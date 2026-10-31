import {
  CreateProductBody,
  CreateProductResponse,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getSupabaseAdmin, getSupabaseConfigIssue } from "../lib/supabase";
import { db, isLegacyDatabaseConfigured, productsTable } from "@workspace/db";

const router: IRouter = Router();

type ProductRow = {
  id: string;
  legacy_id: number;
  name: string;
  brand: string;
  price: number | string;
  currency: "USD" | "IQD";
  size_ml: number | null;
  stock_quantity: number;
  sku: string | null;
  category: "women" | "men" | "unisex";
  description: string;
  top_notes: string[];
  middle_notes: string[];
  base_notes: string[];
  image_url: string;
  additional_images: string[];
  created_at: string;
};

function toApiProduct(product: ProductRow) {
  return {
    id: Number(product.legacy_id),
    supabase_id: product.id,
    title: product.name,
    brand: product.brand,
    price: Number(product.price),
    currency: product.currency,
    bottle_size_ml: product.size_ml,
    stock: product.stock_quantity,
    sku: product.sku ?? "",
    category: product.category,
    description: product.description,
    top_notes: product.top_notes ?? [],
    heart_notes: product.middle_notes ?? [],
    base_notes: product.base_notes ?? [],
    ingredients: [],
    image_url: product.image_url,
    gallery_images: product.additional_images ?? [],
    created_at: product.created_at,
  };
}

function toLegacyApiProduct(product: typeof productsTable.$inferSelect) {
  return {
    id: product.id,
    supabase_id: null,
    title: product.title,
    brand: product.brand,
    price: product.price,
    currency: product.currency,
    bottle_size_ml: product.bottleSizeMl,
    stock: product.stock,
    sku: product.sku,
    category: product.category,
    description: product.description,
    top_notes: product.topNotes,
    heart_notes: product.heartNotes,
    base_notes: product.baseNotes,
    ingredients: product.ingredients,
    image_url: product.imageUrl,
    gallery_images: product.galleryImages,
    created_at: product.createdAt.toISOString(),
  };
}

function categoryFor(value: string): "women" | "men" | "unisex" {
  const category = value.trim().toLowerCase();
  if (/\b(women|woman|female|femme|ladies)\b/.test(category)) return "women";
  if (/\b(men|man|male|homme|gentlemen)\b/.test(category)) return "men";
  if (/\b(unisex|perfect|shared)\b/.test(category)) return "unisex";
  throw new Error("Choose Women, Men, or Unisex for a perfume category.");
}

