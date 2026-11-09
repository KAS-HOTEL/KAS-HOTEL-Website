# 79 — Customer Screen Specifications

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready
**Last updated:** 2026-08-14

> Twelve screens. Each: **purpose · hierarchy · layout · sections · components · typography · imagery ·
> CTA hierarchy · responsive · states · accessibility.**
> `[PLACEHOLDER]` = business data not yet supplied. **No hotel facts are invented.**

---

## 1. HOME

**Purpose** — Establish that KAS is a real hotel group with eight properties, and open the funnel.
**Density** — Editorial. **Primary CTA** — Search. **Secondary** — Explore the collection.

| # | Section | Container | Height / spacing | Components |
|---|---|---|---|---|
| 1 | Hero | `full` | `aspect.hero`, min 560px desktop / 70vh mobile | Hero, scrim, headline `display-xl` |
| 2 | Booking search | `content` | Overlaps hero base by 50%, 72px | Booking search |
| 3 | KAS at a Glance | `content` | `space.10` above | 4 stat items, `display-sm` numerals + `label` captions |
| 4 | KAS Story | `content` | `space.10` | 7/5 asymmetric: image left, text right. `display-lg` + `body-lg` 68ch |
| 5 | **The KAS Collection** | `content` | `space.10` | Property grid, varied tiles, `space.7` gutter |
| 6 | **Flagship — Milestone** | `full` | `space.9` either side, `aspect.heroWide` 21:9 | `surface.inverse` band, 3 experience callouts |
| 7 | Featured rooms | `content` | `space.10` | 3 room preview cards, horizontal scroll on mobile |
| 8 | Experiences | `content` | `space.10` | 3 facility cards → `/experiences` |
| 9 | Explore Saigon | `content` | `space.10` | District cards + landmark distances `[PLACEHOLDER]` |
| 10 | Guest reviews | `content` | `space.10` | 3 review cards, `surface.sunken` band |
| 11 | Service promise + CTA | `full` | `space.10` | CTA band, `surface.inverse`, one primary button |
| — | Coming Soon | `content` | `space.9` | **Renders only if a property is `COMING_SOON`** |
| — | Footer | `full` | `space.10` above | Footer |

**Hierarchy** — Rank 1: hero photograph + headline + search. Rank 2: collection tiles. Rank 3: story,
experiences, reviews. Rank 4: stat captions, distances.

**Imagery** — Hero: one arresting photograph, subject-safe crop, **no carousel**. Section 6: rooftop at
dusk, 21:9. Section 5: eight distinct per-property crops. Total above-fold payload ≤ 1.2MB.

**Section 3 does specific work** — "KAS is a real hotel group with 8 properties" must land in the first
scroll. Four plain facts do what a hero alone cannot: `8 hotels · since 2019 · Ho Chi Minh City ·
[service statement]`.

**Responsive** — Mobile: hero 4:5 portrait; search collapses to a single "Find your stay" button
opening the sequential flow; collection tiles 1-up; flagship band full-bleed portrait crop; featured
rooms horizontal scroll; footer accordion.

**States** — No reviews yet → section 10 hidden entirely. No offers → no offers section. No
`COMING_SOON` property → band absent. Availability service degraded → search still renders, results
page shows the degraded badge.

**Accessibility** — `<h1>` is the hero headline; sections are `<section>` with `<h2>`; the stat band is
a `<dl>`; skip link first.

---

## 2. HOTELS / THE KAS COLLECTION

**Purpose** — Curated discovery of eight distinct properties. **Density** — Editorial.
**Primary CTA** — Open a property. **Secondary** — Compare · Map.

| # | Section | Spec |
|---|---|---|
| 1 | Intro | `container.narrow`, one editorial sentence, `display-sm` + `body-lg`. `space.9` top |
| 2 | Filter row | Single restrained row of chips: District · Character · Amenities (7 only). `space.6` below |
| 3 | Featured | Milestone, `feature` tile, 8 cols, image left / text right |
| 4 | The Eight | Varied grid ([77](77-phase-6-layout-grid.md) §4.1), `space.7` gutter |
| 5 | Map teaser | Static map strip, `aspect.heroWide`, "See them all on a map" |
| 6 | Compare CTA | `surface.sunken` band, "Not sure which? Compare up to three" |
| 7 | Coming Soon | Separate group, muted tiles, conditional |

