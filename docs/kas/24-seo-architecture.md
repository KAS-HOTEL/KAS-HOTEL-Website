# 24 — SEO Architecture

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Why SEO is architecture, not marketing

**PROPOSED** — KAS's commercial goal is to shift bookings away from OTAs, which charge commission.
Those OTAs outrank KAS for almost every query about KAS's own hotels. The only structural defence is
that **KAS owns the definitive page for each of its eight properties** — richer, more accurate, and
more complete than any OTA listing.

That is an information-architecture outcome, not a marketing campaign. It is why:

- Public pages are **server-rendered** — a client-only render forfeits the competition outright
- Property pages are **one canonical URL** with all their signals concentrated, not fragmented
- District pages exist only where they have real content
- Reviews live on-site rather than only on third-party platforms

---

## 2. Indexable vs. non-indexable

**PROPOSED**

### 2.1 Indexable — canonical, in sitemap, crawlable

| Page | Priority | Change frequency |
|---|:--:|---|
| Home | 1.0 | Weekly |
| The Collection `/hotels` | 0.9 | Weekly |
| **Property detail** × 8 | **1.0** | Weekly |
| Room list × 8 | 0.8 | Weekly |
| **Room type detail** × ~40 | **0.8** | Weekly |
| Property gallery × 8 | 0.5 | Monthly |
| Property reviews × 8 | 0.6 | Daily |
| Locations | 0.8 | Monthly |
| District landings | 0.7 | Monthly |
| Experiences | 0.6 | Monthly |
| Offers index + detail | 0.6 | Weekly |
| Reviews (portfolio) | 0.5 | Daily |
| About · Story · Service | 0.6 | Monthly |
| Contact · FAQ | 0.6 | Monthly |
| Policies | 0.3 | Yearly |

**PROPOSED** — Property detail pages carry the highest priority alongside the homepage. For a hotel
group, the property page *is* the money page.

### 2.2 Non-indexable — `noindex`, excluded from sitemap

| Page | Mechanism | Why |
|---|---|---|
| `/search` and all parameterised results | `noindex, follow` | Infinite parameter combinations; thin, duplicative, date-scoped content |
| `/compare` | `noindex, follow` | Combinatorial URL space |
| `/stay`, `/stay/**` | `noindex, nofollow` | Private session state |
| `/login`, `/register`, password flows | `noindex, follow` | No search value; login pages in results are a phishing-adjacent risk |
| `/account/**` | `noindex, nofollow` + auth | Private |
| `/track/{token}` | `noindex, nofollow` + `X-Robots-Tag` | Contains a credential in the URL |
| `/admin/**` | `noindex, nofollow` + `robots.txt` + auth | Three independent layers |
| `/404`, `/500`, `/offline` | `noindex` | — |
| `DRAFT` properties | Not rendered publicly at all | — |

**PROPOSED — `follow` where sensible.** A `noindex, follow` search page still passes link equity to
the property pages it links to. `nofollow` is reserved for genuinely private areas.

### 2.3 robots.txt

```
User-agent: *
Disallow: /admin/
Disallow: /account/
Disallow: /track/
Disallow: /stay/
Disallow: /api/
Allow: /

Sitemap: https://{domain}/sitemap.xml
```

**PROPOSED** — `robots.txt` is a **crawl directive, not a security control**. Every private area is
also authentication-gated and `noindex`-headed. Listing `/admin/` in a public file is acceptable
because it protects nothing on its own — the auth does.

---

## 3. Canonical strategy

**PROPOSED**

| Situation | Canonical |
|---|---|
| Property page with search parameters | Self, **parameter-free**: `/en/hotels/kas-milestone-premium-hotel` |
| Room list with dates | Parameter-free room list |
| Room type with dates | Parameter-free room type |
| Search results | Self-canonical **and** `noindex` — not canonical to `/hotels`, which is different content |
| District page | Self |
| Trailing slash / uppercase / `www` variants | Resolved by 301 before a canonical is ever needed |
| Locale variants | **Each locale is self-canonical**, joined by `hreflang` (§5) |
| Paginated reviews | Self-canonical per page; page 1 is the entry in the sitemap |
| Offer expired | 301 to `/offers` if the offer is gone; keep the URL live if it may return |

**PROPOSED — the rule:** canonicals resolve *parameter noise*, not *page hierarchy*. Never canonical
a room type to its property page — they answer different queries and both should rank.

---

## 4. Structured data

