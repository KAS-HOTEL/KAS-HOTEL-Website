# 68 — Booking Experience & Your Stay

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Last updated:** 2026-08-14

> Matches the Phase 4 contract exactly: [57](57-phase-4-reservation-sales.md),
> [54](54-phase-4-state-machines.md), [58](58-phase-4-api-contract.md).
> **KAS V1 is request / sales-assisted. This is not an OTA-style instant checkout.**

---

## 1. The journey

**CONFIRMED**

```
SEARCH → RESULTS → PROPERTY → ROOM TYPE → SELECT QUANTITY
      → STAY SUMMARY → CUSTOMER INFORMATION → REQUEST → CONFIRMATION
```

| # | Step | Screen | System state | Exits available |
|---|---|---|---|---|
| 1 | Search | Home / header panel | — | Full navigation |
| 2 | Results | `/search` | — | Full navigation |
| 3 | Property | `/hotels/{slug}` | — | Full navigation |
| 4 | Room type | `/hotels/{slug}/rooms` | — | Full navigation |
| 5 | Quantity | *(inline)* | — | — |
| 6 | **Stay summary** | `/stay` | Client/session state | **Reduced** — back to rooms only |
| 7 | Customer information | `/stay/details` | — | Back one step |
| 8 | Review & request | `/stay/review` | — | Back, or edit any element |
| 9 | Confirmation | `/stay/sent/{ref}` | `salesStatus = REQUESTED` | **Full navigation restored** |

**PROPOSED — the funnel narrows structurally.** Steps 1–5 sit inside the full site. Steps 6–8
progressively remove exits. Step 9 restores everything. Every exit offered during Your Stay is an
invitation to abandon.

**Progress indicator on steps 6–8 only:** **Your Stay → Your Details → Review**. Deliberately *not*
Cart → Checkout → Payment: there is no payment step, and implying one is the single most damaging
vocabulary error available in this product.

---

## 2. Search

```
┌──────────────────────────────────────────────────────────────┐
│  Where            When                  Who        Rooms     │
│  All KAS ▾   │  12 Sep → 14 Sep    │  2 + 0   │    1    │ ⌕ │
└──────────────────────────────────────────────────────────────┘
```

| Field | Behaviour |
|---|---|
| **Where** | Defaults to "All KAS hotels". Accepts a property, district or landmark. At n=8 a named dropdown beats free-text autocomplete |
| **When** | Range picker. Two months on desktop; **one scrollable month column on mobile**. Past dates disabled. Check-out changeable without restarting |
| **Who** | Adults and children **separated**, with an **age per child** — required for occupancy and child pricing |
| **Rooms** | Explicit and first-class. Multi-room is confirmed, not hidden |

Defaults are never empty: tonight → tomorrow, 2 adults, 1 room. All state URL-encoded, so a search is
shareable and back-button safe.

---

## 3. Your Stay — `/stay`

**CONFIRMED** — Customer-facing name is **"Your Stay"**. Never cart, basket or checkout — in any label,
URL, or analytics event name.