**H1** — "The KAS Collection". **Nav label remains "Hotels"** (OQ-084).

**Filter rationale is documented, not implied** — a "How we order this" link beside the sort control
explains `Recommended` in one sentence: flagship first, then editorial order. **Guest-rating sort is
hidden until a property has ≥ 5 published reviews.**

**Usage rules** — Never a uniform grid. Milestone is first with more visual weight and **no badge, no
tier label**. Absent amenities in comparison render **"Not at this property"**, never a red cross.

**Responsive** — Tablet 2-up varied; mobile 1-up, filters in a bottom sheet.
**States** — Filters exclude everything → name the filter, one-tap clear.

---

## 3. HOTEL DETAIL

**Purpose** — Persuade, then convert to room selection. **Density** — Editorial above, transactional
below. **Primary CTA** — View rooms.

| # | Section | Anchor | Spec |
|---|---|---|---|
| 1 | Hero gallery | — | `aspect.hero`, gallery count chip, `radius.none` |
| 2 | Identity bar | — | Name `display-md` · signature `body-lg` · meta row · `space.7` vertical |
| 3 | **Sticky stay bar** | — | 64px, appears when hero leaves viewport. Dates · guests · `View rooms` |
| 4 | Sub-nav | — | Appears on scroll: **Overview · Rooms · Location · Reviews** — four, not eleven |
| 5 | Introduction | `#overview` | `container.narrow`, `body-lg` 1.70, 68ch |
| 6 | Highlights | `#highlights` | 3–5 icon+label items, 3 cols desktop |
| 7 | Story | `#story` | 7/5 asymmetric, `body-lg`, `space.10` |
| 8 | Gallery | `#gallery` | 3-col grid, "View all N" → immersive |
| 9 | Signature experiences | `#experiences` | 1–4 facility cards, alternating sides |
| **9a** | **Dining** | `#dining` | **Flagship extension — renders for any property with the content** |
| **9b** | **The Rooftop** | `#rooftop` | Signature imagery: dusk |
| **9c** | **Wellness** | `#wellness` | Gym hours, access |
| 10 | Rooms & availability | `#rooms` | Room cards with live availability |
| 11 | Amenities | `#amenities` | Grouped, highlights first |
| 12 | Location & nearby | `#location` | 7/5 static map + landmark list |
| 13 | Guest reviews | `#reviews` | 3 cards + "See all N reviews" |
| 14 | Good to know | `#policies` | Check-in/out · children · **cancellation `[BLOCKED — A4]`** |
| 15 | Other KAS hotels | — | 3 compact tiles, **neutral order, no comparative language** |

**The seam** — Sections 1–9 are editorial (image-to-text 40–55%); 10–14 are transactional (25–35%). The
sticky stay bar appears exactly at the transition.

**Flagship rule** — 9a–9c render from `Facility` content, **not** from `isFlagship`. If Sonata gains a
rooftop, it gets `#rooftop` with identical prominence. `isFlagship` controls **placement weight only**.

**CONFIRMED** — No physical room numbers anywhere. Guests see room type + available quantity only.

**Responsive** — Mobile: sub-nav becomes horizontally scrollable chips sticking under the header;
7/5 sections stack image-first; gallery 1-col with swipe; sticky bottom bar replaces the stay bar.

**States** — `TEMPORARILY_CLOSED` → notice band above section 5 with reopening date and alternatives.
`CLOSED` → 410 page with nearby properties. No reviews → section 13 renders a neutral statement.

**Accessibility** — `<h1>` = property name; section headings `<h2>`; room names `<h3>`; sub-nav is
`<nav aria-label="On this page">` with anchor links.

---

## 4. ROOM DETAIL

**Purpose** — Full room product; convert to Your Stay. **Density** — Transactional with editorial
imagery. **Primary CTA** — Add to Your Stay.

