import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Separate from perfume products: prices are per gram, not per bottle.
export type MaterialQuantityOption = { label: string; value: string; price?: number; currency?: string; unit?: string };

export const rawMaterialsTable = pgTable("raw_materials", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull(),
  sourceSku: text("source_sku"),
  sourceName: text("source_name").notNull(),
  sourceDescription: text("source_description").notNull().default(""),
  sourceCategory: text("source_category").notNull().default("Raw Material"),
  sourceImageUrl: text("source_image_url").notNull().default(""),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Raw Material"),
  price: numeric("price", { precision: 12, scale: 4, mode: "number" }).notNull(),
  currency: text("currency").notNull().default("USD"),
  sourcePrice: numeric("source_price", { precision: 12, scale: 4, mode: "number" }).notNull(),
  sourceCurrency: text("source_currency").notNull().default("USD"),
  imageUrl: text("image_url").notNull().default(""),
  sourceUnit: text("source_unit").notNull().default("g"),
  quantityOptions: jsonb("quantity_options").$type<MaterialQuantityOption[]>().notNull().default([]),
  sourceUrl: text("source_url").notNull(),
  supplierAvailable: boolean("supplier_available").notNull().default(false),
  sourceAvailable: boolean("source_available").notNull().default(false),
  published: boolean("published").notNull().default(true),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("raw_materials_hillen_source_unique").on(table.sourceId)]);

export type RawMaterialImportError = { page: number; url: string; message: string };
export const rawMaterialImportRunsTable = pgTable("raw_material_import_runs", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("running"),
  categoryId: integer("category_id"),
  categoryName: text("category_name").notNull().default("All categories"),
  nextPage: integer("next_page").notNull().default(1),
  totalPages: integer("total_pages").notNull().default(0),
  discovered: integer("discovered").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  sourceIds: integer("source_ids").array().notNull().default([]),
  categories: text("categories").array().notNull().default([]),
  processedPages: integer("processed_pages").array().notNull().default([]),
  failedPages: integer("failed_pages").array().notNull().default([]),
  errors: jsonb("errors").$type<RawMaterialImportError[]>().notNull().default([]),
  leaseToken: text("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
