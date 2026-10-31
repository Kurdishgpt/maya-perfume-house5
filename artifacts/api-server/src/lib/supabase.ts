import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeEnv } from "./runtime-env";

function serverUrl(): string | undefined {
  return (getRuntimeEnv("SUPABASE_URL") || getRuntimeEnv("VITE_SUPABASE_URL"))?.trim();
}

export function getSupabaseConfigIssue(): "missing" | "invalid_url" | null {
  const url = serverUrl();
  const serviceRoleKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceRoleKey) return "missing";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "invalid_url";
    return null;
  } catch {
    return "invalid_url";
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigIssue() === null;
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = serverUrl();
  const serviceRoleKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (getSupabaseConfigIssue() !== null || !url || !serviceRoleKey) {
    throw new Error(
      "Supabase server access is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the hosting runtime.",
    );
  }

  // Do not cache a client carrying credentials from a previous request/deploy.
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
