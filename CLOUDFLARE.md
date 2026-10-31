# Cloudflare Workers deployment

The root `wrangler.jsonc` deploys the storefront and API together as one Worker.
It serves the Vite build from `artifacts/maya-perfume-shop/dist/public` and
dispatches `/api/*` requests to the existing API routes.

## Cloudflare build settings

Run commands from the repository root:

- Build: `PORT=22746 BASE_PATH=/ pnpm run build`
- Production deploy: `pnpm run deploy:cloudflare`
- Branch preview deploy: `pnpm run preview:cloudflare`

The production script runs `wrangler deploy --config wrangler.jsonc --keep-vars`
using the pinned workspace Wrangler version. `--keep-vars` preserves runtime
variables configured in the dashboard. Production secrets remain server-side.

If the Cloudflare deployment pipeline currently runs `npx wrangler preview`,
that is a Preview deployment command. It is appropriate for branch previews;
the added `previews.vars.NODE_ENV = "development"` configuration supports it
in Wrangler 4.155.0. For the production pipeline serving the live domain, set
the deploy command to `pnpm run deploy:cloudflare` instead. Deployment commands
configured in the Cloudflare dashboard are not changed by editing this file.

The preview block contains no Supabase credentials, passwords, signing secrets,
or production resources. Configure isolated preview-only resources and secrets
through Cloudflare's Preview settings before testing database/admin features.
Without those settings, those features should report unavailable rather than
access production data. Production `vars.NODE_ENV` remains `production`.
The Worker entry point, assets, API routing and compatibility settings are
shared at the top level; they do not belong in the `previews` block.

Vite defaults to port 22746 and the root base path; the deployed Worker
does not open a listening port. The explicit root Wrangler config prevents
Wrangler from trying to guess which package in the pnpm workspace to deploy.

Set these build-time variables in the Cloudflare build environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `PORT=22746`
- `BASE_PATH=/`

Set these Worker runtime variables/secrets in Cloudflare:

- Variable: `SUPABASE_URL` (the server-only project URL; `VITE_SUPABASE_URL` remains supported as a fallback)
- Secret: `SUPABASE_SERVICE_ROLE_KEY`
- Secret: `ADMIN_PANEL_PASSWORD`
- Secret: `SESSION_SECRET`
- Secret: `GEMINI_API_KEY`

Replit Secrets do not automatically copy to Cloudflare. Set these values on the
Cloudflare Worker itself, and make sure `VITE_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` belong to the same Supabase project. The build-time
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must also point to that project.

After deploying, verify `GET /api/supabase/status` returns
`{"status":"connected"}` and both catalog endpoints return HTTP 200 JSON arrays.
An empty perfume array is a valid empty catalog, not a connection error.
`schema_not_ready` now specifically identifies a missing table/column;
`access_denied` indicates a credentials/permissions failure, and `unavailable`
indicates an unclassified runtime/connection failure. Check runtime logs before
applying any migration. Never reset the database to clear a readiness error.

The Worker reads request-scoped bindings explicitly; do not depend on build-time
variables becoming runtime secrets. API paths run through the Worker before the
static asset fallback. Keep the frontend's API requests on the same origin:
the storefront, API and signed admin cookies are served by the same Worker.
An unrelated cross-origin API URL would also require deliberate cookie/CORS changes.

If `POST /api/admin/passcode` returns HTTP 403, its configured password either
differs from the entered passphrase or is absent in an older deployment. The
updated API returns 503 when either `ADMIN_PANEL_PASSWORD` or `SESSION_SECRET`
is missing. Set the intended password as the Worker secret `ADMIN_PANEL_PASSWORD`.
Keep `SESSION_SECRET` stable across deployments unless intentionally invalidating
all admin sessions. Do not put either secret in the repository or browser code.

Netlify and Cloudflare deployments are independent. A Netlify deployment does
not publish a Worker update to `echodub.qzz.io`. Deploy the reviewed changes to
the Cloudflare Worker with the commands above and its production runtime secrets.
The Netlify configuration also deploys `/api/*` as a Function for Netlify-hosted
copies; its credentials must be available to Functions, not only to builds.
See [the production verification report](PRODUCTION-RECOVERY.md) for measured
record counts, test results, and the outstanding production steps.

The Supabase image bucket `maya-product-images` must exist. Keep the service-role
key private; only the public anon key belongs in the browser build.

## Cloudflare-specific limits

Legacy image URLs served from Replit Object Storage are not available in a
Cloudflare Worker. New product uploads use Supabase Storage; old Replit-hosted
images need to be copied to Supabase Storage and their product URLs updated.
The Replit-only fragrance image search connector also needs a Cloudflare-compatible
search provider before that optional admin feature can run there.
