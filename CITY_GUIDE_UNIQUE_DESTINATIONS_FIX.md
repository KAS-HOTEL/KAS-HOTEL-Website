# City Guide — Unique Destinations Fix

- Removed repeated physical destinations from both English and Vietnamese City Guide listing pages.
- Kept the first occurrence as the canonical card; card numbers are recalculated within each section.
- Reduced Admin `site-image-slots.json` to one editable image slot per destination so duplicate variants do not appear as separate Admin entries.
- Guidebook detail pages and unrelated website pages are not removed or rewritten.
- When adding a destination, reuse its canonical slug/key instead of creating a second card/slot for the same physical place.