**PROPOSED** — Server-rendered JSON-LD, generated from the same data that renders the page, so the
two can never disagree.

| Page | Schema | Notes |
|---|---|---|
| Property detail | **`Hotel`** (`LodgingBusiness`) | name, description, address, geo, telephone, images, priceRange, amenityFeature, checkinTime/checkoutTime, starRating *(only if officially rated — OQ-031)*, aggregateRating *(only with real reviews)* |
| Room type detail | **`HotelRoom`** + `Offer` | name, description, images, occupancy, bed, floorSize, price in **VND** |
| Property reviews | **`Review`** + `AggregateRating` | Only verified, published reviews. **Never fabricate or pad** |
| All pages | **`BreadcrumbList`** | Server-rendered; matches visible breadcrumbs exactly |
| Home | **`Organization`** + `WebSite` + `SearchAction` | Logo, social profiles, contact |
| FAQ | **`FAQPage`** | Only where content is genuinely Q&A |
| Offers | **`Offer`** | Validity dates, applicable properties |
| Locations / district | **`ItemList`** of `Hotel` | — |
| Contact | **`Organization`** with `ContactPoint` | Multilingual availability declared |

**PROPOSED — integrity rules:**
- `aggregateRating` is emitted **only** when real published reviews exist. An invented or inflated
  rating is a manual-action risk and a trust failure.
- `priceRange` and `Offer.price` reflect the **VND base price**, never the indicative USD conversion
  ([25](25-i18n-currency-architecture.md)).
- Structured data never contains content absent from the visible page.

---

## 5. Multilingual SEO

**PROPOSED** — Path-prefix locales (`/vi/`, `/en/`) with full reciprocal `hreflang`.

```html
<link rel="alternate" hreflang="vi" href="https://{d}/vi/hotels/kas-milestone-premium-hotel">
<link rel="alternate" hreflang="en" href="https://{d}/en/hotels/kas-milestone-premium-hotel">
<link rel="alternate" hreflang="x-default" href="https://{d}/en/hotels/kas-milestone-premium-hotel">
```

| Rule | Detail |
|---|---|
| Reciprocity | Every locale variant references every other **and itself**. Non-reciprocal `hreflang` is ignored by search engines — the most common implementation failure |
| `x-default` | **NEEDS CONFIRMATION — OQ-064.** Recommendation: `en`, since `x-default` serves users whose language matches neither, who are typically international |
| Self-canonical | Each locale canonicals to itself. Never canonical `vi` → `en` — that de-indexes the Vietnamese site |
| Untranslated pages | If a page exists in one locale only, emit **no** `hreflang` for the missing one rather than pointing at a fallback that shows the wrong language |
| Metadata | Title, description, Open Graph and structured data all fully localised |
| `lang` attribute | Set correctly on `<html>`; critical for screen readers and for Vietnamese text rendering |
| Locale redirects | The bare `/hotels` → negotiated locale is a **302**, never a 301 — the choice is per-user, not permanent |

---

## 6. Sitemaps

**PROPOSED**

```
/sitemap.xml                 index
├── /sitemap-vi.xml          all Vietnamese URLs
├── /sitemap-en.xml          all English URLs
└── /sitemap-images.xml      property and room imagery
```

- Generated from **published** content; a `DRAFT` property can never appear
- Each entry carries `lastmod` from the content's real update time, plus `hreflang` alternates
- `COMING_SOON` properties **are** included — they have a real page and real search interest
- `CLOSED` properties are removed; their URLs return 410
- Regenerated on publish, not on a nightly schedule — a new property should be discoverable within
  minutes
- An **image sitemap** matters unusually much here: a photography-led hospitality brand gets real
  traffic from image search

---

## 7. Metadata

**PROPOSED** — Every page has authored metadata with a computed fallback, never a raw template.

| Page | Title pattern | Description source |
|---|---|---|
| Home | `KAS Hotels — {brand line} \| Ho Chi Minh City` | Authored |
| The Collection | `Our Hotels in Ho Chi Minh City \| KAS` | Authored |
| Property | `{Property name} \| KAS Hotels` | `metaDescription`, falling back to `shortDescription` |
| Room type | `{Room name} — {Property name} \| KAS` | Authored, falling back to short description |
| District | `KAS Hotels in {District}, Ho Chi Minh City` | Authored |
| Reviews | `Guest Reviews — {Property name} \| KAS` | Computed from real review data |
| Offer | `{Offer title} \| KAS Hotels` | Authored |

