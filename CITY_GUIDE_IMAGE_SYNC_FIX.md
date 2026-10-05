# City Guide image sync fix

## Problem
`admin.html` already managed the 40 `guidebook.entry.*` image keys, and `city-guidebook.html` already consumed them through `js/site-images.js`. However, `city-guide.html` was not loading `js/site-images.js`, so its 40 `.cg-card` images stayed on their inline defaults.

## Fix
- `city-guide.html` now loads `js/site-images.js`.
- `js/site-images.js` now applies the existing `guidebook.entry.<hash>` override to matching `.cg-card` elements on `city-guide.html`.
- No duplicate image keys were introduced.
- The same Guidebook image key now drives the corresponding card on both City Guide and City Guidebook pages.
