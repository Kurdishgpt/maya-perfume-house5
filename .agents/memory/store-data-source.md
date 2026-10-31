---
name: Store data source
description: The Maya storefront's production catalog source and optional legacy transfer database.
---

Use Supabase for the live product catalog and store operations. `LEGACY_DATABASE_URL` is an explicit opt-in source for one-time migration only; do not infer legacy data from Replit's automatically provided `DATABASE_URL`.

**Why:** The imported project uses Supabase as its production data store and retains old Replit PostgreSQL only for optional data transfer. Replit's default database may exist without the legacy catalog tables.

**How to apply:** Keep live routes on Supabase. Only read legacy tables or offer data transfer when `LEGACY_DATABASE_URL` is set.
