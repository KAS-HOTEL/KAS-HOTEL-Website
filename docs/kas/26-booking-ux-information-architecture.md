# 26 — Booking / Request Information Architecture

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. The confirmed flow

**CONFIRMED (Phase 1.5)**

```
CUSTOMER
  → SEARCH
  → SELECT HOTEL
  → SELECT ROOM TYPE
  → SELECT QUANTITY
  → YOUR STAY
  → CUSTOMER INFORMATION
  → BOOKING REQUEST
  → SALES / ADMIN
  → AVAILABILITY CHECK
  → CUSTOMER CONTACT
  → PAYMENT HANDLED SEPARATELY
  → CONFIRMED BOOKING
```

**CONFIRMED** — Primary CTA: **REQUEST THIS STAY**. Never *Book Now*, *Pay Now*, or *Confirm Now*.

**CONFIRMED** — The guest must clearly understand: *"This is a booking request. No payment is taken at
this step."*

---

## 2. The IA problem this flow creates

**PROPOSED** — A request flow looks like a checkout and is not one. Three consequences shape every
decision below:

1. **Certainty is deferred.** The guest leaves without knowing if they have a room. Every screen must
   set that expectation *before* it becomes a surprise.
2. **Vocabulary carries legal and trust weight.** "Booking", "confirm", "total", and "reserve" all
   imply commitments that have not been made. The terminology is not styling — it is accuracy.
3. **The value of the submission is the *lead quality*, not the submission itself.** A request sales
   cannot act on has cost the guest their time and KAS its reputation. Field completeness matters more
   than funnel speed — a genuine inversion of normal e-commerce priorities.

---

## 3. Step architecture

**PROPOSED**

| # | Step | URL | Guest question answered | Exit points |
|---|---|---|---|---|
| 1 | **Search** | `/search` | "Who has room for my dates?" | Full navigation |
| 2 | **Select hotel** | `/hotels/{p}` | "Is this the right hotel?" | Full navigation |
| 3 | **Select room type** | `/hotels/{p}/rooms` | "Which room, and is it available?" | Full navigation |
| 4 | **Select quantity** | *(inline)* | "How many rooms?" | — |
| 5 | **Your Stay** | `/stay` | "Is this what I want to request?" | Reduced — back to rooms only |
| 6 | **Your Details** | `/stay/details` | "How do they reach me?" | Back one step |
| 7 | **Review** | `/stay/review` | "What exactly am I sending?" | Back, or edit any element |
| 8 | **Request sent** | `/stay/sent/{ref}` | "What happens now?" | Full navigation restored |

**PROPOSED — the funnel narrows structurally.** Steps 1–4 sit inside the full site with all navigation
available. Steps 5–7 progressively remove exits. Step 8 restores everything. This is the "navigation
gets smaller as the guest gets closer" principle ([20](20-customer-navigation.md) §1) made concrete.

**PROPOSED** — Progress indicator on steps 5–7 only, labelled **Your Stay → Your Details → Review**.
Deliberately **not** "Cart → Checkout → Payment": there is no payment step, and implying one would be
the single most damaging vocabulary error in the product.

---

## 4. Step 1 — Search

**PROPOSED** — Composition:

```
┌─────────────────────────────────────────────────────────────┐
│  Where          When                    Who         Rooms   │
│  All KAS ▾   │  12 Sep → 14 Sep     │  2 + 0    │   1    │ ⌕│
└─────────────────────────────────────────────────────────────┘
```

| Field | Behaviour |
|---|---|
| **Where** | Defaults to "All KAS hotels". Accepts a property, a district, or a landmark. At n=8, a dropdown of named properties beats a free-text autocomplete |
| **When** | Range picker: two months on desktop, one scrollable month on mobile. Past dates disabled. Check-out changeable without restarting. Availability hinting per date where feasible |
| **Who** | **Adults and children separated**, with an **age input per child** — required for occupancy and for child pricing (OQ-007) |
| **Rooms** | Explicit and first-class. Multi-room is a confirmed requirement, not a hidden option |

**PROPOSED** — Defaults are never empty: tonight → tomorrow, 2 adults, 1 room. An empty search form is
a decision the guest has to make before they can start.

