import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase";

const router: IRouter = Router();
const cookieName = "maya_guest_cart";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CartItemInput = { product_id: string; quantity: number };

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function getCart(req: Request, res: Response) {
  const token = typeof req.cookies?.[cookieName] === "string" ? req.cookies[cookieName] : "";
  const safeToken = /^[a-f0-9]{64}$/i.test(token) ? token : randomBytes(32).toString("hex");
  if (safeToken !== token) {
    res.cookie(cookieName, safeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 180 * 24 * 60 * 60 * 1000,
      path: "/api/cart",
    });
  }
  const supabase = getSupabaseAdmin();
  const guestHash = tokenHash(safeToken);
  const { data: existing, error: readError } = await supabase
    .from("carts")
    .select("id")
    .eq("guest_token_hash", guestHash)
    .eq("status", "active")
    .maybeSingle();
  if (readError) throw new Error("The saved bag could not be read.");
  if (existing) return { id: existing.id as string, token: safeToken };
  const { data: created, error: createError } = await supabase
    .from("carts")
    .insert({ guest_token_hash: guestHash, status: "active" })
    .select("id")
    .single();
  if (createError || !created) throw new Error("A saved bag could not be created.");
  return { id: created.id as string, token: safeToken };
}

router.get("/cart", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Saved bags are not available until Supabase is configured." });
    return;
  }
  try {
    const cart = await getCart(req, res);
    const supabase = getSupabaseAdmin();
    const { data: items, error } = await supabase
      .from("cart_items")
      .select("id,product_id,quantity,created_at,updated_at")
      .eq("cart_id", cart.id);
    if (error) throw new Error("The saved bag could not be read.");
    const productIds = (items ?? []).map((item) => item.product_id);
    const { data: products, error: productError } = productIds.length
      ? await supabase.from("products").select("id,name,price,currency,image_url,stock_quantity,is_active,product_type").in("id", productIds)
      : { data: [], error: null };
    if (productError) throw new Error("The saved bag products could not be loaded.");
    const byId = new Map((products ?? []).map((product) => [product.id, product]));
    res.json({
      items: (items ?? []).flatMap((item) => {
        const product = byId.get(item.product_id);
        return product ? [{ ...item, product }] : [];
      }),
    });
  } catch (error) {
    req.log.warn({ err: error }, "Guest bag load failed");
    res.status(503).json({ error: "The saved bag could not be loaded. Your local bag remains unchanged." });
  }
});

router.put("/cart", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Saved bags are not available until Supabase is configured." });
    return;
  }
  const rawItems: unknown = req.body?.items;
  if (!Array.isArray(rawItems) || rawItems.length > 100) {
    res.status(400).json({ error: "A bag must contain no more than 100 products." });
    return;
  }
  const combined = new Map<string, number>();
  for (const value of rawItems) {
    const item = value as Partial<CartItemInput>;
    if (typeof item.product_id !== "string" || !uuidPattern.test(item.product_id) ||
        !Number.isInteger(item.quantity) || (item.quantity ?? 0) < 1 || (item.quantity ?? 0) > 10000) {
      res.status(400).json({ error: "Check product IDs and quantities in the saved bag." });
      return;
    }
    const quantity = (combined.get(item.product_id) ?? 0) + (item.quantity as number);
    if (quantity > 10000) {
      res.status(400).json({ error: "A product quantity is too large." });
      return;
    }
    combined.set(item.product_id, quantity);
  }
  try {
    const cart = await getCart(req, res);
    const supabase = getSupabaseAdmin();
    const productIds = [...combined.keys()];
    if (productIds.length) {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,is_active")
        .in("id", productIds);
      if (error) throw new Error("Product availability could not be checked.");
      const activeIds = new Set((products ?? []).filter((item) => item.is_active).map((item) => item.id));
      if (activeIds.size !== productIds.length) {
        res.status(409).json({ error: "One or more products are no longer available." });
        return;
      }
      const { error: upsertError } = await supabase.from("cart_items").upsert(
        productIds.map((product_id) => ({ cart_id: cart.id, product_id, quantity: combined.get(product_id)! })),
        { onConflict: "cart_id,product_id" },
      );
      if (upsertError) throw new Error("The bag could not be saved.");
      const { error: deleteError } = await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cart.id)
        .not("product_id", "in", `(${productIds.join(",")})`);
      if (deleteError) throw new Error("Removed products could not be cleared from the saved bag.");
    } else {
      const { error: clearError } = await supabase.from("cart_items").delete().eq("cart_id", cart.id);
      if (clearError) throw new Error("The bag could not be cleared.");
    }
    res.json({ saved: true, item_count: productIds.length });
  } catch (error) {
    req.log.warn({ err: error }, "Guest bag save failed");
    res.status(503).json({ error: error instanceof Error ? error.message : "The saved bag could not be updated." });
  }
});

router.delete("/cart", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Saved bags are not available until Supabase is configured." });
    return;
  }
  try {
    const cart = await getCart(req, res);
    const { error } = await getSupabaseAdmin().from("cart_items").delete().eq("cart_id", cart.id);
    if (error) throw new Error();
    res.json({ cleared: true });
  } catch (error) {
    req.log.warn({ err: error }, "Guest bag clear failed");
    res.status(503).json({ error: "The saved bag could not be cleared." });
  }
});

export default router;
