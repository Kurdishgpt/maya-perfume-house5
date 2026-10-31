---
name: Contact details integrity
description: Rules for displaying Maya Collection store hours and location.
---
Only display merchant-confirmed store hours and location details. Maya most recently confirmed the hours 9:00 AM–6:00 PM on 2026-10-30; operating days were not specified. Use the merchant-supplied map destination and only show a marker at coordinates resolved from that destination.

**Why:** The user explicitly provided the latest time window but not operating days, and requires accurate location information without invented addresses or map markers.

**How to apply:** Display the currently confirmed 9:00 AM–6:00 PM window without adding days unless the merchant confirms them; allow admin edits or clearing. Use the supplied map link as the location source of truth, and never imply an approximate map pin is exact.
