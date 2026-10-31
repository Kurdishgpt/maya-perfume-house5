import {
  CreateProductBody,
  CreateProductResponse,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
  type ProductInput,
  type ProductSizeInput,
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
  is_active?: boolean;
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
    size_variants: [{
      supabase_id: product.id,
      bottle_size_ml: product.size_ml,
      price: Number(product.price),
      stock: product.stock_quantity,
    }],
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
    size_variants: [{
      supabase_id: null,
      bottle_size_ml: product.bottleSizeMl,
      price: product.price,
      stock: product.stock,
    }],
    created_at: product.createdAt.toISOString(),
  };
}

const generatedSkuPattern = /^(MAYA-VAR-[A-F0-9]{32})-(\d+)ML$/;

function skuFamilyPrefix(sku: string | null | undefined): string | null {
  return sku ? generatedSkuPattern.exec(sku)?.[1] ?? null : null;
}

function groupProductRows(rows: ProductRow[]) {
  const grouped = new Map<string, ProductRow[]>();
  for (const row of rows) {
    const family = skuFamilyPrefix(row.sku);
    const key = family ?? `single:${row.id}`;
    const entries = grouped.get(key) ?? [];
    entries.push(row);
    grouped.set(key, entries);
  }

  return [...grouped.values()].map((familyRows) => {
    const ordered = [...familyRows].sort((a, b) =>
      (a.size_ml ?? Number.MAX_SAFE_INTEGER) - (b.size_ml ?? Number.MAX_SAFE_INTEGER),
    );
    const primary = ordered[0];
    const product = toApiProduct(primary);
    const sizeVariants = ordered.map((row) => ({
      supabase_id: row.id,
      bottle_size_ml: row.size_ml,
      price: Number(row.price),
      stock: row.stock_quantity,
    }));
    return {
      ...product,
      price: sizeVariants[0]?.price ?? Number(primary.price),
      bottle_size_ml: sizeVariants[0]?.bottle_size_ml ?? primary.size_ml,
      stock: sizeVariants.reduce((total, variant) => total + variant.stock, 0),
      size_variants: sizeVariants,
    };
  });
}

function validateSizeVariants(variants: ProductSizeInput[]): string | null {
  if (variants.length < 1 || variants.length > 5) return "Add between one and five bottle sizes.";
  const sizes = new Set<number>();
  for (const variant of variants) {
    if (!Number.isInteger(variant.bottle_size_ml) || variant.bottle_size_ml < 1 || variant.bottle_size_ml > 10000) {
      return "Bottle sizes must be whole numbers from 1 to 10,000 ml.";
    }
    if (sizes.has(variant.bottle_size_ml)) return "Each bottle size must be unique.";
    sizes.add(variant.bottle_size_ml);
    if (!Number.isFinite(variant.price) || variant.price < 0) return "Each size needs a valid price of zero or more.";
    if (!Number.isInteger(variant.stock) || variant.stock < 0) return "Each size needs whole-number stock of zero or more.";
  }
  return null;
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
    return { status: 409, message: "A matching fragrance record already exists." };
  }
  return { status: 500, message: fallback };
}

