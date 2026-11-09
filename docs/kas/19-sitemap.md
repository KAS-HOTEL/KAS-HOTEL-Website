# 19 — Sitemap

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Zone A — Brand & Discovery (public, indexed)

```
/                                       Home
│
├── /hotels                             The Collection — all 8 properties, editorial
│   └── /hotels/{property}              Property detail
│       ├── /rooms                      Room types at this property
│       │   └── /{room-type}            Room type detail
│       ├── /gallery                    Immersive gallery
│       └── /reviews                    All verified reviews for this property
│
├── /locations                          Map-led discovery, all properties
│   └── /locations/{district}           District landing  (SEO — see §5)
│
├── /compare                            Compare up to 3 properties
│
├── /experiences                        Rooms & experiences across the portfolio
│
├── /offers                             Current offers
│   └── /offers/{offer}                 Offer detail
│
├── /reviews                            Portfolio-wide verified guest reviews
│
├── /about                              About KAS
│   ├── /about/story                    The KAS story — 2019 to eight houses
│   └── /about/service                  The service promise (the request model, explained)
│
├── /contact                            Contact — per property + general
├── /faq                                Frequently asked questions
│
└── /policies                           Policy index
    ├── /policies/booking               Booking terms
    ├── /policies/cancellation          Cancellation  ⚠ NEEDS CONFIRMATION (OQ-045)
    ├── /policies/privacy               Privacy
    ├── /policies/terms                 Terms of use
    └── /policies/cookies               Cookies
```

## 2. Zone B — Booking Request (public, not indexed)

```
/search                                 Availability view — date-scoped results
│
/stay                                   YOUR STAY  — the selection
├── /stay/details                       Your Details — guest information
├── /stay/review                        Review & confirm what you're requesting
└── /stay/sent/{reference}              Request sent — confirmation screen
```

**PROPOSED** — `/stay` is deliberately short and memorable. It is the customer-facing "Your Stay"
concept and is never called cart, basket, or checkout in any URL, label, or event name.

## 3. Zone C — Guest Account (authenticated, not indexed)

```
/login                                  Sign in
/register                               Create an account
/forgot-password                        Request a reset link
/reset-password                         Set a new password
/verify-email                           Email verification landing
│
/account                                Account home
├── /account/bookings                   My Stays  (tabbed: Upcoming · Requests · Past)
│   └── /account/bookings/{reference}   Stay detail + request status timeline
├── /account/reviews                    My Reviews
│   └── /account/reviews/new/{ref}      Write a review
├── /account/saved                      Saved Hotels        ⚠ pending OQ-056
├── /account/offers                     My Offers
├── /account/notifications              Notifications
├── /account/profile                    Profile
├── /account/preferences                Language · Currency · Communications
└── /account/security                   Password · Sessions · Sign out everywhere
│
/track/{signedToken}                    Track a request — guest (no account) access
```

**PROPOSED — "My Stays", not "My Bookings".** The section contains both submitted *requests* and
confirmed *stays*. "My Bookings" would imply everything inside is booked, which is precisely the
misunderstanding the whole product must avoid. Tabs separate the three states.

## 4. Zone D — Admin & Sales (staff, not indexed, `noindex` + robots-blocked)

