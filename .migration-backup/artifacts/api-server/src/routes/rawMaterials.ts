import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, isLegacyDatabaseConfigured, rawMaterialsTable } from "@workspace/db";
import {
  AddHillenRawMaterialBody, AddHillenRawMaterialResponse,
  CreateRawMaterialImportBody, CreateRawMaterialImportResponse, DeleteRawMaterialParams,
  GetRawMaterialImportParams, GetRawMaterialImportResponse,
  ListHillenRawMaterialCategoriesResponse, ListRawMaterialImportsResponse,
  ListAdminRawMaterialsResponse, ListRawMaterialsResponse,
  ResearchRawMaterialsBody, ResearchRawMaterialsResponse,
  UpdateRawMaterialBody, UpdateRawMaterialParams, UpdateRawMaterialResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getSupabaseAdmin, getSupabaseConfigIssue, isSupabaseConfigured } from "../lib/supabase";
import { fetchHillenCategories, fetchHillenMaterial, fetchHillenPage, HillenError, hillenUrl, parseHillenMaterial, searchHillenMaterials, unsupportedHillenReason, type HillenMaterial } from "../lib/hillenCatalog";
import { explainRawMaterials } from "../lib/rawMaterialAi";

const router: IRouter = Router();
const calls = new Map<string, { at: number; count: number }>();

function api(row: typeof rawMaterialsTable.$inferSelect) {
  return {
    id: row.id, supabase_id: null, source_id: row.sourceId, name: row.name, description: row.description,
    source_sku: row.sourceSku, source_description: row.sourceDescription,
    source_name: row.sourceName, source_category: row.sourceCategory,
    source_image_url: row.sourceImageUrl, source_available: row.sourceAvailable,
    category: row.category,
    price: row.price, currency: row.currency,
    source_price: row.sourcePrice, source_currency: row.sourceCurrency,
    image_url: row.imageUrl, source_url: row.sourceUrl,
    supplier_available: row.supplierAvailable, published: row.published,
    unit: row.sourceUnit, quantity_options: row.quantityOptions,
    imported_at: row.importedAt.toISOString(),
  };
}

type SupabaseMaterialRow = {
  id: string;
  legacy_id: number;
  source_id: number;
  source_sku: string | null;
  source_name: string | null;
  source_description: string | null;
  source_category: string | null;
  source_image_url: string | null;
  source_available: boolean | null;
  raw_material_category: string | null;
  name: string;
  description: string;
  price: number | string;
  currency: "USD" | "IQD";
  source_price: number | string | null;
  source_currency: "USD" | "IQD" | null;
  image_url: string;
  source_url: string | null;
  supplier_available: boolean | null;
  is_active: boolean;
  source_unit: "g" | "item" | null;
  quantity_options: unknown;
  imported_at: string | null;
  created_at: string;
};

type SupabaseImportRunRow = {
  id: number | string;
  mode: "dry-run" | "import";
  status: "running" | "complete" | "partial";
  category_id: number | null;
  category_name: string;
  next_page: number;
  total_pages: number;
  discovered: number;
  created: number;
  updated: number;
  skipped: number;
  processed: number;
  source_ids: number[] | null;
  categories: string[] | null;
  processed_pages: number[] | null;
  failed_pages: number[] | null;
  errors: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  lease_token: string | null;
  lease_until: string | null;
};

function supabaseApi(row: SupabaseMaterialRow) {
  return {
    id: Number(row.legacy_id),
    supabase_id: row.id,
    source_id: row.source_id,
    name: row.name,
    description: row.description,
    source_sku: row.source_sku ?? "",
    source_description: row.source_description ?? "",
    source_name: row.source_name ?? "",
    source_category: row.source_category ?? "",
    source_image_url: row.source_image_url ?? "",
    source_available: row.source_available ?? false,
    category: row.raw_material_category ?? row.source_category ?? "Other",
    price: Number(row.price),
    currency: row.currency,
    source_price: Number(row.source_price ?? row.price),
    source_currency: row.source_currency ?? row.currency,
    image_url: row.image_url,
    source_url: row.source_url ?? "",
    supplier_available: row.supplier_available ?? false,
    published: row.is_active,
    unit: row.source_unit ?? "item",
    quantity_options: Array.isArray(row.quantity_options) ? row.quantity_options : [],
    imported_at: new Date(row.imported_at ?? row.created_at).toISOString(),
  };
}

