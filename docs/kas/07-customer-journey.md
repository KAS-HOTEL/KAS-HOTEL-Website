# 07 — Customer Journey

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Journey overview

**PROPOSED** — Six stages. The KAS platform must serve all six; most hotel websites only serve two.

```
DISCOVER  →  EXPLORE  →  DECIDE  →  REQUEST  →  WAIT  →  STAY  →  RETURN
                                                  ▲
                                      the stage most platforms don't have
```

The **WAIT** stage is unique to a request-based model and is where this product either earns or loses
the guest's trust. It receives disproportionate design attention below.

## 2. Primary personas

**PROPOSED** — Working personas for design. Not validated with real research; validation is a Phase 2
recommendation (OQ-044).

| Persona | Context | Needs from KAS | Primary risk |
|---|---|---|---|
| **The international leisure traveller** | Booking HCMC from abroad, 2–8 weeks out, comparing on OTAs | Location clarity, honest photography, English content, trust that a request will be honoured | Abandons for an OTA's instant confirmation |
| **The domestic weekend guest** | Vietnamese, booking days ahead, mobile, price-aware | Fast mobile flow, Vietnamese content, VND pricing, Zalo contact, quick response | Frustrated by slow site or English-only content |
| **The business traveller** | Repeat visits, needs invoice, values proximity and consistency | Fast rebooking, saved details, VAT invoice, reliable check-in | Friction on repeat booking |
| **The group organiser** | Family or colleagues, multiple rooms and room types | Multi-room selection, clear total, one point of contact | Multi-room UX that fights them |
| **The returning KAS guest** | Has stayed before, direct intent | Recognition, saved preferences, direct advantage | Treated as a stranger |

## 3. Stage 1 — DISCOVER

**Entry:** organic search, Google Maps, OTA referral, social, word of mouth, returning direct.

**PROPOSED** — Guest questions and the answers the site must give:

| Guest question | Where answered |
|---|---|
| What is KAS? | Homepage hero + KAS at a Glance |
| Is this legitimate and premium? | Photography quality, verified reviews, real addresses, professional execution |
| Where are these hotels? | Homepage locations module, Locations page |
| Which one is right for me? | Property identity, collections, comparison |
| Can I trust a request-based booking? | Service promise, response promise, reviews |

**PROPOSED** — Homepage structure, as approved in the brief, with the job each section performs:

| # | Section | Job |
|---|---|---|
| 1 | Hero | Establish premium brand in under one second, with one arresting real photograph |
| 2 | Booking Search | Give immediate booking intent a path. Baymard's travel-accommodations research flags that a quarter of accommodation sites fail to make the booking search the primary homepage content — KAS must not |
| 3 | KAS at a Glance | 8 hotels · since 2019 · Ho Chi Minh City · the service thesis |
| 4 | KAS Story | The 2019 founding, Passion as the first house, why hospitality is the product |
| 5 | Flagship — Milestone | Full-bleed editorial: rooftop, restaurant, gym, premium rooms |
| 6 | Explore 8 KAS Hotels | Editorial varied-tile layout, never a uniform card grid |
| 7 | Find Your Stay | Intent-led entry: by neighbourhood, by occasion, by character |
| 8 | Rooms / Experiences | What a KAS room is actually like |
| 9 | What's Around You | Ho Chi Minh City rootedness; named landmarks and real distances |
| 10 | Service Promise | The request model explained as a benefit, with the response commitment |
| 11 | Guest Reviews | Verified Stay reviews with property attribution |
| 12 | KAS No. 9 — Coming Soon | Portfolio momentum; optional interest registration |
| 13 | Footer | Contact, properties, policies, legal, language, social |

**PROPOSED** — Search placement nuance: the hero image and the search form compete. Recommended
resolution — the search bar sits at the base of the hero, visually anchored and immediately usable
without scrolling, then becomes a compact persistent header element on scroll. This satisfies both
"premium editorial hero" and "booking search is primary" without compromising either.

## 4. Stage 2 — EXPLORE

**PROPOSED** — Two exploration modes; the site must serve both:

- **Property-first** — "Which KAS hotel?" → Hotels index → Hotel detail → Rooms
- **Date-first** — "I need 12–14 September" → Search → Availability across all properties → Property → Rooms

Most hotel-group sites serve only date-first and treat property browsing as an afterthought. For a
group whose thesis is that its eight properties have individual character, property-first browsing is
strategically essential.

### 4.1 Search

**PROPOSED** — Requirements drawn from established accommodation-booking UX practice:

