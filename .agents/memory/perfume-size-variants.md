---
name: Perfume size variants
description: The persistence and checkout invariant for per-size perfume options.
---

Store each sellable bottle size as its own product record and group those records into one fragrance for the admin and storefront. The internal family SKU identifies the group; each record remains the source of truth for that size's price and stock.

**Why:** The existing Supabase checkout transaction accepts product IDs and reads price and inventory from the corresponding product rows. Keeping each size as a product row preserves authoritative, transactional checkout without trusting client prices or replacing the live order procedure.

**How to apply:** Cart and checkout requests must send the selected size's product ID. If the storage model changes, update the checkout transaction and inventory checks together; do not store per-size prices only in client data.
