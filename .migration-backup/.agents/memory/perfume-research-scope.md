---
name: Perfume research scope
description: Approved search provider and accuracy boundaries for admin fragrance research.
---
Use Brave for perfume image research. The user initially asked for Google, then explicitly selected Brave when offered the provider choice.

**Why:** They approved this alternative to Google Images through a separately configured search service. Do not describe the resulting feature as Google-powered.

**How to apply:** Keep real image results distinguishable from AI-written perfume details. Require merchant review of bottle identity, concentration, image rights, scent notes, and commercial fields before publishing. Scent notes are not evidence of the cosmetic ingredient list.

## Reliability budget

Budget external research and AI generation together; retries must use the remaining time rather than restarting a full request budget.

**Why:** The user reported intermittent AI gateway errors even though direct checks succeeded. Individually healthy providers do not establish reliability for the combined synchronous request.

**How to apply:** When changing the research pipeline, verify both authenticated live searches and simulated upstream failures. Keep temporary-outage recovery bounded and distinguish quota/configuration failures from transient failures.