```
/admin                                  Dashboard
│
│  ── DIRECT SALES ─────────────────────  CRM · channelType = DIRECT only
├── /admin/inquiries                    Sales inquiries — NEW / QUALIFIED / LOST  (V1)
│   └── /admin/inquiries/{id}           Qualify → creates a reservation
├── /admin/leads                        DIRECT REQUESTS — the direct sales queue
│   ├── ?view=new|mine|breaching|followup|all   Saved views
│   ├── ?leadSource=FACEBOOK|ZALO|WEBSITE|…     Lead source filter
│   ├── /admin/leads/new                Create a direct request (social, phone, walk-in, referral)
│   └── /admin/leads/{reference}        Lead workspace — the sales CRM
├── /admin/follow-ups                   Due and overdue follow-ups
├── /admin/assignments                  Sales assignments
│
│  ── OPERATIONS ───────────────────────  the operational hub · ALL channels
├── /admin/reservations                 All reservations, every channel
│   ├── ?channel=DIRECT|OTA             Channel filter
│   └── /admin/reservations/{reference} Reservation detail
├── /admin/arrivals                     Arrivals — direct AND OTA AND walk-in
├── /admin/departures                   Departures
├── /admin/occupancy                    In-house and occupancy
│
│  ── DISTRIBUTION ─────────────────────  external channels · never a sales queue
├── /admin/distribution/ota             OTA reservation register   TRANSITIONAL — V1
│   └── /admin/distribution/ota/new     Record an OTA reservation (manual)
├── /admin/distribution/channels        Channel status, allotment, recording lag, reconciliation
├── /admin/distribution/sync            Sync status                FUTURE
└── /admin/distribution/channel-manager Channel manager            FUTURE
│
├── /admin/hotels                       Properties
│   └── /admin/hotels/{id}              Property workspace
│       ├── /content                    Identity, story, highlights, SEO
│       ├── /gallery                    Media for this property
│       ├── /amenities                  Amenity assignment
│       ├── /location                   Address, map, nearby landmarks
│       ├── /policies                   Check-in/out, children, cancellation
│       ├── /experiences                Signature experiences (incl. flagship blocks)
│       └── /room-types                 Room types at this property
│           └── /{roomTypeId}           Room type workspace
│               ├── /content            Description, facts, amenities
│               ├── /images             Room imagery
│               └── /pricing            Base rate and rules for this room type
│
├── /admin/inventory                    Inventory calendar (cross-property)
├── /admin/pricing                      Rates and rate rules (cross-property)
├── /admin/availability                 Availability lookup — "what can I sell?"
│
├── /admin/customers                    Customers
│   └── /admin/customers/{id}           Customer record
│
├── /admin/reviews                      Review moderation
│   └── /admin/reviews/{id}             Review detail + reply
│
├── /admin/vouchers                     Offers & vouchers
│   └── /admin/vouchers/{id}            Voucher detail + usage
│
├── /admin/media                        Media library
│
├── /admin/notifications                Notification rules and delivery log
├── /admin/emails                       Email templates and delivery log
│   └── /admin/emails/templates/{key}   Template editor (localised, versioned)
│
├── /admin/analytics                    Analytics
│   ├── /requests                       Funnel, volume, conversion
│   ├── /properties                     Per-property performance
│   ├── /sales                          Response time, SLA compliance, agent conversion
│   └── /reviews                        Review scores over time
│
└── /admin/content                      Editorial pages (Home, About, Story, Service, FAQ, Policies)
    └── /admin/content/{pageKey}        Page block editor
```

## 5. Zone D′ — Super Admin (staff, `SUPER_ADMIN` only)

```
/admin/users                            Staff accounts
│   └── /admin/users/{id}               Account, role assignment, property scope, sessions
├── /admin/roles                        Roles and permission bundles
├── /admin/audit                        Audit log
└── /admin/settings                     System settings
    ├── /organisation                   Legal entity, contact, brand assets
    ├── /booking                        SLA, hold duration, request limits, expiry
    ├── /currency                       VND base, USD display, FX source     ⚠ OQ-052
    ├── /languages                      VI/EN, default, fallback behaviour
    ├── /policies                       Global policy defaults
    ├── /content-rules                  Positive-framing banned-phrase list
    ├── /integrations                   Email, storage, maps credentials (write-only)
    └── /features                       Feature flags
```

**PROPOSED** — Super Admin items live inside `/admin/*` rather than a separate `/super-admin` tree.
They are the same console with more permissions; a separate tree would duplicate layout, navigation,
and auth for no benefit and would make future role introduction harder.

## 6. Zone E — System

```
/404                                    Not found
/500                                    Something went wrong
/410                                    Permanently closed  (property lifecycle CLOSED)
/offline                                Offline fallback
/sitemap.xml                            Index → /sitemap-{locale}.xml
/robots.txt
/manifest.webmanifest
```

## 7. District landing pages

**PROPOSED** — `/locations/{district}` exists **only where KAS has a property in that district** and
is generated from data, not authored per district. It exists because "hotel in District 1 Ho Chi Minh
City" is real, high-intent search demand that a single `/locations` page cannot capture.

Content: district editorial intro, KAS properties there, what's nearby, map. If KAS has no property in
a district, the page does not exist — we do not create thin pages for SEO.

**Decision required — OQ-060:** we do not yet know which districts the 8 properties occupy. If all
eight are in one or two districts, this layer collapses to two pages and may not be worth building in
V1.

## 8. Page inventory

**PROPOSED** — `SSR` server-rendered · `SSG` statically generated, revalidated · `CSR` client-rendered.

