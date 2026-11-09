# 18 — Information Architecture v2 (Master)

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Supersedes:** [08-information-architecture.md](08-information-architecture.md) — that document remains
valid as Phase 1 context, but **where the two disagree, this document governs.**
**Last updated:** 2026-08-14

> **Phase rule in force:** documentation only. No code, no dependencies, no framework initialisation,
> no database, no UI components.

---

## 1. What changed since Phase 1

**CONFIRMED (Phase 1.5)** — The following are now decided and are treated as binding throughout
documents 18–28:

| Decision | Value | Effect on Phase 1 |
|---|---|---|
| Backend | **Spring Boot** | Resolves OQ-038. [11](11-technology-evaluation.md) / [12](12-recommended-stack.md) recommended NestJS *conditional on team skills*, with Spring Boot as the documented contingency. That contingency is now the decision. Architecture, module boundaries, domain model and deployment shape are unchanged |
| Frontend | **Next.js + React + TypeScript** | Confirms the Phase 1 recommendation |
| Database | **PostgreSQL** | Confirms |
| Architecture | **Modular monolith** | Confirms |
| Languages | **Vietnamese + English** | Resolves the language half of OQ-020 |
| Currency display | **VND + USD** | **Changes Phase 1.** [10](10-system-requirements.md) NFR-14 had multi-currency as *Could / FUTURE*. It is now V1 |
| Base booking currency | **VND** | Confirms |
| Room pricing | **Per room, per night** | Resolves part of OQ-005 (basis, not rates) |
| Inventory source of truth | **Admin** | Resolves OQ-011 in principle. The OTA reconciliation risk it implies is **not** resolved — see §11 |
| Customer room model | **Property → Room Type → Available Quantity** | Confirms |
| Room numbers | **Never customer-facing** | Confirms |
| Payment | **No gateway in V1** | Confirms |
| Primary CTA | **REQUEST THIS STAY** | Confirms |
| Sales response promise | **Within the day** | Resolves OQ-013 in spirit. The precise boundary rules are **not** defined — see §11 |
| Cancellation / no-show | **NOT YET DEFINED** | OQ-045 stays open. This has a direct IA consequence — see §11 |
| Roles | CUSTOMER, ADMIN, SUPER_ADMIN; future HOTEL_MANAGER, RECEPTIONIST, ACCOUNTANT | Confirms |
| UI direction | **Classic Luxury × Modern Hospitality** | New |
| Brand concept | *"KAS — Where Hospitality Feels Personal."* | Still a **concept, not an approved slogan** |

## 2. IA principles

**PROPOSED** — Ten principles. Where two conflict, the lower number wins.

1. **The guest never learns our operations.** No internal vocabulary, no internal states, no room
   numbers, no queue mechanics, no inventory states. The guest's mental model is
   *hotel → room → dates → request*.
2. **Eight is a curation, not a catalogue.** Every discovery decision is made for a guest choosing
   between eight known properties, not searching a marketplace of thousands. Anything that only makes
   sense at OTA scale is rejected on principle.
3. **Additive flagship.** Milestone gets more surface area, more depth, more editorial. No structure,
   label, sort order, or filter positions any other property as lesser.
4. **Booking intent is always one tap away** — but never shouting. A persistent, calm entry point on
   every page.
5. **Depth is earned, not imposed.** Shallow for the guest who knows what they want; deep for the
   guest who wants to be persuaded. The same page serves both.
6. **One canonical location per piece of content.** Everything else is a link, not a copy.
7. **Structure carries meaning, not just layout.** Property identity, flagship status, lifecycle
   state, and collection are *data*. The IA reads them; it does not hard-code them.
8. **The request is honest at every step.** No screen may imply instant confirmation or payment.
9. **Language and currency are dimensions, not variants.** One IA, resolved per locale and per
   display currency — never two sitemaps.
10. **Luxury simplifies.** Classic Luxury × Modern Hospitality means fewer items, larger imagery, more
    whitespace, clearer hierarchy. It never means more menus.

## 3. The five zones

**PROPOSED** — The whole platform divides into five zones with different rules for authentication,
indexing, rendering, and vocabulary. This division is the backbone of every document that follows.

| Zone | Purpose | Auth | Indexed | Voice |
|---|---|:--:|:--:|---|
| **A · Brand & Discovery** | Understand KAS, discover and compare the 8 properties, explore rooms | Public | Yes | Editorial |
| **B · Booking Request** | Search, select, Your Stay, guest details, submit | Public (guest allowed) | No | Plain, calm, reassuring |
| **C · Guest Account** | Track requests, manage stays, review, profile | Authenticated | No | Personal, direct |
| **D · Admin & Sales** | Operate the platform | Staff | No | Operational, dense |
| **E · System** | Errors, legal, sitemaps, redirects | Mixed | Selective | Functional |

