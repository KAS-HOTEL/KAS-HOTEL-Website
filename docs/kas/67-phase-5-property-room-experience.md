# 67 — Property & Room Experience

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Property detail — page anatomy

**PROPOSED** — One long editorial page with anchored sub-navigation. Sections with no content **do not
render** — they are never shown as gaps.

```
┌ HERO GALLERY ────────────────────────────────────────────────┐
│  Full-bleed primary image · thumbnail strip · [View all 24]  │
├ IDENTITY BAR ────────────────────────────────────────────────┤
│  KAS Milestone Premium Hotel                                 │
│  [signature line]                                            │
│  District 1 · ★ 4.8 (127 reviews) · from [price] ₫ / night   │
├ STICKY STAY BAR ─────────────────────────────────────────────┤
│  12–14 Sep · 2 guests · 1 room          [ View rooms ]       │
├ ANCHORED SUB-NAV (appears on scroll) ────────────────────────┤
│  Overview · Rooms · Location · Reviews                       │
├──────────────────────────────────────────────────────────────┤
│  1  INTRODUCTION      2–3 sentences: what this property is   │
│  2  HIGHLIGHTS        3–5 concrete strengths, iconographic   │
│  3  STORY             editorial narrative — the differentiator│
│  4  GALLERY           categorised, captioned                 │
│  5  SIGNATURE EXPERIENCES  1–4 named, unique to this property│
│     [FLAGSHIP ONLY — or any property with the content]       │
│     5a DINING · 5b THE ROOFTOP · 5c WELLNESS                 │
│  6  ROOMS & AVAILABILITY   room types with live availability │
│  7  AMENITIES         grouped by category, highlights first  │
│  8  LOCATION & NEARBY map · address · landmarks with times   │
│  9  GUEST REVIEWS     verified, sub-scores, hotel replies    │
│ 10  GOOD TO KNOW      check-in/out · children · cancellation │
│ 11  OTHER KAS HOTELS  three, neutral order                   │
└──────────────────────────────────────────────────────────────┘
```

**PROPOSED — the sub-nav shows four items, not eleven.** The page is long and rich; the navigation over
it is short and calm. That is the Classic Luxury principle applied to a specific control.

### 1.1 Section notes

| Section | Design note |
|---|---|
| **Hero gallery** | Primary image full-bleed at a fixed aspect ratio so nothing shifts. Thumbnails below, not overlaid. "View all" opens the immersive gallery |
| **Identity bar** | Name is the largest element. Review score is **supporting evidence beneath the name**, never the property's identity |
| **Sticky stay bar** | Carries the dates the guest already chose. **Re-entering dates is the commonest avoidable friction in hotel booking** |
| **Story** | The direct site's only structural advantage over an OTA. Given real width and real type size, not a collapsed "read more" |
| **Amenities** | Grouped by category with highlights promoted. Icons plus text — never icons alone |
| **Location** | Static map image by default; interactive on tap. Loading a heavy map SDK on every property page is both a performance and a cost decision |
| **Good to know** | Factual register, not marketing. **This is where the positive-framing rule does not apply** ([02](02-brand-foundation.md) §4.2) |
| **Other KAS hotels** | Three properties, neutral order, **no comparative language** — never "cheaper" or "better" |

---

## 2. Flagship treatment — structurally additive

**CONFIRMED** — Milestone's documented strengths: large restaurant · rooftop bar · gym · premium
rooms · rooftop experience · high-end hospitality.

**PROPOSED** — Three additional first-class blocks between §5 and §6:

| Block | Content | Why a block, not a bullet |
|---|---|---|
| **Dining** | Restaurant: editorial description, own gallery, hours, cuisine, whether open to non-residents | A large restaurant is a reason to choose the hotel, not an amenity checkbox |
| **The Rooftop** | Rooftop bar + rooftop experience. Signature imagery: **dusk** | The portfolio's most distinctive available asset |
| **Wellness** | Gym: equipment, hours, access | Decisive for business and long-stay guests |

**CONFIRMED — the additive guarantee, made structural.** These blocks render for **any property that
has content in the corresponding `Facility` record** ([52](52-phase-4-domain-model.md) §3.14). If KAS
Sonata gains a rooftop bar, it gets a `#rooftop` block automatically, with identical prominence.

`isFlagship` controls **placement weight only** — featured band on the collection page, `Recommended`
sort position, homepage editorial band. **It never controls which content blocks are available.**