- Destination field accepting: "All KAS hotels", a specific property, a district, or a landmark
- A **date range picker** that is a genuine range picker — the single most-studied failure point in
  accommodation UX. Requirements: two months visible on desktop, one scrollable month on mobile,
  clear check-in/check-out labelling, past dates disabled, minimum/maximum stay respected, price or
  availability hinting per date where feasible, and the ability to change check-out without
  restarting the selection
- A **guest selector** with adults and children **separated**, and an age input per child (child
  pricing and occupancy depend on it — OQ-007)
- A **rooms selector**, with the multi-room case treated as first class rather than hidden
- All state URL-encoded so a search is shareable and back-button safe
- Sensible defaults, never empty: tonight/tomorrow, 2 adults, 1 room
- Recent searches restored for returning visitors

### 4.2 Hotel discovery

**PROPOSED**

- Results show, per property: hero image, signature line, neighbourhood, from-price for the selected
  dates, availability status, verified review score, 3–4 highlighted amenities
- Sort: recommended (default), price, guest rating, distance from a chosen landmark
- Filter: district, character tag, amenities, price range, availability
- **Unavailable properties are shown, not hidden** — with dates on which they are available and a
  clear path to adjust. Hiding them makes the portfolio look thin and denies the guest a decision
- Map view synchronised with the list
- Comparison of up to 3 properties, presented neutrally

### 4.3 Hotel detail

**PROPOSED** — Composition order:

```
Gallery → Identity (name, signature line, neighbourhood, review score)
       → Sticky booking bar (dates, guests, "View rooms")
       → Editorial story
       → Signature experiences  [Milestone: Rooftop | Restaurant | Gym]
       → Room types with live availability for the selected dates
       → Amenities, grouped
       → Location, map, what's around you
       → Verified reviews
       → Good to know: check-in/out, children, cancellation, payment
       → Other KAS hotels nearby
```

**PROPOSED** — The sticky booking bar carries the dates the guest already chose through every page.
Re-entering dates is the most common avoidable friction in hotel booking flows.

## 5. Stage 3 — DECIDE

### 5.1 Room type selection

**PROPOSED**

- Room types listed with image, name, key facts (area, bed, max guests), 3–4 highlight amenities,
  price per night, and availability count
- **"6 rooms available"** shown when true — real scarcity only
- Quantity stepper bounded by availability across all nights of the stay
- Adding a room type gives immediate, non-disruptive feedback and updates the Your Stay summary
- Multiple room types selectable simultaneously without leaving the page
- Unavailable room types remain visible, greyed, with the reason ("Not available 12–14 Sep") and
  alternatives — never silently removed
- Guest count vs. capacity guidance is advisory and constructive, never a dead-end error

### 5.2 Your Stay

**CONFIRMED** — Concept is "Your Stay", never "Shopping Cart".

**PROPOSED** — Content and behaviour:

- Property name and hero thumbnail
- Each selected room type with quantity, per-night price, line subtotal, and remove/adjust controls
- Dates with day names and check-in/check-out times
- Nights count, guest breakdown
- Price breakdown: room subtotal, taxes, service charge, any voucher, **estimated total**
- Explicit "Estimated — final amount confirmed by the KAS team" label
- Persistent, editable, recoverable; never silently emptied
- Availability re-validated on open, on change, and at submit

### 5.3 Decision-support content at the point of decision

**PROPOSED** — Cancellation terms, check-in/check-out times, child policy, and what happens after
submitting must be visible **at the decision point**, not buried in a policies page. Cost and
condition transparency at the point of commitment is one of the strongest, most consistently
replicated findings in e-commerce checkout research, and it matters more here because the guest is
committing to a *process*, not a purchase.

## 6. Stage 4 — REQUEST

**PROPOSED** — Flow: Your Stay → Customer information → Review → Submit.

Requirements:

- Progress indicator with named steps
- Guest submission permitted (pending OQ-016), with account creation offered *after* success
- Authenticated guests get details pre-filled
- Minimal required fields (see [05-booking-sales-model.md](05-booking-sales-model.md) §3.2)
- Inline validation on blur, not on submit; errors stated in plain language next to the field
- Vietnamese and international phone formats both accepted; country code selector
- Special requests as free text, with examples ("high floor", "late arrival", "twin beds")
- Full summary on the review step; every element editable without losing entered data
- Policies acknowledged explicitly before submit
- The action reads **"Request This Stay"**
- Double-submission prevented; a network failure must never produce two requests

### 6.1 Request submitted

**PROPOSED** — The confirmation screen has one job: convert uncertainty into confidence.

```
Your stay request has been sent.

Reference  KAS-260912-4F7A

What happens next
1. A member of the KAS team reviews your request.
2. We confirm availability and contact you within [SLA].
3. We arrange payment together — nothing is charged now.

We've emailed a copy to nguyen@example.com

[ Track this request ]   [ Create an account ]
Questions? +84 … · Zalo · reservations@…
```