**PROPOSED** — Zone B is the hinge of the whole product. It is entered from Zone A, exits into Zone C,
and is the only zone where the guest is asked to commit anything. It gets the simplest navigation, the
fewest exits, and the most explicit language.

---

## 4. Hotel discovery architecture

### 4.1 Discovery model

**PROPOSED** — Guests arrive with one of four intents. The IA must serve all four; most hotel-group
sites serve only the first.

| Intent | Guest phrasing | Entry point | Landing surface |
|---|---|---|---|
| **Date-first** | "I need 12–14 September in Saigon" | Homepage search | Search results across all 8 |
| **Place-first** | "Somewhere near Ben Thanh" | Locations, homepage "What's Around You" | Locations map + list |
| **Property-first** | "Which KAS hotel is right for me?" | Hotels index, header menu | Hotels index (editorial) |
| **Brand-first** | "Who is KAS?" | Homepage, About | Story → Hotels |

**PROPOSED — the structural decision:** `/hotels` and `/search` are **two different pages with two
different jobs**, not one page in two modes.

- **`/hotels` — the Collection.** Editorial, evergreen, indexable, no dates required. This is where
  the eight properties have individual character. It is the SEO and brand surface.
- **`/search` — the Availability View.** Transactional, date-scoped, not indexed, availability-first.
  This is where a guest with dates gets answers.

Merging them would force a compromise: either the editorial page carries transactional clutter, or
the availability view loses the storytelling. At eight properties we can afford both, and each does
its job properly.

### 4.2 Hotels index (the Collection) — composition

**PROPOSED**

```
1  Intro         — one short editorial statement about the portfolio
2  Quick filters — a single restrained row (see §4.4)
3  Featured      — KAS Milestone, full-width editorial band
4  The Eight     — varied editorial tiles, alternating alignment and size
5  Map teaser    — "See them all on a map" → /locations
6  Compare CTA   — "Not sure which? Compare up to three"
7  Coming Soon   — any property in COMING_SOON lifecycle state
```

**PROPOSED** — Tile content per property: hero image (per-property crop), name, `signatureLine`,
district, 2–3 `characterTags`, from-price, review score once available, and — when dates are in
context — an availability indicator. Tiles are **deliberately non-uniform** in size and alignment so
the page reads as an editorial spread rather than a results grid ([03](03-property-map.md) §3).

**PROPOSED** — The Featured band is driven by `property.isFlagship`, not by a hard-coded ID. If KAS
ever designates a different flagship, it is a data change.

### 4.3 Search (the Availability View) — composition

**PROPOSED**

```
1  Search summary   — editable in place: dates, guests, rooms
2  Result count     — "6 of 8 KAS hotels have rooms for your dates"
3  Sort control     — Recommended | Price | Guest rating | Distance from…
4  Results          — property rows: image, name, signature line, district,
                      from-price, availability, review score, 3 amenities
5  Unavailable      — shown BELOW available, never hidden, with nearest
                      available dates and a one-tap date shift
6  Map toggle       — full-width map with synchronised list
7  No-results state — portfolio-wide nearest available dates
```

**PROPOSED — unavailable properties are shown, not hidden.** With eight properties, hiding two makes
the portfolio look thin and denies the guest a decision they are entitled to make. They appear in a
clearly separated group with a constructive next step.

### 4.4 Filters — and the rationale for each

**CONFIRMED direction** — Do not add filters because OTAs have them. Every filter must earn its place
in an eight-property ecosystem.

**The test applied:** *at n=8, does this filter reduce the set in a way the guest could not do faster
by simply looking?* A filter that removes one property is worse than no filter — it adds a control,
a state, and a cognitive step to save nothing.

#### Filters we include

| Filter | Rationale | Where |
|---|---|---|
| **Dates + guests + rooms** | Not a filter — it is the search itself. It is the only input that changes what is *purchasable* rather than what is *shown*. | Search, persistent |
| **District / area** | In Ho Chi Minh City, district is the single strongest decision factor for a city hotel — it determines commute, nightlife, and character. Eight properties across several districts makes this genuinely discriminating, and it maps to how guests actually talk ("somewhere in District 1"). | Hotels, Search, Locations |
| **Near a landmark** | Guests think in proximity, not addresses: "near Ben Thanh", "close to the Opera House". This is a *distance sort scoped to a chosen point*, which at n=8 is more useful than a checkbox. Directly supports the "rooted in Ho Chi Minh City" brand pillar. | Locations, Search |
| **Character / collection** | The honest replacement for a star or tier filter. Answers "what kind of stay?" (rooftop and buzz vs. quiet house vs. refined retreat) without ranking. **Depends on OQ-009** — if collections are rejected, this becomes a `characterTags` filter instead. | Hotels, Search |
| **Key amenities — a short fixed list** | Restricted to amenities that genuinely change a booking decision: **Rooftop · Restaurant on site · Gym · Pool · Family rooms · Parking · Airport transfer**. Seven, not forty. Each one is a reason someone picks a different hotel. | Hotels, Search |

