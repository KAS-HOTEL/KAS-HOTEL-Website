# 08 — Information Architecture

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Confirmed page inventory

**CONFIRMED** — The website must eventually contain:

Home · Hotels · Hotel Detail · Rooms · Booking / Your Stay · Login · Register · Customer Dashboard ·
My Bookings · Booking Detail · Reviews · About KAS · KAS Story · Locations · Offers / Vouchers ·
Contact · FAQ · Policies

## 2. Sitemap

**PROPOSED**

```
KAS Public Site
│
├── Home                                    /
│
├── Hotels                                  /hotels
│   └── Hotel Detail                        /hotels/{property-slug}
│       ├── Rooms                           /hotels/{property-slug}/rooms
│       │   └── Room Type Detail            /hotels/{property-slug}/rooms/{room-type-slug}
│       ├── Gallery                         /hotels/{property-slug}/gallery
│       ├── Location                        /hotels/{property-slug}/location
│       └── Reviews                         /hotels/{property-slug}/reviews
│
├── Search Results                          /search?…
├── Your Stay                               /your-stay
│   ├── Guest Details                       /your-stay/details
│   ├── Review                              /your-stay/review
│   └── Request Sent                        /your-stay/sent/{reference}
│
├── Locations                               /locations
├── Compare                                 /compare?properties=…
├── Rooms & Experiences                     /experiences
├── Offers                                  /offers
│   └── Offer Detail                        /offers/{slug}
│
├── About KAS                               /about
│   └── Our Story                           /about/story
├── Service Promise                         /about/service          (PROPOSED)
├── Contact                                 /contact
├── FAQ                                     /faq
├── Policies                                /policies
│   ├── Booking Terms                       /policies/booking
│   ├── Cancellation                        /policies/cancellation
│   ├── Privacy                             /policies/privacy
│   ├── Terms of Use                        /policies/terms
│   └── Cookies                             /policies/cookies
│
├── Account
│   ├── Login                               /login
│   ├── Register                            /register
│   ├── Forgot / Reset Password             /forgot-password · /reset-password
│   ├── Verify Email                        /verify-email
│   └── Dashboard                           /account
│       ├── My Bookings                     /account/bookings
│       │   └── Booking Detail              /account/bookings/{reference}
│       ├── My Reviews                      /account/reviews
│       │   └── Write a Review              /account/reviews/new/{bookingReference}
│       ├── My Offers                       /account/offers
│       ├── Profile                         /account/profile
│       └── Preferences                     /account/preferences
│
├── Track Request (guest, signed link)      /track/{signedToken}
└── System
    ├── 404 / 500                           —
    ├── sitemap.xml · robots.txt            —
    └── Language switch                     /vi/… · /en/…
```

```
KAS Admin Console                           /admin
│
├── Dashboard                               /admin
├── Hotels                                  /admin/hotels
│   └── Hotel                               /admin/hotels/{id}
│       ├── Content · Gallery · Amenities · Location · Policies
│       └── Room Types                      /admin/hotels/{id}/room-types
│           └── Room Type                    …/{roomTypeId} → Images · Pricing · Inventory
├── Inventory Calendar                      /admin/inventory
├── Pricing                                 /admin/pricing
├── Booking Requests                        /admin/bookings
│   └── Booking Detail                      /admin/bookings/{reference}
├── Customers                               /admin/customers
├── Reviews                                 /admin/reviews
├── Vouchers                                /admin/vouchers
├── Notifications                           /admin/notifications
├── Emails                                  /admin/emails
├── Analytics                               /admin/analytics
├── Media Library                           /admin/media
├── Users & Roles         (SUPER_ADMIN)     /admin/users
├── Audit Log             (SUPER_ADMIN)     /admin/audit
└── Settings              (SUPER_ADMIN)     /admin/settings
```

## 3. URL conventions

**PROPOSED**

| Rule | Detail |
|---|---|
| Lowercase, hyphenated slugs | `/hotels/kas-milestone-premium-hotel` |
| Slugs are stable and immutable once published | Renames create a 301 from the old slug |
| Language prefix | `/vi/...` and `/en/...`; default language decided in OQ-020 |
| Search state in the query string | `?checkIn=2026-09-12&checkOut=2026-09-14&adults=2&children=0&rooms=1` — shareable and back-safe |
| No personal data in URLs | Ever. Booking references are opaque; guest tracking uses signed, expiring tokens |
| Booking reference format | `KAS-YYMMDD-XXXX`, non-sequential suffix so references are not enumerable |
| Trailing slashes | Omitted, enforced by redirect |
| Admin routes | All under `/admin`, excluded from indexing |

## 4. Navigation

### 4.1 Primary header

**PROPOSED**

```
[KAS]   Hotels   Locations   Offers   About   Contact        [VI/EN]  [Account]  [Book]
```

- Sticky on scroll, condensing to logo + Book + Account
- **Hotels** opens a rich menu listing all 8 properties with thumbnail and signature line — this
  makes the portfolio immediately legible and reinforces individual identity
- Once a search exists, the header **Book** control becomes a compact summary of the current search
  (dates, guests) and reopens the search panel
- Mobile: logo + search + menu; full-screen overlay navigation

### 4.2 Footer

**PROPOSED** — Five columns: *Our Hotels* (all 8 + Coming Soon) · *Discover* (About, Story, Service
Promise, Locations, Offers, Experiences) · *Guest Services* (My Bookings, FAQ, Contact, Reviews) ·
*Policies* (Booking, Cancellation, Privacy, Terms, Cookies) · *Contact & Legal* (address, phone,
email, Zalo, social, business registration details — OQ-021).
Plus: language switch, currency note, copyright.