**CONFIRMED** — Every property must publish **at least one signature experience** before it can go live.
This publish-checklist rule is what operationally prevents "one rich flagship page and seven thin ones".

**CONFIRMED** — Do not distort the brand around Property 4. Milestone is a **storytelling moment within
the KAS Collection**, not the brand's centre of gravity. On the homepage it occupies one band of
eleven; on the collection page one featured position among eight.

---

## 3. Room list — `/hotels/{slug}/rooms`

```
┌ SEARCH CONTEXT ──────────────────────────────────────────────┐
│  12–14 Sep · 2 nights · 2 adults · 1 room     [ Change ]     │
└──────────────────────────────────────────────────────────────┘

┌ ROOM TYPE CARD ──────────────────────────────────────────────┐
│  [image — swipeable on mobile]                               │
│                                                              │
│  [Room name]                                                 │
│  [28] m²  ·  1 King bed  ·  Up to 2 guests  ·  City view     │
│                                                              │
│  ⌾ Wi-Fi   ⌾ Air conditioning   ⌾ Rain shower   ⌾ Safe       │
│                                                              │
│  [1.850.000] ₫  per room / night        ≈ $[73]              │
│  6 rooms available for your dates                            │
│                                                              │
│  [ − ]  2  [ + ]              [ Add to Your Stay ]           │
│                               [ Room details → ]             │
└──────────────────────────────────────────────────────────────┘

              ┌─ YOUR STAY (sticky side panel / bottom sheet) ─┐
              │  2 rooms · estimated [12.450.000] ₫            │
              │  [ View Your Stay → ]                          │
              └────────────────────────────────────────────────┘
```

**CONFIRMED — what the customer sees:** room type name · gallery · description · bed configuration ·
guest capacity · amenities · size (if available) · view (if available) · **available quantity** ·
price · policies · quantity selector.

**CONFIRMED — what the customer never sees:** physical room numbers, in any form, anywhere.

### 3.1 Availability display

| Rule | Detail |
|---|---|
| Source | `availableDirect`, the **minimum across every night** of the stay ([55](55-phase-4-inventory.md) §3.1) |
| Wording | "6 rooms available for your dates" — **only when literally true** |
| Zero | Card stays visible, muted, with the reason and nearest available dates. **Never silently removed** |
| Beyond horizon | "Not yet open for booking — contact us", never "unavailable" |
| Service degraded | "Availability temporarily unavailable — please contact us". **Never a guessed number** |

### 3.2 Quantity selector

```
[ − ]  2  [ + ]
```

| Rule | Behaviour |
|---|---|
| Range | 0 … `min(availableDirect across all nights, config B15)` |
| At ceiling | `+` disables with an inline reason: *"6 rooms available for these dates"* |
| To zero | Removes the line, **with undo** |
| Feedback | Your Stay summary updates in place; the page does not navigate |
| Multiple types | Any number of room types added without leaving the page |
| Occupancy | Advisory, never blocking: *"2 rooms fit up to 4 guests. Add a room for your 5th?"* |

**CONFIRMED** — Never a free-text number field. Typing "50" and receiving an error is worse than a
bounded control that cannot express an impossible request.

**CONFIRMED** — Multiple room types in one booking request is supported end to end
([57](57-phase-4-reservation-sales.md) §2.1).

### 3.3 Comparison within a property

**PROPOSED** — A compact spec strip aligned across cards (area · bed · max guests · price) so a guest
can scan vertically. **No separate room-comparison page**: a property has 4–8 room types, and four
aligned cards *are* a comparison.

---

## 4. Room type detail — `/hotels/{slug}/rooms/{rt}`

```
┌ GALLERY ─────────────────────────────────────────────────────┐
│  Large primary · thumbnail strip · full-screen on tap        │
├──────────────────────────────────────────────────────────────┤
│  [Room name]                                                 │
│  [28] m² · 1 King bed · Up to 2 guests · City view · Non-smoking │
├──────────────────────────────────────────────────────────────┤
│  DESCRIPTION            editorial, sensory, concrete         │
├──────────────────────────────────────────────────────────────┤
│  AMENITIES              grouped: comfort · bathroom · media  │
├──────────────────────────────────────────────────────────────┤
│  FACILITIES AT THIS PROPERTY   links to the property's       │
│                                dining / rooftop / wellness   │
├──────────────────────────────────────────────────────────────┤
│  [1.850.000] ₫ per room / night      ≈ $[73] approximate     │
│  6 rooms available for your dates                            │
│  [ − ] 2 [ + ]        [ Add to Your Stay ]                   │
├──────────────────────────────────────────────────────────────┤
│  GOOD TO KNOW    check-in/out · children · cancellation      │
├──────────────────────────────────────────────────────────────┤
│  OTHER ROOMS AT THIS PROPERTY                                │
└──────────────────────────────────────────────────────────────┘
```

