# Find Your KAS — Zero Hero & Admin image controls

- Updated `find-your-kas.html` hero proportions and typography for a more balanced desktop layout and more compact responsive behavior.
- The shared navigation on this page now uses the normal sticky header flow rather than a floating overlay, preventing the navigation from covering the hero title and labels. Other pages are unchanged.
- Added Admin section `Find Your KAS · Ảnh Zero` with independent upload/HTTPS URL controls for the main hero image (`find.zero.main`) and inset card image (`find.zero.card`).
- Added both image slots to `site-image-slots.json` and synchronized their overrides in `js/site-images.js`. The existing Admin upload and URL endpoints are reused.
- No booking, rate, hotel gallery, or unrelated page logic was changed.
