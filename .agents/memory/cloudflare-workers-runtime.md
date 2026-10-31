---
name: Cloudflare Workers runtime
description: Runtime boundaries for the Maya store's Cloudflare Worker deployment.
---

Keep the Cloudflare entry fetch-based and isolate platform adaptation at the Worker boundary. Share API business routes, but do not rely on a listening Node HTTP server, Replit Object Storage sidecars, or Replit-only connectors in the Worker runtime. Supabase Storage is the supported path for new product uploads.

**Why:** Cloudflare Workers handle Fetch requests and do not provide Replit's local sidecar services; Node HTTP server adapters are not a drop-in replacement.

**How to apply:** Verify compatibility using `wrangler dev` and `wrangler deploy --dry-run`. Before migrating additional endpoints, identify any Node server APIs or Replit integrations they depend on and replace those dependencies with Worker-compatible services.

For Cloudflare builds, define dependency overrides in the root package manifest's `pnpm.overrides`, and verify the lockfile with the build's pnpm 9.10 frozen-install mode.

**Why:** Cloudflare's pnpm 9.10 build rejected the lockfile metadata when overrides were configured only in workspace settings; root package overrides kept the same patches compatible with both the build and the local pnpm version.

**How to apply:** When changing overrides or regenerating the lockfile, validate frozen installs under pnpm 9.10 and the local pnpm version before publishing.

The workspace build runs Vite builds without Replit service environment variables. Vite configs must therefore keep `PORT` and `BASE_PATH` optional for builds, using defaults that match each artifact's service manifest.

**Why:** Cloudflare's build environment does not provide Replit's per-service variables, but Vite still loads server settings while producing static assets.

**How to apply:** Prefer explicit environment values when present; use the artifact's configured port and base path as build-safe defaults so local dev and preview keep their expected routes.
