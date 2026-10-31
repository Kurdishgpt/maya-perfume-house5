---
name: Catalog currency and bottle sizes
description: Merchant-selected currencies, no automatic conversion, and unknown bottle sizes.
---
The user explicitly chose both IQD and USD for catalog prices rather than USD-only pricing or converting IQD to USD.

**Why:** The currency request was ambiguous, so the user selected support for both currencies from those three alternatives.

**How to apply:** Treat the entered amount and selected currency as the merchant's price. Do not restore the former fixed-rate conversion or combine unlike currencies into a single total. Preserve existing USD amounts. Bottle size is merchant-entered in ml; leave an unknown size unspecified instead of inventing available sizes.