**PROPOSED** — All state URL-encoded ([22](22-url-architecture.md) §5) so a search is shareable and
back-button safe.

---

## 5. Steps 2–3 — Hotel and room selection

Covered in [18-information-architecture-v2.md](18-information-architecture-v2.md) §4 and §6. The IA
points that belong to the booking flow specifically:

**PROPOSED**

- **Dates travel with the guest.** Once entered, they persist through search results, property pages,
  room lists, and into Your Stay. The guest never re-enters them.
- **Availability is shown per room type for the exact stay** — the minimum across all nights, never
  the first night ([15](15-inventory-rules.md) §4.1).
- **Unavailable room types stay visible**, muted, with a reason and alternative dates. Removing them
  hides information the guest needs.
- **Adding a room never navigates away.** The room list stays put; the Your Stay summary updates in
  place (side panel on desktop, bottom sheet on mobile).

---

## 6. Step 4 — Quantity

**CONFIRMED** — `[−] quantity [+]`.

**PROPOSED**

| Rule | Behaviour |
|---|---|
| Lower bound | 0 — decrementing to 0 removes the line, with undo |
| Upper bound | Minimum availability across every night of the stay |
| At the ceiling | `+` disables with an inline reason: *"6 rooms available for these dates"* |
| Portfolio ceiling | A configurable maximum routes the request to a **group enquiry** (**PROPOSED**: 5 rooms / 10 guests — OQ-015) |
| Occupancy guidance | Advisory, constructive, never blocking: *"2 rooms fit up to 4 guests. Add a room for your 5th?"* |
| Feedback | Estimated total and Your Stay count update immediately |
| Multiple types | Any number of room types may be added; each has its own stepper |

**PROPOSED** — The stepper is **never** a free-text number input. Typing "50" and receiving an error
is a worse experience than a bounded control that cannot express an impossible request.

---

## 7. Step 5 — Your Stay

**CONFIRMED** — Customer-facing concept is **"Your Stay"**. Never cart, basket, or checkout — in any
label, URL, or analytics event.

### 7.1 Composition

**PROPOSED**