function supplierProductValues(material: HillenMaterial) {
  const image = material.image_url ?? "";
  return {
    name: material.name,
    slug: `hillen-${material.source_id}-${material.name}`
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 550),
    description: material.description,
    brand: "",
    category: "raw_materials",
    product_type: "raw_material",
    price: material.price,
    currency: material.currency,
    image_url: image,
    additional_images: image ? [image] : [],
    size_ml: null,
    stock_quantity: 0,
    sku: null,
    is_active: true,
    source_id: material.source_id,
    source_sku: material.source_sku,
    source_name: material.name,
    source_description: material.source_description,
    source_category: material.source_category,
    source_image_url: image,
    raw_material_category: material.category,
    source_price: material.price,
    source_currency: material.currency,
    source_url: material.source_url,
    source_unit: material.unit,
    quantity_options: material.quantity_options,
    supplier_available: material.supplier_available,
    source_available: material.supplier_available,
    imported_at: new Date().toISOString(),
  };
}

async function saveSupplierMaterial(material: HillenMaterial): Promise<SupabaseMaterialRow> {
  const supabase = getSupabaseAdmin();
  const fields = supplierProductValues(material);
  const { data: existing, error: findError } = await supabase
    .from("products")
    .select("*")
    .eq("source_id", material.source_id)
    .maybeSingle();
  if (findError) throw new Error("Could not check the existing Supabase catalog item.");

  if (existing) {
    const { data, error } = await supabase
      .from("products")
      .update({
        source_sku: fields.source_sku,
        source_name: fields.source_name,
        source_description: fields.source_description,
        source_category: fields.source_category,
        source_image_url: fields.source_image_url,
        source_price: fields.source_price,
        source_currency: fields.source_currency,
        source_url: fields.source_url,
        source_unit: fields.source_unit,
        quantity_options: fields.quantity_options,
        supplier_available: fields.supplier_available,
        source_available: fields.source_available,
        imported_at: fields.imported_at,
      })
      .eq("source_id", material.source_id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Could not refresh supplier details in Supabase.");
    return data as SupabaseMaterialRow;
  }

  const { data, error } = await supabase
    .from("products")
    .insert(fields)
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not save the raw material to Supabase.");
  return data as SupabaseMaterialRow;
}
function importJob(row: SupabaseImportRunRow) {
  return {
    id: Number(row.id), mode: row.mode, status: row.status,
    category_id: row.category_id, category_name: row.category_name,
    next_page: row.next_page, total_pages: row.total_pages,
    discovered: row.discovered, created: row.created, updated: row.updated,
    skipped: row.skipped, processed: row.processed,
    source_ids: row.source_ids ?? [], categories: row.categories ?? [],
    processed_pages: row.processed_pages ?? [], failed_pages: row.failed_pages ?? [],
    errors: Array.isArray(row.errors) ? row.errors : [],
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

router.get("/raw-materials", async (req, res): Promise<void> => {
  if (getSupabaseConfigIssue()) {
    if (!isLegacyDatabaseConfigured) {
      res.status(503).json({ error: "The raw-material catalog is unavailable until Supabase is configured." });
      return;
    }
    try {
      const rows = await db.select().from(rawMaterialsTable)
        .where(eq(rawMaterialsTable.published, true))
        .orderBy(asc(rawMaterialsTable.name));
      req.log.warn("Supabase is not ready; serving the existing Replit raw-material catalog without changing it");
      res.setHeader("X-Maya-Catalog-Source", "legacy");
      res.json(ListRawMaterialsResponse.parse(rows.map(api)));
    } catch (error) {
      req.log.error({ err: error }, "Legacy raw-material catalog read failed");
      res.status(503).json({ error: "Raw materials are temporarily unavailable." });
    }
    return;
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("products")
      .select("*")
      .eq("product_type", "raw_material")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) {
      req.log.error({ code: error.code }, "Supabase raw-material catalog read failed");
      res.status(503).json({ error: "Raw materials are temporarily unavailable." });
      return;
    }
    res.setHeader("X-Maya-Catalog-Source", "supabase");
    res.json(ListRawMaterialsResponse.parse((data as SupabaseMaterialRow[]).map(supabaseApi)));
  } catch (error) {
    req.log.error({ err: error }, "Supabase raw-material request failed");
    res.status(503).json({ error: "Raw materials are temporarily unavailable." });
  }
});

router.use("/admin/raw-materials", requireAdmin, (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "PATCH" || req.method === "DELETE") { next(); return; }
  const key = req.ip ?? "unknown";
  const now = Date.now();
  if (calls.size > 1000) for (const [ip, value] of calls) if (now - value.at >= 60_000) calls.delete(ip);
  const entry = calls.get(key);
  if (!entry || now - entry.at >= 60_000) calls.set(key, { at: now, count: 1 });
  else if (++entry.count > 40) { res.status(429).json({ error: "Please wait before requesting more supplier data." }); return; }
  next();
});

router.get("/admin/raw-materials", async (req, res): Promise<void> => {
  if (getSupabaseConfigIssue()) {
    if (!isLegacyDatabaseConfigured) {
      res.status(503).json({ error: "Saved raw materials are unavailable until Supabase is configured." });
      return;
    }
    try {
      const rows = await db.select().from(rawMaterialsTable).orderBy(asc(rawMaterialsTable.name));
      req.log.warn("Supabase is not ready; serving the existing Replit raw-material catalog to the administrator");
      res.setHeader("X-Maya-Catalog-Source", "legacy");
      res.json(ListAdminRawMaterialsResponse.parse(rows.map(api)));
    } catch (error) {
      req.log.error({ err: error }, "Legacy admin raw-material read failed");
      res.status(503).json({ error: "Saved raw materials are temporarily unavailable." });
    }
    return;
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("products")
      .select("*")
      .eq("product_type", "raw_material")
      .order("name", { ascending: true });
    if (error) {
      req.log.error({ code: error.code }, "Supabase admin raw-material read failed");
      res.status(503).json({ error: "Saved raw materials are temporarily unavailable." });
      return;
    }
    res.setHeader("X-Maya-Catalog-Source", "supabase");
    res.json(ListAdminRawMaterialsResponse.parse((data as SupabaseMaterialRow[]).map(supabaseApi)));
  } catch (error) {
    req.log.error({ err: error }, "Supabase admin raw-material request failed");
    res.status(503).json({ error: "Saved raw materials are temporarily unavailable." });
  }
});

router.get("/admin/raw-materials/categories", async (req, res): Promise<void> => {
  try { res.json(ListHillenRawMaterialCategoriesResponse.parse(await fetchHillenCategories())); }
  catch (error) {
    req.log.warn({ reason: error instanceof HillenError ? error.message : "Supplier category discovery failed" }, "Raw material categories unavailable");
    res.status(502).json({ error: error instanceof HillenError ? error.message : "Supplier categories could not be discovered." });
  }
});

router.get("/admin/raw-materials/imports", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured to save import progress." });
    return;
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("raw_material_import_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error("Saved import history could not be loaded.");
    res.json(ListRawMaterialImportsResponse.parse(
      (data ?? []).map((row) => importJob(row as SupabaseImportRunRow)),
    ));
  } catch (error) {
    req.log.error({ err: error }, "Raw-material import history could not be loaded");
    res.status(503).json({ error: "Saved import history is temporarily unavailable." });
  }
});