#### Filters we deliberately exclude

| Excluded | Why |
|---|---|
| **Star rating** | Official ratings are unknown (OQ-031), and a star filter builds an explicit hierarchy across KAS's own properties — a direct conflict with the confirmed positive-framing rule. |
| **Guest rating threshold** | Same hierarchy problem, plus a cold-start problem: at launch there is little or no review volume, so the filter would be empty or misleading. Offered as a **sort**, not a filter — sorting reorders, filtering excludes. Raised as OQ-059. |
| **Price range slider** | At eight properties, a price *sort* answers the question in one interaction; a range slider requires the guest to guess boundaries, and a badly chosen range can empty the entire portfolio. |
| **Property type (hotel / boutique / resort)** | All eight are city hotels. The filter would never divide the set usefully. |
| **Free cancellation** | **Cannot be offered — the policy is not defined (OQ-045).** Must not be invented. Revisit once the policy exists. |
| **Payment options** | No payment is taken on the platform. Meaningless here. |
| **Distance from city centre** | Superseded by district and landmark proximity, which are more concrete. |
| **Long amenity checklists (40+)** | An OTA pattern for disambiguating thousands of near-identical listings. At n=8 it is noise, and it invites a guest to filter KAS out of its own site. |
| **Review count, "popular", "trending"** | Manufactured social ranking between KAS properties. Conflicts with the flagship-is-additive rule. |

**PROPOSED** — Filter behaviour: filters are additive, always show the result count before applying,
never zero the portfolio silently (if a combination yields nothing, show the nearest matches and say
what was relaxed), and are fully URL-encoded so a filtered view is shareable.

### 4.5 Sorting

**PROPOSED** — `Recommended` (default) · `Price (low → high)` · `Guest rating` · `Distance from [chosen point]`.

`Recommended` is an explicit, documented, non-secret order: flagship first, then editorial sort order
set in admin. It is **not** an engagement-optimised black box — that would be an OTA behaviour, and
guests are increasingly sceptical of unexplained "recommended" ordering. A short "How we order this"
link explains it in one sentence.

### 4.6 Map view

**PROPOSED** — Map is a **view mode**, not a separate destination, on `/search` and `/hotels`; and it
is the **primary content** on `/locations`. Synchronised list ↔ pins, pin selection reveals a compact
property card, and clustering is unnecessary at eight pins — a benefit of the small portfolio worth
taking.

### 4.7 Comparison

**PROPOSED** — Up to **three** properties, `/compare?properties=a,b,c`. Rows: district, distance from
a chosen landmark, character, room types available, from-price, key amenities, review score, signature
experience.

**PROPOSED — presentation rule:** an absent amenity renders as **"Not at this property"**, never as a
red cross or an empty cell. A comparison table is the single easiest place to accidentally rank KAS's
own hotels against each other, and the visual language must be neutral by construction.

---

## 5. Hotel detail architecture

### 5.1 Universal property template

**PROPOSED** — Every property, including Milestone, uses this spine. Sections whose content is empty
do not render — they are not shown as gaps.

| # | Block | Purpose | Anchor |
|---|---|---|---|
| 1 | **Hero** | Identity in one image | — |
| 2 | **Identity bar** | Name, signature line, district, review score, from-price | — |
| 3 | **Sticky stay bar** | Dates, guests, "View rooms" — carries search context | persistent |
| 4 | **Introduction** | 2–3 sentences: what this property is | `#overview` |
| 5 | **Highlights** | 3–5 concrete strengths, iconographic | `#highlights` |
| 6 | **Story** | Editorial narrative — the brand's core differentiator | `#story` |
| 7 | **Gallery** | Immersive, categorised, captioned | `#gallery` |
| 8 | **Signature experiences** | 1–4 named experiences unique to this property | `#experiences` |
| 9 | **Rooms & availability** | Room types with price and available quantity | `#rooms` |
| 10 | **Amenities** | Grouped by category, highlights promoted | `#amenities` |
| 11 | **Location & nearby** | Map, address, directions, named landmarks with real distances | `#location` |
| 12 | **Guest reviews** | Verified Stay reviews, sub-scores, admin replies | `#reviews` |
| 13 | **Policies / Good to know** | Check-in/out, children, and — **once defined** — cancellation | `#policies` |
| 14 | **Other KAS hotels** | Lateral discovery, neutral presentation | — |

