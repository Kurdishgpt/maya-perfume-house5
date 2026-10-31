# Maya Collection production verification

Verification date: October 31, 2026. Code changes were tested locally, including HTTP requests through Netlify Dev using the configured Supabase database. They were not deployed to the Cloudflare Worker serving `https://echodub.qzz.io` during this session. Production recovery remains pending that deployment and verification of its runtime secrets.

## Findings and causes

| Problem | Confirmed evidence | Cause and remaining uncertainty |
| --- | --- | --- |
| Home collection | The deployed JavaScript uses same-origin `/api/products`. The live API returned JSON HTTP 503; `/api/healthz` returned 200. With the configured database, the updated local API returned HTTP 200 and `[]`. | Requests reach the deployed Cloudflare API. Its database access fails at runtime. Separately, the accessible Supabase project has no perfume rows. The exact deployed credential/project/connectivity failure cannot be established without Cloudflare runtime settings or logs. |
| Raw materials | Live `/api/raw-materials` returned JSON 503. Direct authenticated, read-only queries found 326 active raw materials. The updated local API and Netlify HTTP function returned all 326 with successful response-schema validation. | Existing records are present in `public.products`, filtered by `product_type = 'raw_material'` and `is_active = true`. They are not stored in a separate Supabase `raw_materials` table. The production failure is in the deployed database-access path, rather than an empty catalog or frontend endpoint typo. |
| Admin login | Live passcode status returned 200. A single login attempt using the configured workspace passphrase returned 403 without issuing a cookie. That same credential worked locally, including an authenticated admin catalog read. | The deployed verifier does not accept the configured workspace credential. Older code returned the same 403 for a missing password and a mismatched password, so those cases cannot be distinguished remotely. Missing `SESSION_SECRET` would have returned 503. The updated API checks both required settings before verification. |
| Misleading database status | Live readiness returned 503 `schema_not_ready` with no database error code. Direct queries to both `site_settings` and the catalog succeeded. | The old endpoint labeled every Supabase read failure as a missing migration. That diagnosis was unsupported. The updated endpoint distinguishes missing tables/columns, access denial and other connectivity/runtime failures. |
| Netlify API | The inspected Netlify deployment published a frontend and exposed no deployed API functions. Its site settings did not attach `echodub.qzz.io`. | Building the Node API does not start a persistent server on a static host. The added Netlify Function serves the existing API routes on Netlify. It does not update the separate Cloudflare deployment. |

The live frontend uses the correct same-origin paths for the current combined Worker architecture. No cross-origin API host appeared in its deployed bundle. Same-origin requests do not need CORS permissions, and admin cookies remain on the same host. No arbitrary API origin, broad CORS allowance or authentication bypass was introduced.

Some Python HTTP probes received Cloudflare-generated 403 responses even for the homepage; Node fetch requests reached the application and produced the statuses above. This client-dependent edge behavior is separate from the application's passphrase rejection. Cloudflare security logs were not accessible here. No real browser automation was available; frontend verification covered the deployed bundle and HTTP routing, rather than rendered interactions.

## Database results

These exact counts came from read-only PostgREST count queries using the configured server credentials, not from sample data:

| Query in `public.products` | Count |
| --- | ---: |
| All records | 326 |
| Perfumes, including inactive | 0 |
| Active perfumes | 0 |
| Raw materials, including inactive | 326 |
| Active raw materials | 326 |

The singleton `site_settings` record was also readable. All 326 active raw materials passed the existing API response schema. No tables, policies, records, names, prices, images, descriptions, SKU values or CAS information were edited. Database schema or permission changes were neither required by the accessible project's reads nor attempted.

There is nothing to reimport for raw materials in this project. For missing perfumes, first confirm that this is the intended Supabase project. If the real perfume catalog lives in a legacy source, recover/export those actual records. The existing authenticated legacy migration requires `LEGACY_DATABASE_URL`, which is absent here; review that source and back up the destination before using it. The migration also handles other tables, so review its complete scope. Alternatively, use the existing admin catalog entry/import tools with verified real records and prices. Do not create example perfumes to hide the empty catalog or run an unverified reset/migration against production.

## Changes

