# 22 — URL Architecture

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Principles

**PROPOSED**

1. **A URL is a promise.** Once published and indexed, it is permanent. Changing it costs rankings,
   breaks shared links, and invalidates emails already in guests' inboxes.
2. **Readable to a human first.** A guest should understand a URL read aloud over the phone.
3. **Hierarchy mirrors the IA.** The path expresses containment: property → rooms → room type.
4. **Locale is a path prefix**, not a subdomain, parameter, or cookie ([25](25-i18n-currency-architecture.md)).
5. **Slugs are stable and language-independent.** One slug, both locales.
6. **State goes in the query string; identity goes in the path.** Dates and filters are query
   parameters; a property is a path segment.
7. **Nothing personal in a URL.** Ever — not an email, not a name, not a phone number.
8. **Guessability is not access.** A reference in a URL never grants access on its own.

---

## 2. Canonical URL patterns

**PROPOSED**

| Pattern | Example |
|---|---|
| `/{locale}` | `/vi` · `/en` |
| `/{locale}/hotels` | `/en/hotels` |
| `/{locale}/hotels/{property}` | `/en/hotels/kas-milestone-premium-hotel` |
| `/{locale}/hotels/{property}/rooms` | `/en/hotels/kas-milestone-premium-hotel/rooms` |
| `/{locale}/hotels/{property}/rooms/{room-type}` | `…/rooms/deluxe-room` |
| `/{locale}/hotels/{property}/gallery` | `…/kas-sonata-luxury-hotel/gallery` |
| `/{locale}/hotels/{property}/reviews` | `…/kas-sonata-luxury-hotel/reviews` |
| `/{locale}/locations` | `/vi/locations` |
| `/{locale}/locations/{district}` | `/en/locations/district-1` |
| `/{locale}/search` | `/en/search?checkIn=…` |
| `/{locale}/stay` | `/en/stay` |
| `/{locale}/stay/details` · `/review` · `/sent/{reference}` | `/en/stay/sent/KAS-260912-4F7A` |
| `/{locale}/offers/{offer}` | `/vi/offers/tet-2027` |
| `/{locale}/about` · `/about/story` · `/about/service` | `/vi/about/story` |
| `/{locale}/policies/{policy}` | `/en/policies/cancellation` |
| `/{locale}/account/**` | `/en/account/bookings/KAS-260912-4F7A` |
| `/track/{signedToken}` | *(no locale — locale carried in the token)* |
| `/admin/**` | `/admin/leads/KAS-260912-4F7A` *(no locale — see §8)* |

---

## 3. Slug rules

**PROPOSED**

| Rule | Detail |
|---|---|
| Character set | Lowercase `a–z`, digits, hyphens. **No Vietnamese diacritics in slugs** |
| Diacritic handling | Transliterate on generation: `Khách sạn` → `khach-san`, `đ` → `d` |
| Word separator | Hyphen. Never underscore, never camelCase |
| Length | Target ≤ 60 characters |
| Uniqueness | Property slugs unique globally; room type slugs unique **within a property** |
| Generation | Auto-generated from the English name on creation, then **manually editable before first publish** |
| Immutability | **Frozen at first publish.** Any later change creates a permanent 301 from the old slug |
| Locale | **One slug serves both locales.** See §4 |
| Reserved words | `admin`, `api`, `search`, `stay`, `account`, `track`, `assets`, `_next`, `static`, `vi`, `en` cannot be slugs |

### 3.1 Property slugs

**PROPOSED** — Use the **full property name**, including the `kas-` prefix:

```
kas-passion-boutique-hotel
kas-elegance-hotel
kas-ancient-boutique-hotel
kas-milestone-premium-hotel
kas-zody-boutique-hotel
kas-sonata-luxury-hotel
kas-eliana-luxury-hotel
kas-dilly-hotel
```

Rejected alternative — short slugs (`/hotels/milestone`). They read well but lose the brand name from
the URL, which appears in search results, is spoken aloud, and is pasted into messages. Guests search
for "KAS Milestone", not "Milestone". The brand prefix is worth the extra characters.

### 3.2 Room type slugs

**PROPOSED** — Scoped to the property, so the same product name is stable across the portfolio:

```
/hotels/kas-milestone-premium-hotel/rooms/deluxe-room
/hotels/kas-sonata-luxury-hotel/rooms/deluxe-room      ← same slug, different property
```

