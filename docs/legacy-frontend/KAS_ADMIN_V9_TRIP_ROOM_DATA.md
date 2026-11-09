# KAS ADMIN V9 — Trip.com Room Data

- Room names/specs on the customer room cards are overlaid from the supplied Trip.com hotel pages.
- KAS pricing and STT mapping remain authoritative from `js/rates.js`.
- Hotel 04: Trip.com currently exposes an additional "Deluxe Room with Balcony" beyond the 6-room KAS rate sheet; it is not added to the priced 48-room inventory.
- KAS Zody (hotel-05): Trip.com exposes bed/window details but the extracted room listing does not publish m²; V9 leaves size unpublished rather than inventing it.
- The customer-facing "X ảnh phòng đã upload" badge has been removed. Uploaded room images remain available in the room gallery.
