import { Router, type IRouter } from "express";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();
const batchSize = 100;
const maxCsvCharacters = 10 * 1024 * 1024;
const headers = [
  "slug", "name", "description", "brand", "category", "product_type", "price", "currency",
  "compare_at_price", "stock_quantity", "sku", "image_url", "additional_images", "scent_family",
  "top_notes", "middle_notes", "base_notes", "size_ml", "is_active", "is_featured", "is_new_arrival",
  "raw_material_category", "source_id", "source_sku", "source_name", "source_description",
  "source_category", "source_image_url", "source_price", "source_currency", "source_url",
  "source_unit", "quantity_options", "supplier_available", "source_available",
];

type CatalogRow = Record<string, unknown> & { slug: string; name: string };
type RowError = { row: number; reason: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function cleanCell(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBoolean(value: string, defaultValue = false): boolean {
  if (!value) return defaultValue;
  return ["true", "yes", "1", "published", "active"].includes(value.toLowerCase());
}

function parseArray(value: string): string[] {
  return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

function parseRow(raw: Record<string, string>, rowNumber: number): { value?: CatalogRow; error?: RowError } {
  const name = cleanCell(raw.name);
  const sku = cleanCell(raw.sku);
  const rawProductType = cleanCell(raw.product_type).toLowerCase();
  const categoryInput = cleanCell(raw.category);
  const normalizedCategory = categoryInput.toLowerCase();
  const productType = rawProductType === "raw_material" || normalizedCategory === "raw_materials"
    ? "raw_material"
    : "perfume";
  let category: "women" | "men" | "unisex" | "raw_materials";
  if (productType === "raw_material") {
    category = "raw_materials";
  } else if (/\b(women|woman|female|femme|ladies)\b/.test(normalizedCategory)) {
    category = "women";
  } else if (/\b(men|man|male|homme|gentlemen)\b/.test(normalizedCategory)) {
    category = "men";
  } else if (/\b(unisex|shared|perfect)\b/.test(normalizedCategory)) {
    category = "unisex";
  } else {
    return { error: { row: rowNumber, reason: "Category must be Women, Men, Unisex, or a raw material category." } };
  }
  const price = Number(raw.price);
  const currency = cleanCell(raw.currency).toUpperCase();
  const stock = raw.stock_quantity?.trim() ? Number(raw.stock_quantity) : 0;
  const size = raw.size_ml?.trim() ? Number(raw.size_ml) : null;
  const compareAt = raw.compare_at_price?.trim() ? Number(raw.compare_at_price) : null;
  const sourceId = raw.source_id?.trim() ? Number(raw.source_id) : null;
  const sourcePrice = raw.source_price?.trim() ? Number(raw.source_price) : null;
  if (!name || name.length > 500) return { error: { row: rowNumber, reason: "Product name is required and must be 500 characters or fewer." } };
  if (!Number.isFinite(price) || price < 0) return { error: { row: rowNumber, reason: "Price must be a nonnegative number." } };
  if (currency !== "USD" && currency !== "IQD") return { error: { row: rowNumber, reason: "Currency must be USD or IQD." } };
  if (!Number.isInteger(stock) || stock < 0) return { error: { row: rowNumber, reason: "Stock quantity must be a nonnegative whole number." } };
  if (size !== null && (!Number.isInteger(size) || size < 1 || size > 10000)) return { error: { row: rowNumber, reason: "Bottle size must be a whole number from 1 to 10,000 ml." } };
  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) return { error: { row: rowNumber, reason: "Compare-at price must be nonnegative." } };
  if (sourceId !== null && (!Number.isSafeInteger(sourceId) || sourceId < 1)) return { error: { row: rowNumber, reason: "Source ID must be a positive whole number." } };
  if (sourcePrice !== null && (!Number.isFinite(sourcePrice) || sourcePrice < 0)) return { error: { row: rowNumber, reason: "Source price must be nonnegative." } };

  let quantityOptions: unknown[] = [];
  if (raw.quantity_options?.trim()) {
    try {
      quantityOptions = JSON.parse(raw.quantity_options);
      if (!Array.isArray(quantityOptions)) throw new Error();
    } catch {
      return { error: { row: rowNumber, reason: "Quantity options must be a JSON array." } };
    }
  }
  const sourceUnit = cleanCell(raw.source_unit);
  if (sourceUnit && sourceUnit !== "g" && sourceUnit !== "item") {
    return { error: { row: rowNumber, reason: "Source unit must be g or item." } };
  }
  const explicitSlug = cleanCell(raw.slug);
  const stableBase = sku ? `sku-${slugify(sku)}` : slugify(explicitSlug || name);
  const slug = (explicitSlug || stableBase || `product-${rowNumber}`).slice(0, 550);
  const value: CatalogRow = {
    slug,
    name,
    description: cleanCell(raw.description),
    brand: cleanCell(raw.brand),
    category,
    product_type: productType,
    price,
    currency,
    compare_at_price: compareAt,
    stock_quantity: productType === "raw_material" ? 0 : stock,
    sku: sku || null,
    image_url: cleanCell(raw.image_url),
    additional_images: parseArray(cleanCell(raw.additional_images)),
    scent_family: cleanCell(raw.scent_family) || null,
    top_notes: parseArray(cleanCell(raw.top_notes)),
    middle_notes: parseArray(cleanCell(raw.middle_notes)),
    base_notes: parseArray(cleanCell(raw.base_notes)),
    size_ml: size,
    is_active: parseBoolean(cleanCell(raw.is_active)),
    is_featured: parseBoolean(cleanCell(raw.is_featured)),
    is_new_arrival: parseBoolean(cleanCell(raw.is_new_arrival)),
    raw_material_category: productType === "raw_material"
      ? cleanCell(raw.raw_material_category) || categoryInput
      : null,
    source_id: sourceId,
    source_sku: cleanCell(raw.source_sku) || null,
    source_name: cleanCell(raw.source_name) || null,
    source_description: cleanCell(raw.source_description) || null,
    source_category: cleanCell(raw.source_category) || null,
    source_image_url: cleanCell(raw.source_image_url) || null,
    source_price: sourcePrice,
    source_currency: cleanCell(raw.source_currency).toUpperCase() || null,
    source_url: cleanCell(raw.source_url) || null,
    source_unit: sourceUnit || null,
    quantity_options: quantityOptions,
    supplier_available: raw.supplier_available?.trim() ? parseBoolean(raw.supplier_available) : null,
    source_available: raw.source_available?.trim() ? parseBoolean(raw.source_available) : null,
  };
  return { value };
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : Array.isArray(value) ? value.join("|") : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const header = headers.join(",");
  return [header, ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\r\n");
}

router.use("/admin/products", requireAdmin);

router.get("/admin/products/export.csv", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured before exporting the production catalog." });
    return;
  }
  try {
    const supabase = getSupabaseAdmin();
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await supabase
        .from("products")
        .select(headers.join(","))
        .order("created_at", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) {
        req.log.error({ code: error.code }, "CSV catalog export failed");
        res.status(503).json({ error: "The product catalog could not be exported." });
        return;
      }
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < batchSize) break;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="maya-collection-catalog.csv"');
    res.send(`\uFEFF${toCsv(rows)}`);
  } catch (error) {
    req.log.error({ err: error }, "CSV catalog export failed");
    res.status(503).json({ error: "The product catalog could not be exported." });
  }
});