This is correct: "Deluxe Room at Milestone" and "Deluxe Room at Sonata" are different products at
different URLs, and neither needs a disambiguating suffix.

**NEEDS CONFIRMATION** — Actual room type names are unknown (OQ-010), so no room slugs can be fixed yet.

---

## 4. Localisation and slugs

**PROPOSED — one slug, both locales:**

```
/en/hotels/kas-milestone-premium-hotel
/vi/hotels/kas-milestone-premium-hotel
```

**Not** `/vi/khach-san/kas-milestone-premium-hotel`.

Rationale:

| Argument | Assessment |
|---|---|
| Translated slugs marginally help local SEO | Real but small. Vietnamese guests overwhelmingly search the **brand name**, which is identical in both languages |
| Translated slugs double the URL surface | Every property gets two permanent URLs to maintain, redirect, and reconcile |
| Path segments (`/hotels/`) could be translated | Would mean two route trees, two sitemap structures, and a redirect matrix for every future page |
| Property names are proper nouns | "KAS Milestone Premium Hotel" is not translated in Vietnamese marketing either |
| Operational cost | Slug drift between locales is a recurring, hard-to-detect content bug |

**PROPOSED** — Path segments stay in English (`/hotels`, `/rooms`, `/locations`, `/about`) as stable
technical identifiers. **All visible content, labels, navigation and metadata are fully localised.**
A Vietnamese guest sees an entirely Vietnamese page; only the URL structure is English.

**Revisit trigger:** if Vietnamese organic performance materially underperforms English after launch,
reconsider translated segments as a measured change rather than a launch assumption. Logged as OQ-062.

---

## 5. Query parameters

**PROPOSED** — A fixed, documented vocabulary. Undocumented parameters are ignored and stripped from
canonicals.

| Parameter | Values | Used on |
|---|---|---|
| `checkIn`, `checkOut` | `YYYY-MM-DD` | search, property, rooms, stay |
| `adults`, `children` | integer | search, property, rooms |
| `childAges` | comma-separated integers | search, property, rooms |
| `rooms` | integer | search |
| `property` | slug (repeatable) | search, compare |
| `district` | slug | search, hotels |
| `near` | landmark slug | search, locations |
| `character` | slug (repeatable) | search, hotels |
| `amenity` | slug (repeatable) | search, hotels |
| `sort` | `recommended` · `price` · `rating` · `distance` | search, hotels |
| `view` | `list` · `map` | search, hotels, locations |
| `offer` | voucher code | stay |
| `lang`, `currency` | — | **Never.** These are preferences, not URL state (§6) |

**PROPOSED — rules:**
- **Every search state is URL-encoded**, so a search is shareable, bookmarkable, and back-button safe.
- Parameters are **ordered canonically** when written, so equivalent searches produce identical URLs.
- Any page with parameters carries a **canonical to its parameter-free form** ([24](24-seo-architecture.md)).
- Absent parameters mean "use the default" — never an error.
- Invalid values fall back to the default with a non-blocking notice, never a 400.

---

## 6. Currency and language are not URL state

**PROPOSED** — This is a deliberate asymmetry, and the reasoning differs for each.

**Language *is* in the URL** (as a path prefix) because a Vietnamese page and an English page are
**different content** that search engines must index separately and guests must be able to share.

**Currency is *not* in the URL** because USD is an **indicative display conversion over a VND base**
([25](25-i18n-currency-architecture.md)). The page content is identical; only a formatted number
changes. Putting it in the URL would:

- Create duplicate URLs for identical content, requiring canonicals to solve a self-inflicted problem
- Let a shared link show a price the recipient did not choose
- Imply KAS transacts in USD, which it does not

Currency is a **user preference** held in a cookie and on the account, applied at render.

---

## 7. Booking and account URLs

**PROPOSED**

| URL | Access | Notes |
|---|---|---|
| `/{locale}/stay` | Public | Selection held server-side (signed in) or locally (guest) — never in the URL |
| `/{locale}/stay/sent/{reference}` | Public, one-time | Confirmation screen. Reference alone shows **no personal data** — only "your request was received" and next steps |
| `/{locale}/account/bookings/{reference}` | Authenticated + **ownership checked** | The reference identifies; the session authorises |
| `/track/{signedToken}` | Signed, expiring token | For guests without an account. Token is opaque, single-purpose, time-limited, and revocable |

