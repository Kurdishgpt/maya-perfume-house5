# Maya Collection Supabase setup

This repository keeps the existing React/Vite storefront and Express API. Supabase is the intended production data store; the existing Replit PostgreSQL database is not deleted or modified by the Supabase migration.

## Configure Replit Secrets

Add the following in **Tools → Secrets**:

- `VITE_SUPABASE_URL` — Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable/anon key. This key is public by design; RLS must remain enabled.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key. Never add a `VITE_` prefix or place it in frontend code.
- `SUPABASE_DB_URL` — PostgreSQL connection string, used only for schema/data migration. Keep it secret.

Restart the web and API workflows after changing secrets. `.env.example` contains placeholders only and is not loaded automatically.

## Apply the schema

1. In Supabase, open **SQL Editor → New query**.
2. Copy and run the complete `migrations/20261030123000_maya_collection_core.sql` file.
3. Confirm that the `products`, `profiles`, `wishlist_items`, `carts`, `cart_items`, `orders`, `order_items`, `site_settings`, `contact_messages`, and `raw_material_import_runs` tables exist and RLS is enabled.
4. In **Storage**, confirm the public `maya-product-images` bucket exists with a 5 MB limit and image-only MIME types.
5. In the unlocked admin panel, open **Settings → Supabase database → Copy existing store data**. Review the returned inserted/duplicate/error counts, then repeat the operation if any transient errors were reported. The copy is non-destructive and does not overwrite Supabase records already present.

The migration is additive and idempotent; it does not drop tables or delete existing data. The current Replit database remains intact as the migration source until the Supabase cutover is verified.

## Administrator authorization

Database administrator policies check the authenticated user's trusted `app_metadata.role` claim for `admin`; client-editable user metadata is not used. In **Authentication → Users**, create the first administrator user, then assign `app_metadata`:

```json
{ "role": "admin" }
```

Only a project owner or trusted server-side administrator should assign this claim. Customer signup must never be allowed to set it. Existing catalog API mutations continue to require server-validated admin access; no database key is sent to the browser.

## Existing data and cutover

At inspection, the Replit database contained 0 perfume products and 326 Hillen99 raw-material records. The product schema includes source metadata so the raw-material catalog can be transferred without losing supplier URLs, source prices/currency, quantity options, availability, or merchant-edited names/prices. Do not import supplier availability as Maya inventory. The store's current public product data should be checked against the original database before switching production traffic.

Do not clear or replace the Replit database as part of setup. The migration is not considered complete until the existing catalog has been transferred, Supabase policies and storage have been verified against the actual project, and the storefront/API have passed the checks below.

## Verification checklist

- [ ] Public visitors can read active products only; inactive products remain private.
- [ ] Customer signup creates a profile; a customer cannot read or modify another customer's profile, wishlist, cart, or orders.
- [ ] Guest cart access is restricted to a server-issued HttpOnly token.
- [ ] Admin mutations reject requests without server-verified admin authorization.
- [ ] Order creation uses current database prices, enforces a single currency per order, checks stock under row locks, and cannot be called by anon/authenticated clients directly.
- [ ] Perfume inventory is decremented atomically; raw-material estimates remain pending Maya's availability/price confirmation.
- [ ] Product image uploads reject unsupported MIME types and files larger than 5 MB.
- [ ] Catalog search, category/brand filters, price sorting, and pagination work with real Supabase rows.
- [ ] CSV imports validate every row, report failures, batch writes, and upsert by SKU/slug; CSV export opens successfully.
- [ ] English, Kurdish (Sorani), and Arabic UI and RTL layouts remain intact.
- [ ] Mobile home, collection, product, raw materials, bag, checkout, account, and admin pages render without console errors.

## Current implementation status

The schema, server/client SDKs, admin transfer controls, catalog CSV tools, server-validated guest checkout, guest-bag sync, Supabase contact storage, and signed product-image uploads are implemented. When Supabase is not configured, public catalog reads stay on the existing Replit database and the admin connection panel reports the setup issue. Writes that require Supabase stay unavailable until configuration and schema setup are complete.

Customer sign-in, cross-device wishlist syncing, an order-history/admin-order interface, and server-side catalog pagination are not part of this implementation. The checklist above still needs to be run against the actual Supabase project. Do not describe the migration as complete until the project URL is valid, the SQL migration is applied, existing rows are copied, and the checks pass.