function variantRecord(data: ProductInput, category: "women" | "men" | "unisex", familyPrefix: string, variant: ProductSizeInput, id?: string) {
  const sku = `${familyPrefix}-${variant.bottle_size_ml}ML`;
  return {
    ...(id ? { id } : {}),
    name: data.title.trim(),
    slug: slugFor(data.title, sku),
    description: data.description,
    brand: data.brand.trim(),
    category,
    product_type: "perfume",
    price: variant.price,
    currency: data.currency ?? "USD",
    image_url: data.image_url,
    additional_images: data.gallery_images,
    scent_family: data.ingredients[0] ?? null,
    top_notes: data.top_notes,
    middle_notes: data.heart_notes,
    base_notes: data.base_notes,
    size_ml: variant.bottle_size_ml,
    stock_quantity: variant.stock,
    sku,
    is_active: true,
  };
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
    res.json(ListProductsResponse.parse(groupProductRows(data as ProductRow[])));
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
  const sizeError = validateSizeVariants(data.size_variants);
  if (sizeError) {
    res.status(400).json({ error: sizeError });
    return;
  }
  let category: "women" | "men" | "unisex";
  try {
    category = categoryFor(data.category);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Choose a valid category." });
    return;
  }

  try {
    const familyPrefix = `MAYA-VAR-${randomUUID().replace(/-/g, "").toUpperCase()}`;
    const { data: products, error } = await getSupabaseAdmin()
      .from("products")
      .insert(data.size_variants.map((variant) => variantRecord(data, category, familyPrefix, variant)))
      .select("*")
      ;

    if (error || !products?.length) {
      const mapped = responseError(error ?? {}, "The product could not be created.");
      req.log.error({ code: error?.code }, "Supabase product creation failed");
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    res.status(201).json(CreateProductResponse.parse(groupProductRows(products as ProductRow[])[0]));
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
    try {
      const supabase = getSupabaseAdmin();
      const { data: current, error: currentError } = await supabase
        .from("products")
        .select("*")
        .eq("legacy_id", params.data.id)
        .eq("product_type", "perfume")
        .maybeSingle();

      if (currentError || !current) {
        if (currentError) req.log.error({ code: currentError.code }, "Supabase product lookup failed");
        res.status(currentError ? 500 : 404).json({ error: currentError ? "The product could not be loaded." : "Product not found." });
        return;
      }

      const currentRow = current as ProductRow;
      const familyPrefix = skuFamilyPrefix(currentRow.sku);
      const { data: familyRows, error: familyError } = familyPrefix
        ? await supabase.from("products").select("*").eq("product_type", "perfume").like("sku", `${familyPrefix}-%`)
        : { data: [currentRow], error: null };
      if (familyError) {
        req.log.error({ code: familyError.code }, "Supabase product variants could not be loaded");
        res.status(500).json({ error: "The product could not be updated." });
        return;
      }

      if (data.size_variants) {
        const sizeError = validateSizeVariants(data.size_variants);
        if (sizeError) {
          res.status(400).json({ error: sizeError });
          return;
        }
        let category: "women" | "men" | "unisex";
        try {
          category = data.category !== undefined ? categoryFor(data.category) : currentRow.category;
        } catch (error) {
          res.status(400).json({ error: error instanceof Error ? error.message : "Choose a valid category." });
          return;
        }
        const familyData: ProductInput = {
          title: data.title ?? currentRow.name,
          brand: data.brand ?? currentRow.brand,
          currency: data.currency ?? currentRow.currency,
          category,
          description: data.description ?? currentRow.description,
          top_notes: data.top_notes ?? currentRow.top_notes ?? [],
          heart_notes: data.heart_notes ?? currentRow.middle_notes ?? [],
          base_notes: data.base_notes ?? currentRow.base_notes ?? [],
          ingredients: data.ingredients ?? [],
          image_url: data.image_url ?? currentRow.image_url,
          gallery_images: data.gallery_images ?? currentRow.additional_images ?? [],
          size_variants: data.size_variants,
        };
        const activeFamilyPrefix = familyPrefix ?? `MAYA-VAR-${randomUUID().replace(/-/g, "").toUpperCase()}`;
        const existingBySku = new Map((familyRows as ProductRow[]).map((row) => [row.sku ?? "", row]));
        const records = data.size_variants.map((variant, index) => {
          const sku = `${activeFamilyPrefix}-${variant.bottle_size_ml}ML`;
          const existing = existingBySku.get(sku);
          const id = existing?.id ?? (!familyPrefix && index === 0 ? currentRow.id : undefined);
          return variantRecord(familyData, category, activeFamilyPrefix, variant, id);
        });
        const { data: updatedRows, error: updateError } = await supabase
          .from("products")
          .upsert(records, { onConflict: "id" })
          .select("*");

        if (updateError || !updatedRows?.length) {
          const mapped = responseError(updateError ?? {}, "The product could not be updated.");
          req.log.error({ code: updateError?.code }, "Supabase product variant update failed");
          res.status(mapped.status).json({ error: mapped.message });
          return;
        }
        const updatedIds = new Set((updatedRows as ProductRow[]).map((row) => row.id));
        const staleIds = [...new Set([
          ...(familyRows as ProductRow[]).filter((row) => !updatedIds.has(row.id)).map((row) => row.id),
          ...(!updatedIds.has(currentRow.id) ? [currentRow.id] : []),
        ])];
        if (staleIds.length) {
          const { error: deactivateError } = await supabase.from("products").update({ is_active: false }).in("id", staleIds);
          if (deactivateError) {
            req.log.error({ code: deactivateError.code }, "Removed product size variants could not be deactivated");
            res.status(500).json({ error: "The sizes were saved, but an older size could not be removed from the storefront. Retry the save." });
            return;
          }
        }
        res.json(UpdateProductResponse.parse(groupProductRows(updatedRows as ProductRow[])[0]));
        return;
      }

      const values: Record<string, unknown> = {};
      if (data.title !== undefined) values.name = data.title.trim();
      if (data.brand !== undefined) values.brand = data.brand.trim();
      if (data.currency !== undefined) values.currency = data.currency;
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
      const activeIds = (familyRows as ProductRow[]).filter((row) => row.is_active !== false).map((row) => row.id);
      if (Object.keys(values).length === 0) {
        res.status(400).json({ error: "Add at least one field to update." });
        return;
      }
      const { data: updatedRows, error } = await supabase
        .from("products")
        .update(values)
        .in("id", activeIds.length ? activeIds : [currentRow.id])
        .select("*");
      if (error) {
        const mapped = responseError(error, "The product could not be updated.");
        req.log.error({ code: error.code }, "Supabase product update failed");
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }
      if (!updatedRows?.length) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      res.json(UpdateProductResponse.parse(groupProductRows(updatedRows as ProductRow[])[0]));
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
      const supabase = getSupabaseAdmin();
      const { data: product, error: readError } = await supabase
        .from("products")
        .select("*")
        .eq("legacy_id", params.data.id)
        .eq("product_type", "perfume")
        .maybeSingle();
      if (readError) {
        req.log.error({ code: readError.code }, "Supabase product lookup failed before deletion");
        res.status(500).json({ error: "The product could not be removed." });
        return;
      }
      if (!product) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      const familyPrefix = skuFamilyPrefix((product as ProductRow).sku);
      const { data: familyRows, error: familyError } = familyPrefix
        ? await supabase.from("products").select("id").eq("product_type", "perfume").like("sku", `${familyPrefix}-%`)
        : { data: [{ id: (product as ProductRow).id }], error: null };
      if (familyError) {
        req.log.error({ code: familyError.code }, "Supabase product variants could not be loaded before deletion");
        res.status(500).json({ error: "The product could not be removed." });
        return;
      }
      const ids = (familyRows ?? []).map((row) => row.id);
      const { data, error } = await supabase
        .from("products")
        .update({ is_active: false })
        .in("id", ids)
        .select("id");
      if (error) {
        req.log.error({ code: error.code }, "Supabase product deactivation failed");
        res.status(500).json({ error: "The product could not be removed." });
        return;
      }
      if (!data?.length) {
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