**PROPOSED — the security rule, stated plainly:** a booking reference is an **identifier, not a
credential**. Every access checks ownership or permission server-side. References use a non-sequential
suffix (`KAS-YYMMDD-XXXX`) so they cannot be enumerated, but non-enumerability is a speed bump, **not**
the access control ([10](10-system-requirements.md) §5.2).

---

## 8. Admin URLs

**PROPOSED**

- All under `/admin/**`. No locale prefix — the console runs in one language in V1 (OQ-057).
- `noindex` header **and** blocked in `robots.txt` **and** authentication-gated. Three layers, because
  each fails differently.
- Objects addressed by **internal ID** (property, room type, customer, review) or by **reference**
  (bookings), never by guest-identifying data.
- Filters and saved views in query parameters, so an agent can bookmark "my breaching requests".
- **No personal data in admin URLs** — an admin URL appears in browser history, screenshots, and
  support tickets.

**PROPOSED** — Consider serving admin from a distinct hostname (`admin.kas…`) in Phase 3. It allows a
stricter CSP, separate cookie scope, and independent rate limiting. Deferred as an infrastructure
decision, not an IA one.

---

## 9. Redirects and legacy URLs

**PROPOSED**

| Situation | Behaviour |
|---|---|
| Slug changed after publish | **301** old → new, permanently retained |
| Property `CLOSED` | **410 Gone** with an explanatory page and links to nearby KAS properties. Not a 404, and not a silent redirect to `/hotels` — that would strand a guest with no explanation |
| Property `TEMPORARILY_CLOSED` | URL stays **200**; the page states the closure and reopening date |
| Room type archived | 301 to the property's room list |
| Trailing slash | 301 to the non-slashed form |
| Uppercase in path | 301 to lowercase |
| `www` vs. apex | 301 to the chosen canonical host (Phase 3 decision) |
| HTTP | 301 to HTTPS, with HSTS |
| Missing locale prefix (`/hotels`) | 302 to the negotiated locale ([25](25-i18n-currency-architecture.md) §3) |
| Legacy URLs from an existing KAS site | **NEEDS CONFIRMATION — OQ-063.** If a site exists today, its URL inventory must be captured and mapped before launch, or its accumulated organic equity is lost |

---

## 10. Reserved namespaces

**PROPOSED** — Reserved at the root so future needs never collide with a property slug:

```
/admin      /api        /assets     /static     /_next
/vi         /en         /search     /stay       /account
/track      /sitemap.xml            /robots.txt
/manifest.webmanifest   /offline
```

Reserved for likely future use: `/experiences`, `/dining`, `/events`, `/careers`, `/press`,
`/gift-cards`, `/groups`.

---

## 11. URL examples end to end

**PROPOSED**

```
Brand discovery
  /en                                        Home
  /en/hotels                                 The Collection
  /en/hotels/kas-milestone-premium-hotel     Property
  /en/hotels/kas-milestone-premium-hotel/rooms
  /en/hotels/kas-milestone-premium-hotel/rooms/deluxe-room
  /en/locations                              Map discovery
  /en/locations/district-1                   District landing

Availability
  /en/search?checkIn=2026-09-12&checkOut=2026-09-14&adults=2&children=1&childAges=6&rooms=1
  /en/search?checkIn=2026-09-12&checkOut=2026-09-14&adults=2&district=district-1&sort=price
  /en/compare?property=kas-milestone-premium-hotel&property=kas-sonata-luxury-hotel

Request
  /en/stay
  /en/stay/details
  /en/stay/review
  /en/stay/sent/KAS-260912-4F7A

Account
  /en/account/bookings
  /en/account/bookings/KAS-260912-4F7A
  /en/account/reviews/new/KAS-260620-1A9C
  /track/eyJhbGciOi…                        Guest tracking, signed

Vietnamese — identical structure
  /vi/hotels/kas-milestone-premium-hotel
  /vi/stay

Admin
  Direct Sales
    /admin/leads?view=breaching
    /admin/leads?leadSource=FACEBOOK
    /admin/leads/KAS-260912-4F7A
    /admin/follow-ups?due=today
  Operations
    /admin/reservations?channel=OTA
    /admin/arrivals?date=2026-09-12
    /admin/occupancy?property={id}
  Distribution
    /admin/distribution/ota
    /admin/distribution/channels?channel=BOOKING_COM
  /admin/hotels/{id}/room-types/{roomTypeId}/pricing
  /admin/inventory?property={id}&from=2026-09-01&to=2026-11-30
```