```
┌──────────────────────────────────────────────────────────────────┐
│  YOUR STAY                                                       │
├──────────────────────────────────────────────────────────────────┤
│  [img]  KAS Milestone Premium Hotel                              │
│         District [1], Ho Chi Minh City                           │
├──────────────────────────────────────────────────────────────────┤
│  Fri 12 Sep 2026   →   Sun 14 Sep 2026            2 nights       │
│  Check-in from [14:00]   Check-out until [12:00]     [ Change ]  │
├──────────────────────────────────────────────────────────────────┤
│  3 adults, 1 child (age 6)                            [ Change ] │
├──────────────────────────────────────────────────────────────────┤
│  [Deluxe Room]                                                   │
│    [1.850.000] ₫ / room / night    [−] 2 [+]        [Remove]     │
│    2 rooms × 2 nights                    [7.400.000] ₫           │
│                                                                  │
│  [Suite Balcony]                                                 │
│    [2.525.000] ₫ / room / night    [−] 1 [+]        [Remove]     │
│    1 room × 2 nights                     [5.050.000] ₫           │
│                                              [ + Add rooms ]     │
├──────────────────────────────────────────────────────────────────┤
│  Rooms subtotal                          [12.450.000] ₫          │
│  Taxes & service charge                  estimated ⓘ             │
│  Offer                          —        [ Add an offer code ]   │
│  ────────────────────────────────────────────────────────        │
│  ESTIMATED TOTAL                         [12.450.000] ₫          │
│                                          ≈ $[492] approximate    │
│  Final amount is confirmed by the KAS team.                      │
├──────────────────────────────────────────────────────────────────┤
│  Special requests                                                │
│  [ High floor if possible. Late arrival around 23:00.          ] │
├──────────────────────────────────────────────────────────────────┤
│  GOOD TO KNOW                                                    │
│  · Check-in from [14:00], check-out until [12:00]                │
│  · Children: [PLACEHOLDER — config B10]                          │
│  · Cancellation: ⚠ BLOCKED — config A4. Not designed until       │
│                  the policy exists. Publish blocker.             │
├──────────────────────────────────────────────────────────────────┤
│  This is a booking request. No payment is taken now.             │
│  We'll confirm availability and contact you [within the day].    │
│                                                                  │
│              [    REQUEST THIS STAY    ]                         │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Rules

| Rule | Detail |
|---|---|
| One property per request | All lines share one property |
| One date range per request | All lines share check-in and check-out |
| **Price basis on every line** | "per room / night", stated explicitly |
| **"Estimated", always** | Never labelled "Total" alone |
| Currency | VND primary; USD indicative with `≈` and disclaimer |
| Persistence | Server-side when signed in; local for guests, merged on login |
| Expiry | 24h inactivity, **warned before expiry — never silently emptied** |
| Live re-validation | On open, on any change, and **under lock at submission** |
| Editability | Fully editable up to submission; afterwards changes go through sales |
| Empty state | "Your Stay is empty" → back to rooms, **dates preserved** |

### 3.2 The policies block — a publish blocker

> ⚠ **BLOCKED — config A4 / A5 / OQ-055.** Phase 1 requires cancellation terms to be visible **before**
> the submit action, as a trust and legal requirement. The policy is **not defined**.
>
> The design **reserves the block and invents nothing**. The booking flow cannot go live with it empty.
> Options: (a) define the policy · (b) launch with an explicit "cancellation terms will be confirmed
> when our team contacts you" statement — honest but weaker · (c) delay the flow.
> **Recommendation: (a).**

---

## 4. Your Details — `/stay/details`

**PROPOSED** — Minimum viable set. Every extra field costs completion; every missing field costs sales
a phone call.

| Field | Required | Why |
|---|---|---|
| Full name | ✔ | Identification |
| Email | ✔ | Acknowledgement and record |
| Phone (country code) | ✔ | Primary sales channel in Vietnam |
| **Preferred contact channel** | Recommended | Phone · **Zalo** · Email. Zalo is standard in Vietnam |
| Best time to contact | Recommended | Directly supports the response promise |
| Country / nationality | Recommended | Vietnamese properties record guest nationality |
| Estimated arrival time | Optional | Operationally valuable for late arrivals |
| Special requests | Optional | Carried from Your Stay, editable |
| "How did you hear about us?" | Optional | Marketing attribution — **stored separately from `leadSource`**, which the server sets to `WEBSITE` |
| Company / tax invoice | Conditional | Vietnamese VAT invoicing (config A7) |
| Marketing consent | Explicit opt-in | **Unticked by default** |

**Guest submission is permitted**; account creation is offered *after* success, never before.
Authenticated guests get pre-filled details with a "not you?" escape. Inline validation on blur, plain
language, adjacent to the field. Numeric keypads and correct `autocomplete` on mobile.

---

## 5. Review, submit, confirm

### 5.1 Review — `/stay/review`

Every element with a `[ Change ]` that returns to the relevant step **and back to review**, with all
other data intact. A guest who loses their form data at step 8 does not come back.

```
WHAT HAPPENS NEXT
1  Your request reaches the KAS reservations team.
2  We confirm availability and contact you [within the day].
3  We arrange payment together — nothing is charged now.

