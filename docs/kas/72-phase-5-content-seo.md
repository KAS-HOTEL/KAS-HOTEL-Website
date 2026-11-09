# 72 — Content & SEO Experience

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Relationship:** [24](24-seo-architecture.md) remains authoritative for indexing, canonicals,
structured data and sitemaps. This document specifies the **content experience** those rules operate on.
**Last updated:** 2026-08-14

---

## 1. The commercial premise

**PROPOSED** — KAS's goal is to shift bookings away from commission-charging OTAs. Those OTAs currently
outrank KAS for KAS's own property names. The only structural defence is that **KAS owns the definitive
page for each of its eight properties** — richer, more accurate, more complete than any OTA listing.

That is a content outcome, not a marketing campaign. It is why property pages carry the highest
priority alongside the homepage, why server rendering is non-negotiable, and why reviews live on-site.

---

## 2. No invented facts

**CONFIRMED** — Do not write fake hotel facts.

| State | Rendering |
|---|---|
| **Real** | Documented in Phase 1–4: the 8 names · founded 2019 · KAS Passion Boutique Hotel as first property · Ho Chi Minh City · Milestone's flagship strengths · the request model |
| **`[PLACEHOLDER]`** | Structurally required, value unknown — room names, rates, distances, amenities, addresses, opening hours, signature lines |
| **Omitted** | Not written at all until the business decides — cancellation terms, the meaning of "KAS", founder story, team |

**PROPOSED** — Placeholders render in a **visibly distinct style** in every deliverable, so a reviewer
can never mistake `[Deluxe Room — placeholder]` for an approved name. **Lorem ipsum is prohibited**: it
reads as decided.

---

## 3. Content requirements per page type

### 3.1 Property page

| Field | Length | Purpose | Status |
|---|---|---|---|
| **Signature line** | ≤ 90 chars | Nav panel, tiles, search results, hero. **Must be unique across published properties** | `[PLACEHOLDER]` |
| Short description | ≤ 220 chars | Cards, comparison, meta-description fallback | `[PLACEHOLDER]` |
| Introduction | 2–3 sentences | "What this property is" | `[PLACEHOLDER]` |
| **Story** | 200–400 words | The differentiator an OTA cannot replicate | `[PLACEHOLDER]` |
| Neighbourhood story | 100–200 words | Local Heritage pillar; feeds district pages | `[PLACEHOLDER]` |
| Highlights | 3–5 items | Concrete strengths, iconographic | `[PLACEHOLDER]` |
| **Signature experiences** | 1–4 | **≥ 1 required to publish** — the rule preventing thin pages | `[PLACEHOLDER]` |
| Nearby landmarks | 5–8 | Name + **verified** walking time | **Blocked — OQ-060** |
| Amenities | From taxonomy | Filtering and comparison | **Blocked — A9** |
| Policies | Structured | Check-in/out, children, cancellation | **Blocked — A4/A5** |
| Meta title / description | ≤ 60 / ≤ 155 | Search presentation | Computed fallback + editable |

**All fields in both locales.** A property cannot publish without name, signature line and short
description in **both**.

### 3.2 Room type page