| # | Section | Spec |
|---|---|---|
| 1 | Breadcrumb | Home / Hotels / [Property] / Rooms / **[Room name]** |
| 2 | Gallery | Primary `aspect.card` + thumbnail strip, immersive on tap |
| 3 | Title + facts | `display-md` name; facts row `metadata` — area · bed · max guests · view · smoking |
| 4 | Description | `container.narrow`, `body-lg` 1.70, 68ch. Sensory and concrete |
| 5 | Amenities | Grouped, icon + label, 3 cols |
| 6 | Facilities at this property | Cross-link to `#dining` / `#rooftop` / `#wellness` |
| 7 | **Selection block** | Price · availability badge · quantity stepper · Add to Your Stay |
| 8 | Good to know | Check-in/out · children · cancellation `[BLOCKED]` |
| 9 | Other rooms | Compact room cards |

**Selection block** — `surface.sunken`, `radius.md`, `space.5` padding, **sticky on desktop** within
section 7's column; becomes the mobile bottom bar content.

**CTA hierarchy** — Rank 1: Add to Your Stay. Rank 2: quantity stepper. Rank 3: "View all photos".

**Section 6 is deliberate** — a guest reading about a Milestone room should discover the rooftop from
here, not only from the property page.

---

## 5. SEARCH / AVAILABILITY RESULTS

**Purpose** — Date-scoped answers across the portfolio. **Density** — Transactional.
**Primary CTA** — Open a property.

| # | Section | Spec |
|---|---|---|
| 1 | Search context bar | Sticky, editable in place, `surface.elevated` |
| 2 | Result count | *"6 of 8 KAS hotels have rooms for your dates"* — `heading-md` |
| 3 | Sort + map toggle | Right-aligned. Sort: Recommended · Price · Rating · Distance |
| 4 | Available results | Full-width rows: image 4 cols / content 8 cols |
| 5 | **Unavailable group** | **Below available, never hidden.** `surface.sunken` band, muted rows, nearest available dates, one-tap date shift |
| 6 | Map (toggle) | 7 list / 5 map desktop; full-screen mode on mobile |

**Result row** — image `aspect.tile` · name `heading-md` · signature `body-sm` clamp 1 · district ·
review score · 3 amenity chips · from-price `price-lg` · availability badge.

**CONFIRMED** — Unavailable properties are **shown, not hidden**. With eight properties, hiding two
makes the portfolio look thin and denies the guest a decision.

**States** — Zero results → portfolio-wide nearest available dates. Degraded → content renders,
availability shows the degraded badge, contact route offered, **never a guessed number**.
**Not indexed** (`noindex, follow`).

---

## 6. YOUR STAY

**Purpose** — Review and submit the request. **Density** — Transactional, imagery ≤ 15%.
**Primary CTA** — **Request this stay**.

| # | Block | Spec |
|---|---|---|
| 1 | Progress | **Your Stay → Your Details → Review** — three steps, never "Payment" |
| 2 | Property | 72×72 thumb + name + district. `space.4` |
| 3 | Dates | Range + check-in/out times + nights. `[ Change ]` ghost |
| 4 | Guests | Adults, children with ages. `[ Change ]` |
| 5 | Room lines | Per line: name · price with basis · stepper · subtotal · Remove. `border.subtle` between |
| 6 | Add rooms | Ghost button back to the room list |
| 7 | Price breakdown | Subtotal · taxes `estimated` ⓘ · offer · rule · **ESTIMATED TOTAL** + USD |
| 8 | Special requests | Textarea, 4 rows, character counter |
| 9 | **Good to know** | Check-in/out · children `[B10]` · **cancellation `[BLOCKED — A4. Publish blocker]`** |
| 10 | Request statement | *"This is a booking request. No payment is taken now. We'll confirm availability and contact you [within the day]."* |
| 11 | Primary action | **Request this stay**, `lg`, full-width mobile |

**Typography** — Total `price-lg` 26px/600 `text.primary`; the word **"estimated"** `body-sm`
`text.muted` directly beneath; disclaimer `caption`.

