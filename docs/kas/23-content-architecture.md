# 23 — Content Architecture

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Objective

**CONFIRMED direction** — Design a reusable content model. Avoid hard-coding homepage sections.
"KAS No. 9" must be representable as property lifecycle data, not a special case.

**PROPOSED** — The governing test for this document:

> If KAS opens a ninth hotel, reorders the homepage, or announces a tenth as "coming soon",
> **no engineer should need to be involved.**

Everything below exists to make that true.

---

## 2. Content taxonomy

**PROPOSED** — Four content classes with different governance, different editors, and different
publish rules. Confusing them is the most common cause of unmaintainable hotel sites.

| Class | Definition | Managed as | Example |
|---|---|---|---|
| **Entity content** | Structured data about a real thing | Typed admin forms | Property, room type, amenity, offer, review |
| **Editorial content** | Rich narrative attached to an entity | Rich text + media blocks on the entity | Property story, room description, signature experience |
| **Composed pages** | Pages assembled from ordered blocks | Block editor | Home, About, Story, Service Promise |
| **Micro-copy** | UI strings, labels, validation, email subjects | Translation catalogue | "Request This Stay", "6 rooms available" |

**PROPOSED — the boundary rule:** if something is *about a property*, it lives **on the property**. If
it is *about the brand*, it lives on a **page**. A property's story is never authored inside a
homepage block — the homepage *references* the property and pulls its story fields. One canonical
location, referenced everywhere ([18](18-information-architecture-v2.md) §2, principle 6).

---

## 3. Property content model

**PROPOSED** — The central entity. Fields grouped by purpose; all text fields are localised (§8).

### 3.1 Identity

| Field | Type | Purpose |
|---|---|---|
| `name` | localised text | Display name |
| `slug` | string, immutable after publish | URL |
| `lifecycleState` | enum | `DRAFT` · `COMING_SOON` · `OPEN` · `TEMPORARILY_CLOSED` · `CLOSED` |
| `isFlagship` | boolean | Placement weight only — never content capability (§5) |
| `collection` | enum \| null | Grouping — **pending OQ-009** |
| `characterTags[]` | refs | Non-hierarchical descriptors: `rooftop`, `heritage`, `quiet-street` |
| `sortOrder` | int | Editorial order within the portfolio |
| `openedYear`, `joinedKasYear` | int | Story material |

### 3.2 Editorial

| Field | Type | Where it surfaces |
|---|---|---|
| `signatureLine` | localised, ≤ 90 chars | Nav panel, tiles, search results, hero |
| `shortDescription` | localised, ≤ 220 chars | Cards, comparison, meta description fallback |
| `introduction` | localised rich text | Property page §Introduction |
| `story` | localised rich text | Property page §Story |
| `neighbourhoodStory` | localised rich text | Property page §Location, district pages |
| `highlights[]` | 3–5 localised items with icon | Property page §Highlights |
| `signatureExperiences[]` | list of experience blocks | Property page §Experiences (§5) |

**PROPOSED — uniqueness constraint on `signatureLine`.** Two properties may not publish the same or a
near-identical signature line. This is the content-model expression of the confirmed requirement that
the eight hotels must not look identical, and it is checked at publish time.

### 3.3 Facilities, location, policies

| Field | Type |
|---|---|
| `amenities[]` | refs to the shared taxonomy, with `isHighlight` |
| `facilityBlocks[]` | typed content blocks — see §5 |
| `address`, `district`, `ward` | localised text |
| `coordinates` | lat/lng |
| `directions` | localised rich text |
| `nearbyLandmarks[]` | `{ name (localised), type, distanceMetres, walkingMinutes }` |
| `checkInTime`, `checkOutTime` | time |
| `policies[]` | typed policy entries — see §7 |
| `contact` | phone, email, Zalo, front desk hours |

### 3.4 Media and SEO

| Field | Type |
|---|---|
| `heroImage` + `heroTreatment` | media ref + crop/composition variant, **distinct per property** |
| `gallery[]` | ordered media refs with category, localised caption and alt text |
| `metaTitle`, `metaDescription` | localised, with a computed fallback |
| `socialImage` | media ref |

---

## 4. Property lifecycle — how "KAS No. 9" works

**CONFIRMED direction** — "KAS No. 9" must be lifecycle data, not a hard-coded special case.

**PROPOSED**

