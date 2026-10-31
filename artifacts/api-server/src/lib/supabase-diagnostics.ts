/** Classify failures without returning upstream messages, URLs, or credentials. */
export function supabaseFailure(error: { code?: string; message?: string }) {
  const code = error.code ?? "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) {
    return { status: "schema_not_ready", message: "The configured Supabase project is missing a required table or column.", code };
  }
  if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(code) || /invalid api key|invalid jwt|jwt expired/i.test(error.message ?? "")) {
    return { status: "access_denied", message: "Verify the server-side Supabase service-role key and project URL in the hosting runtime." };
  }
  return { status: "unavailable", message: "The hosting runtime could not read Supabase. Check runtime credentials, outbound connectivity, and server logs." };
}