```
┌──────────────────────────────────────────────────────────────┐
│  YOUR STAY                                                   │
├──────────────────────────────────────────────────────────────┤
│  [img]  KAS Milestone Premium Hotel                          │
│         District 1, Ho Chi Minh City                         │
├──────────────────────────────────────────────────────────────┤
│  Fri 12 Sep 2026   →   Sun 14 Sep 2026        2 nights       │
│  Check-in from 14:00   Check-out until 12:00     [ Change ]  │
├──────────────────────────────────────────────────────────────┤
│  3 adults, 1 child (6)                          [ Change ]   │
├──────────────────────────────────────────────────────────────┤
│  Deluxe Room                                                 │
│    1.850.000 ₫ / room / night     [−] 2 [+]      [Remove]    │
│    Subtotal 2 rooms × 2 nights        7.400.000 ₫            │
│                                                              │
│  Suite Balcony                                               │
│    2.525.000 ₫ / room / night     [−] 1 [+]      [Remove]    │
│    Subtotal 1 room × 2 nights         5.050.000 ₫            │
│                                                [ Add rooms ] │
├──────────────────────────────────────────────────────────────┤
│  Rooms subtotal                      12.450.000 ₫            │
│  Taxes & service charge              estimated ⓘ             │
│  Offer  —                            [ Add an offer code ]   │
│  ──────────────────────────────────────────────────────      │
│  ESTIMATED TOTAL                     12.450.000 ₫            │
│                                      ≈ $492 approximate      │
│  Final amount is confirmed by the KAS team.                  │
├──────────────────────────────────────────────────────────────┤
│  Special requests                                            │
│  [ High floor if possible. Late arrival around 23:00.      ] │
├──────────────────────────────────────────────────────────────┤
│  GOOD TO KNOW                                                │
│  · Check-in from 14:00, check-out until 12:00                │
│  · Children: not accepted in V1 — see §7.4                   │
│  · Cancellation: ⚠ NEEDS CONFIRMATION — OQ-045 / OQ-055      │
├──────────────────────────────────────────────────────────────┤
│  This is a booking request. No payment is taken now.         │
│  We'll confirm availability and contact you within the day.  │
│                                                              │
│           [    REQUEST THIS STAY    ]                        │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Rules

**PROPOSED**

| Rule | Detail |
|---|---|
| **One property per request** | All room types share one property. **Pending OQ-014** — multi-property trips are offered as a second stay |
| **One date range per request** | All rooms share check-in and check-out. Split stays are separate requests |
| **Price basis** | **Per room, per night** (**CONFIRMED**) — stated explicitly on every line, because per-person pricing is common in the region and ambiguity here causes disputes |
| **Estimated, always** | The word *estimated* appears on the total. It is never called "Total" alone |
| **Currency** | VND primary; USD indicative with `≈` and a disclaimer ([25](25-i18n-currency-architecture.md) §6.3) |
| **Persistence** | Server-side when signed in; local for guests, merged on login. Survives refresh and device change |
| **Expiry** | 24h inactivity (**PROPOSED**), with a warning before expiry — **never silently emptied** |
| **Live re-validation** | Availability re-checked on open, on any change, and immediately before submit |
| **Editability** | Fully editable up to submission. After submission it is immutable and changes go through sales |
| **Empty state** | "Your Stay is empty" with a route back to rooms, dates preserved |

### 7.3 The tax and service charge line

> ⛔ **NOT IN V1 — struck from the V1 panel** (owner decision 2026-08-18,
> [99](99-phase-7-5e-owner-decisions-applied.md) §12). Tax is out of scope, so **the line in §7.1's
> sketch is not rendered in V1 at all** — not as a number, not as a zero, and not as the word
> `estimated`. Reserving a line for a feature the project has excluded would tell a guest that a
> charge is coming. The recommendation below stands for the day tax becomes a business capability of
> its own.
>
> **The total is still labelled an estimate** — see [56](56-phase-4-pricing.md) §9 and
> [58](58-phase-4-api-contract.md) §11.2.4 — but for a different reason: a price is a calculation
> until the snapshot is written at `REQUESTED`.

**NEEDS CONFIRMATION — OQ-022.** VAT and service charge treatment is undefined.

**PROPOSED** — The IA reserves the line and shows it as `estimated` with an explanatory tooltip until
the rule is known. **Recommendation: display all-inclusive prices** once confirmed — inclusive display
consistently outperforms exclusive display on trust and reduces late-stage abandonment. Until then the
line must not show a fabricated number.

### 7.4 What V1 refuses rather than guesses

**CONFIRMED — owner decision 2026-08-20.** Three inputs the frozen quote request accepts have no
frozen pricing rule. V1 **refuses** each with an actionable **422** rather than choosing a behaviour:

| Input | V1 | Blocked on |
|---|---|---|
| Children in the party | **refused** — the guest selector must not offer a child count in V1 | B10 · OQ-007 |
| A party larger than the rooms hold | **refused**, never silently clamped or split | B11 · OQ-008 |
| An offer code | **refused**, never silently ignored | B23 · OQ-029 |

The §7.1 sketch above therefore shows *more* than V1 renders: it predates these decisions and is
retained as the target design. In V1 the panel has no child selector, no tax line and no offer field.

Contract: [58](58-phase-4-api-contract.md) §11.2.3.

### 7.4 The policies block — a publish blocker

> ⚠ **NEEDS CONFIRMATION — OQ-055.** Phase 1 requires cancellation terms to be visible **before** the
> submit action ([05](05-booking-sales-model.md) §3.1). Phase 1.5 confirms the cancellation and
> no-show policy is **not yet defined**.
>
> The IA reserves the block. **No placeholder terms have been invented.** The booking flow cannot go
> live with this block empty. Options: (a) define the policy, (b) launch with an explicit "cancellation
> terms will be confirmed when our team contacts you" statement — honest but weaker, or (c) delay the
> flow. **Recommendation: (a).**

---

## 8. Step 6 — Your Details

**PROPOSED** — Minimum viable set. Every extra field costs completion; every missing field costs sales
a phone call.

| Field | Required | Rationale |
|---|---|---|
| Full name | ✔ | Identification |
| Email | ✔ | Acknowledgement and record |
| Phone (with country code) | ✔ | Primary sales channel in Vietnam |
| Preferred contact channel | Recommended | Phone · Zalo · Email. **Zalo is standard in Vietnam** (OQ-032) |
| Best time to contact | Recommended | Directly supports the "within the day" promise |
| Country / nationality | Recommended | Vietnamese properties record guest nationality |
| Estimated arrival time | Optional | Operationally valuable, especially for late arrivals |
| Purpose of stay | Optional | Business / leisure — enables better service |
| Company & tax invoice details | Conditional | Vietnamese VAT invoicing (OQ-022) |
| Marketing consent | Explicit opt-in | **Unticked by default** |

**PROPOSED**

- **Guest submission permitted** (pending OQ-016); account creation offered *after* success, never before
- Authenticated guests get pre-filled details with a "not you?" escape
- Inline validation on blur, plain-language errors adjacent to the field
- Vietnamese and international phone formats both accepted
- Special requests carried forward from Your Stay, editable here
- Correct `autocomplete` attributes and numeric keypads on mobile

---

## 9. Step 7 — Review

**PROPOSED** — The last chance to catch an error, and the last chance to reset expectations.

```
REVIEW YOUR REQUEST

  Hotel        KAS Milestone Premium Hotel            [ Change ]
  Stay         12 – 14 Sep 2026 · 2 nights            [ Change ]
  Guests       3 adults, 1 child (6)                  [ Change ]
  Rooms        Deluxe × 2 · Suite Balcony × 1         [ Change ]
  Requests     "High floor if possible…"              [ Change ]
  Contact      Nguyen Van A · +84 … · Zalo preferred  [ Change ]

  Estimated total          12.450.000 ₫
  Final amount confirmed by the KAS team.

  Good to know
  · Check-in from 14:00, check-out until 12:00
  · Cancellation: ⚠ pending OQ-045
  ☐  I've read and accept the booking terms

  WHAT HAPPENS NEXT
  1  Your request reaches the KAS reservations team.
  2  We confirm availability and contact you within the day.
  3  We arrange payment together — nothing is charged now.

           [    REQUEST THIS STAY    ]