| State | `/hotels` | Nav panel | Search | Property page | Bookable | Sitemap |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `DRAFT` | ✖ | ✖ | ✖ | preview only | ✖ | ✖ |
| `COMING_SOON` | ✔ teaser tile in a separate group | link in panel footer | ✖ | ✔ teaser page | ✖ | ✔ |
| `OPEN` | ✔ full tile | ✔ | ✔ | ✔ full | ✔ | ✔ |
| `TEMPORARILY_CLOSED` | ✔ marked unavailable, with reopening date | ✔ | ✔ marked unavailable | ✔ full + notice | ✖ | ✔ |
| `CLOSED` | ✖ | ✖ | ✖ | **410** + nearby properties | ✖ | ✖ |

**PROPOSED — the homepage "Coming Soon" section is a block type, not a section about KAS No. 9.**

```
Block: PropertyShowcase
  filter: lifecycleState = COMING_SOON
  layout: teaser
  headline: (localised, editable)
  emptyBehaviour: hide the block entirely
```

Consequences:
- If no property is `COMING_SOON`, the block **disappears**. No empty section, no placeholder.
- When KAS No. 9 opens, it moves to `OPEN` and automatically leaves the block and joins The Eight.
- A tenth "coming soon" property appears with no code change.
- The block never mentions "No. 9" anywhere in code or configuration.

**PROPOSED** — A `COMING_SOON` property may collect **interest registrations** (email + optional
notes), giving the teaser a real function. Registrants are notified on opening.

---

## 5. Facility and experience blocks — the additive flagship, structurally

**CONFIRMED** — Milestone's strengths get strong editorial emphasis. Flagship treatment is **additive**;
the other seven must not be diminished.

**PROPOSED** — Facility content is a **typed block available to every property**. Milestone stands out
because it *has* more, not because the system *permits* it more.

```
FacilityBlock
  type          RESTAURANT | BAR | ROOFTOP | GYM | POOL | SPA | MEETING | LOUNGE | TERRACE
  name          localised          e.g. "The Rooftop"
  description   localised rich text
  images[]      media refs
  openingHours  structured
  openToNonResidents  boolean | null
  highlights[]  localised items
  sortOrder     int
```

| Property | Facility blocks today |
|---|---|
| **KAS Milestone Premium Hotel** | `RESTAURANT` (large restaurant) · `ROOFTOP` + `BAR` (rooftop bar, rooftop experience) · `GYM` |
| The other seven | **NEEDS CONFIRMATION — OQ-031.** Each must be populated with whatever it genuinely has |

**PROPOSED — three rules that enforce the additive guarantee:**

1. **No property is capped.** Any property may have any facility block. If Sonata gains a rooftop bar,
   it renders a `#rooftop` block with identical prominence.
2. **`isFlagship` never gates content.** It affects placement weight only — Featured band on
   `/hotels`, `Recommended` sort position, homepage editorial section. It grants no extra block types,
   no extra gallery slots, no extra fields.
3. **Every property must publish at least one `signatureExperience`.** A publish-checklist rule. This
   is the concrete mechanism that prevents "one rich flagship page and seven thin ones" — the failure
   mode the confirmed brand rules are trying to avoid.

```
SignatureExperience
  title          localised     e.g. "Breakfast on the terrace"
  description    localised
  image          media ref
  timeOfDay      enum | null
  sortOrder      int
```

---

## 6. Composed pages and block library

**CONFIRMED direction** — Avoid hard-coding homepage sections.

**PROPOSED** — A page is an **ordered list of blocks**. The homepage structure approved in Phase 1
becomes *default configuration*, not code.

### 6.1 Block library

| Block | Purpose | Key configuration |
|---|---|---|
| `Hero` | Full-bleed brand statement | image, headline, subhead, CTA, overlay strength |
| `BookingSearch` | The search form | variant (inline / anchored), default dates |
| `StatBand` | KAS at a glance | 3–5 stat items (label + value) |
| `EditorialStory` | Long-form narrative + imagery | layout (image left/right/full), body, media |
| `PropertyShowcase` | One property, editorial | property ref **or** filter (`isFlagship`), layout |
| `PropertyGrid` | Multiple properties | filter (all / collection / district / lifecycle), layout (editorial-varied / uniform), limit |
| `IntentFinder` | "Find your stay" by intent | intent items → filtered destinations |
| `RoomShowcase` | Rooms & experiences | room type refs or filter |
| `NearbyHighlights` | What's around you | landmark refs, per property or portfolio-wide |
| `ServicePromise` | The request model, explained as a benefit | promise text (**bound to the SLA setting**), supporting points |
| `ReviewShowcase` | Verified reviews | filter (property / rating floor / recency), count |
| `OfferShowcase` | Active offers | filter, limit, `emptyBehaviour: hide` |
| `RichText` | Freeform editorial | body |
| `FAQAccordion` | Questions | category ref or explicit items |
| `MediaGallery` | Image set | media refs, layout |
| `ContactBand` | Contact routes | properties, channels |
| `CTABand` | Single call to action | headline, action |

