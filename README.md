# KAS Hotel Collection — Booking Demo

A fully functional hotel booking platform for the eight KAS properties in
Ho Chi Minh City. Real hotel and room data, a complete five-step booking flow, bilingual
EN/VI UI, and persistence via `localStorage`. The project also includes an optional Node/Express
server for admin room-photo uploads and persistent storage on Render.

**151 automated assertions · 0 failures.**

---

## Run it

For the public booking UI, any static server will do. For admin photo uploads and the
Render persistent-disk workflow, use the included Node/Express server.

```bash
cd kas-hotels

python3 -m http.server 8000     # → http://localhost:8000
# or
npx serve .

# Full app with admin upload endpoint (ADMIN_KEY is required; the server
# refuses to start without it or with a placeholder value)
npm install
ADMIN_KEY="your-long-random-key" npm start          # macOS / Linux
$env:ADMIN_KEY="your-long-random-key"; npm start     # Windows PowerShell
```

> Open it through a server, not `file://` — the pages share modules across files and
> `localStorage` behaves inconsistently on the `file:` origin.

The front end has no framework or bundler. The included upload server uses Node.js,
Express, and Multer.

---

## The booking flow

Every step below actually works and is guarded — you cannot skip ahead.

```
index.html            Home — hero search across all 8 properties
   ↓ Explore Rooms
hotels.html           ① SEARCH   — all 8 hotels, filters + sort
   ↓ View Rooms
hotel-detail.html     ② SELECT   — property gallery, room types, filters
   ↓ Select Room
room-detail.html      ② SELECT   — gallery, specs, policies, live price sidebar
   ↓ Book This Room
guest-details.html    ③ DETAILS  — validated form, guests, payment method
   ↓ Continue to Review
review-confirm.html   ④ REVIEW   — full read-back, price breakdown
   ↓ Confirm Booking
booking-confirmed.html ⑤ DONE    — booking number, calendar, print, download
   ↓ Manage Booking
manage-booking.html              — look up, modify, cancel
```

Guards: landing on `guest-details` or `review-confirm` without a selected room bounces you
back with a toast; a bad hotel/room id in the URL redirects; the confirmation page falls back
gracefully when a booking reference is unknown.

---

## File structure

```
/
├── index.html                 Home
├── hotels.html                Find Your Stay — 8 properties, filters, sort
├── hotel-detail.html          Property page + room availability
├── room-detail.html           Room page + booking sidebar
├── guest-details.html         Step 3 — guest form
├── review-confirm.html        Step 4 — review
├── booking-confirmed.html     Step 5 — confirmation
├── manage-booking.html        Look up / modify / cancel
│
├── css/
│   ├── style.css              Design tokens, typography, forms, header/footer
│   ├── components.css         Hero, cards, gallery, stepper, panels, modals
│   └── responsive.css         1440+ / 768–1439 / <768 + print
│
├── js/
│   ├── images.js              PHOTO CATALOGUE — by branch, by source category
│   ├── contact.js             CONTACT — phone / Zalo / WhatsApp, one source
│   ├── data.js                THE DATASET — 8 hotels, 48 room types, sources
│   ├── utils.js               Formatting, dates, price maths, icons, images
│   ├── storage.js             localStorage + booking-number generation
│   ├── app.js                 Header, footer, drawer, gallery, lightbox, modal
│   ├── booking.js             Booking state machine, validation, confirmation
│   ├── search.js              Search widget + summary bar
│   ├── hotel.js               Hotel/room cards, filtering, sorting
│   └── room.js                Room specs, policies, reviews
│
├── tools/
│   └── fetch-images.js        Vendor remote photos into /assets (see below)
│
├── DATA_AUDIT.md              Field-by-field source audit — read this
└── README.md
```

---

## Where the data comes from

**Short version: all 8 Agoda slugs are legacy names.** The properties have been rebranded
under KAS, and the Agoda pages are a JavaScript SPA that returns an empty shell to any
server-side fetch. Each slug was resolved to its current property via Google-indexed Agoda
page titles, then confirmed by exact street address.