**PROPOSED** — Section navigation: an anchored sub-nav appears on scroll (Overview · Rooms · Location ·
Reviews). Four items, not fourteen — the rest are reached by scrolling. This is the Classic Luxury
principle applied: the page is long and rich, the navigation over it is short and calm.

### 5.2 Flagship extension — KAS Milestone Premium Hotel

**CONFIRMED** — Milestone's strengths receive strong editorial emphasis: large restaurant, rooftop
bar, gym, premium rooms, rooftop experience, high-end hospitality.

**PROPOSED** — Milestone renders **three additional first-class blocks** between §5.1 blocks 8 and 9:

| Block | Content | Anchor | Why a block and not a bullet |
|---|---|---|---|
| **Dining** | The restaurant: editorial description, own gallery, hours, cuisine, whether open to non-residents | `#dining` | A large restaurant is a reason to choose the hotel, not an amenity checkbox |
| **The Rooftop** | Rooftop bar + rooftop experience: signature imagery (dusk), hours, atmosphere | `#rooftop` | This is Milestone's signature image and the portfolio's most distinctive asset |
| **Wellness** | Gym: equipment, hours, access | `#wellness` | Decisive for business and long-stay guests |

Plus: extended room-type treatment (larger imagery, longer descriptions) for premium rooms, and a
larger gallery allocation.

**PROPOSED — the additive guarantee, made structural.** These blocks are **not** keyed to a Milestone
ID or an `isFlagship` boolean alone. They render for **any property that has content in the
corresponding facility block**. So:

- If KAS Sonata gains a rooftop bar, it gets a `#rooftop` block automatically.
- Milestone stands out because it *has more*, not because the template *permits it more*.
- No property is structurally capped.

`isFlagship` controls **placement weight** only — the Featured band on `/hotels`, position in
`Recommended` sort, homepage editorial section. It never controls which content blocks are available.

**PROPOSED** — Every one of the other seven properties must have at least one populated
`signatureExperiences` entry before publish. This is a publish-checklist rule, and it is what
operationally prevents "the flagship plus seven thin pages".

### 5.3 Sub-pages vs. one page

**PROPOSED** — The property detail page is **one long editorial page** with anchors, plus four
genuine sub-pages that exist because they have independent SEO, shareability, or depth value:

| Sub-page | Exists because |
|---|---|
| `/hotels/{property}/rooms` | Room discovery is a distinct task with its own intent and its own search traffic |
| `/hotels/{property}/rooms/{room-type}` | A room type is a product with its own images, description, and search demand |
| `/hotels/{property}/gallery` | Immersive full-screen browsing is a different mode from scrolling a page |
| `/hotels/{property}/reviews` | Review volume outgrows an embedded excerpt; independent SEO value |

`/location` is **not** a sub-page — it is an anchor. Splitting it would fragment a property's local
SEO signal across two URLs competing for the same intent.

---

## 6. Room discovery architecture

### 6.1 Room list — `/hotels/{property}/rooms`

**PROPOSED**

```
Search context bar   dates · guests · rooms   [editable]
─────────────────────────────────────────────────────
Room type card  ×N
  ├ Image (swipeable on mobile)
  ├ Room name
  ├ Facts row:  area m²  ·  bed type  ·  up to N guests
  ├ 3–4 highlight amenities
  ├ Price per room per night           (VND, USD indicative)
  ├ Available quantity for these dates
  ├ [−] qty [+]     [ Add to Your Stay ]
  └ [ Room details → ]
─────────────────────────────────────────────────────
Your Stay summary (sticky: bottom sheet on mobile, side panel on desktop)
```

**CONFIRMED** customer-facing room fields: room name · description · images · area · bed type ·
maximum guests · amenities · price per night · available quantity · policies if applicable.

**CONFIRMED** — Never a physical room number, anywhere, in any state.

### 6.2 Quantity selection

**CONFIRMED** — `[−] quantity [+]`.

**PROPOSED** — IA rules:
- Upper bound = the **minimum availability across every night** of the stay ([15](15-inventory-rules.md) §4.1)
- At the ceiling, the `+` disables with an inline reason: "6 rooms available for these dates"
- Adding gives immediate, non-disruptive feedback — the Your Stay summary updates in place
- Multiple room types can be added without leaving the page
- Unavailable room types stay visible, muted, with the reason and the nearest available dates
- Guest-capacity guidance is advisory: *"2 rooms fit up to 4 guests. Add a room for your 5th?"* —
  never a blocking error

### 6.3 Room comparison