Name `[PLACEHOLDER]` · short description · long description (sensory, concrete — *"the light in the
morning"*, not *"well-appointed"*) · facts (area, bed, occupancy, view) · amenities · images with alt
text · policies.

### 3.3 Location content

`/locations` intro · per-district editorial `[PLACEHOLDER]` · landmark descriptions · verified
distances.

**PROPOSED** — District pages are generated **only where KAS has a property**, from real content. We do
not create thin pages for SEO. If all eight properties sit in one or two districts, this layer collapses
and may not be worth building (OQ-060).

### 3.4 Brand pages

| Page | Available now | Blocked |
|---|---|---|
| About | 8 hotels · 2019 · HCMC · service thesis | Team, milestones |
| Story | Founding year, first property, growth to eight | **Meaning of "KAS" (OQ-001)**, founder narrative |
| **Service Promise** | The request model explained as a benefit | The **SLA wording** (config A6) |

---

## 4. Heading structure

**PROPOSED** — One `<h1>` per page, logical descent, no skipped levels.

| Page | h1 | h2 | h3 |
|---|---|---|---|
| Home | KAS brand statement | Section headings | Property names in the collection band |
| Collection | **The KAS Collection** | Featured · The Eight · Coming Soon | Property names |
| Property | **Property name** | Overview · Story · Rooms · Location · Reviews · Good to know | Room names, facility names |
| Room list | *Rooms at {Property}* | — | Room type names |
| Room detail | **Room name** | Description · Amenities · Good to know | — |
| Locations | *KAS Hotels in Ho Chi Minh City* | District names | Property names |
| Experiences | *Experiences across KAS* | Rooftop · Dining · Wellness · Neighbourhoods | Property names |

**PROPOSED** — Headings are the page's outline, not a styling choice. A visually small heading is still
an `h2` if it opens a section; size comes from tokens, not from tag choice.

---

## 5. Alt text as content

**CONFIRMED** — Required in both locales before public use — a **publish gate**
([62](62-phase-4-media.md) §5).

| Do | Don't |
|---|---|
| Describe the place: *"The rooftop terrace at dusk, looking north over District 1"* | *"Hotel image"* · *"IMG_4821"* |
| Describe the room: bed, light, view | *"Beautiful room"* |
| Write natively in each locale | Translate mechanically |
| `alt=""` for genuinely decorative images | Alt text on decorative icons |

**PROPOSED** — Alt text describes; caption adds editorial context. They do different jobs, and a caption
is not a substitute.

---

## 6. Internal linking

**PROPOSED** — Every property must be reachable from at least four places, so no page depends on a
single link.

| From | To |
|---|---|
| Nav panel | All 8 properties, always |
| Collection page | All 8 |
| Locations / district pages | Properties in that district |
| "Other KAS hotels" | 3 properties per property page, neutral order |
| Homepage collection band | All 8 |
| Room detail | Parent property + other rooms + **property facilities** |
| Experiences | Properties offering each experience |
| Reviews | Property pages |
| Footer | All 8 by name |

**PROPOSED — one rule:** internal link text is the **property or room name**, never "click here" or
"read more". It serves screen readers and search equally.

---

## 7. Metadata UX

| Page | Title pattern | Description |
|---|---|---|
| Home | `KAS Hotels — [brand line] \| Ho Chi Minh City` | Authored |
| Collection | `Our Hotels in Ho Chi Minh City \| KAS` | Authored |
| Property | `{Property name} \| KAS Hotels` | `metaDescription`, falling back to short description |
| Room | `{Room name} — {Property name} \| KAS` | Authored, falling back to short description |
| District | `KAS Hotels in {District}, Ho Chi Minh City` | Authored |
| Reviews | `Guest Reviews — {Property name} \| KAS` | Computed from real review data |

**PROPOSED** — Editable per page **per locale** in admin, with a **live search-result preview** and
character-count warnings. Property names are long ("KAS Milestone Premium Hotel" is 27 characters), so
patterns must be tested against real names, not placeholders.

**Open Graph on every public page**, with a per-property social image. A property link shared into
**Zalo or Messenger** must render an attractive card — this matters more in the Vietnamese market than
in Western ones.

---

## 8. Structured content

Generated from the same data that renders the page, so the two cannot disagree
([24](24-seo-architecture.md) §4).

| Page | Schema | Guard |
|---|---|---|
| Property | `Hotel` / `LodgingBusiness` | `starRating` only if officially rated (**A9**) |
| Room | `HotelRoom` + `Offer` | Price in **VND**, never the indicative USD |
| Reviews | `Review` + `AggregateRating` | **Emitted only when real published reviews exist. Never fabricated or padded** |
| All | `BreadcrumbList` | Matches visible breadcrumbs exactly |
| Home | `Organization` + `WebSite` | — |
| FAQ | `FAQPage` | Only where content is genuinely Q&A |

---

## 9. Intent ownership

**PROPOSED** — One page per intent; no two pages compete.

| Intent | Owner |
|---|---|
| "KAS Milestone Premium Hotel" | Property page |
| "KAS hotels Ho Chi Minh City" | `/hotels` |
| "hotel District 1 Ho Chi Minh City" | District page *(OQ-060)* |
| "hotel near Ben Thanh Market" | District page + property landmarks |
| "rooftop bar hotel Saigon" | Milestone property page, `#rooftop` |
| "{property} rooms" | Room list |
| "{room name} {property}" | Room type page |
| "KAS reviews" | Property reviews page |

**Cannibalisation guard:** the property page owns the property name; the room list owns
"{property} rooms"; each room type owns its own name. Enforced editorially through per-page metadata.

---

## 10. Bilingual content

**CONFIRMED** — Vietnamese and English, both first-class.

| Rule | Detail |
|---|---|
| Vietnamese is **written**, not translated | *"Kỳ nghỉ của bạn"* must read naturally to a Vietnamese guest — a copywriting judgement, not a translation task |
| Publish gate | Core fields required in **both** locales |
| Fallback | Missing translation falls back to the default and is **flagged in admin as untranslated** — never an empty section |
| Untranslated report | Portfolio-wide, or gaps stay invisible until a guest finds one |
| Slugs | Locale-independent; one slug, both locales |
| Alt text and captions | Localised |
| `hreflang` | Reciprocal on every page, including self |

**Blocked on B27** — the Vietnamese label and status set requires native copywriter review.

---

## 11. Editorial governance

| Control | Where |
|---|---|
| **Banned-phrase lint** | Warns on guest-facing rich text: *small · limited · lacking · inferior · weaker*. Editable in Settings, both locales |
| Comparative-language check | Flags constructions positioning one KAS property against another |
| **Signature line uniqueness** | Enforced at publish across published properties |
| Publish checklist | Hero · signature line · both-locale descriptions · address · ≥1 room type · **≥1 signature experience** · alt text on all public images |
| Preview as guest | Any draft, either locale, any breakpoint |
| **Factual/marketing split** | Positive framing governs **story** fields. Amenities, policies and Good to know are **factual** fields where plain disclosure applies |

**PROPOSED** — The lint **warns rather than blocks**, deliberately. A hard block would be worked around
with synonyms, and human editorial judgement must remain able to win.

---

## 12. Content readiness

| Content | Volume | Status |
|---|---|---|
| Property editorial | 8 × (signature line, intro, story, neighbourhood, 3–5 highlights) × 2 locales | ⚠ Not started |
| Signature experiences | ≥ 1 per property; 4 for Milestone | ⚠ Not started |
| Facility blocks | Milestone: restaurant, rooftop, gym. Others unknown | ⚠ **A9** |
| Room types | 8 × 4–8 × (name, description, facts) × 2 locales | ⚠ **A1** |
| **Photography** | 12–30 per property + room sets, captioned, alt-texted | ⚠ **B8 — longest lead time** |
| Alt text | Every public image × 2 locales | ⚠ Depends on B8 |
| Amenity taxonomy | ~60 amenities × 2 locales with icons | ⚠ **A9** |
| Nearby landmarks | 5–8 per property, **verified** distances | ⚠ **OQ-060** |
| Policies | Global + per-property × 2 locales | ⚠ **A4/A5 blocked** |
| Page content | Home, About, Story, Service, FAQ, Contact × 2 | ⚠ Not started |
| Micro-copy | Full UI catalogue × 2 locales | ⚠ **B27** |
| Email templates | ~14 × 2 locales | ⚠ Not started |

**PROPOSED** — Content production must run **in parallel with design**, not after build. On projects of
this shape, **content is the schedule, not the code.**

---

## 13. Open dependencies

| ID | Blocks |
|---|---|
| **B8 / OQ-030** | All photography and alt text |
| **A1 / OQ-010** | Room names and descriptions |
| **A9 / OQ-031** | Amenity taxonomy, star ratings, accessibility facts |
| **A4 / A5** | Policy content |
| **OQ-060** | Districts, addresses, landmark distances |
| A6 | Service Promise wording |
| B27 / OQ-061 | Vietnamese copy review |
| OQ-001 | Meaning of "KAS" — the Story page |
| OQ-021 | Legal entity details |
| OQ-063 | Existing site URL inventory before cutover |
