# 66 — Customer Experience: Home, Collection, Brand, Reviews, Account

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Last updated:** 2026-08-14

> `[PLACEHOLDER]` marks a value that is structurally required but not yet supplied by the business.
> **No hotel facts are invented** ([64](64-phase-5-ux-principles.md) §10).

---

## 1. The ten things a guest must understand

**CONFIRMED** — Mapped to where each is answered.

| # | Guest question | Answered by |
|---|---|---|
| 1 | Who is KAS? | Home hero + At a Glance + Story |
| 2 | Why is KAS trustworthy? | Verified reviews · real addresses · photography quality · Service Promise · named contact |
| 3 | What are the 8 properties? | Home collection band · The Collection page · nav panel |
| 4 | Which property suits my trip? | Signature lines · character tags · collection grouping · Locations · Compare |
| 5 | What rooms are available? | Room list with live availability for the guest's dates |
| 6 | What does each room offer? | Room card facts + room detail |
| 7 | How much does it cost? | Price per room per night, VND primary, USD indicative |
| 8 | How close is it to what matters? | Nearby landmarks with real distances · Locations map |
| 9 | What did previous guests experience? | Verified Stay reviews with sub-scores |
| 10 | How do I book? | Persistent stay control · Service Promise · the request flow |

---

## 2. Homepage

**PROPOSED** — Eleven bands. Each is a content block ([23](23-content-architecture.md) §6.1), so
reordering is drag-and-drop, not engineering.

```
1  HERO                     full-bleed photograph · brand statement · search anchored at base
2  BOOKING SEARCH           Where · When · Who · Rooms
3  KAS AT A GLANCE          8 hotels · since 2019 · Ho Chi Minh City · the service thesis
4  KAS STORY                editorial band → /about/story
5  THE KAS COLLECTION       eight editorial tiles, varied
6  FLAGSHIP — MILESTONE     full-bleed band: rooftop · restaurant · gym
7  FEATURED ROOMS           what a KAS room is actually like
8  EXPERIENCES              rooftop · dining · neighbourhood → /experiences
9  EXPLORE SAIGON           districts, landmarks, real distances
10 GUEST REVIEWS            verified, attributed to property
11 SERVICE PROMISE + CTA    the request model explained as a benefit
   (COMING SOON)            renders only if a property is in COMING_SOON
   FOOTER
```

**PROPOSED** — Band 3 is doing specific work: **"KAS is a real hotel group with 8 properties"** must be
established within the first scroll. A single hero cannot say it; four plain facts can.

### 2.1 Hero

- One arresting photograph, full-bleed, **subject-safe crop** so the search panel never covers the
  subject.
- Brand statement, short. **The slogan is a concept, not approved** ([02](02-brand-foundation.md) §1) —
  any tagline in a mock-up is marked `[PLACEHOLDER — slogan not approved]`.
- Search panel **anchored at the base of the hero**, immediately usable without scrolling. This
  satisfies both "premium editorial hero" and "booking search is primary" without compromising either.
- No auto-playing video with sound. No carousel — one image, chosen well.

### 2.2 Booking search

```
┌──────────────────────────────────────────────────────────────┐
│  Where            When                  Who        Rooms     │
│  All KAS ▾   │  12 Sep → 14 Sep    │  2 + 0   │    1    │ ⌕ │
└──────────────────────────────────────────────────────────────┘
```

Defaults are never empty: tonight → tomorrow, 2 adults, 1 room. Adults and children **separated**, with
an age per child (required for occupancy and child pricing). Rooms is first-class, not hidden.

### 2.3 The Collection band

**Eight editorial tiles, deliberately non-uniform** in size and alignment, alternating image side.
Per tile: hero image (per-property crop) · name · signature line `[PLACEHOLDER]` · district
`[PLACEHOLDER]` · 2–3 character tags · from-price `[PLACEHOLDER]` · review score once available.

**CONFIRMED** — Never a uniform grid. Uniform cards make eight distinct hotels interchangeable, which
contradicts the confirmed identity requirement.

