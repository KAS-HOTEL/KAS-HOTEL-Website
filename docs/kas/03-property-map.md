# 03 — Property Map

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Portfolio

**CONFIRMED** — Eight properties, all in Ho Chi Minh City, Vietnam.

| # | Property | Name signal | Role |
|---|---|---|---|
| 1 | **KAS Passion Boutique Hotel** | Boutique | Founding property (2019) |
| 2 | **KAS Elegance Hotel** | Refinement | Portfolio |
| 3 | **KAS Ancient Boutique Hotel** | Heritage, boutique | Portfolio |
| 4 | **KAS Milestone Premium Hotel** | Premium | **Flagship** |
| 5 | **KAS Zody Boutique Hotel** | Boutique, contemporary | Portfolio |
| 6 | **KAS Sonata Luxury Hotel** | Luxury | Portfolio |
| 7 | **KAS Eliana Luxury Hotel** | Luxury | Portfolio |
| 8 | **KAS Dilly Hotel** | — | Portfolio |

**NEEDS CONFIRMATION** — A ninth property, referred to as **"KAS No. 9"**, appears in the approved
homepage structure as a *Coming Soon* section. We do not have its name, location, opening date, or
whether the name is a placeholder. This affects the property data model (a property must be able to
exist in a pre-opening state) and the homepage. See OQ-002.

## 2. Portfolio structure

**PROPOSED** — The eight names already imply a tiering that the product owner has not confirmed:

```
Luxury      → Sonata, Eliana
Premium     → Milestone (flagship)
Boutique    → Passion, Ancient, Zody
Unclassified→ Elegance, Dilly
```

**This inference must not be implemented without approval.** Three risks:

1. Publishing a tier hierarchy inevitably positions lower tiers as *lesser*, which conflicts with the
   confirmed positive-framing rule.
2. It may not reflect actual room product, rate positioning, or how KAS sells today.
3. Guests filtering by tier would see relative judgements the brand does not want to make.

**PROPOSED alternative — "collections" rather than tiers.** Group by *guest intent*, which is
horizontal and non-hierarchical:

| Collection | Answers the guest question |
|---|---|
| **The Landmark** | "I want the full experience — rooftop, restaurant, gym" |
| **The Houses** | "I want somewhere with character and a small front desk that knows me" |
| **The Retreats** | "I want quiet, space, and refinement" |

Every property belongs to exactly one collection and no collection is presented as superior.
Decision required — see OQ-009.

## 3. Per-property identity model

**CONFIRMED** — Each property must have its own identity and positive storytelling. The eight must
not render as identical generic cards.

**PROPOSED** — Identity is not a decoration applied at design time; it is *structured data*, so that
every listing surface can vary. Each property carries:

| Field | Purpose | Example shape |
|---|---|---|
| `signatureLine` | One-line editorial hook, unique per property | "The rooftop view of District 1 that people come back for" |
| `characterTags[]` | 2–4 non-hierarchical descriptors | `rooftop`, `heritage`, `quiet-street`, `walkable` |
| `neighbourhoodStory` | Why *this* location, in editorial voice | 2–3 paragraphs |
| `signatureExperiences[]` | 1–4 named things this property does distinctively | "Rooftop at dusk", "Breakfast on the terrace" |
| `heroImage` + `heroTreatment` | Distinct crop/composition per property | Prevents card sameness |
| `collection` | Grouping (**pending OQ-009**) | — |
| `isFlagship` | Boolean; drives layout weight | `true` for Milestone only |
| `nearbyLandmarks[]` | Named places with real walking distance | "Ben Thanh Market — 6 min walk" |

**PROPOSED** — Design consequence: the Hotels index page uses an **editorial layout with varied tile
sizes and alternating image/text alignment**, not a uniform 3-column card grid. Each tile pulls
`signatureLine` and `heroImage`, so no two tiles read the same.

## 4. Flagship — KAS Milestone Premium Hotel

**CONFIRMED** — Flagship property. Confirmed strengths:

| Strength | Site treatment (**PROPOSED**) |
|---|---|
| Large restaurant | First-class "Dining" block on the hotel detail page; own gallery; opening hours |
| Rooftop bar | Signature visual identity; hero and homepage flagship section |
| Gym | Wellness block with hours and access rules |
| Premium rooms | Room types get extended detail treatment and larger imagery |
| Rooftop experience | Editorial narrative section, not a bullet in an amenity list |
| High-end hospitality | Service promise anchored on this property |

**PROPOSED** — Milestone uses an **extended hotel detail template** with additional editorial blocks
(Dining, Rooftop, Wellness) that other properties do not render. This is a template variant driven by
`isFlagship` and by which facility blocks have content — not hard-coded to one hotel ID.

**NEEDS CONFIRMATION** — Restaurant name, cuisine, covers, opening hours; rooftop bar name and hours;
gym hours and equipment; whether restaurant/rooftop are open to non-staying guests; whether F&B
reservations should be bookable through the site (OQ-042).

## 5. Property data requirements

**PROPOSED** — Every property needs the following before it can be published. Currently **none of
these values are known for any property** — this is the single largest content gap in the project
(OQ-030, OQ-031).

### 5.1 Identity and location