☐  I've read and accept the booking terms

        [    REQUEST THIS STAY    ]
```

### 5.2 The submit moment

| Requirement | Detail |
|---|---|
| **Label** | **REQUEST THIS STAY** — in both languages, everywhere, without exception |
| Adjacent text | *"This sends a request to the KAS team… No payment is taken now."* |
| SLA wording | From **one settings value** (config A6), so screen, email and timer never disagree |
| Policies above the button | Visible, not behind a link |
| Double-submit | Idempotency key. A network failure must never produce two requests |
| Blocking state | Explicit, non-cancellable, "please don't refresh" |
| Failure | Clear message · selection preserved · correlation ID · **and a phone number** |
| Availability lost | Explained inline with alternatives. **Never a silent quantity reduction** |

### 5.3 Confirmation — `/stay/sent/{ref}`

```
Your stay request has been sent.

  Reference   KAS-260912-4F7A

  WHAT HAPPENS NEXT
  1  A member of the KAS reservations team reviews your request.
  2  We confirm availability and contact you [within the day].
  3  We arrange payment together — nothing is charged now.

  We've emailed a copy to n•••@example.com

  [ Track this request ]     [ Create an account ]

  Questions?  +84 [PLACEHOLDER] · Zalo · reservations@[PLACEHOLDER]
```

One job: **convert uncertainty into confidence.** The page shows no personal data beyond a masked
email. Account creation is offered here, pre-filled — the highest-converting moment for it.

---

## 6. Request status — the Wait stage

**CONFIRMED** — Internal sales states are **never** exposed. No `WON`, no `ASSIGNED`, no
`AVAILABILITY_CHECK`.

### 6.1 Guest vocabulary

| Guest sees | Internal ([54](54-phase-4-state-machines.md)) |
|---|---|
| **Request received** | `salesStatus = REQUESTED` |
| **Our KAS team is reviewing your request** | `salesStatus = ASSIGNED` |
| **Checking availability** | `salesStatus = AVAILABILITY_CHECK` |
| **We're contacting you** | `salesStatus = CUSTOMER_CONTACTED` |
| **Alternative options available** | `salesStatus = ALTERNATIVE_OFFERED` |
| **Your requested room is available** | `salesStatus = WON`, payment outstanding |
| **Payment instructions ready** | `salesStatus = WON`, payment pending |
| **Your stay is confirmed** | `stayStatus = CONFIRMED` |
| **Ready for your arrival** | `stayStatus = CHECK_IN_READY` |
| **You're checked in** | `stayStatus = CHECKED_IN` |
| **Stay completed** | `stayStatus = COMPLETED` |
| **Request cancelled** | `CANCELLED` / `DECLINED` |
| **Request expired** | `EXPIRED` |

**CONFIRMED** — The guest **never sees the word `WON`.** It is sales-internal; the guest sees "Your
stay is confirmed" once `stayStatus = CONFIRMED`.

### 6.2 The status timeline

```
┌────────────────────────────────────────────────────────┐
│  KAS Milestone Premium Hotel                           │
│  12–14 Sep 2026 · 2 nights · 3 rooms                   │
│  Reference KAS-260912-4F7A                             │
├────────────────────────────────────────────────────────┤
│  ● YOUR REQUESTED ROOM IS AVAILABLE        Today 16:20 │
│    Your rooms are available for these dates.           │
│    Next: we'll arrange payment together.               │
│                                                        │
│  ● We're contacting you                    Today 15:40 │
│    [Linh] from KAS Reservations called you.            │
│                                                        │
│  ● Checking availability                   Today 14:35 │
│  ● Our KAS team is reviewing your request  Today 14:20 │
│  ● Request received                        Today 14:03 │
├────────────────────────────────────────────────────────┤
│  YOUR STAY   [Deluxe] × 2 · [Suite Balcony] × 1        │
│  Estimated total  [12.450.000] ₫                       │
│                                                        │
│  Need to change something?                             │
│  Call +84 [PLACEHOLDER] · Zalo    [ Cancel request ]   │
└────────────────────────────────────────────────────────┘
```

| Rule | Detail |
|---|---|
| Only guest-meaningful events | Assignment changes, internal notes, availability re-checks and SLA events **never** appear |
| Current state dominant | History present but quieter |
| Named agent | **First name only** — enough to be personal, not a staff directory |
| **No fixed-step progress bar** | A request can branch to alternatives, decline or expire. A "5 of 7" bar would promise a path that may not happen |
| Guest access | Account, or a signed expiring link for guest submissions |

### 6.3 Alternatives

**PROPOSED** — The state most likely to save a booking, with no competitor precedent.

```
ALTERNATIVE OPTIONS AVAILABLE

