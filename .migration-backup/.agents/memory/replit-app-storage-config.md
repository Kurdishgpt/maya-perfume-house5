---
name: Replit App Storage configuration
description: Keep App Storage bucket identifiers out of tracked configuration files.
---

Replit App Storage buckets are managed through the App Storage tool; do not hard-code a bucket ID in `.replit`. Keep any required environment settings in the platform-managed environment instead.

**Why:** Netlify secrets scanning blocked a deploy when the bucket ID was committed in `.replit`; Replit documentation confirmed the `.replit` bucket setting was unnecessary.

**How to apply:** When preparing this project for external hosting, preserve App Storage through its Replit-managed setup and remove committed bucket identifiers rather than disabling secrets scanning.