router.post("/admin/products/import.csv", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured before importing catalog rows." });
    return;
  }
  const csv = req.body?.csv;
  if (typeof csv !== "string" || !csv.trim() || csv.length > maxCsvCharacters) {
    res.status(400).json({ error: "Choose a non-empty CSV file smaller than 10 MB." });
    return;
  }

  let rows: string[][];
  try {
    rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "The CSV could not be parsed." });
    return;
  }
  if (rows.length < 2 || rows.length > 10001) {
    res.status(400).json({ error: "The CSV must have a header and between 1 and 10,000 product rows." });
    return;
  }
  const columnNames = rows[0].map((value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  if (!columnNames.includes("name") || !columnNames.includes("price") ||
      !columnNames.includes("currency") || !columnNames.includes("category")) {
    res.status(400).json({ error: "CSV headers must include name, price, currency, and category." });
    return;
  }

  const parsed: CatalogRow[] = [];
  const errors: RowError[] = [];
  const seenSlugs = new Set<string>();
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].length > columnNames.length) {
      errors.push({ row: index + 1, reason: "This row has more values than the header." });
      continue;
    }
    const record: Record<string, string> = {};
    columnNames.forEach((column, columnIndex) => { record[column] = rows[index][columnIndex] ?? ""; });
    const item = parseRow(record, index + 1);
    if (!item.value) {
      if (item.error) errors.push(item.error);
      continue;
    }
    if (seenSlugs.has(item.value.slug)) {
      errors.push({ row: index + 1, reason: "This CSV repeats a product slug or SKU." });
      continue;
    }
    seenSlugs.add(item.value.slug);
    parsed.push(item.value);
  }

  const supabase = getSupabaseAdmin();
  let inserted = 0;
  let updated = 0;
  for (let offset = 0; offset < parsed.length; offset += batchSize) {
    const batch = parsed.slice(offset, offset + batchSize);
    const slugs = batch.map((row) => row.slug);
    const { data: existing, error: lookupError } = await supabase
      .from("products")
      .select("slug")
      .in("slug", slugs);
    if (lookupError) {
      req.log.error({ code: lookupError.code }, "CSV import could not check existing products");
      batch.forEach((_, index) => errors.push({ row: offset + index + 2, reason: "Could not check existing catalog records." }));
      continue;
    }
    const existingSlugs = new Set((existing ?? []).map((row) => row.slug));
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "slug" });
    if (!error) {
      for (const row of batch) {
        if (existingSlugs.has(row.slug)) updated += 1;
        else inserted += 1;
      }
      continue;
    }

    req.log.warn({ code: error.code }, "CSV import batch failed; retrying row by row");
    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      const { error: rowError } = await supabase.from("products").upsert(item, { onConflict: "slug" });
      if (rowError) {
        errors.push({ row: offset + index + 2, reason: rowError.code === "23505" ? "SKU is already assigned to another product." : "This row could not be saved." });
      } else if (existingSlugs.has(item.slug)) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }
  }

  res.status(errors.length ? 207 : 200).json({
    received: rows.length - 1,
    imported: inserted + updated,
    inserted,
    updated,
    errors,
  });
});

export default router;