**PROPOSED** — Within a property only, at the room-list level: a compact spec strip (area, bed, max
guests, price) aligned across cards so the guest can scan vertically. A separate room comparison page
is **not** justified — properties have 4–8 room types, and a side-by-side view of four cards is
already a comparison.

---

## 7. Mobile information architecture

**CONFIRMED direction** — Do not assume desktop navigation collapses into a hamburger.

**PROPOSED** — Mobile has a **different navigation model**, not a smaller one.

| Surface | Mobile model |
|---|---|
| **Primary navigation** | Header: logo · search icon · account icon · menu. Full-screen overlay menu, one level deep, large tap targets |
| **Persistent action** | **Bottom sticky bar**, context-aware — see §7.1 |
| **Hotel discovery** | Vertically stacked full-width tiles; map as a full-screen mode with a list drawer |
| **Filters** | Bottom sheet, one screen, apply/clear explicit — never an inline row that reflows results |
| **Search** | Full-screen sequential: Where → When → Who → Search. Each step one decision |
| **Date picker** | One scrollable month column, touch-first. **Not** a shrunken desktop calendar |
| **Property page** | Anchored horizontal chip nav that sticks under the header (Overview · Rooms · Location · Reviews) |
| **Gallery** | Full-screen swipe, pinch-zoom, category tabs |
| **Room selection** | Full-width cards, quantity stepper thumb-reachable |
| **Your Stay** | **Bottom sheet**, expandable — never a separate page, so selection context is never lost |
| **Request flow** | One question group per screen, with a visible step indicator |
| **Request status** | Vertical timeline, most recent at top |
| **Account** | List-based, one level deep |
| **Admin** | Queue and booking detail are mobile-usable; inventory calendar and pricing are desktop/tablet |

### 7.1 Sticky bar behaviour

**PROPOSED** — Context determines the bar. One bar, never two.

| Context | Bottom bar shows |
|---|---|
| Homepage, brand pages | *Find your stay* → opens search |
| Hotels index, Locations | *Check availability* → opens search |
| Property detail (no dates) | From-price · *Check availability* |
| Property detail (dates set) | From-price · *View rooms* |
| Room list (empty stay) | Dates summary · *Select a room* |
| Room list (rooms selected) | **N rooms · estimated total · *Your Stay* →** |
| Your Stay | ***Request This Stay*** |
| Request flow | *Continue* / ***Request This Stay*** on the final step |
| Account, request status | No sticky bar — nothing to sell here |

**PROPOSED** — The bar never covers the primary action of the page beneath it, and it hides on scroll
up in immersive gallery mode.

---

## 8. Error, empty and loading states at IA level

**PROPOSED** — These are IA concerns, not visual polish: each state must have a defined *location in
the structure* and a defined *next action*. A state without a next action is a dead end.

### 8.1 Empty states

| Where | Condition | Content | Next action |
|---|---|---|---|
| Search results | No property available for the dates | "No KAS hotel has rooms for 12–14 Sep" | Nearest available dates across the portfolio; adjust dates; contact us |
| Search results | Filters exclude everything | Say which filter caused it | Clear that filter (one tap) |
| Room list | No room type available | Property-level alternative dates | Shift dates; see other KAS hotels |
| Your Stay | Nothing selected | "Your Stay is empty" | Back to rooms with dates preserved |
| My Bookings | No bookings | "No stays yet" | Explore the eight hotels |
| Reviews (property) | No reviews yet | Neutral statement — **never an apology, never a fabricated score** | — |
| My Reviews | Nothing to review | "You'll be able to review after your stay" | — |
| Notifications | None | "Nothing new" | — |
| Offers | No active offers | "No offers right now" | Register interest / newsletter |
| Admin queue | Queue clear | "No requests waiting" | — (a genuinely good state; say so) |

### 8.2 Loading states

**PROPOSED**

| Content | Approach |
|---|---|
| Page shell (property, hotels) | Server-rendered — no loading state exists |
| Availability | Skeleton at the exact final dimensions, so nothing shifts (CLS) |
| Gallery images | Progressive with a blurred placeholder at correct aspect ratio |
| Search results | Skeleton rows, count appears first |
| Your Stay recalculation | Inline, in-place; **the previous total stays visible** rather than blanking |
| Request submission | Blocking, explicit, non-cancellable, with a clear "don't refresh" message |
| Admin lists | Skeleton rows, filters remain interactive |

**PROPOSED** — Never show a spinner where a skeleton can hold the layout. Never let a price or an
availability count flicker between two values.

### 8.3 Error states