function slugFor(title: string, sku: string): string {
  const base = title.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "perfume";
  const suffix = sku.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base}-${suffix || randomUUID().slice(0, 8)}`.slice(0, 550);
}

function responseError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "23505" || error.code === "409") {
    return { status: 409, message: "That SKU or product slug is already in use." };
  }
  return { status: 500, message: fallback };
}

router.get("/products", async (req, res): Promise<void> => {
  if (getSupabaseConfigIssue()) {
    if (!isLegacyDatabaseConfigured) {
      res.status(503).json({ error: "The fragrance collection is unavailable until Supabase is configured." });
      return;
    }
    try {
      const rows = await db.select().from(productsTable);
      req.log.warn("Supabase is not ready; serving the existing Replit catalog without changing it");
      res.setHeader("X-Maya-Catalog-Source", "legacy");
      res.json(ListProductsResponse.parse(rows.map(toLegacyApiProduct)));
    } catch (error) {
      req.log.error({ err: error }, "Legacy product catalog read failed");
      res.status(503).json({ error: "The fragrance collection is temporarily unavailable." });
    }
    return;
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("product_type", "perfume")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      req.log.error({ code: error.code }, "Supabase product catalog read failed");
      res.status(503).json({ error: "The fragrance collection is temporarily unavailable." });
      return;
    }
    res.setHeader("X-Maya-Catalog-Source", "supabase");
    res.json(ListProductsResponse.parse((data as ProductRow[]).map(toApiProduct)));
  } catch (error) {
    req.log.error({ err: error }, "Supabase product catalog request failed");
    res.status(503).json({ error: "The fragrance collection is temporarily unavailable." });
  }
});

router.post("/products", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  let category: "women" | "men" | "unisex";
  try {
    category = categoryFor(data.category);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Choose a valid category." });
    return;
  }

  try {
    const { data: product, error } = await getSupabaseAdmin()
      .from("products")
      .insert({
        name: data.title.trim(),
        slug: slugFor(data.title, data.sku),
        description: data.description,
        brand: data.brand.trim(),
        category,
        product_type: "perfume",
        price: data.price,
        currency: data.currency ?? "USD",
        image_url: data.image_url,
        additional_images: data.gallery_images,
        scent_family: data.ingredients[0] ?? null,
        top_notes: data.top_notes,
        middle_notes: data.heart_notes,
        base_notes: data.base_notes,
        size_ml: data.bottle_size_ml,
        stock_quantity: data.stock,
        sku: data.sku.trim(),
        is_active: true,
      })
      .select("*")
      .single();

    if (error || !product) {
      const mapped = responseError(error ?? {}, "The product could not be created.");
      req.log.error({ code: error?.code }, "Supabase product creation failed");
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    res.status(201).json(CreateProductResponse.parse(toApiProduct(product as ProductRow)));
  } catch (error) {
    req.log.error({ err: error }, "Supabase product creation failed");
    res.status(500).json({ error: "The product could not be created." });
  }
});

router.patch(
  "/products/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product ID." });
      return;
    }

    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const values: Record<string, unknown> = {};
    if (data.title !== undefined) values.name = data.title.trim();
    if (data.brand !== undefined) values.brand = data.brand.trim();
    if (data.price !== undefined) values.price = data.price;
    if (data.currency !== undefined) values.currency = data.currency;
    if (data.bottle_size_ml !== undefined) values.size_ml = data.bottle_size_ml;
    if (data.stock !== undefined) values.stock_quantity = data.stock;
    if (data.sku !== undefined) values.sku = data.sku.trim();
    if (data.category !== undefined) {
      try {
        values.category = categoryFor(data.category);
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Choose a valid category." });
        return;
      }
    }
    if (data.description !== undefined) values.description = data.description;
    if (data.top_notes !== undefined) values.top_notes = data.top_notes;
    if (data.heart_notes !== undefined) values.middle_notes = data.heart_notes;
    if (data.base_notes !== undefined) values.base_notes = data.base_notes;
    if (data.ingredients !== undefined) values.scent_family = data.ingredients[0] ?? null;
    if (data.image_url !== undefined) values.image_url = data.image_url;
    if (data.gallery_images !== undefined) values.additional_images = data.gallery_images;

    if (Object.keys(values).length === 0) {
      res.status(400).json({ error: "Add at least one field to update." });
      return;
    }

    try {
      const { data: product, error } = await getSupabaseAdmin()
        .from("products")
        .update(values)
        .eq("legacy_id", params.data.id)
        .eq("product_type", "perfume")
        .select("*")
        .maybeSingle();

      if (error) {
        const mapped = responseError(error, "The product could not be updated.");
        req.log.error({ code: error.code }, "Supabase product update failed");
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
      if (!product) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      res.json(UpdateProductResponse.parse(toApiProduct(product as ProductRow)));
    } catch (error) {
      req.log.error({ err: error }, "Supabase product update failed");
      res.status(500).json({ error: "The product could not be updated." });
    }
  },
);

router.delete(
  "/products/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product ID." });
      return;
    }

    try {
      const { data, error } = await getSupabaseAdmin()
        .from("products")
        .delete()
        .eq("legacy_id", params.data.id)
        .eq("product_type", "perfume")
        .select("id")
        .maybeSingle();
      if (error) {
        req.log.error({ code: error.code }, "Supabase product deletion failed");
        res.status(500).json({ error: "The product could not be deleted." });
        return;
      }
      if (!data) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.error({ err: error }, "Supabase product deletion failed");
      res.status(500).json({ error: "The product could not be deleted." });
    }
  },
);

export default router;