router.post("/admin/raw-materials/imports", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured to save import progress." });
    return;
  }
  const input = CreateRawMaterialImportBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Select dry run or import, and a valid discovered source category." }); return; }
  const categoryId = input.data.category_id ?? null;
  try {
    const supabase = getSupabaseAdmin();
    if (input.data.mode === "import") {
      const { data: preview, error: previewError } = input.data.dry_run_id
        ? await supabase.from("raw_material_import_runs").select("*").eq("id", input.data.dry_run_id).maybeSingle()
        : { data: null, error: null };
      if (previewError) throw new Error("The dry-run report could not be loaded.");
      const runPreview = preview as SupabaseImportRunRow | null;
      const categoryMatches = runPreview?.category_id === categoryId;
      const reviewFresh = runPreview?.completed_at &&
        Date.now() - new Date(runPreview.completed_at).getTime() < 12 * 60 * 60 * 1000;
      if (!runPreview || runPreview.mode !== "dry-run" || runPreview.status !== "complete" || !categoryMatches || !reviewFresh) {
        res.status(400).json({ error: "Complete and review a fresh dry run for this category before importing." });
        return;
      }
    }

    let categoryName = "All categories";
    if (categoryId !== null) {
      try {
        const category = (await fetchHillenCategories()).find((item) => item.id === categoryId);
        if (!category) { res.status(400).json({ error: "Select a current Hillen99 category." }); return; }
        categoryName = category.name;
      } catch (error) {
        res.status(502).json({ error: error instanceof HillenError ? error.message : "Supplier categories could not be discovered." });
        return;
      }
    }
    const { data: run, error } = await supabase
      .from("raw_material_import_runs")
      .insert({
        mode: input.data.mode,
        status: "running",
        category_id: categoryId,
        category_name: categoryName,
      })
      .select("*")
      .single();
    if (error || !run) throw new Error("The import run could not be saved.");
    res.status(201).json(CreateRawMaterialImportResponse.parse(
      importJob(run as SupabaseImportRunRow),
    ));
  } catch (error) {
    req.log.error({ err: error }, "Raw-material import run could not be created");
    res.status(503).json({ error: "The import run could not be saved." });
  }
});