## 7. Stage 5 — WAIT

**PROPOSED** — The stage that does not exist on OTA platforms, and therefore the stage no competitor
pattern can be copied from. Design principles:

1. **Silence is the enemy.** Every meaningful state change produces a guest-visible signal.
2. **Status is always retrievable** — in the account for authenticated guests, and via a signed
   email link for guest submissions.
3. **A named human appears as early as possible.** "Linh from KAS Reservations will contact you"
   converts an anonymous queue into a relationship.
4. **The status vocabulary is guest-appropriate.** Internal states are mapped to plain language:

| Internal state | Guest sees |
|---|---|
| `REQUESTED` | Request received — we're reviewing it |
| `SALES_CONTACTED` | We've been in touch |
| `AVAILABILITY_CONFIRMED` | Your rooms are confirmed available |
| `PAYMENT_PENDING` | Awaiting payment to finalise |
| `CONFIRMED` | **Your stay is confirmed** |
| `CHECK_IN_READY` | Ready for your arrival |

5. **If the answer is no, the alternative arrives with it.** A "not available" message that offers
   different dates, room types, or a nearby KAS property preserves the booking and the relationship.

## 8. Stage 6 — STAY

**PROPOSED**

| Moment | Platform action |
|---|---|
| 48h before | Check-in reminder: directions, arrival time, contact, parking |
| 24h before | Final reminder; early check-in and transfer offers |
| Arrival day | Warm welcome message with a direct phone number |
| During stay | Booking detail remains accessible; contact channel open |
| Departure day | Check-out reminder; late check-out option; invoice availability |

**FUTURE** — Digital check-in, in-stay service requests, and digital room key are natural extensions
but are not in scope.

## 9. Stage 7 — RETURN

**CONFIRMED** — Only customers who have completed a stay can review.

**PROPOSED**

| Moment | Action |
|---|---|
| 24h after check-out | Thank-you email with review invitation |
| Day 7 | One review reminder — one only |
| Review submission | Overall + cleanliness, service, location, room, value; written review; optional photos |
| Publication | Admin moderation, then publish with a **Verified Stay** badge |
| Admin reply | Public, attributed reply |
| Ongoing | Occasional offers, honouring communication preferences |
| Next visit | Recognition, saved preferences, faster rebooking |

## 10. Mobile

**PROPOSED** — Mobile is the primary surface, not a reduction of desktop. Requirements:

- Every flow authored mobile-first
- Thumb-reachable primary actions; sticky action bars where appropriate
- Date picker designed specifically for touch — a desktop calendar shrunk is the classic failure
- Galleries as native-feeling swipeable carousels with pinch-zoom
- Your Stay as a bottom sheet, not a separate page, so context is never lost
- Numeric keypads for numeric fields; correct `autocomplete` attributes throughout
- Performance budget enforced on mid-range Android over 4G, not on a developer's laptop
- Tap targets ≥ 44 × 44 px

## 11. Accessibility

**PROPOSED** — WCAG 2.2 AA as the standard.

- Full keyboard operability, including the date picker and gallery
- Visible focus states meeting contrast requirements
- Semantic landmarks and heading order
- All images with meaningful alternative text (a hotel gallery is content, not decoration)
- Colour contrast ≥ 4.5:1 for body text — a real risk for elegant light-grey-on-white typography
- Form errors programmatically associated with their fields
- `prefers-reduced-motion` respected
- Screen-reader tested on the booking flow at minimum
- Accessibility information about the properties themselves stated factually

## 12. Edge cases

**PROPOSED** — Each must have a designed state, not a default error:

| Case | Required behaviour |
|---|---|
| Availability lost between selection and submit | Explain what changed, offer alternatives, preserve everything else |
| Requested quantity exceeds availability | Prevented at the stepper; if bypassed, clear server-side rejection |
| Dates in the past / reversed | Prevented in the picker; validated server-side |
| Stay exceeds maximum length | Explained, with a stated maximum (OQ-035) |
| No availability anywhere for the dates | Show nearest available dates across the portfolio |
| Session expires mid-flow | Preserve Your Stay; return the guest to where they were after login |
| Duplicate submission | Detected and de-duplicated; one request, one email |
| Email fails to send | Retry with backoff; surface on screen; admin alert |
| Guest opens a stale email link | Explain plainly and offer to re-request access |
| Property is `TEMPORARILY_CLOSED` | Stated clearly with reopening date and alternatives |
| Review attempted without a completed stay | Explained, not silently rejected |
| Slow or offline network | Optimistic UI where safe; explicit failure otherwise; never a silent loss of input |
