# Maya Collection on Netlify

The repository is configured for a static Netlify site with the existing Express API served as a Netlify Function. The API keeps the existing `/api/...` routes; Netlify rewrites those requests to the `api` function. The React storefront stays a Vite build. The API can start without the legacy Replit database: catalog, contact, cart, checkout, and Hillen99 import progress use Supabase.

## Deploy

1. Push this repository to a Git provider supported by Netlify.
2. In Netlify, create a site by importing that repository. Keep the repository root as the base directory; `netlify.toml` supplies the build, publish, function, API rewrite, and SPA fallback settings.
3. Add the environment variables below in **Site configuration → Environment variables**. Do not put server secrets in Vite variables or commit them.
4. Trigger a deploy. The build command checks shared libraries and the API before building the storefront. Netlify bundles the function with esbuild.
5. Test `/api/healthz`, `/api/supabase/status`, catalog reads, admin unlock, image upload, cart, and checkout before sharing the site.

## Netlify monorepo build settings

On the Build settings screen, choose **Other (configure manually)** for **Project to deploy**. Do not select only `artifacts/maya-perfume-shop`; the API function and shared workspace packages are outside that folder. Keep this as one Netlify site using the repository root:

- Branch to deploy: `main`
- Base directory: `.`
- Install command: `pnpm install --frozen-lockfile`
- Build command: use the command in `netlify.toml`
- Publish directory: `artifacts/maya-perfume-shop/dist/public`
- Functions directory: `artifacts/api-server/netlify/functions`

These paths are relative to the repository root. If the dashboard has values that conflict with `netlify.toml`, clear the overrides or set them to the values above.

## Environment variables

Required for the Supabase-backed production paths:

- `VITE_SUPABASE_URL` — the exact HTTPS Project URL from Supabase → Project Settings → API.
- `VITE_SUPABASE_ANON_KEY` — public anon/publishable key; RLS must remain enabled.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret, never prefix with `VITE_`.
- `ADMIN_PANEL_PASSWORD` — choose a strong admin passcode.
- `SESSION_SECRET` — use a long random value for signing the admin session cookie.

Also add `GEMINI_API_KEY` if the AI description tools are needed. Configure any provider credentials those tools require in Netlify as server-only values.

`DATABASE_URL` is optional and is only needed for the one-time copy from the legacy Replit database. Hillen99 import-run progress and imported materials use Supabase. If you add `DATABASE_URL`, keep it server-only and confirm the source database accepts connections from Netlify. Do not use `SUPABASE_DB_URL` as `DATABASE_URL`; they identify different databases.

The `PORT` and `BASE_PATH` build values are already configured in `netlify.toml`. The publish directory is `artifacts/maya-perfume-shop/dist/public`, relative to the repository root. `SUPABASE_DB_URL` is not needed by the running function; use the Supabase SQL Editor to apply `supabase/migrations/20261030123000_maya_collection_core.sql`.

## Current limitations to resolve before production use

- The Supabase URL currently configured in Replit did not validate as an HTTP/HTTPS project URL. Enter the correct URL in Netlify and Replit, then verify `/api/supabase/status` reports connected before relying on Supabase-backed operations.
- Existing Replit Object Storage image paths cannot be served by Netlify Functions. New uploads use the Supabase image bucket; move any existing Replit-hosted product images to that bucket and update their product URLs.
- Brave image search uses the Replit-connected integration and is not automatically available to a Netlify deployment. The AI image-search feature needs a provider credential and a Netlify-compatible API call before it can be used there.
- Without `DATABASE_URL`, the one-time legacy Replit-to-Supabase transfer route is unavailable; no Supabase data is lost. Configure the source database only if that transfer is still required.
- Netlify publishing was not run from this workspace because no Netlify account connection is available here.