**CONFIRMED** — Never labelled "Total" alone. **USD is indicative here and disappears entirely from
the confirmation onward.**

**Responsive** — Desktop: 8-col content + 4-col sticky summary. Mobile: single column, summary as an
expandable bottom sheet, primary action in the bottom bar.
**States** — Empty → "Your Stay is empty", back to rooms with **dates preserved**. Availability lost →
inline explanation with alternatives, **never a silent quantity reduction**. Near expiry → warning with
one-tap extend.

---

## 7. CUSTOMER INFORMATION

**Purpose** — Capture what sales needs. **Layout** — `container.narrow` 680px.
**Primary CTA** — Continue to review.

| Group | Fields |
|---|---|
| Contact | Full name* · email* · phone with country code* |
| Preferences | Preferred channel (Phone · **Zalo** · Email) · best time to contact |
| Travel | Country · estimated arrival time |
| Requests | Special requests (carried from Your Stay, editable) |
| Attribution | "How did you hear about us?" — **optional; stored separately from `leadSource`** |
| Invoice | Company + tax details — conditional on config A7 |
| Consent | Marketing opt-in — **unticked by default** |

**Spec** — Field gap `space.5`; group gap `space.7`; labels above, always visible; validation **on blur**;
errors adjacent in plain language. Guest submission permitted; account creation offered **after** success.

**Accessibility** — `<fieldset>` + `<legend>` per group; `aria-describedby` for helper and error;
error summary at the top with links to fields; correct `autocomplete` and `inputmode`.

---

## 8. REQUEST SUBMITTED

**Purpose** — Convert uncertainty into confidence. **Layout** — `container.narrow`, centred.

```
        ✓  (48px, success.500)

    Your stay request has been sent.        display-md

    Reference   KAS-260912-4F7A             mono, heading-md, selectable

    WHAT HAPPENS NEXT                       label
    1  A member of the KAS team reviews your request.
    2  We confirm availability and contact you [within the day].
    3  We arrange payment together — nothing is charged now.

    We've emailed a copy to n•••@example.com     body-sm, text.muted

    [ Track this request ]   [ Create an account ]

    Questions?  +84 [PLACEHOLDER] · Zalo · reservations@[PLACEHOLDER]
```

**Rules** — No personal data beyond a masked email. Reference is selectable and copyable. **A phone
number is always present** — in a request model the human channel *is* the product. Account creation is
pre-filled; this is the highest-converting moment for it. Full navigation is restored here.
**CONFIRMED** — No `salesStatus` is exposed. The guest sees plain language only.

---

## 9. REQUEST STATUS

**Purpose** — Make the wait feel like attention, not absence. **Layout** — `container.narrow`.

| # | Block | Spec |
|---|---|---|
| 1 | Header | Property · dates · nights · rooms · reference |
| 2 | **Current status** | Rank 1. Guest label `heading-lg` + guidance `body` |
| 3 | Timeline | Vertical, most recent first. Dot 12px + label `body-sm` + timestamp `caption` + guidance |
| 4 | Your Stay summary | Rooms, estimated total |
| 5 | Alternatives *(conditional)* | Up to 3 option cards, each stating **plainly what differs** |
| 6 | Contact | Phone · Zalo · agent **first name only** |
| 7 | Actions | Cancel request · Talk to us |

**Guest vocabulary only** — Request received · Our KAS team is reviewing your request · Checking
availability · We're contacting you · Alternative options available · Your requested room is available
· Payment instructions ready · **Your stay is confirmed** · Ready for your arrival · You're checked in ·
Stay completed · Request cancelled · Request expired.

**CONFIRMED** — `WON`, `ASSIGNED`, `AVAILABILITY_CHECK`, `CUSTOMER_CONTACTED` **never appear.**

**No fixed-step progress bar** — a request can branch to alternatives, decline or expire. The timeline
shows what has happened, not a promised path.

**Alternatives** — Each card: what differs (headline), rooms, dates, price, `[ Choose this ]`.
**"Held for you until [date/time]"** appears **only** where an `ALTERNATIVE_OFFER` hold is active.
Other KAS properties presented **neutrally**.

