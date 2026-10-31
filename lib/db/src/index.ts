import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Replit provides DATABASE_URL for the app's own database. This project only
// uses its older PostgreSQL catalog as an explicit, one-time migration source.
const databaseUrl = process.env.LEGACY_DATABASE_URL?.trim();

export const isLegacyDatabaseConfigured = Boolean(databaseUrl);

// Keep a lazy default pool for routes that only touch it when a legacy source
// has been explicitly configured.
export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : new Pool();
export const db = drizzle(pool, { schema });

export * from "./schema";