### 4.3 Persistent booking access

**PROPOSED** — Booking entry must be reachable from every page: the header control on desktop, and a
sticky bottom bar on mobile property and room pages showing from-price and "Check availability".

## 5. Page composition

**PROPOSED** — Content blocks per page, defining what the CMS/admin must be able to manage.

| Page | Blocks |
|---|---|
| **Home** | Hero · Search · At a Glance · Story · Flagship · 8 Hotels · Find Your Stay · Rooms & Experiences · What's Around You · Service Promise · Reviews · Coming Soon · Footer |
| **Hotels** | Intro · Filter/sort · Editorial property tiles (varied) · Map teaser · Comparison CTA |
| **Hotel Detail** | Gallery · Identity · Sticky booking bar · Story · Signature experiences · Room types · Amenities · Location & nearby · Reviews · Good to know · Other KAS hotels |
| **Room Type Detail** | Gallery · Facts · Description · Amenities · Price & availability · Add to Your Stay · Policies |
| **Search Results** | Search summary (editable) · Filters · Sort · Property results · Map · Empty/alternative state |
| **Your Stay** | Selection summary · Editable lines · Dates & guests · Price breakdown · Policies · Request action |
| **Locations** | Map · District grouping · Property list · Landmark distance tool |
| **Offers** | Active offers · Terms · How to use with a booking request |
| **About / Story** | Founding 2019 · Passion as the first house · Growth to 8 · Service philosophy · Team · Portfolio |
| **Contact** | Per-property contact cards · General enquiries · Group/event enquiry form · Map |
| **FAQ** | Categories: booking process, payment, check-in, cancellation, amenities, accessibility |
| **Policies** | Booking terms · Cancellation · Privacy · Terms · Cookies |
| **Account Dashboard** | Upcoming stay · Recent requests · Pending reviews · Offers · Profile completeness |
| **Booking Detail** | Status timeline · Property · Rooms · Dates & guests · Price · Contact · Actions · Documents |

## 6. Content model

**PROPOSED** — What is structured data vs. editable content:

| Type | Managed as | Examples |
|---|---|---|
| **Structured domain data** | Admin forms over typed entities | Properties, room types, amenities, inventory, prices, bookings, reviews, vouchers |
| **Editorial content** | Rich text and media blocks attached to entities | Property stories, room descriptions, signature experiences |
| **Page content** | Managed page blocks | Homepage sections, About, Story, Service Promise |
| **Micro-copy** | Translation catalogue | Buttons, labels, validation, email subjects |
| **Legal content** | Versioned documents with effective dates | Policies, terms — versioning matters because a booking must reference the terms in force when it was made |

**PROPOSED** — A full third-party CMS is not recommended for v1. The admin console already needs to
manage properties, rooms, galleries, and amenities; adding a separate CMS creates two sources of
truth and a synchronisation problem. Structured content lives in the platform; a block-based page
editor covers editorial pages.

## 7. Internationalisation

**NEEDS CONFIRMATION** — Languages, default language, and currency display (OQ-020).

**PROPOSED** — Vietnamese and English, both first-class.

| Concern | Approach |
|---|---|
| Language routing | Path prefix `/vi/`, `/en/` — indexable, shareable, unambiguous |
| Language detection | `Accept-Language` on first visit only; explicit choice persisted and always overriding |
| Content model | Every guest-facing text field is localised; language is a first-class dimension, not a duplicated record |
| Fallback | Missing translation falls back to the default language and is flagged in admin as untranslated — never shown as an empty section |
| Currency | VND is primary. **Note: VND is a zero-decimal currency** and must be formatted `1.850.000 ₫`, not `1,850,000.00`. Multi-currency display is **FUTURE** and, if added, must be indicative-only with a stated conversion basis |
| Dates | Locale-appropriate formats; ICT (UTC+7) is the operational timezone; all timestamps stored in UTC |
| Fonts | Must fully support Vietnamese diacritics — validated before selection |
| SEO | `hreflang` pairs on every localised page; canonical per language |

## 8. SEO

**PROPOSED** — Direct booking depends on organic visibility; this is commercial infrastructure, not a
polish task.

- Server-rendered HTML for all public pages — a client-only render is not acceptable for a hotel
  brand competing with OTAs
- Unique title and meta description per page, editable in admin
- `Hotel` / `LodgingBusiness` structured data per property (address, geo, amenities, star rating,
  images, aggregate rating); `BreadcrumbList`; `FAQPage`; `Review`
- Clean canonical URLs; parameterised search results excluded from indexing
- `sitemap.xml` generated from published content, with `hreflang` alternates
- Image optimisation: modern formats, responsive sizes, explicit dimensions to avoid layout shift,
  descriptive alt text
- Core Web Vitals treated as launch gates
- Per-property location pages targeting district and landmark intent
- Google Business Profile alignment for all 8 properties (an operations task, flagged as OQ-036)

## 9. Analytics & measurement

**PROPOSED**

- Privacy-respecting analytics; consent-gated where legally required
- Funnel events: `search_performed`, `property_viewed`, `room_type_viewed`, `room_added_to_stay`,
  `stay_viewed`, `details_started`, `request_submitted`, `request_confirmed`
- No personal data in analytics payloads
- Admin-visible funnel and property performance dashboards
- Server-side event recording for booking-lifecycle events, so measurement does not depend on
  client-side tracking surviving ad blockers