| Branch | Agoda slug (legacy) | Current property |
|--------|---------------------|------------------|
| 01 | `cabana-hotel-saigon` | KAS Passion Boutique Hotel |
| 02 | `pravina-hotel_2` | KAS Premium Boutique Hotel |
| 03 | `song-anh-1-hotel` | KAS Ancient Luxury Hotel |
| 04 | `the-kas-hotel-saigon` | KAS Milestone Premium Hotel |
| 05 | `tuyet-lan-corner` | KAS Zody Boutique Hotel |
| 06 | `tuong-vy-hotel` | KAS Sonata Luxury Hotel |
| 07 | `apec-hotel` | KAS Eliana Luxury Hotel |
| 08 | `kas-mays-saigon` | KAS Dilly Luxury Hotel |

Room inventory comes from the operator's own site (kashotelpremium.com) and Trip.com;
ratings, review counts and price ranges from Tripadvisor. Fields that no source publishes
are `null` and render as *"Not published by source"* — nothing is invented.

**`DATA_AUDIT.md` documents every field, every source, and every gap.** Read it before
trusting any number on the page.

### Two things to know

1. **Prices are demo rates.** Live Agoda availability rates could not be retrieved. Each room
   carries a rate derived from its property's *published* price range, and every price panel
   in the UI says so. They are not live rates and are not presented as such.

2. **Photos are real, and now category-verified.** Photographs are taken from the source
   gallery's **Rooms** category, so no exterior, lobby or restaurant shot is served as a room
   photo. Each room type gets a *disjoint* slice — no photo appears under two room types, and
   none crosses a branch (both enforced by automated tests). What is still unverified is which
   *room type* a photo depicts: no source publishes that. Every room is flagged
   `NEEDS_REVIEW` on that dimension and the UI says so. Branches 01, 06 and 07 await category
   verification and show an amber chip instead of a green one.
   See `VERIFIED_ROOM_IMAGE_MATRIX.md` for the per-room record.

---

## Images

Photos are **hotlinked** from the source CDNs. The build environment's egress proxy blocked
those hosts (`403 connect_rejected — organization policy`), so they could not be downloaded
into `/assets` or shown in build-time screenshots. From a normal browser they should load
fine, along with Google Fonts.

If an image does fail, a **branded KAS placeholder** appears — never a broken-image icon and
never a photo from a different hotel. The loader steps down through render sizes actually
observed on the source pages before giving up.

To vendor the photos locally, from a machine with open internet:

```bash
node tools/fetch-images.js            # download into assets/images/hotels/
node tools/fetch-images.js --rewrite  # ...and repoint js/data.js at them
```

---

## Design system

| Token | Value | Use |
|-------|-------|-----|
| `--black` | `#0E0D0B` | Header, hero, dark panels |
| `--ivory` | `#FBF9F5` | Page ground |
| `--gold` | `#C2A25C` | Primary accent, CTAs |
| `--champagne` | `#E8D7B4` | Light accent on dark |
| `--brown` | `#6B553A` | Secondary accent |
| `--sand` / `--beige` | `#E3D9C6` / `#EDE6D9` | Borders, image grounds |

Headings in **Cormorant Garamond**, body in **Inter**. Gold is used as a thin accent —
hairline rules, small icons, one CTA per view — never as a large fill.

Responsive at 1440+ / 768–1439 / <768, with a hamburger drawer, vertical cards, a sticky
bottom booking CTA on room pages, swipeable galleries, and a print stylesheet for the
confirmation.

---

## Contact

One source of truth — `KAS_DATA.config.contact`, rendered via `js/contact.js`. No component
hard-codes a number or link.

| Channel | Value | Link |
|---|---|---|
| Phone | 0869 768 885 | `tel:+84869768885` |
| Zalo | Chat on Zalo | `https://zalo.me/0869768885` |
| WhatsApp | Chat on WhatsApp | `https://wa.me/84869768885` |

It appears in the header, the footer, the mobile drawer, the booking sidebars, the
confirmation screen, and a floating Call / Zalo / WhatsApp widget that collapses to a single
button and stays clear of the sticky Book CTA on mobile.

---