**PROPOSED — every block supports:** localised content, an `emptyBehaviour` (`hide` by default), a
visibility window (publish/unpublish dates), an anchor ID, and a preview.

### 6.2 The homepage, expressed as data

**PROPOSED** — The Phase 1 approved structure, as a block sequence:

```
1   Hero                    heroImage, brand statement
2   BookingSearch           variant: anchored
3   StatBand                8 hotels · since 2019 · Ho Chi Minh City · service
4   EditorialStory          The KAS story  → links /about/story
5   PropertyShowcase        filter: isFlagship = true          ← not "Milestone"
6   PropertyGrid            filter: lifecycleState = OPEN, layout: editorial-varied
7   IntentFinder            by neighbourhood · by occasion · by character
8   RoomShowcase            filter: featured room types
9   NearbyHighlights        portfolio-wide
10  ServicePromise          bound to the SLA setting
11  ReviewShowcase          filter: rating ≥ 4, recent, verified
12  PropertyShowcase        filter: lifecycleState = COMING_SOON, emptyBehaviour: hide
13  (footer — global, not a block)
```

**PROPOSED** — Block 5 reads `isFlagship`, not a property ID. Block 12 reads a lifecycle state, not
"KAS No. 9". Reordering the homepage is drag-and-drop. Neither requires an engineer.

### 6.3 Pages in V1

`home` · `about` · `about/story` · `about/service` · `contact` · `faq` · `experiences` ·
`locations` (intro band only; the map is a component) · `offers` (intro band only).

---

## 7. Policies as content

**PROPOSED** — Policies are **versioned documents with effective dates**, not editable free text.

```
Policy
  type            BOOKING | CANCELLATION | CHILDREN | PETS | SMOKING |
                  PAYMENT | ACCESSIBILITY | PRIVACY | TERMS | COOKIES
  scope           GLOBAL | PROPERTY
  propertyId      ref | null
  version         int
  effectiveFrom   date
  summary         localised — the short form shown in the booking flow
  body            localised rich text — the full form
  status          DRAFT | PUBLISHED | SUPERSEDED
```

**PROPOSED — why versioning matters:** a booking must reference **the terms in force when it was
made**. `booking.termsVersion` pins it. Without this, changing a policy silently rewrites the terms of
every historical booking — a real dispute risk.

**PROPOSED — property override:** a property-scoped policy supersedes the global one. This is required
if cancellation terms differ across the eight properties, which is likely.

> ⚠ **NEEDS CONFIRMATION — OQ-045 / OQ-055.** The cancellation and no-show policy is **not defined**.
> The content model reserves its place, and the booking flow reserves its display slot, but no
> placeholder text has been written. The booking flow **cannot publish** with this empty
> ([18](18-information-architecture-v2.md) §11.1).

---

## 8. Localisation model

**PROPOSED** — Locale is a **dimension of content**, never a duplicated record.

```
Property         ──┬── PropertyTranslation (propertyId, locale) → name, signatureLine, story…
                   └── locale-independent: slug, coordinates, isFlagship, sortOrder, media refs

RoomType         ──── RoomTypeTranslation
Amenity          ──── AmenityTranslation
Policy           ──── PolicyTranslation
PageBlock        ──── PageBlockTranslation
MediaAsset       ──── MediaAssetTranslation (alt text, caption)
```

| Rule | Detail |
|---|---|
| Locales | `vi`, `en` |
| Slugs | Locale-independent ([22](22-url-architecture.md) §4) |
| Media | Files are shared; **alt text and captions are localised** — an English alt text on a Vietnamese page is an accessibility failure |
| Fallback | Missing translation falls back to the default locale and is flagged in admin as untranslated. **Never render an empty section** |
| Publish gate | A property cannot publish without `name`, `signatureLine`, and `shortDescription` in **both** locales |
| Untranslated report | Admin shows a portfolio-wide list of missing translations — otherwise gaps are invisible until a guest finds them |

---

## 9. Media model

**PROPOSED**

```
MediaAsset
  storageKey, mimeType, width, height, sizeBytes, checksum
  category      EXTERIOR | LOBBY | ROOM | DINING | FACILITY | ROOFTOP |
                NEIGHBOURHOOD | DETAIL | STAFF | EVENT
  tags[]        free tags for search
  usages[]      computed — every entity referencing it
  translations  alt text, caption (localised)
```