| Class | IA treatment | Next action |
|---|---|---|
| **404** | Branded page inside the normal navigation | Hotels · Search · Home |
| **410** (property permanently closed) | Explanatory page, not a 404 | Nearby KAS properties |
| **500** | Branded page with a correlation ID | Retry · Contact (phone shown) |
| **Availability service degraded** | Content renders; availability area states it is temporarily unavailable | Contact us — **never a guessed number** |
| **Availability lost at submit** | Inline within Your Stay, selection preserved | Adjust quantity · alternative dates · alternative property |
| **Session expired mid-flow** | Return to the exact step after login; Your Stay preserved | Continue |
| **Validation** | Inline, adjacent to the field, plain language | Fix in place |
| **Rate limited** | Plain explanation, no jargon | Wait, or contact us |
| **Stale email link** | Explanatory page | Request a new link |
| **Review not permitted** | Explain the rule, don't just refuse | — |

**PROPOSED** — Every error state on the booking path shows a **phone number**. In a request model the
human channel is always available, and that is the product's differentiator — a failed page should
route to a person, not a dead end.

---

## 9. Competitor patterns — adopt, adapt, reject

**CONFIRMED direction** — Research informs the IA but must not override KAS business rules.

### 9.1 PATTERNS WE ADOPT — used substantially as they exist

| Pattern | Source | Why we adopt it |
|---|---|---|
| **Booking search as primary homepage content** | Baymard (25% of accommodation sites fail this) | Booking intent must never have to hunt. Adopted with a KAS constraint: it anchors the base of the hero rather than replacing it |
| **Persistent search context across pages** | Marriott, Hilton, Hyatt | Re-entering dates is the most common avoidable friction in hotel booking. Our sticky stay bar carries it everywhere |
| **Room type as the unit of sale** | All hotel groups | Exactly matches the confirmed KAS room model |
| **Property storytelling above rate comparison** | Marriott, Accor, boutique groups | Story is the direct site's only structural advantage over an OTA |
| **Multi-dimension review sub-scores** | Booking.com, Expedia | More credible and more useful than a single number; matches the confirmed review dimensions |
| **Map + synchronised list** | Booking.com, Airbnb | Location is a primary decision factor for a city hotel |
| **Breadcrumbs with structured data** | Broad SEO practice; measurable organic uplift reported | Cheap, aids orientation, and improves search presentation |
| **Mobile-first booking flow** | All | Mobile dominates accommodation traffic, and dominates Vietnamese traffic in particular |
| **Cost transparency before commitment** | NN/g checkout research | Even more important here: the guest is committing to a *process*, not a purchase |
| **Neighbourhood / "what's around you" content** | Hyatt, boutique groups | Directly serves the "rooted in Ho Chi Minh City" brand pillar |

### 9.2 PATTERNS WE ADAPT — the idea is right, the execution must change

| Pattern | As used by OTAs / chains | KAS adaptation | Why |
|---|---|---|---|
| **Faceted filtering** | 30–60 filters, deep facet trees | **5 filter groups, one restrained row** | At n=8, most filters remove one property. Each surviving filter is individually justified (§4.4) |
| **Property results list** | Uniform dense cards, rate-first | **Editorial tiles on `/hotels`, availability rows on `/search`** | Uniform cards would make eight distinct hotels look interchangeable — a direct conflict with the confirmed identity requirement |
| **"Recommended" sorting** | Opaque, engagement-optimised | **Documented, explainable order** with a "How we order this" link | An unexplained ranking of KAS's own properties is both untrustworthy and a positive-framing risk |
| **Scarcity messaging** | "5 people viewing", "1 left!" | **Real inventory counts only** — "6 rooms available" | Confirmed brand rule bans manufactured urgency. Real scarcity is permitted precisely because it's true |
| **Mega menu** | Deep multi-column category trees | **A single rich "Hotels" panel** listing all 8 with thumbnail and signature line | Makes the portfolio legible in one glance; eight is exactly the right number for this. Everything else stays a plain link |
| **Star / class rating** | Primary sort and filter dimension | **Non-hierarchical character or collection** | A tier system ranks KAS's own hotels — prohibited by the positive-framing rule |
| **Guest rating** | Filter + prominent ranking badge | **Sort option and displayed score, never a filter** | Sorting reorders; filtering excludes. Also a cold-start problem at launch |
| **Shopping cart** | "Cart", "Basket", quantity table | **"Your Stay"** — a stay summary, not a receipt | Confirmed terminology. It is a stay being assembled, not goods being purchased |
| **Checkout progress bar** | Cart → Delivery → Payment → Confirm | **Your Stay → Your Details → Review → Request Sent** | There is no payment step. The labels must not imply one |
| **Comparison table** | Green ticks / red crosses | **"Not at this property"**, neutral typography | Red crosses against KAS's own properties are the exact thing the framing rule prohibits |
| **Loyalty / member rate hook** | Sign in for member pricing | **Personal service promise + request tracking as the account benefit** | No loyalty programme exists (OQ-041). We do not invent a discount we cannot honour |