## Booking numbers

Format: `KAS` + 2-digit branch code + 5 random digits.

```
KAS0412345
 │   │  └── 5 random digits, unique across stored bookings
 │   └───── branch 04 = KAS Milestone Premium Hotel
 └───────── system prefix
```

The generator re-rolls on collision and falls back to a deterministic walk of the 5-digit
space if random attempts are exhausted. Verified: **2,000 consecutive numbers, zero
duplicates.**

---

## Price calculation

Never hard-coded — computed at runtime in `U.calcPrice()`:

```
nights        = checkOut − checkIn
subtotal      = pricePerNight × nights × rooms
serviceCharge = subtotal × 5%
VAT           = (subtotal + serviceCharge) × 8%
total         = subtotal + serviceCharge + VAT
```

Rates live in `KAS_DATA.config` (`serviceChargeRate`, `vatRate`), not in the view layer.

---

## localStorage

| Key | Contents |
|-----|----------|
| `kas_bookings` | Array of confirmed bookings (survives refresh and close) |
| `kas_recent_search` | Last search — dates, guests, rooms |
| `kas_current_booking` | In-progress draft; cleared on confirmation |
| `kas_guest_info` | Last guest details, used to prefill the next booking |

Booking record shape:

```js
{
  bookingNumber, branchId, branchCode, hotelId, hotelName, hotelAddress,
  roomId, roomName, roomSize, roomBed, roomView, roomMaxGuests, breakfast,
  checkIn, checkOut, checkInTime, checkOutTime, nights,
  adults, children, infants, rooms,
  guest: { title, firstName, lastName, email, phoneFull, nationality, dob, … },
  specialRequests, arrivalTime, purpose, heardFrom, paymentMethod,
  nightlyRate, roomRate, serviceCharge, vat, total, currency,
  cancellationDeadline, cancellationPolicy, priceBasis,
  status,        // CONFIRMED | MODIFIED | CANCELLED
  createdAt
}
```

All storage access is wrapped in try/catch — private browsing or blocked site data degrades
the demo gracefully rather than throwing.

---

├── server.js                    Optional Node/Express server for persistent admin uploads

## Test coverage

The suite drives a real headless browser through the whole product:

| Area | Covered |
|------|---------|
| Search validation | Missing dates, check-out ≤ check-in, adults ≥ 1, rooms ≥ 1 |
| Filters & sort | Price, room type, bed, view, amenities; 4 sort modes |
| Gallery | Thumbnails, next/prev, lightbox, Esc, keyboard, swipe |
| Guest form | Empty submit, bad email, empty phone, required names, occupancy cap |
| Flow guards | Deep-linking past a step, bad hotel/room ids, missing reference |
| Booking | Number format, uniqueness over 2,000 draws, totals consistent across 3 pages |
| Persistence | Refresh on confirmation, cancellation survives reload |
| Manage | Unknown number, wrong email, modify + reprice, cancel + confirm modal |
| Navigation | Browser back/forward across the flow |
| Data integrity | No duplicate ids, no photos shared across branches, every room sourced |
| Responsive | 390 / 900 / 1440 — no horizontal scroll on any page, drawer, sticky CTA |

---

## Known limitations

- **Booking data is demo/local.** There is no payment processing or live room inventory.
  Bookings live in the browser's `localStorage` and are not visible on another device.
- **Admin uploads use the included server.** Room/property photos can be uploaded through the
  admin UI and stored under `uploads/`; on Render, `uploads/` is intended to live on the
  configured persistent disk and is excluded from Git.
- **Live rates unavailable** — see above and `DATA_AUDIT.md` §5.
- **Room-level photo attribution unverified** — see `DATA_AUDIT.md` §4.
- **Branch 05 mapping** (`tuyet-lan-corner` → KAS Zody) is by elimination rather than a direct
  indexed title; it is the one mapping of the eight carrying residual uncertainty.
- Language switcher, sign-in and newsletter are UI only.


## V22.6 — Collection card names
- Collection card display names remove the trailing “Hotel” suffix.
- Hotel names are white, bold, and kept on one line to match the editorial reference layout.
