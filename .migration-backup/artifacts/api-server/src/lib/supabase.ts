import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseConfigIssue(): "missing" | "invalid_url" | null {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
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
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (getSupabaseConfigIssue() !== null || !url || !serviceRoleKey) {
    throw new Error(
      "Supabase server access is not configured. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the hosting environment.",
    );
  }

  adminClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
}