### 9.3 PATTERNS WE REJECT — and will not implement

| Rejected pattern | Where it's common | Why it's rejected |
|---|---|---|
| **Instant-payment checkout** | Booking.com, Expedia, all chains | **Explicitly prohibited by the product owner.** V1 has no payment gateway and no instant confirmation |
| **"Book Now" / "Pay Now" / "Confirm" CTA** | Universal | Confirmed CTA is **REQUEST THIS STAY**. Any other label misrepresents what happens |
| **Countdown timers on price or availability** | OTAs | Manufactured urgency; banned by the brand voice rules |
| **"X people are looking at this hotel"** | Booking.com | Fabricated social pressure. Unverifiable and brand-damaging for a premium audience |
| **Hiding unavailable properties** | OTAs | With eight properties this makes the portfolio look thin and denies the guest a choice. We show them with alternative dates |
| **Promotional ribbons, discount badges, deal-of-the-day** | OTA and budget chains | Directly contradicts the confirmed rejection of the "cheap hotel booking website" aesthetic |
| **Upsell interstitials between booking steps** | Expedia, airlines | Friction at the highest-value moment of the funnel |
| **Genericised uniform property cards** | Everywhere | Confirmed requirement that the 8 hotels must not look identical |
| **Infinite scroll on results** | OTAs | Eight results. There is nothing to paginate |
| **Review score as the primary property identity** | OTAs | Reduces a property with a story to a number. Score is supporting evidence, not identity |
| **Cross-sell of flights, cars, insurance** | OTAs | KAS is a hotel group, not a travel agency |
| **Account wall before booking** | Some chains | Would measurably cut request volume. Guest submission stays permitted (OQ-016) |
| **Newsletter pop-up on arrival** | Common | Interrupts the first impression of a premium brand |
| **Cookie banner that pre-consents** | Common | Privacy default is decline-non-essential |
| **Dashboard-first homepage** | — | Confirmed rejection in Phase 1 |

---

## 10. Future extensibility

**PROPOSED** — The IA must absorb each of the following **without restructuring**. Where a hook is
needed now, it is named.

| Future capability | IA accommodation | Hook needed in V1 |
|---|---|---|
| **9th, 10th, 15th property** | `/hotels` is data-driven; nav panel lists from data; comparison caps at 3 regardless of portfolio size | None — never hard-code eight |
| **KAS No. 9 announcement** | `property.lifecycleState = COMING_SOON` renders a teaser tile and an optional interest form | Lifecycle state in the property model — **no special-casing** |
| **Payment gateway** | A `Payment` step inserts between *Availability confirmed* and *Confirmed*; the request flow itself is unchanged | Status architecture already includes a payment-instructions stage ([27](27-request-status-architecture.md)) |
| **Rate plans** (breakfast included, non-refundable) | Room type card gains a rate-plan selector beneath the price | Room type ≠ rate ([04](04-room-architecture.md) §3.2). Do not model price as a single immutable room-type field |
| **Loyalty / member rates** | Account gains a Membership section; property and room cards gain a member-rate line | Account IA has room; pricing is layered |
| **HOTEL_MANAGER / RECEPTIONIST roles** | Admin nav filters by permission; property scope already in the model | **Property scoping must be in the IA now** — see [21](21-admin-navigation.md) §6 |
| **Restaurant / spa / experience booking** | A parallel `/experiences` booking domain reusing the request pattern | Milestone's Dining and Rooftop blocks are already first-class content |
| **Third language** | Locale is a dimension, not a duplicated tree | Never build a per-language sitemap |
| **Additional display currency** | Currency is a display-layer preference over a VND base | Never store a second booking price ([25](25-i18n-currency-architecture.md)) |
| **Channel manager / OTA sync** | No customer-facing IA change; admin gains a Channels module | Inventory model already date-and-count based |
| **Native app** | Consumes the same public API surface | Public/admin API separation already required |

---

## 11. Conflicts and gaps found — NOT silently resolved

**CONFIRMED instruction:** on discovering a conflict with the Phase 1 business model, stop and
document it as NEEDS CONFIRMATION.

Five items surfaced while designing this IA. Each is logged with a new OQ ID in
[28-phase-2-decisions.md](28-phase-2-decisions.md) §4 and none has been resolved by assumption.

### 11.1 Cancellation policy is undefined, but the IA requires it before submission

**NEEDS CONFIRMATION — OQ-055.** Phase 1 ([05](05-booking-sales-model.md) §3.1,
[07](07-customer-journey.md) §5.3) requires cancellation terms to be visible **before** the
*Request This Stay* action, as a trust and legal requirement. Phase 1.5 confirms the policy is **not
yet defined**.