| Rule | Detail |
|---|---|
| Central library | One asset, many usages. Never re-uploaded per entity |
| Alt text | **Required before an asset can be used on a public page.** A photography-led site is inaccessible without it |
| Aspect ratios | Defined per usage slot (hero, tile, gallery, room card) with a guided crop per ratio |
| Deletion | Blocked while in use; the block names the usages |
| Replacement | Updates every usage at once — essential when a property is rephotographed |
| Derivatives | Generated automatically; originals retained |

**PROPOSED — per-property hero distinctiveness** is a content rule, not a design one: each property's
hero uses a **different composition** (wide exterior, interior detail, rooftop, street context). If all
eight heroes are the same shot type, the properties look interchangeable regardless of how good the
layout is.

---

## 10. Review content

**PROPOSED** — Reviews are guest-authored content with a distinct governance model.

| Aspect | Rule |
|---|---|
| Origin | Structurally requires a linked `COMPLETED` booking — Verified Stay by construction |
| Editing by staff | **Prohibited.** Approve, reject with a reason, or reply. Never rewrite |
| Reply | Separate content object, publicly attributed, with its own approval step |
| Display | Guest display name (first name + last initial), stay month (not exact dates), property, sub-scores |
| Language | Stored with its language; shown to all guests with the language labelled. **No machine translation in V1** — a mistranslated review is a credibility risk |
| Aggregation | Property score recomputed on publish |
| Empty state | Neutral statement. Never an apology, never a fabricated score |

---

## 11. Offers content

**PROPOSED** — An offer has two faces: a **rule** (the voucher) and a **story** (the page).

```
Offer
  voucher       ref → voucher rules (discount, validity, applicability, limits)
  title, subtitle, description   localised
  heroImage
  applicableProperties[]         refs — displayed, not just enforced
  terms                          localised
  status, visibility             PUBLIC | TARGETED | HIDDEN
```

Public offers render at `/offers/{slug}` and in `OfferShowcase` blocks. Targeted offers exist only in
a guest's account. `emptyBehaviour: hide` means no "no offers available" placeholder ever appears on
the homepage.

---

## 12. Editorial governance

**PROPOSED** — The positive-framing rule, operationalised in the content workflow.

| Control | Where |
|---|---|
| **Banned-phrase lint** | Warns (never hard-blocks) on guest-facing rich text; list editable in Settings, in both locales |
| **Comparative-language check** | Flags constructions positioning one KAS property against another |
| **Publish checklist** | Hero image · signature line · descriptions in both locales · address and coordinates · ≥ 1 room type · ≥ 1 signature experience · alt text on all public images |
| **Preview as guest** | Any draft, in either locale, at any breakpoint |
| **Uniqueness check** | `signatureLine` must be distinct across published properties |
| **Factual/marketing split** | Positive framing governs **story fields**. Amenities, policies, and Good to know are **factual fields** where plain disclosure applies ([02](02-brand-foundation.md) §4.2, OQ-003) |

**PROPOSED** — The lint warns rather than blocks deliberately. A hard block would eventually be worked
around with synonyms, and human editorial judgement must remain able to win.

---

## 13. Content inventory and readiness

**PROPOSED** — What must exist before launch. **Currently almost none of it does** — this is the
largest non-engineering risk in the project ([16](16-open-questions.md) OQ-030, OQ-031).

| Content | Volume | Status |
|---|---|---|
| Property identity + editorial | 8 × (signature line, intro, story, neighbourhood, 3–5 highlights) × 2 locales | ⚠ Not started |
| Signature experiences | ≥ 1 per property, 4 for Milestone | ⚠ Not started |
| Facility blocks | Milestone: restaurant, rooftop, gym. Others: unknown | ⚠ OQ-031 |
| Room types | 8 × 4–8 types × (name, description, facts, amenities) × 2 locales | ⚠ OQ-010 |
| Photography | 12–30 per property + room-type sets | ⚠ **OQ-030 — longest lead time of any launch dependency** |
| Alt text and captions | Every public image × 2 locales | ⚠ Depends on photography |
| Amenity taxonomy | ~60 amenities × 2 locales, with icons | ⚠ Not started |
| Nearby landmarks | 5–8 per property with **verified** distances | ⚠ Not started |
| Policies | Global + per-property × 2 locales | ⚠ **Cancellation blocked — OQ-045** |
| Page content | Home, About, Story, Service, FAQ, Contact × 2 locales | ⚠ Not started |
| Micro-copy | Full UI catalogue × 2 locales | ⚠ Not started |
| Email templates | ~14 templates × 2 locales | ⚠ Not started |

**PROPOSED** — Content production must start in Phase 2 **in parallel with design**, not after build.
On projects of this shape, content is the schedule, not the code.