**PROPOSED** — "Facilities at this property" is a deliberate cross-link: a guest reading about a room
at Milestone should discover the rooftop from there, not only from the property page.

**Nothing in this composition can express a room number.** The public room-type response has no field
capable of carrying one ([58](58-phase-4-api-contract.md) §9).

---

## 5. Gallery experience

| Context | Behaviour |
|---|---|
| Property hero | Primary + thumbnail strip; "View all N" opens immersive |
| Immersive | Full-screen, category tabs (Exterior · Rooms · Dining · Facilities · Neighbourhood), captions, keyboard arrows, `Esc` to close |
| Mobile | Native-feeling swipe, pinch-zoom, tap to close |
| Room gallery | Same pattern, scoped to the room type |
| Facility gallery | Same pattern, scoped to the facility |
| Loading | Blurred placeholder at the correct aspect ratio; **no layout shift** |
| Accessibility | Focus trapped while open, restored on close; every image has alt text; arrow-key navigation |

**PROPOSED** — Captions are shown, not hidden behind a hover. A caption naming the room, the view or
the neighbourhood is content, and hovering does not exist on touch.

---

## 6. Price presentation

**CONFIRMED** — Per room, per night. VND primary, USD indicative.

```
1.850.000 ₫   per room / night
≈ $73         approximate
```

| Rule | Detail |
|---|---|
| Basis stated **on every price** | Per-person pricing is common in the region; ambiguity causes disputes |
| VND formatting | `1.850.000 ₫` — Vietnamese convention |
| USD | `≈`, rounded to the whole dollar, with a persistent disclaimer |
| **USD disappears at commitment** | Not on the confirmation, not in email, not in the snapshot |
| "From" prices | Labelled "from", never presented as the price |
| Taxes | Line reserved, shown as `estimated` **until config A7 is supplied. No number is fabricated** |

---

## 7. Coming Soon and closed properties

| Lifecycle state | Presentation |
|---|---|
| `COMING_SOON` | Teaser tile in a separate group; teaser page; optional interest registration. **Not bookable** |
| `TEMPORARILY_CLOSED` | Listed, marked unavailable with the reopening date, alternatives offered |
| `CLOSED` | 410 page explaining the closure, with nearby KAS properties — **not a 404, not a silent redirect** |

**CONFIRMED** — "KAS No. 9" is **lifecycle data, never a hard-coded section**. If no property is
`COMING_SOON`, the band disappears entirely.

---

## 8. Content requirements per property

**PROPOSED** — Publish checklist, enforced in admin ([60](60-phase-4-admin-operations.md) §3.4):

| Required before publish | Status |
|---|---|
| Hero image with a distinct composition | **Blocked — B8** |
| Signature line, unique across published properties | `[PLACEHOLDER]` |
| Short and long description, **both locales** | `[PLACEHOLDER]` |
| Address, district, coordinates | **Blocked — OQ-060** |
| ≥ 1 published room type with images | **Blocked — A1/A2** |
| **≥ 1 signature experience** | `[PLACEHOLDER]` |
| Amenity assignments | **Blocked — A9** |
| Check-in / check-out times | `[PLACEHOLDER]` |
| Alt text on every public image, both locales | **Blocked — B8** |

**PROPOSED** — The design is complete and implementable. **It has no content.** Nothing in this
specification compensates for the absence of B8 and A1.

---

## 9. Open dependencies

| ID | Blocks |
|---|---|
| **B8 / OQ-030** | All photography — hero distinctiveness, galleries, the whole image-led direction |
| **A1 / A2 / OQ-010** | Room type names, configurations, quantities — every room surface |
| **B6 / OQ-005** | Rates — every price |
| A7 | Tax and service charge — the estimate line |
| A9 / OQ-031 | Amenity data — amenity sections and filters |
| OQ-060 | Districts, addresses, landmark distances — location sections |
| A4 / A5 | Cancellation and no-show — the Good to know block |
| OQ-042 | Whether Milestone's restaurant and rooftop are bookable |
