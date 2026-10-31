import { AsyncLocalStorage } from "node:async_hooks";

export type RuntimeEnvironment = Record<string, string | undefined>;
export const runtimeEnvironmentKeys = [
  "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PANEL_PASSWORD", "SESSION_SECRET", "NODE_ENV", "GEMINI_API_KEY",
  "PUBLIC_OBJECT_SEARCH_PATHS", "PRIVATE_OBJECT_DIR",
] as const;

const environment = new AsyncLocalStorage<RuntimeEnvironment>();

/** Keep host bindings scoped to the request; never mutate shared process.env. */
export function withRuntimeEnvironment<T>(values: RuntimeEnvironment, run: () => T): T {
  return environment.run(values, run);
}

export function getRuntimeEnv(name: string): string | undefined {
  const bindings = environment.getStore();
  return bindings ? bindings[name] : process.env[name];
}