- Legal and display name (VI + EN)
- Full street address (VI + EN), district, ward
- Geo coordinates (lat/lng) for maps
- Phone, email, and messaging channel (Zalo is standard in Vietnam — OQ-032)
- Star rating / classification, if officially rated
- Year opened; year joined KAS
- Total room count
- Directions from Tan Son Nhat International Airport (SGN) and from key districts

### 5.2 Editorial

- Signature line, short description, long description (VI + EN)
- Neighbourhood story
- Signature experiences
- Nearby landmarks with verified walking/driving times
- 12–30 photographs, captioned, in the correct aspect ratios

### 5.3 Facilities and policies

- Amenity set (from the shared amenity taxonomy — see §6)
- Facilities: restaurant, bar, rooftop, gym, pool, spa, parking, lift, meeting space
- Check-in / check-out times
- Child and extra-bed policy
- Pet policy
- Smoking policy
- Cancellation policy
- Payment methods accepted at property
- Accessibility information (**must be factual, not framed**)

### 5.4 Commercial

- Room types with descriptions, images, bed configuration, area, max occupancy
- Inventory counts per room type
- Base rates and any known rate rules
- Applicable taxes and service charges

## 6. Shared amenity taxonomy

**PROPOSED** — Amenities are a **shared, controlled vocabulary** across all properties, not free text
per hotel. This is what makes comparison, filtering, and consistent iconography possible.

Structure: `AmenityCategory → Amenity`, with per-property and per-room-type assignment.

| Category | Example amenities |
|---|---|
| Connectivity | Wi-Fi, wired internet, work desk |
| Comfort | Air conditioning, blackout curtains, soundproofing, in-room safe |
| Bathroom | Rain shower, bathtub, toiletries, hairdryer, bathrobe |
| Media | Smart TV, streaming, Bluetooth speaker |
| Food & drink | Minibar, kettle, coffee machine, in-room dining, breakfast included |
| Property facilities | Restaurant, bar, rooftop, gym, pool, spa, laundry, parking, lift, luggage storage |
| Services | 24h reception, airport transfer, concierge, daily housekeeping, tour desk |
| Accessibility | Step-free entrance, accessible bathroom, lift access |
| Family | Cot available, extra bed, connecting rooms |

**PROPOSED** — Amenities are managed in admin with: name (VI + EN), icon, category, sort order, and
an `isHighlight` flag that promotes an amenity into the top-line summary of a property or room type.

**NEEDS CONFIRMATION** — The actual amenity set for each property and room type (OQ-031).

## 7. Location and comparison experience

**CONFIRMED** — Customers must be able to compare hotel locations.

**PROPOSED** — Delivered through three surfaces:

1. **Locations page** — a single map of Ho Chi Minh City with all 8 (soon 9) properties pinned, plus a
   synchronised list. Selecting a pin reveals a property card with signature line, from-price, and a
   link. Filterable by district and by character tag.
2. **Comparison view** — side-by-side comparison of up to 3 properties across: neighbourhood,
   distance to selected landmarks, room types available, from-price, key amenities, review score.
   Comparison must present differences neutrally and **must not rank properties or render an empty
   cell as a deficiency** (use "Not at this property" phrasing rather than a red cross).
3. **"What's Around You"** — per-property nearby attractions with real distances, supporting the
   "rooted in Ho Chi Minh City" brand pillar.

**PROPOSED** — Map provider must sit behind a provider abstraction (`MapProvider`) per the confirmed
vendor-independence rule. Candidate providers evaluated in
[11-technology-evaluation.md](11-technology-evaluation.md); note that Google Maps coverage and local
search quality in Vietnam is materially better than most alternatives, which weighs on that choice.

## 8. Coming-soon property support

**PROPOSED** — The property model supports a lifecycle so "KAS No. 9" is data, not a hard-coded
homepage section:

```
DRAFT → COMING_SOON → OPEN → TEMPORARILY_CLOSED → CLOSED
```

| State | Public visibility | Bookable |
|---|---|---|
| `DRAFT` | Hidden | No |
| `COMING_SOON` | Listed with a teaser; optional interest-registration form | No |
| `OPEN` | Fully listed | Yes |
| `TEMPORARILY_CLOSED` | Listed, marked unavailable for the stated period | No |
| `CLOSED` | Delisted; existing URLs redirect | No |

**PROPOSED** — A `COMING_SOON` property may collect email interest registrations, giving the
homepage's "KAS No. 9 — Coming Soon" section a real function beyond decoration.

## 9. Risks specific to the portfolio

| # | Risk | Mitigation |
|---|---|---|
| P1 | Eight properties described in near-identical language, defeating the individuality requirement | Structured identity fields (§3); editorial review requiring each `signatureLine` to be demonstrably unique |
| P2 | Flagship emphasis making the other seven feel like consolation choices | Every property gets its own genuine editorial angle; no comparative language; collections instead of tiers |
| P3 | Uneven photography quality across properties creating an implicit ranking | Shot list applied equally; consistent grade; no property published below the quality bar |
| P4 | Name-based tier assumptions leaking into UI (Luxury > Premium > Boutique) | Tiering decision deferred to OQ-009; no tier field until approved |
| P5 | Property data volume delaying launch | Content collection starts in Phase 2 in parallel with design, not after build |