router.get("/admin/raw-materials/imports/:id", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured to load import progress." });
    return;
  }
  const params = GetRawMaterialImportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid import run ID." }); return; }
  try {
    const { data: run, error } = await getSupabaseAdmin()
      .from("raw_material_import_runs")
      .select("*")
      .eq("id", params.data.id)
      .maybeSingle();
    if (error) throw new Error("Import progress could not be loaded.");
    if (!run) { res.status(404).json({ error: "Import run not found." }); return; }
    res.json(GetRawMaterialImportResponse.parse(importJob(run as SupabaseImportRunRow)));
  } catch (error) {
    req.log.error({ err: error }, "Raw-material import progress could not be loaded");
    res.status(503).json({ error: "Import progress is temporarily unavailable." });
  }
});

router.post("/admin/raw-materials/imports/:id/step", async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured to save import progress." });
    return;
  }
  const params = GetRawMaterialImportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid import run ID." }); return; }
  const id = params.data.id;
  const now = new Date();
  const lease = randomUUID();
  const supabase = getSupabaseAdmin();
  let run: SupabaseImportRunRow | null = null;
  try {
    const { data, error } = await supabase
      .from("raw_material_import_runs")
      .update({
        lease_token: lease,
        lease_until: new Date(now.getTime() + 30_000).toISOString(),
        updated_at: now.toISOString(),
        status: "running",
      })
      .eq("id", id)
      .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
      .select("*")
      .maybeSingle();
    if (error) throw new Error("Import progress could not be claimed.");
    run = data as SupabaseImportRunRow | null;
  } catch (error) {
    req.log.error({ err: error }, "Could not claim raw-material import run");
    res.status(503).json({ error: "Import progress is temporarily unavailable." });
    return;
  }
  if (!run) {
    const { data: current, error } = await supabase
      .from("raw_material_import_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      res.status(503).json({ error: "Import progress is temporarily unavailable." });
      return;
    }
    if (!current) { res.status(404).json({ error: "Import run not found." }); return; }
    const currentRun = current as SupabaseImportRunRow;
    if (currentRun.status === "complete") {
      res.json(GetRawMaterialImportResponse.parse(importJob(currentRun)));
      return;
    }
    res.status(409).json({ error: "This saved import is already processing a page. Wait before resuming it." });
    return;
  }
  const retryPage = run.failed_pages?.[0];
  const page = retryPage ?? run.next_page;
  const failedPagesBefore = run.failed_pages ?? [];
  if (run.total_pages > 0 && page > run.total_pages) {
    const completedAt = failedPagesBefore.length ? null : now.toISOString();
    const { data: completed, error } = await supabase
      .from("raw_material_import_runs")
      .update({
        status: failedPagesBefore.length ? "partial" : "complete",
        lease_token: null,
        lease_until: null,
        completed_at: completedAt,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .eq("lease_token", lease)
      .select("*")
      .maybeSingle();
    if (error) {
      res.status(503).json({ error: "Import progress could not be saved." });
      return;
    }
    res.json(GetRawMaterialImportResponse.parse(importJob((completed ?? run) as SupabaseImportRunRow)));
    return;
  }
  const pageUrl = `https://hillen99.com/wp-json/wc/store/v1/products?per_page=100&page=${page}${run.category_id ? `&category=${run.category_id}` : ""}`;
  try {
    const result = await fetchHillenPage(page, run.category_id ?? undefined);
    const entries = result.products.map(parseHillenMaterial);
    const pageMaterials = [...new Map(entries.flatMap((entry) => entry ? [[entry.material.source_id, entry.material] as const] : [])).values()];
    const pageIds = pageMaterials.map((material) => material.source_id);
    const { data: existingRows, error: existingError } = pageIds.length
      ? await supabase.from("products").select("source_id").in("source_id", pageIds)
      : { data: [], error: null };
    if (existingError) throw new Error("Existing materials could not be checked in Supabase.");
    const existingIds = new Set((existingRows ?? []).map((row) => Number(row.source_id)));
    if (run.mode === "import") {
      for (const material of pageMaterials) await saveSupplierMaterial(material);
    }
    const previousSourceIds = run.source_ids ?? [];
    const sourceIds = new Set([...previousSourceIds, ...pageIds]);
    const categories = new Set([...(run.categories ?? []), ...pageMaterials.flatMap((item) => item.source_category.split(" / ").map((name) => name.trim()).filter(Boolean))]);
    const newlySeenIds = pageIds.filter((sourceId) => !previousSourceIds.includes(sourceId));
    const unsupported = entries.filter((entry) => !entry).length;
    const completedPages = [...new Set([...(run.processed_pages ?? []), page])].sort((a, b) => a - b);
    const failedPages = failedPagesBefore.filter((failed) => failed !== page);
    const nextPage = page === run.next_page ? page + 1 : run.next_page;
    const complete = nextPage > result.totalPages && failedPages.length === 0;
    const updatedAt = new Date();
    const newCount = newlySeenIds.filter((sourceId) => !existingIds.has(sourceId)).length;
    const refreshedCount = newlySeenIds.filter((sourceId) => existingIds.has(sourceId)).length;
    const priorErrors = (Array.isArray(run.errors) ? run.errors : []) as { page: number; url: string; message: string }[];
    const errors = [
      ...priorErrors.filter((item) => item.page !== page),
      ...entries.flatMap((entry, index) => {
        if (entry) return [];
        const product = result.products[index] as { id?: unknown; name?: unknown; permalink?: unknown };
        const id = Number.isSafeInteger(product?.id) ? product.id : null;
        const name = typeof product?.name === "string" ? product.name.replace(/<[^>]*>/g, "").slice(0, 100) : "";
        const sourceUrl = hillenUrl(product?.permalink) || pageUrl;
        return [{
          page, url: sourceUrl,
          message: `Skipped Hillen99${id === null ? "" : ` #${id}`}${name ? ` (${name})` : ""}: ${unsupportedHillenReason(product)}.`,
        }];
      }),
    ].slice(-250);
    const { data: saved, error: saveError } = await supabase
      .from("raw_material_import_runs")
      .update({
        status: complete ? "complete" : failedPages.length ? "partial" : "running",
        next_page: nextPage,
        total_pages: result.totalPages,
        discovered: sourceIds.size,
        created: run.created + newCount,
        updated: run.updated + refreshedCount,
        skipped: run.skipped + unsupported,
        processed: run.processed + result.products.length,
        source_ids: [...sourceIds],
        categories: [...categories].sort(),
        processed_pages: completedPages,
        failed_pages: failedPages,
        errors,
        lease_token: null,
        lease_until: null,
        updated_at: updatedAt.toISOString(),
        completed_at: complete ? updatedAt.toISOString() : null,
      })
      .eq("id", id)
      .eq("lease_token", lease)
      .select("*")
      .maybeSingle();
    if (saveError) throw new Error("The import progress could not be saved.");
    if (!saved) { res.status(409).json({ error: "Import progress changed. Reload the saved run before resuming." }); return; }
    req.log.info({
      runId: id, mode: saved.mode, page, imported: saved.created,
      refreshed: saved.updated, skipped: unsupported, complete: saved.status === "complete",
    }, "Raw material import page completed");
    res.json(GetRawMaterialImportResponse.parse(importJob(saved as SupabaseImportRunRow)));
  } catch (error) {
    const reason = error instanceof HillenError ? error.message : "This page could not be saved; retrying it will not change merchant prices.";
    const failures = [...new Set([...failedPagesBefore, page])].sort((a, b) => a - b);
    const previousErrors = (Array.isArray(run.errors) ? run.errors : []) as { page: number; url: string; message: string }[];
    const { data: saved, error: saveError } = await supabase
      .from("raw_material_import_runs")
      .update({
        status: "partial",
        next_page: run.next_page,
        total_pages: run.total_pages,
        failed_pages: failures,
        errors: [...previousErrors.filter((item) => item.page !== page), { page, url: pageUrl, message: reason }].slice(-250),
        lease_token: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
        completed_at: null,
      })
      .eq("id", id)
      .eq("lease_token", lease)
      .select("*")
      .maybeSingle();
    if (saveError) req.log.error({ code: saveError.code }, "Could not persist failed import page");
    req.log.warn({ runId: id, page, reason }, "Raw material import page failed and was recorded for retry");
    if (saved) { res.json(GetRawMaterialImportResponse.parse(importJob(saved as SupabaseImportRunRow))); return; }
    res.status(502).json({ error: reason });
  }
});

