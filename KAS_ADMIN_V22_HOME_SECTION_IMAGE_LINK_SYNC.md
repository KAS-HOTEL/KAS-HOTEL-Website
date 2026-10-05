# KAS Admin V22 — Home Section & Image Link Sync

- Renamed Home content slots to match the visible `A Day in Saigon` and four `Bốn câu chuyện khu phố` cards.
- Added exact current image defaults from `index.html` to `site-image-slots.json`; stable keys and selectors are unchanged.
- Admin previews now show the active override when present, otherwise the website default image, with a direct open/copy link.
- Upload and URL override continue to use the existing `/api/admin/site-image`, `/api/admin/image-url`, and `/api/admin/image-overrides` flows.
- No booking, pricing, hotel, or non-Home page data/API was modified.