The IA therefore reserves a **Policies block** immediately above the submit action, and treats it as
a **publish blocker**: the booking flow cannot go live with that block empty. We have **not** invented
placeholder terms. Options for the product owner: (a) define the policy, (b) launch with an explicit
"cancellation terms will be confirmed by our team when we contact you" statement — which is honest but
weaker, or (c) delay the flow. **Recommendation: (a).**

### 11.2 The sales workflow order differs from the Phase 1 state machine

**NEEDS CONFIRMATION — OQ-053.** Phase 1.5 specifies:

```
REQUESTED → ASSIGNED → AVAILABILITY CHECK → CONTACT CUSTOMER → CONFIRM/ALTERNATIVE/DECLINE → PAYMENT RECORDING → CONFIRMED
```

[14-booking-state-machine.md](14-booking-state-machine.md) has `SALES_CONTACTED` **before**
`AVAILABILITY_CONFIRMED` (T2), and treats assignment as an *attribute*, not a *state*.

The Phase 1.5 order is arguably better — checking availability before calling means the agent has an
answer when they pick up the phone. But it is a **change**, and doc 14 needs amending. Two sub-questions:
does `ASSIGNED` become a real state or stay an attribute, and can an agent still contact a guest before
checking availability (e.g. to clarify dates)? The IA is built to support both orders; the state machine
must be told which is canonical.

### 11.3 "DECLINE" is a new outcome not present in Phase 1

**NEEDS CONFIRMATION — OQ-054.** Phase 1.5 introduces **DECLINE** as a sales outcome. Phase 1 models
this as `CANCELLED` with a reason. Is a decline a distinct terminal state (with different guest
messaging and different reporting), or a cancellation reason code? This affects the status vocabulary,
the guest-facing label set, and analytics.

### 11.4 "Within the day" needs a precise boundary

**NEEDS CONFIRMATION — OQ-051.** "Within the day" is a clear commercial promise but not yet an
operational rule. Unanswered: a request at 23:40 — same day or next? Weekends and Vietnamese public
holidays? Is "the day" a calendar day or a business day? What is the escalation threshold?

This matters beyond copy: it drives the SLA timer, the queue's breach highlighting, the escalation
rule, and the wording shown to the guest at the most trust-sensitive moment in the product. The IA
uses a single settings-driven string everywhere so that when the rule is fixed, one change updates
all surfaces.

### 11.5 USD display was FUTURE in Phase 1 and is now V1

**NEEDS CONFIRMATION — OQ-052.** Not a conflict, but an expansion with unanswered mechanics: what is
the FX rate source, how often does it refresh, what rounding applies, and what disclaimer accompanies
an indicative price? Full treatment and recommendation in
[25-i18n-currency-architecture.md](25-i18n-currency-architecture.md) §6.

### 11.6 Still-open Phase 1 questions that shape this IA

| OQ | Effect if unanswered |
|---|---|
| **OQ-009** (collections vs. tiers) | The character filter and the Hotels index grouping cannot be finalised |
| **OQ-010** (room type names) | Room IA is structurally complete but has no real content |
| **OQ-030** (photography) | The entire editorial IA depends on imagery that may not exist |
| **OQ-031** (amenity data) | The amenity filter set is proposed but unvalidated against reality |
| **OQ-033** (OTA channel mix) | *(updated)* Channels now named. Volume and mix per channel still unknown, and now block the V1 OTA inventory strategy — allotment vs manual entry (OQ-067). See [29](29-direct-sales-crm-architecture.md) §7 |
| **OQ-045** (cancellation) | See §11.1 |

---

## 12. Document map for Phase 1.5

| Doc | Covers |
|---|---|
| **18** *(this)* | IA principles, zones, hotel discovery, hotel detail, room discovery, mobile, states, competitor patterns, extensibility, conflicts |
| [19](19-sitemap.md) | Complete sitemap and page inventory |
| [20](20-customer-navigation.md) | Customer navigation, labels, breadcrumbs, sticky CTA |
| [21](21-admin-navigation.md) | Admin and Super Admin navigation, module specs, sales queue |
| [22](22-url-architecture.md) | URL strategy |
| [23](23-content-architecture.md) | Reusable content model |
| [24](24-seo-architecture.md) | SEO architecture |
| [25](25-i18n-currency-architecture.md) | Vietnamese/English and VND/USD |
| [26](26-booking-ux-information-architecture.md) | Search → Your Stay → Request |
| [27](27-request-status-architecture.md) | The Wait stage and request tracking |
| [28](28-phase-2-decisions.md) | Decision log, conflicts, new open questions |