We couldn't confirm [Suite Balcony] for 12–14 Sep.
Here are three options — each keeps the rest of your stay as requested.

① Same hotel, different room     [Deluxe] × 3 · 12–14 Sep · [11.100.000] ₫
② Same rooms, shifted dates      13–15 Sep · [12.450.000] ₫
③ Another KAS hotel              [KAS Sonata], District [3] · [11.800.000] ₫

Held for you until [date/time]          ← only when an inventory hold exists

None of these work?   [ Talk to us ]     [ Cancel my request ]
```

- **Up to three.** More becomes a search results page, which is not what a waiting guest wants.
- Each states **plainly what differs** from the original.
- Other KAS properties presented **neutrally** — never as a downgrade.
- **"Held for you until…"** appears only where an `ALTERNATIVE_OFFER` hold is active
  ([55](55-phase-4-inventory.md) §5). Framed as KAS holding something *for* the guest — which is true —
  rather than a deadline imposed on them.

### 6.4 Expiry

Expiry is communicated as **"held until"**. An expired request offers **"Recreate this request"**,
pre-filled — a guest who already wanted to stay should not re-enter everything.

---

## 7. Vocabulary rules

**CONFIRMED** — Binding on UI, email, notifications, admin guest-visible text, **and analytics event
names**.

| Use | Never |
|---|---|
| Your Stay | Cart · Basket |
| **Request This Stay** | Book Now · Pay Now · Confirm · Reserve · Checkout |
| Booking request | Order · Reservation *(before confirmation)* |
| Estimated total | Total · Amount due |
| Available rooms | Stock · Inventory |
| Room type | SKU · Product |
| Request sent | Order placed · Booking complete |
| Offer code | Coupon · Promo |

**PROPOSED** — Analytics events follow the same rules. An event named `add_to_cart` eventually surfaces
in a dashboard title and leaks the wrong vocabulary back into the product.

---

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Availability lost at submit | Explained inline, alternatives offered, rest of the selection preserved |
| Session expires mid-flow | Your Stay preserved; return to the exact step after login |
| Your Stay near expiry | Warning with one-tap extend |
| Dates become past while browsing | Prompt to update; selection preserved |
| Property becomes `TEMPORARILY_CLOSED` | Explained, with alternative KAS properties for the same dates |
| Offer code invalid | Inline explanation; rest of Your Stay untouched |
| Duplicate submission | Idempotency key; returns the first request |
| Beyond booking horizon | "Not yet open for booking" + contact route — **not** "unavailable" |
| Availability service degraded | Content renders; availability states it is unavailable; **never a guessed number** |

---

## 9. Open dependencies

| ID | Blocks |
|---|---|
| **A4 / A5** | Cancellation and no-show — **the policies block. Publish blocker** |
| **A6** | "Within the day" wording — appears on 6 surfaces |
| A7 | Tax and service charge — the estimate line |
| B1 / B2 | Hold durations — "held until" messaging |
| B6 | Rates — every price shown |
| B12 | Deposit rule — the payment-instructions step |
| B15 | Group threshold — quantity ceiling |
| OQ-016 | Guest submission permitted? **PROPOSED: yes** |
| OQ-021 | Phone number and legal details |