router.post("/admin/raw-materials/research", async (req, res): Promise<void> => {
  const input = ResearchRawMaterialsBody.safeParse(req.body);
  if (!input.success || input.data.query.trim().length < 2) { res.status(400).json({ error: "Enter a material name or keyword between 2 and 120 characters." }); return; }
  try {
    const matches = await searchHillenMaterials(input.data.query.trim());
    let answer = "";
    let warning = "";
    if (matches.length) {
      try { answer = await explainRawMaterials(input.data.query.trim(), matches); }
      catch (error) { warning = error instanceof Error ? error.message : "AI explanation is unavailable. Verified supplier results are shown."; }
    }
    res.json(ResearchRawMaterialsResponse.parse({ answer, warning, matches: matches.map((match) => match.material) }));
  } catch (error) {
    req.log.warn({ reason: error instanceof HillenError ? error.message : "Supplier search failed" }, "Raw material research failed");
    res.status(502).json({ error: error instanceof HillenError ? error.message : "Supplier search could not complete. Please try again." });
  }
});

router.post("/admin/raw-materials", async (req, res): Promise<void> => {
  const input = AddHillenRawMaterialBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Select a verified Hillen99 material." }); return; }
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase must be configured before adding raw materials." });
    return;
  }
  try {
    const { data: existingSupabase, error: existingError } = await getSupabaseAdmin()
      .from("products").select("*").eq("source_id", input.data.source_id).maybeSingle();
    if (existingError) throw new Error("Could not check the saved Supabase material.");
    if (existingSupabase) {
      res.json(AddHillenRawMaterialResponse.parse(supabaseApi(existingSupabase as SupabaseMaterialRow)));
      return;
    }
    const [existingLegacy] = isLegacyDatabaseConfigured
      ? await db.select().from(rawMaterialsTable).where(eq(rawMaterialsTable.sourceId, input.data.source_id))
      : [];
    const { material } = await fetchHillenMaterial(input.data.source_id);
    let saved = await saveSupplierMaterial(material);
    if (existingLegacy) {
      const { data: edited, error } = await getSupabaseAdmin()
        .from("products")
        .update({
          name: existingLegacy.name,
          description: existingLegacy.description,
          raw_material_category: existingLegacy.category,
          price: existingLegacy.price,
          currency: existingLegacy.currency,
          image_url: existingLegacy.imageUrl,
          is_active: existingLegacy.published,
        })
        .eq("source_id", input.data.source_id)
        .select("*")
        .single();
      if (error || !edited) throw new Error("Could not preserve the existing merchant-edited material.");
      saved = edited as SupabaseMaterialRow;
    }
    res.json(AddHillenRawMaterialResponse.parse(supabaseApi(saved)));
  } catch (error) {
    req.log.warn({ reason: error instanceof HillenError ? error.message : "Import failed" }, "Single material import failed");
    res.status(error instanceof HillenError ? 502 : 500).json({ error: error instanceof HillenError ? error.message : "The material could not be imported." });
  }
});