```

**PROPOSED** — Every `[ Change ]` returns to the relevant step and **back to review**, with all other
entered data intact. A guest who loses their form data at step 7 does not come back.

---

## 10. The submit moment

**PROPOSED** — The highest-risk interaction in the product. Non-negotiable requirements:

| Requirement | Detail |
|---|---|
| **Label** | **REQUEST THIS STAY** — in both languages, everywhere, without exception |
| **Adjacent text** | *"This sends a request to the KAS team. We'll confirm availability and contact you within the day. No payment is taken now."* |
| **SLA wording** | Drawn from the single settings value, so on-screen text, email, and the queue timer can never disagree ([21](21-admin-navigation.md) §4) |
| **Policies above the button** | Visible, not behind a link |
| **Double-submit prevention** | Idempotency key. A network failure must never produce two requests |
| **Blocking state** | Explicit, non-cancellable, with "please don't refresh" |
| **Failure** | Clear message, selection preserved, correlation ID, **and a phone number** |
| **Availability lost at submit** | Explained inline with alternatives; **never a silent quantity reduction** |

---

## 11. Step 8 — Request sent

**PROPOSED** — One job: convert uncertainty into confidence.

```
Your stay request has been sent.

  Reference   KAS-260912-4F7A

  WHAT HAPPENS NEXT
  1  A member of the KAS reservations team reviews your request.
  2  We confirm availability and contact you within the day.
  3  We arrange payment together — nothing is charged now.

  We've emailed a copy to nguyen@example.com

  [ Track this request ]     [ Create an account ]

  Questions?  +84 … · Zalo · reservations@…