**PROPOSED** — Titles ≤ 60 characters, descriptions ≤ 155, both editable per page per locale in
admin, both validated at publish. Property names are long ("KAS Milestone Premium Hotel" is 27
characters), so patterns must be tested against real names, not placeholders.

**Open Graph and Twitter cards** on every public page, with a per-property social image — a property
page shared into Zalo or Messenger must render an attractive card, which matters more in the
Vietnamese market than in Western ones.

---

## 8. Content SEO architecture

**PROPOSED** — Which page owns which intent. One page per intent; no two pages compete.

| Search intent | Owning page |
|---|---|
| "KAS Milestone Premium Hotel" | Property detail |
| "KAS hotels Ho Chi Minh City" | `/hotels` |
| "hotel District 1 Ho Chi Minh City" | District landing (pending OQ-060) |
| "hotel near Ben Thanh Market" | District landing + property `nearbyLandmarks` |
| "rooftop bar hotel Saigon" | Milestone property page, `#rooftop` block |
| "deluxe room {property}" | Room type detail |
| "KAS hotel reviews" | Property reviews page |
| "KAS booking policy / cancellation" | Policy pages |
| "boutique hotel Saigon" | `/hotels` + collection grouping (pending OQ-009) |

**PROPOSED — cannibalisation guard:** the property page and its room list must not target the same
phrase. The property page owns the property name; the room list owns "{property} rooms"; each room
type owns its own name. Enforced editorially through the per-page metadata fields.

---

## 9. Technical SEO requirements

**PROPOSED**

| Requirement | Detail |
|---|---|
| Server-side rendering | All indexable pages. Non-negotiable |
| Core Web Vitals | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75 on mobile ([10](10-system-requirements.md) §2) |
| Image optimisation | Modern formats, responsive sizes, explicit dimensions, lazy below the fold, descriptive localised alt text |
| Internal linking | Every property linked from the nav panel, `/hotels`, `/locations`, and from three other properties' "Other KAS hotels" sections |
| Heading hierarchy | One `<h1>` per page; logical descent |
| 404 handling | Real 404 status with a branded page. **Never a soft 404** |
| 410 handling | Closed properties return 410, not 404 — it tells search engines the removal is intentional |
| HTTPS | Enforced with HSTS |
| Pagination | `rel` links on review pages; page 1 in the sitemap |
| Duplicate prevention | One canonical host, one trailing-slash convention, one case convention |
| Crawl budget | Trivial at ~90 indexable pages. No special handling needed |

---

## 10. Off-site alignment

**PROPOSED** — Outside the platform, but the platform must supply consistent data.

| Item | Requirement |
|---|---|
| **Google Business Profile** × 8 | Claimed, accurate, and matching the site's name, address, phone and hours exactly. NAP inconsistency is the most common local-SEO defect for multi-property groups. **OQ-036** |
| Google Hotel Ads / free booking links | Requires structured rate and availability feeds — **FUTURE**, but the architecture already models per-date availability |
| OTA listing consistency | Property names, addresses and descriptions should not contradict the site |
| Zalo / Facebook / Instagram | Linked from the footer, with consistent naming |

---

## 11. Measurement

**PROPOSED**

- Search Console verified for **both** locale paths, with property-page performance tracked separately
- Real user monitoring for Core Web Vitals from actual Vietnamese traffic
- Server-side funnel events, so measurement survives ad blockers
- Index coverage monitored — a property page dropping out of the index is a revenue incident and
  should alert, not be discovered at the next quarterly review
- Baseline captured **before** launch if a KAS site exists today (OQ-063)

---

## 12. SEO risks

| # | Risk | Mitigation |
|---|---|---|
| S1 | Existing KAS site's URLs are lost at launch | Capture the URL inventory and map 301s **before** cutover — OQ-063 |
| S2 | Vietnamese and English pages compete or de-index each other | Reciprocal `hreflang`, self-canonicals, no cross-locale canonical |
| S3 | Photography-led design breaches Core Web Vitals | Performance budget in CI; explicit dimensions; responsive images |
| S4 | Thin district pages created for SEO | Only generate a district page where a property exists and real content is written |
| S5 | Search result pages indexed, creating duplicate thin content | `noindex, follow` + parameter-free canonicals |
| S6 | `aggregateRating` emitted without real reviews | Guarded in the structured-data generator |
| S7 | Property and room pages cannibalise each other | One intent per page, enforced through per-page metadata |
| S8 | Room type names unknown, delaying ~40 indexable pages | OQ-010 |