**Expiry** — Framed as "held until", never "expires at". An expired request offers **"Recreate this
request"**, pre-filled.

---

## 10. MY KAS

**Purpose** — Track, manage, review. **Layout** — Left rail 3 cols / content 9 cols desktop.

| Section | Contents |
|---|---|
| Overview | Next stay card · pending actions · reviews to write · **rewards placeholder line** |
| **Stays** | Three tabs: **Upcoming · Requests · Past** |
| Reviews | Written · awaiting moderation · eligible to write |
| Profile · Preferences · Offers · Notifications · Security | Standard forms and lists |

**"Stays", not "Bookings"** — the section contains requests that are not bookings.

**Rewards placeholder** — **one quiet line** in Overview: *"A KAS guest programme is coming."*
`body-sm`, `text.muted`. **No points, no tier, no progress bar, no navigation entry.** Omitting it
entirely is also correct (OQ-041).

**Responsive** — Mobile: rail becomes a list; tabs horizontally scrollable.
**States** — No stays → "No stays yet" + explore the eight hotels.

---

## 11. RESERVATION DETAIL

**Purpose** — Everything about one stay. **Layout** — `container.narrow`.

| # | Block | Spec |
|---|---|---|
| 1 | Status band | Current guest status, `surface.sunken`, rank 1 |
| 2 | Property | Image · name · address · phone · directions link |
| 3 | Stay | Dates · nights · check-in/out times · guests |
| 4 | Rooms | Room type names + quantities. **No room numbers** |
| 5 | Price | Breakdown + total. **VND only** |
| 6 | Payment | Method · amount · date · status — summary only |
| 7 | Timeline | Full status history in guest vocabulary |
| 8 | Contact | Property phone · Zalo · agent first name |
| 9 | Actions | Add to calendar · Directions · **Cancel `[BLOCKED — A4]`** · Write a review (when `COMPLETED`) |

**CONFIRMED absent** — `salesStatus`, `stayStatus` raw values, `salesOwnerId`, `leadSource`,
`distributionChannel`, `otaReference`, holds, internal notes, SLA fields, room numbers.

**PROPOSED** — An **OTA guest with a KAS account sees the same screen**, minus the request timeline —
they never had a sales process. This is the Customer 360 promise made visible.

---

## 12. REVIEW

**Purpose** — Capture a verified review. **Layout** — `container.narrow`. **Entry** — My KAS or the
post-stay email.

| # | Block | Spec |
|---|---|---|
| 1 | Context | Property · stay month · **Verified Stay badge** |
| 2 | Overall rating* | 5 stars, 44px targets, keyboard operable, label per value |
| 3 | Sub-scores | Cleanliness · Service · Location · Room · Value — optional, same control |
| 4 | Title | Optional, single line |
| 5 | Review* | Textarea 6 rows, counter, min/max per config B16 |
| 6 | Photos | Optional, drag-drop, max N, EXIF stripped |
| 7 | Consent | Display name shown as "First L." — stated, not asked |
| 8 | Submit | Primary |

**After submit** — *"Thank you. Your review is checked before publishing, usually within
[PLACEHOLDER]."* The guest is not left wondering why it has not appeared.
**Eligibility** — Screen reachable **only** where `stayStatus = COMPLETED`, ownership matches, no
existing review, and within the window. **Channel-agnostic — OTA guests are eligible on identical
terms.**
**Accessibility** — Star rating is a radio group with visible labels; not hover-dependent.

---

## 13. Cross-screen rules

| Rule | Applies to |
|---|---|
| **One rank-1 element per viewport** | All |
| Dates never re-entered once given | All booking-path screens |
| Every booking-path error shows a phone number | 5–9 |
| USD never appears at or after commitment | 8, 9, 11 |
| Placeholders visibly marked in deliverables | All |
| No internal state, no room numbers | All customer screens |
| Empty states are neutral, never apologetic | All |
| Loading uses skeletons at final dimensions | All |