```

**PROPOSED**

- Reference format `KAS-YYMMDD-XXXX`, non-sequential suffix
- The page shows **no personal data** beyond a masked email — the reference alone must not expose a
  guest's details ([22](22-url-architecture.md) §7)
- "Track this request" issues a signed, expiring link for guest submissions; goes straight to the
  account for signed-in guests
- Account creation offered here, pre-filled, one action — the highest-converting moment for it
- A phone number is present. In a request model the human channel is the product

---

## 12. Multi-room and multi-type IA

**CONFIRMED** — Multiple room types and multiple quantities in one Your Stay.

**PROPOSED** — What the IA must handle correctly:

| Case | Behaviour |
|---|---|
| Same type, several rooms | One line, quantity 3. Not three lines |
| Different types | Separate lines, each with its own stepper and subtotal |
| Type becomes unavailable after adding | Line flagged inline; guest chooses to reduce, remove, or change dates. Never auto-removed |
| Guests exceed total capacity | Advisory prompt suggesting an additional room |
| Guests below capacity | No warning. Booking a large room for one guest is legitimate |
| Quantity reduced to 0 | Line removed with undo |
| All lines removed | Empty state, dates preserved |
| Different properties attempted | Blocked with an explanation and an offer to start a second stay (pending OQ-014) |
| Group threshold exceeded | Routed to a group enquiry (pending OQ-015) |

---

## 13. Vocabulary rules for this flow

**PROPOSED** — Binding on UI, email, notifications, admin guest-visible text, and analytics event names.

| Use | Never use |
|---|---|
| Your Stay | Cart · Basket · Trolley |
| Request This Stay | Book Now · Pay Now · Confirm · Reserve · Checkout |
| Booking request | Order · Reservation *(before confirmation)* |
| Estimated total | Total · Amount due · Price |
| Available rooms | Stock · Inventory · Units |
| Room type | SKU · Product · Item |
| Your Details | Billing details · Customer info |
| Request sent | Order placed · Booking complete |
| Stay details | Order details |
| Offer code | Coupon · Promo code |

**PROPOSED** — Analytics event names follow the same rules. An event called `add_to_cart` will
eventually surface in a report, a dashboard title, or a conversation with the business, and the
vocabulary will leak back into the product.

---

## 14. Edge cases

**PROPOSED**

| Case | Behaviour |
|---|---|
| Session expires mid-flow | Your Stay preserved; return to the exact step after login |
| Guest switches device | Signed in: Your Stay follows. Guest: local only, stated plainly |
| Your Stay approaching expiry | Warning with a one-tap extend |
| Dates become past while browsing | Prompt to update; selection preserved |
| Property becomes `TEMPORARILY_CLOSED` | Explained, with alternative KAS properties for the same dates |
| Offer code invalid or expired | Inline explanation; the rest of Your Stay untouched |
| Offer expires between request and confirmation | Sales re-validates; divergence flagged in admin (OQ-029) |
| Duplicate request detected | Second attempt returns the first request, not a new one |
| Guest requests dates beyond the horizon | "Not yet open for booking" + contact route — **not** "unavailable" |
| Availability service degraded | Content renders; availability states it is temporarily unavailable; contact offered. **Never a guessed number** |
| Guest submits with an unverified email | Permitted (**PROPOSED**, OQ-025); flagged for sales in admin |

---

## 15. Analytics events

**PROPOSED** — Server-side where possible, so measurement survives ad blockers.

```
search_performed        { locale, property?, checkIn, checkOut, adults, children, rooms }
property_viewed         { propertyId, hasDates }
room_type_viewed        { propertyId, roomTypeId, hasDates }
room_added_to_stay      { propertyId, roomTypeId, quantity }
room_removed_from_stay  { propertyId, roomTypeId }
stay_viewed             { propertyId, lineCount, roomCount, estimatedTotalVnd }
details_started         { propertyId }
review_step_viewed      { propertyId }
request_submitted       { reference, propertyId, roomCount, nights, estimatedTotalVnd, isAuthenticated }
request_failed          { reason }
request_confirmed       { reference, daysToConfirm }      ← emitted by admin transition
```

**PROPOSED** — `request_submitted` → `request_confirmed` is the funnel step no OTA-shaped analytics
model captures, and it is the one that actually measures whether KAS's booking model works.