- `netlify/functions/api.mts`, `netlify/tsconfig.json`, and `netlify.toml`: added a same-origin Netlify API entry point using the existing routes, verified platform client addresses, configured the local development port, and selected the complete root build for automatic deployment validation. The existing correct `dist/public` publish directory and frontend routing fallback were preserved.
- `artifacts/api-server/src/lib/runtime-env.ts` and `cloudflare-worker.ts`: added request-scoped runtime bindings without mutating shared process environment values. Cloudflare now passes its bindings explicitly. API logging emits application events and bounded error codes rather than raw exception objects. The request adapter is shared with Netlify.
- `lib/supabase.ts`: supported server-only `SUPABASE_URL`, retained `VITE_SUPABASE_URL` compatibility, and stopped retaining a credential-bearing client from an earlier request/configuration.
- `middlewares/requireAdmin.ts` and `routes/admin.ts`: used the active runtime settings and returned 503 when the password or signing secret is absent. Constant-time credential comparison, signed 30-minute sessions, secure production cookies, authorization and the existing login-attempt limiter were preserved.
- `routes/cart.ts`, `routes/orders.ts`, `routes/fragrance.ts`, `lib/rawMaterialAi.ts`, and `lib/objectStorage.ts`: used the same runtime settings for cookie security and existing integrations.
- `lib/supabase-diagnostics.ts` and `routes/health.ts`: corrected failure classification, checked required catalog columns, and disabled caching of readiness responses.
- `cloudflare-app.ts`: included the request-logger type augmentation for independent function type checking.
- `wrangler.jsonc`: explicitly routed `/api` and `/api/*` through the Worker before the asset fallback.
- Root `package.json`, `pnpm-lock.yaml`, and `tsconfig.base.json`: supplied function runtime dependencies and workspace source resolution, added the test runner/function types, and included function type checking in root checks. `.gitignore` excluded local Netlify output.
- `artifacts/api-server/tests/api-runtime.test.mjs` and its package test command: added authentication, runtime isolation, adapter routing, missing-configuration and readiness regression tests.
- `.env.example` and `CLOUDFLARE.md`: documented the server URL setting, separate deployment targets and recovery procedure.

The storefront design and existing loading, empty-catalog, retry, search, sort, wishlist, cart, checkout and admin interfaces were retained. No sample-product fallback was added. Existing JSON-response validation in the API client was retained.

## Verification results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed with the final lockfile |
| `pnpm run typecheck` | Passed for shared libraries, API, storefront, mockup workspace, scripts and Netlify Functions |
| API test suite | 34 passed |
| Storefront test suite | 8 passed |
| Root production build | Not manually executed: this environment delegates builds to automatic validation. Netlify is configured to run `pnpm run build`; its deployment result remains pending. |
| Local HTTP `/`, `/collection`, `/raw-material`, `/admin` | 200 HTML through Netlify Dev on port 8889 |
| Local HTTP `/api/healthz` | 200 JSON |
| Local HTTP `/api/supabase/status` | 200, `connected` |
| Local HTTP `/api/products` | 200 JSON, 0 real perfume records |
| Local HTTP `/api/raw-materials` | 200 JSON, 326 real records |
| Local HTTP configured admin login | 200; issued a signed session cookie |
| Local authenticated admin catalog | 200; 326 records |
| Local unauthenticated admin catalog | 401 |
| Local unknown API route | JSON 404; did not return storefront HTML |
| Signed-session security tests | Incorrect passphrases, tampering, expiry, signing-key rotation and unauthenticated writes rejected; existing login limit tested |
| Live Cloudflare health/catalog/auth | Health 200; both catalogs 503; configured passphrase 403; unauthenticated admin catalog 401 |

No authenticated create/update/delete operation was performed against the database. The local development process was stopped after verification.

## Required production settings and deployment

On the Cloudflare Worker serving `echodub.qzz.io`, open **Settings → Variables and Secrets** and verify the **runtime** configuration:

| Setting | Required action |
| --- | --- |
| `SUPABASE_URL` | Set the intended project's server URL. The existing `VITE_SUPABASE_URL` remains a fallback; remove stale conflicting server URL settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | Set a server-only service-role credential for that exact project. A public anon key is not a replacement. |
| `ADMIN_PANEL_PASSWORD` | Set the intended administrator passphrase as a runtime secret. This is the setting relevant to the live 403. |
| `SESSION_SECRET` | Keep a strong, stable server-only signing secret. Changing it invalidates existing admin sessions. |
| `NODE_ENV` | The Worker configuration sets production mode, enabling Secure cookies. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supply public project settings at frontend build time for existing direct storage integration. Use the same project as the server. |

`GEMINI_API_KEY` remains necessary for existing optional AI features. No secret belongs in a `VITE_` variable, browser bundle or repository. `SUPABASE_DB_URL` is not the credential consumed by these REST catalog queries.

For Netlify-hosted copies, supply the server settings in **Project configuration → Environment variables** with **Functions** scope for the target deployment context. Build-only settings do not prove that a Function can access the database. Cloudflare and Netlify settings do not synchronize automatically.

The inspected Netlify repository branch is `main`. This agent did not create a commit, push a branch or publish a Cloudflare deployment; repository publication is handled by the platform. After publication, deploy the reviewed revision to the correct Cloudflare Worker using the existing build/deploy workflow documented in `CLOUDFLARE.md`, then repeat the public endpoint and admin-session checks on the custom domain. Do not change DNS or HTTPS configuration as part of this fix. A passing build or local test does not establish production recovery.