### 2.4 Flagship band

Full-bleed editorial, driven by `isFlagship` — **not a hard-coded property ID**. Content: rooftop bar ·
large restaurant · gym · premium rooms · the rooftop experience. Signature image: **rooftop at dusk**.

**CONFIRMED** — Additive. No comparative language, no "our best hotel", no tier badge.

### 2.5 Explore Saigon

Serves the Local Heritage pillar. District cards with named landmarks and real walking times
`[PLACEHOLDER — distances unverified, OQ-060]`. Links to `/locations`.

### 2.6 Service Promise + final CTA

**PROPOSED** — This band does the single most important persuasion job on the site: it explains the
request model **as a benefit**, not an apology.

```
Every stay begins with a conversation.

Tell us what you need and a member of the KAS team confirms
availability and contacts you [within the day].
No payment is taken online.

[ Find your stay ]        Questions? +84 [PLACEHOLDER] · Zalo
```

The SLA phrase is drawn from **one settings value** (config A6) so on-screen text, email and the
internal timer can never disagree.

---

## 3. The Collection page — `/hotels`

```
1  Intro            one editorial sentence about the portfolio
2  Quick filters    one restrained row (§3.1)
3  Featured         Milestone, full-width editorial band
4  The Eight        varied editorial tiles, alternating alignment
5  Map teaser       "See them all on a map" → /locations
6  Compare CTA      "Not sure which? Compare up to three"
7  Coming Soon      renders only if a property is COMING_SOON
```

### 3.1 Filters — five groups, each justified

**CONFIRMED direction** — Every filter must earn its place at n=8. The test: *does it reduce the set in
a way the guest could not do faster by simply looking?*

| Filter | Rationale |
|---|---|
| **Dates + guests + rooms** | Not a filter — the search itself. The only input changing what is *purchasable* |
| **District** | The strongest decision factor for a city hotel. Blocked on OQ-060 |
| **Near a landmark** | How guests actually think. A distance sort scoped to a chosen point |
| **Character / collection** | The honest replacement for a star or tier filter. Blocked on OQ-009 |
| **Key amenities — seven only** | Rooftop · Restaurant · Gym · Pool · Family rooms · Parking · Airport transfer. Each is a genuine reason to pick a different hotel |