| Page | URL | Zone | Auth | Indexed | Render | V1 |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Home | `/` | A | — | ✔ | SSG | ✔ |
| The Collection | `/hotels` | A | — | ✔ | SSG | ✔ |
| Property detail | `/hotels/{p}` | A | — | ✔ | SSG + live availability | ✔ |
| Room list | `/hotels/{p}/rooms` | A | — | ✔ | SSG + live availability | ✔ |
| Room type detail | `/hotels/{p}/rooms/{rt}` | A | — | ✔ | SSG + live availability | ✔ |
| Property gallery | `/hotels/{p}/gallery` | A | — | ✔ | SSG | ✔ |
| Property reviews | `/hotels/{p}/reviews` | A | — | ✔ | SSR | ✔ |
| Locations | `/locations` | A | — | ✔ | SSG | ✔ |
| District landing | `/locations/{d}` | A | — | ✔ | SSG | ⚠ OQ-060 |
| Compare | `/compare` | A | — | ✖ | CSR | ✔ |
| Experiences | `/experiences` | A | — | ✔ | SSG | ✔ |
| Offers | `/offers` · `/offers/{o}` | A | — | ✔ | SSG | ✔ |
| Reviews (portfolio) | `/reviews` | A | — | ✔ | SSR | ✔ |
| About · Story · Service | `/about/*` | A | — | ✔ | SSG | ✔ |
| Contact | `/contact` | A | — | ✔ | SSG | ✔ |
| FAQ | `/faq` | A | — | ✔ | SSG | ✔ |
| Policies | `/policies/*` | A | — | ✔ | SSG | ✔ |
| Search | `/search` | B | — | ✖ | SSR | ✔ |
| Your Stay | `/stay` | B | — | ✖ | CSR | ✔ |
| Your Details | `/stay/details` | B | — | ✖ | CSR | ✔ |
| Review request | `/stay/review` | B | — | ✖ | CSR | ✔ |
| Request sent | `/stay/sent/{ref}` | B | — | ✖ | SSR | ✔ |
| Auth pages | `/login` … `/verify-email` | C | — | ✖ | SSR | ✔ |
| Account home | `/account` | C | ✔ | ✖ | SSR | ✔ |
| My Stays | `/account/bookings` | C | ✔ | ✖ | SSR | ✔ |
| Stay detail | `/account/bookings/{ref}` | C | ✔ | ✖ | SSR | ✔ |
| My Reviews | `/account/reviews` | C | ✔ | ✖ | SSR | ✔ |
| Write review | `/account/reviews/new/{ref}` | C | ✔ | ✖ | SSR | ✔ |
| Saved Hotels | `/account/saved` | C | ✔ | ✖ | SSR | ⚠ OQ-056 |
| My Offers | `/account/offers` | C | ✔ | ✖ | SSR | ✔ |
| Notifications | `/account/notifications` | C | ✔ | ✖ | SSR | ✔ |
| Profile | `/account/profile` | C | ✔ | ✖ | SSR | ✔ |
| Preferences | `/account/preferences` | C | ✔ | ✖ | SSR | ✔ |
| Security | `/account/security` | C | ✔ | ✖ | SSR | ✔ |
| Track request (guest) | `/track/{token}` | C | signed link | ✖ | SSR | ✔ |
| Admin — all | `/admin/**` | D | staff | ✖ | SSR/CSR | see [21](21-admin-navigation.md) |
| System | `/404` `/500` `/410` `/offline` | E | — | ✖ | — | ✔ |

## 9. Depth analysis

**PROPOSED** — Maximum meaningful depth is **4 levels**, and only on the room-type path:

```
Home (0) → Hotels (1) → Property (2) → Rooms (3) → Room type (4)
```

Every commercially important page is reachable within **three clicks** from the homepage, and the
booking path from any property page is **two steps** (rooms → Your Stay). This is well inside the
threshold where breadcrumbs become necessary — which is why they are used only on the property path
and nowhere else ([20](20-customer-navigation.md) §5).

## 10. What is deliberately absent from the sitemap

**PROPOSED**

| Absent | Reason |
|---|---|
| `/cart`, `/checkout`, `/payment` | No purchase occurs. The vocabulary would misrepresent the model |
| Per-property blog or news | No content supply exists; thin pages hurt SEO |
| `/deals`, `/last-minute` | Discount-led surfaces contradict the premium positioning |
| Per-amenity landing pages | Thin, low-intent, and at n=8 they would each list one or two hotels |
| Separate mobile URLs (`m.`) | One responsive site, one URL set |
| Language-specific sitemaps | Locale is a dimension, not a separate tree ([25](25-i18n-currency-architecture.md)) |
| `/super-admin` tree | Same console, more permissions — see §5 |
| Public property "availability calendar" page | Encourages date-shopping over booking, and exposes inventory patterns |
