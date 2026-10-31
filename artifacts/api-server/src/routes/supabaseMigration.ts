import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  contactMessagesTable,
  db,
  isLegacyDatabaseConfigured,
  productsTable,
  rawMaterialsTable,
  rawMaterialImportRunsTable,
  storeContactSettingsTable,
} from "@workspace/db";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();
const batchSize = 100;

function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

function perfumeCategory(value: string): "women" | "men" | "unisex" {
  const category = value.toLowerCase();
  if (/\b(women|woman|female|femme|ladies)\b/.test(category)) return "women";
  if (/\b(men|man|male|homme|gentlemen)\b/.test(category)) return "men";
  return "unisex";
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

router.post("/admin/supabase/migrate-legacy", requireAdmin, async (req, res): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase server configuration is missing." });
    return;
  }
  if (!isLegacyDatabaseConfigured) {
    res.status(503).json({
      error: "The legacy source database is not configured in this deployment. No data was changed.",
    });
    return;
  }

  try {
    const [legacyPerfumes, legacyMaterials, legacyRuns, legacyMessages, legacySettings] = await Promise.all([
      db.select().from(productsTable),
      db.select().from(rawMaterialsTable),
      db.select().from(rawMaterialImportRunsTable),
      db.select().from(contactMessagesTable),
      db.select().from(storeContactSettingsTable).where(eq(storeContactSettingsTable.id, 1)).limit(1),
    ]);
    const supabase = getSupabaseAdmin();
    const errors: { record: string; reason: string }[] = [];
    let perfumesInserted = 0;
    let materialsInserted = 0;
    let runsInserted = 0;
    let messagesInserted = 0;

    const perfumeRows = legacyPerfumes.map((product) => ({
      name: product.title,
      slug: `legacy-perfume-${slugify(product.sku || product.title)}-${product.id}`,
      description: product.description,
      brand: product.brand,
      category: perfumeCategory(product.category),
      product_type: "perfume",
      price: product.price,
      currency: product.currency,
      image_url: product.imageUrl,
      additional_images: product.galleryImages,
      scent_family: product.ingredients[0] ?? null,
      top_notes: product.topNotes,
      middle_notes: product.heartNotes,
      base_notes: product.baseNotes,
      size_ml: product.bottleSizeMl,
      stock_quantity: product.stock,
      sku: product.sku.trim() || null,
      is_active: true,
    }));

    for (const batch of chunks(perfumeRows, batchSize)) {
      const { data, error } = await supabase
        .from("products")
        .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
        .select("id");
      if (error) {
        req.log.error({ code: error.code }, "Legacy perfume migration batch failed");
        errors.push({ record: "perfume batch", reason: "A perfume batch could not be copied." });
      } else {
        perfumesInserted += data?.length ?? 0;
      }
    }

    const seenSkus = new Set<string>();
    const materialRows = legacyMaterials.map((material) => {
      const normalizedSku = material.sourceSku?.trim() || "";
      const uniqueSku = normalizedSku && !seenSkus.has(normalizedSku);
      if (uniqueSku) seenSkus.add(normalizedSku);
      const image = material.imageUrl || "";
      return {
        name: material.name,
        slug: `hillen-${material.sourceId}-${slugify(material.name)}`.slice(0, 550),
        description: material.description,
        brand: "",
        category: "raw_materials",
        product_type: "raw_material",
        price: material.price,
        currency: material.currency,
        image_url: image,
        additional_images: image ? [image] : [],
        scent_family: null,
        top_notes: [],
        middle_notes: [],
        base_notes: [],
        size_ml: null,
        stock_quantity: 0,
        sku: uniqueSku ? normalizedSku : null,
        is_active: material.published,
        source_id: material.sourceId,
        source_sku: material.sourceSku,
        source_name: material.sourceName,
        source_description: material.sourceDescription,
        source_category: material.sourceCategory,
        source_image_url: material.sourceImageUrl,
        raw_material_category: material.category,
        source_price: material.sourcePrice,
        source_currency: material.sourceCurrency,
        source_url: material.sourceUrl,
        source_unit: material.sourceUnit,
        quantity_options: material.quantityOptions,
        supplier_available: material.supplierAvailable,
        source_available: material.sourceAvailable,
        imported_at: material.importedAt.toISOString(),
      };
    });

    for (const batch of chunks(materialRows, batchSize)) {
      const { data, error } = await supabase
        .from("products")
        .upsert(batch, { onConflict: "source_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        req.log.error({ code: error.code, batchSize: batch.length }, "Legacy raw-material migration batch failed");
        errors.push({ record: "raw-material batch", reason: "A raw-material batch could not be copied." });
      } else {
        materialsInserted += data?.length ?? 0;
      }
    }

    const runRows = legacyRuns.map((run) => ({
      legacy_id: run.id,
      mode: run.mode,
      status: run.status,
      category_id: run.categoryId,
      category_name: run.categoryName,
      next_page: run.nextPage,
      total_pages: run.totalPages,
      discovered: run.discovered,
      created: run.created,
      updated: run.updated,
      skipped: run.skipped,
      processed: run.processed,
      source_ids: run.sourceIds,
      categories: run.categories,
      processed_pages: run.processedPages,
      failed_pages: run.failedPages,
      errors: run.errors,
      created_at: run.createdAt.toISOString(),
      updated_at: run.updatedAt.toISOString(),
      completed_at: run.completedAt?.toISOString() ?? null,
    }));
    for (const batch of chunks(runRows, batchSize)) {
      const { data, error } = await supabase
        .from("raw_material_import_runs")
        .upsert(batch, { onConflict: "legacy_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        req.log.error({ code: error.code }, "Legacy raw-material import history migration failed");
        errors.push({ record: "raw-material import history", reason: "An import-history batch could not be copied." });
      } else {
        runsInserted += data?.length ?? 0;
      }
    }

    const messageRows = legacyMessages.map((message) => ({
      legacy_id: message.id,
      full_name: message.fullName,
      email: message.email,
      phone: message.phone,
      subject: message.subject,
      message: message.message,
      is_read: message.isRead,
      created_at: message.createdAt.toISOString(),
    }));
    for (const batch of chunks(messageRows, batchSize)) {
      const { data, error } = await supabase
        .from("contact_messages")
        .upsert(batch, { onConflict: "legacy_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        req.log.error({ code: error.code }, "Legacy contact message migration batch failed");
        errors.push({ record: "contact-message batch", reason: "A contact-message batch could not be copied." });
      } else {
        messagesInserted += data?.length ?? 0;
      }
    }

    const existingSettings = await supabase
      .from("site_settings")
      .select("store_hours")
      .eq("id", 1)
      .maybeSingle();
    if (existingSettings.error) {
      errors.push({ record: "site settings", reason: "Existing Supabase settings could not be read." });
    } else if (legacySettings[0] && existingSettings.data?.store_hours === "10:00 AM – 10:00 PM") {
      const settingsUpdate = await supabase
        .from("site_settings")
        .update({ store_hours: legacySettings[0].storeHours })
        .eq("id", 1);
      if (settingsUpdate.error) {
        errors.push({ record: "site settings", reason: "The existing store hours could not be copied." });
      }
    }

    const report = {
      source_counts: {
        perfumes: legacyPerfumes.length,
        raw_materials: legacyMaterials.length,
        raw_material_import_runs: legacyRuns.length,
        contact_messages: legacyMessages.length,
      },
      inserted_counts: {
        perfumes: perfumesInserted,
        raw_materials: materialsInserted,
        raw_material_import_runs: runsInserted,
        contact_messages: messagesInserted,
      },
      duplicate_or_existing_counts: {
        perfumes: legacyPerfumes.length - perfumesInserted,
        raw_materials: legacyMaterials.length - materialsInserted,
        raw_material_import_runs: legacyRuns.length - runsInserted,
        contact_messages: legacyMessages.length - messagesInserted,
      },
      errors,
      complete: errors.length === 0,
    };

    req.log.info(
      { ...report, errors: errors.length },
      "Legacy Maya Collection data migration finished",
    );
    res.status(errors.length ? 207 : 200).json(report);
  } catch (error) {
    req.log.error({ err: error }, "Legacy Maya Collection data migration failed");
    res.status(500).json({ error: "The existing catalog could not be migrated. The source database was not changed." });
  }
});

export default router;
