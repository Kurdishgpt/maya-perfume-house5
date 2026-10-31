import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

export const isLegacyDatabaseConfigured = Boolean(databaseUrl);

// Supabase-backed serverless functions do not need the legacy Replit DB pool.
export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : new Pool();
export const db = drizzle(pool, { schema });

export * from "./schema";
