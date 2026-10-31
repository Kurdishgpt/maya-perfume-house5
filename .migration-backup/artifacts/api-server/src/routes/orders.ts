import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { CreateStoreOrderBody, CreateStoreOrderResponse } from "@workspace/api-zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase";

const router: IRouter = Router();
const attemptsByIp = new Map<string, { startedAt: number; count: number }>();
const windowMs = 60_000;
const maxOrdersPerWindow = 8;

router.post("/orders", async (req, res): Promise<void> => {
  const now = Date.now();
  const ip = req.ip ?? "unknown";
  const current = attemptsByIp.get(ip);
  if (current && now - current.startedAt < windowMs && current.count >= maxOrdersPerWindow) {
    res.status(429).json({ error: "Too many checkout attempts. Please wait a minute and try again." });
    return;
  }
  if (attemptsByIp.size > 1000) {
    for (const [key, value] of attemptsByIp) if (now - value.startedAt >= windowMs) attemptsByIp.delete(key);
  }

  const input = CreateStoreOrderBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Check the customer details and product quantities, then try again." });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Checkout is temporarily unavailable while the store database is configured." });
    return;
  }

  const combined = new Map<string, number>();
  for (const item of input.data.items) {
    const quantity = (combined.get(item.product_id) ?? 0) + item.quantity;
    if (quantity > 10000) {
      res.status(400).json({ error: "A product quantity is too large." });
      return;
    }
    combined.set(item.product_id, quantity);
  }
  if (combined.size > 50) {
    res.status(400).json({ error: "An order can contain no more than 50 different products." });
    return;
  }

  const attempts = current && now - current.startedAt < windowMs
    ? current
    : { startedAt: now, count: 0 };
  attempts.count += 1;
  attemptsByIp.set(ip, attempts);

  const guestToken = randomBytes(32).toString("hex");
  const guestTokenHash = createHash("sha256").update(guestToken).digest("hex");
  const items = [...combined].map(([product_id, quantity]) => ({ product_id, quantity }));
  try {
    const supabase = getSupabaseAdmin();
    const { data: orderId, error: createError } = await supabase.rpc("create_store_order", {
      p_user_id: null,
      p_guest_access_token_hash: guestTokenHash,
      p_customer_name: input.data.customer_name,
      p_phone: input.data.phone,
      p_email: input.data.email ?? null,
      p_shipping_address: input.data.shipping_address,
      p_city: input.data.city,
      p_notes: input.data.notes ?? "",
      p_payment_method: input.data.payment_method,
      p_items: items,
    });
    if (createError || typeof orderId !== "string") {
      const reason = createError?.message ?? "";
      req.log.warn({ code: createError?.code }, "Secure checkout order creation failed");
      const publicMessage = reason.includes("MIXED_CURRENCIES")
        ? "Please place separate orders for USD and IQD items."
        : reason.includes("INSUFFICIENT_STOCK")
          ? "One or more fragrances no longer have enough stock."
          : reason.includes("PRODUCT_UNAVAILABLE")
            ? "One or more items are no longer available."
            : reason.includes("INVALID_CUSTOMER_DETAILS")
              ? "Check the customer and delivery details."
              : "The order could not be confirmed. Please try again.";
      res.status(400).json({ error: publicMessage });
      return;
    }

    const { data: order, error: readError } = await supabase
      .from("orders")
      .select("id,subtotal,shipping_fee,total,currency,order_status,payment_status,created_at")
      .eq("id", orderId)
      .single();
    if (readError || !order) {
      req.log.error({ code: readError?.code }, "Created order summary could not be loaded");
      res.status(503).json({ error: "The order was received, but its confirmation could not be loaded. Contact Maya before submitting again." });
      return;
    }
    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("product_name,unit_price,quantity,line_total")
      .eq("order_id", orderId);
    if (itemsError || !orderItems) {
      req.log.error({ code: itemsError?.code }, "Created order items could not be loaded");
      res.status(503).json({ error: "The order was received, but its confirmation could not be loaded. Contact Maya before submitting again." });
      return;
    }

    res.cookie("maya_order_access", guestToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/api",
    });
    res.status(201).json(CreateStoreOrderResponse.parse({
      order_id: order.id,
      subtotal: Number(order.subtotal),
      shipping_fee: Number(order.shipping_fee),
      total: Number(order.total),
      currency: order.currency,
      order_status: order.order_status,
      payment_status: order.payment_status,
      created_at: order.created_at,
      items: orderItems.map((item) => ({
        product_name: item.product_name,
        unit_price: Number(item.unit_price),
        quantity: item.quantity,
        line_total: Number(item.line_total),
      })),
    }));
  } catch (error) {
    req.log.error({ err: error }, "Secure checkout request failed");
    res.status(503).json({ error: "Checkout is temporarily unavailable. Your order was not confirmed." });
  }
});

export default router;