router.patch("/admin/raw-materials/:id", async (req, res): Promise<void> => {
  const params = UpdateRawMaterialParams.safeParse(req.params);
  const input = UpdateRawMaterialBody.safeParse(req.body);
  if (!params.success || !input.success || !Object.keys(input.data).length ||
      (input.data.name !== undefined && !input.data.name.trim()) ||
      (input.data.category !== undefined && !input.data.category.trim())) {
    res.status(400).json({ error: "Enter valid material details and a nonnegative price." }); return;
  }
  const data = input.data;
  const values: Record<string, unknown> = {};
  if (data.name !== undefined) values.name = data.name.trim();
  if (data.description !== undefined) values.description = data.description;
  if (data.category !== undefined) values.raw_material_category = data.category.trim();
  if (data.price !== undefined) values.price = data.price;
  if (data.currency !== undefined) values.currency = data.currency;
  if (data.published !== undefined) values.is_active = data.published;

  try {
    const { data: row, error } = await getSupabaseAdmin()
      .from("products")
      .update(values)
      .eq("legacy_id", params.data.id)
      .eq("product_type", "raw_material")
      .select("*")
      .maybeSingle();
    if (error) {
      req.log.error({ code: error.code }, "Supabase raw-material update failed");
      res.status(503).json({ error: "The material could not be updated in the catalog." });
      return;
    }
    if (!row) { res.status(404).json({ error: "Material not found." }); return; }
    res.json(UpdateRawMaterialResponse.parse(supabaseApi(row as SupabaseMaterialRow)));
  } catch (error) {
    req.log.error({ err: error }, "Supabase raw-material update failed");
    res.status(503).json({ error: "The material could not be updated in the catalog." });
  }
});

router.delete("/admin/raw-materials/:id", async (req, res): Promise<void> => {
  const params = DeleteRawMaterialParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid material ID." }); return; }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("products")
      .delete()
      .eq("legacy_id", params.data.id)
      .eq("product_type", "raw_material")
      .select("id")
      .maybeSingle();
    if (error) {
      req.log.error({ code: error.code }, "Supabase raw-material deletion failed");
      res.status(503).json({ error: "The material could not be removed from the catalog." });
      return;
    }
    if (!data) { res.status(404).json({ error: "Material not found." }); return; }
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ err: error }, "Supabase raw-material deletion failed");
    res.status(503).json({ error: "The material could not be removed from the catalog." });
  }
});

export default router;
