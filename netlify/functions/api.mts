import type { Config, Context } from "@netlify/functions";
import { handleApiRequest } from "../../artifacts/api-server/src/cloudflare-worker";
import { runtimeEnvironmentKeys, withRuntimeEnvironment } from "../../artifacts/api-server/src/lib/runtime-env";

export default async (request: Request, context: Context): Promise<Response> => {
  const bindings = Object.fromEntries(runtimeEnvironmentKeys.map((name) => [name, Netlify.env.get(name)]));
  // Use the platform's verified address, rather than a caller-supplied header.
  const headers = new Headers(request.headers);
  headers.set("cf-connecting-ip", context.ip);
  const forwarded = new Request(request, { headers });
  return withRuntimeEnvironment(bindings, () => handleApiRequest(forwarded));
};

export const config: Config = { path: ["/api", "/api/*"] };