**Excluded, with reasons:** star rating and guest-rating **threshold** (both build a hierarchy across
KAS's own properties — prohibited by the positive-framing rule; rating becomes a *sort*, not a filter) ·
price slider (a sort answers it in one interaction) · property type (all eight are city hotels) ·
free cancellation (**cannot be offered — the policy is undefined**) · 40-item amenity checklists (an
OTA pattern for disambiguating thousands of near-identical listings).

### 3.2 Sorting

`Recommended` (default) · `Price` · `Guest rating` · `Distance from [point]`.

**PROPOSED** — `Recommended` is an **explicit, documented order**: flagship first, then admin sort
order. A short *"How we order this"* link explains it in one sentence. An unexplained ranking of KAS's
own properties is both untrustworthy and a positive-framing risk.

Guest-rating sort is **hidden until a property has ≥ 5 published reviews** (OQ-059 cold start).

### 3.3 Compare

Up to three properties. Rows: district · distance from a chosen landmark · character · room types ·
from-price · key amenities · review score · signature experience.

**CONFIRMED** — An absent amenity renders **"Not at this property"**, never a red cross. A comparison
table is the easiest place to accidentally rank KAS's own hotels; the visual language must be neutral
by construction.

---

## 4. Search results — `/search`

```
Search summary (editable in place)
"6 of 8 KAS hotels have rooms for your dates"
Sort · Map toggle
─────────────────────────────────────────────
Available properties     image · name · signature line · district
                         from-price · availability · review score · 3 amenities
─────────────────────────────────────────────
Not available for these dates          ← shown BELOW, never hidden
                         + nearest available dates + one-tap date shift
─────────────────────────────────────────────
No results → portfolio-wide nearest available dates
```

**PROPOSED** — Unavailable properties are **shown, not hidden**. With eight properties, hiding two
makes the portfolio look thin and denies the guest a decision they are entitled to make.

---

## 5. Locations / Explore — `/locations`

Map-led. All eight pinned (no clustering needed — a benefit of the small portfolio). Synchronised list
↔ pins; selecting a pin reveals a compact property card. District grouping. A landmark-distance tool:
choose a landmark, properties re-sort by proximity.

**Blocked on OQ-060** — district and distance data are unknown; all values render as `[PLACEHOLDER]`.

---

## 6. Experiences — `/experiences`

**PROPOSED** — Portfolio-wide, experience-led, serving the Local Heritage pillar. Content is drawn from
`Facility` and `SignatureExperience` records ([52](52-phase-4-domain-model.md) §3.14), so it populates
automatically as properties add content.

Sections: **Rooftop & views** (Milestone leads) · **Dining** · **Wellness** · **The neighbourhoods** ·
**Signature experiences by property**.

**CONFIRMED** — This is where Milestone's restaurant and rooftop live as *experiences* rather than
amenity checkboxes — and where they can be given weight **without distorting the whole brand around
one property**, because every property's experiences appear on the same page.

---

## 7. About KAS

| Page | Content |
|---|---|
| `/about` | Who KAS is · at a glance · the service thesis · the eight houses · contact |
| `/about/story` | Founded **2019** · **KAS Passion Boutique Hotel** as the first house · growth to eight · why hospitality is the product |
| `/about/service` | **The Service Promise** — the request model explained as personal service, with the response commitment and what happens after a request |

**CONFIRMED facts available:** founded 2019 · first property KAS Passion Boutique Hotel · 8 properties ·
Ho Chi Minh City · premium positioning · service as the primary value. Everything else is
`[PLACEHOLDER]` — founder story, team, milestones and the meaning of "KAS" (OQ-001) are **not invented**.

---

## 8. Reviews

### 8.1 Presentation

```
┌────────────────────────────────────────────────┐
│  ★ 4.8   Nguyen V.        ✓ Verified Stay      │
│  Stayed September 2026 · KAS Milestone Premium │
│  ─────────────────────────────────────────     │
│  Cleanliness 5 · Service 5 · Location 4        │
│  Room 5 · Value 4                              │
│                                                │
│  "[review text]"                               │
│  [guest photos — thumbnails]                   │
│  ──────────────────────────────────────────    │
│  ↳ KAS Milestone Premium Hotel replied          │
│    "[reply text]"                              │
└────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Display name | First name + last initial |
| Date | **Stay month only**, never exact dates — a privacy measure |
| **Verified Stay** | Implicit and structural: a review cannot exist without a completed reservation ([61](61-phase-4-customer-review.md) §5.1) |
| Sub-scores | Cleanliness · Service · Location · Room · Value |
| Photos | Moderated separately from the text |
| Hotel response | Publicly attributed, visually distinct, indented |
| **Moderation states** | **Never visible to guests.** A guest sees published reviews only; their own review's state appears solely in My KAS |
| Language | Shown in its original language, labelled. **No machine translation in V1** |
| Empty state | Neutral. **Never an apology, never a fabricated score** |

**CONFIRMED** — Only guests with an eligible **completed** stay can review, on any channel — OTA guests
included ([61](61-phase-4-customer-review.md) §5.1).

### 8.2 Writing a review

Reached from My KAS or the post-stay email. One screen: overall rating (required) · five optional
sub-scores · title · body · optional photos · submit. Confirmation states plainly that the review is
checked before publishing — the guest is not left wondering why it has not appeared.

---

## 9. My KAS — customer account

```
MY KAS
├── Overview            next stay · pending actions · reviews to write
├── Stays               Upcoming · Requests · Past          ← three tabs
│   └── Stay detail     status timeline · rooms · dates · price · contact
├── Reviews             written · awaiting · eligible
├── Profile             name, contact, country
├── Preferences         language · currency · communication
├── Offers              targeted offers
├── Notifications
└── Security            password · sessions · sign out everywhere
```

**PROPOSED — "Stays", not "Bookings".** The section contains submitted *requests* that are not
bookings. Calling it Bookings recreates exactly the misunderstanding the product exists to avoid.

| Tab | Contains |
|---|---|
| **Upcoming** | Confirmed, ready for arrival, checked in |
| **Requests** | Everything awaiting a KAS response |
| **Past** | Completed, checked out, cancelled, expired |

**CONFIRMED** — Internal states are never shown. The guest sees plain language only
([68](68-phase-5-booking-experience.md) §6).

### 9.1 Rewards placeholder

**CONFIRMED direction** — "Future rewards placeholder **if architecture supports it**."

**PROPOSED — it does, minimally, and should be handled with care.** [51](51-phase-4-configuration.md)
C7 records loyalty as future configuration; no programme exists (OQ-041).

Recommendation: **a non-navigable placeholder only** — a single quiet line in My KAS Overview reading
*"A KAS guest programme is coming."* No points balance, no tier, no fake progress bar, no
"member rate" implication, and **no navigation entry**.

Inventing a visible rewards surface would imply a discount KAS cannot honour, which is precisely what
[64](64-phase-5-ux-principles.md) §5.2 rejects. If the product owner prefers, omit it entirely — that
is also a correct answer.

---

## 10. Trust devices

**PROPOSED** — In a request model these do heavier work than on an instant-payment site.

| Device | Where |
|---|---|
| Verified Stay reviews | Home · property · room · reviews pages |
| Explicit response promise | Search, Your Stay, request confirmation, email |
| Real photography with captions | Everywhere *(blocked on B8)* |
| Named human contact | Request confirmation, status, email |
| Policy summary **before** the submit action | Your Stay *(blocked on A4/A5)* |
| Precise availability | Room cards — **only when true** |
| Address, phone, map per property | Property pages, contact, footer |
| Business registration and tax details | Footer `[PLACEHOLDER — OQ-021]` |

**CONFIRMED prohibited:** fake scarcity · "X people booked today" · unverifiable scores · best-price
guarantees KAS cannot honour.

---

## 11. Empty, loading and error states

| Surface | State | Next action |
|---|---|---|
| Search | No property available | Nearest available dates portfolio-wide |
| Search | Filters exclude everything | Name the filter; one-tap clear |
| Room list | No room type available | Property-level alternative dates |
| Your Stay | Empty | Back to rooms, **dates preserved** |
| My Stays | None | Explore the eight hotels |
| Reviews | None yet | Neutral statement, no apology |
| Offers | None | Section hidden entirely |

**Loading:** server-rendered shells (no loading state exists for page structure) · **skeletons at final
dimensions** for availability, so nothing shifts · progressive images with blurred placeholders at the
correct aspect ratio · Your Stay recalculation keeps the **previous total visible** rather than
blanking · submission is blocking, explicit, and says "please don't refresh".

**Errors:** every booking-path error shows a **phone number**. In a request model the human channel is
always available, and that is the differentiator — a failed page should route to a person, not a dead
end.

---

## 12. Open dependencies

| ID | Blocks |
|---|---|
| **A8 / OQ-004** | Brand assets — all visual tokens provisional |
| **B8 / OQ-030** | Photography — the entire image-led direction |
| **A4 / A5** | Cancellation and no-show — **the policies block above the submit action** |
| A6 | "Within the day" wording |
| A1/A2, B6 | Room types, quantities, rates — all price and room content |
| OQ-060 | Districts and distances — Locations and Explore Saigon |
| OQ-009 | Collections — the character filter and grouping |
| OQ-001 | Meaning of "KAS" — the Story page |
| OQ-021 | Legal entity details — the footer |
| OQ-041 | Loyalty — the rewards placeholder |
