# 27 — Request Status Architecture (The Wait Stage)

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Why this document exists

**CONFIRMED** — KAS has a customer journey stage that instant-booking platforms do not: **WAIT**.

Between *request submitted* and *booking confirmed*, the guest holds no certainty. No OTA, no hotel
chain, and no booking engine has a pattern for this stage, because none of them have it. It had to be
designed from first principles.

**PROPOSED** — The design brief for this stage in one sentence:

> Make the wait feel like *attention*, not *absence*.

Handled badly, the wait reads as a hotel that has not replied. Handled well, it reads as a hotel that
is personally checking — which is precisely the brand's thesis
([02](02-brand-foundation.md) §3).

---

## 2. Principles

**PROPOSED**

1. **Silence is the enemy.** Every meaningful state change produces a guest-visible signal, on at
   least one channel.
2. **Status is always retrievable** — in the account for signed-in guests, and by signed email link
   for guest submissions.
3. **A named human appears as early as possible.** "Linh from KAS Reservations will contact you"
   converts an anonymous queue into a relationship.
4. **The guest reads plain language, never our vocabulary.** Internal states are mapped, always.
5. **If the answer is no, the alternative arrives with it.** A decline without options is a lost
   guest; a decline with three alternatives is often still a booking.
6. **The promise is stated once and kept everywhere.** The "within the day" wording comes from a
   single setting and appears identically on screen, in email, and in the account.
7. **Never imply certainty that does not exist.** Not in a status label, not in an email subject, not
   in a notification.

---

## 3. Customer-facing status vocabulary

**CONFIRMED (Phase 1.5)** — Proposed customer-facing labels supplied by the product owner. Mapped
below to internal states. **These are proposed labels and remain subject to copy approval.**

| Guest label (EN) | Guest label (VI — **proposed**, OQ-061) | Internal state | Guest guidance |
|---|---|---|---|
| **Request received** | Đã nhận yêu cầu | `REQUESTED` | "We've received your request and will contact you within the day." |
| **We're checking availability** | Đang kiểm tra phòng trống | `AVAILABILITY_CHECK` | "Our team is confirming your rooms for these dates." |
| **Our KAS team is reviewing your request** | Đội ngũ KAS đang xem xét yêu cầu | `ASSIGNED` | "{Agent} is looking after your request." |
| **We're contacting you** | Chúng tôi đang liên hệ với bạn | `SALES_CONTACTED` | "We've reached out by {channel}. Reply when convenient." |
| **Your requested room is available** | Phòng bạn yêu cầu còn trống | `AVAILABILITY_CONFIRMED` | "Your rooms are available. Next: we'll arrange payment together." |
| **Alternative options available** | Có phương án thay thế | `ALTERNATIVE_OFFERED` | "We've suggested options for your dates." |
| **Payment instructions ready** | Đã có hướng dẫn thanh toán | `PAYMENT_PENDING` | "Payment details are in your email. Due by {date}." |
| **Booking confirmed** | Đã xác nhận đặt phòng | `CONFIRMED` | "We look forward to welcoming you on {date}." |
| **Request cancelled** | Yêu cầu đã hủy | `CANCELLED` / `DECLINED` | Reason + alternatives |
| **Request expired** | Yêu cầu đã hết hạn | `EXPIRED` | "Start a new request — we'd still love to host you." |

**PROPOSED — additional labels needed for the full lifecycle**, not in the supplied list:

| Guest label | Internal state |
|---|---|
| **Ready for your arrival** | `CHECK_IN_READY` |
| **You're checked in** | `CHECKED_IN` |
| **Stay completed** | `COMPLETED` — unlocks reviewing |

### 3.1 Vocabulary that must never reach a guest

**CONFIRMED** — Do not expose internal sales workflow terminology.

| Never shown | Why |
|---|---|
| `SALES_QUEUE`, `ASSIGNED_TO`, agent workload | Operational internals |
| `InventoryDay`, `reserved`, `occupied`, `maintenance`, hold state | Inventory internals ([04](04-room-architecture.md) §2) |
| `BookingAggregate`, `PAYMENT_PENDING_INTERNAL`, status codes | Engineering internals |
| SLA timers, breach state, escalation | Our performance management, not their concern |
| Internal notes | **Confirmed prohibition** ([21](21-admin-navigation.md) §5.4) |
| Any room number | **Confirmed prohibition** |
| "Queue position", "N requests ahead of you" | Reduces personal service to a ticket line |

---

## 4. Internal → guest mapping

**PROPOSED** — Three new internal states are implied by the Phase 1.5 workflow and the supplied label
list. All three are flagged for confirmation.

| Internal state | Source | Status |
|---|---|---|
| `ASSIGNED` | Phase 1.5 workflow | ⚠ **NEEDS CONFIRMATION — OQ-053.** State, or attribute on `REQUESTED`? |
| `AVAILABILITY_CHECK` | Phase 1.5 workflow + the label "We're checking availability" | ⚠ **NEEDS CONFIRMATION — OQ-053.** Phase 1's state machine has no equivalent |
| `ALTERNATIVE_OFFERED` | The label "Alternative options available" | ⚠ **NEEDS CONFIRMATION — OQ-066.** Phase 1 treats alternatives as an action, not a state. But a guest waiting on a decision *is* in a distinct state, and it needs its own label and its own timer |
| `DECLINED` | Phase 1.5 workflow ("CONFIRM / ALTERNATIVE / DECLINE") | ⚠ **NEEDS CONFIRMATION — OQ-054.** Distinct terminal state, or a `CANCELLED` reason code? Affects reporting and guest messaging |

> **Not resolved here by assumption.** [14-booking-state-machine.md](14-booking-state-machine.md) must
> be amended once the product owner decides. The IA below works under either reading, because it maps
> *guest labels* to *whatever the internal states turn out to be* — the mapping table is the contract.

**PROPOSED — mapping rules:**

1. Guest labels and internal states are related **many-to-one**, never one-to-one. Several internal
   states may share a guest label if the distinction is meaningless to the guest.
2. A new internal state can be added **without** a new guest label. The mapping absorbs it.
3. The mapping lives in **one place** — the translation catalogue — and drives the account page, the
   tracking page, emails, and notifications identically.

---

## 5. Where a guest sees status

**PROPOSED** — Four surfaces, one source of truth.

| Surface | Audience | Access |
|---|---|---|
| **Account → My Stays → Stay detail** | Signed-in guests | Session + ownership check |
| **Track page** `/track/{signedToken}` | Guests without an account | Signed, expiring, revocable token |
| **Email** | All | Sent on every meaningful transition |
| **In-app notifications** | Signed-in guests | Bell + notifications list |

**PROPOSED** — The reference code alone never grants access ([22](22-url-architecture.md) §7). The
token is the credential; the reference is the label.

---

## 6. The status timeline

**PROPOSED** — The primary status UI. Vertical, most recent first on mobile; most recent last on
desktop where vertical space allows the full narrative.

```
┌──────────────────────────────────────────────────────────┐
│  KAS Milestone Premium Hotel                             │
│  12 – 14 Sep 2026 · 2 nights · 3 rooms                   │
│  Reference KAS-260912-4F7A                               │
├──────────────────────────────────────────────────────────┤
│  ● YOUR REQUESTED ROOM IS AVAILABLE          Today 16:20 │
│    Your rooms are available for these dates.             │
│    Next: we'll arrange payment together.                 │
│                                                          │
│  ● We're contacting you                      Today 15:40 │
│    Linh from KAS Reservations called you.                │
│                                                          │
│  ● We're checking availability               Today 14:35 │
│                                                          │
│  ● Our KAS team is reviewing your request    Today 14:20 │
│    Linh is looking after your request.                   │
│                                                          │
│  ● Request received                          Today 14:03 │
│    We'll confirm availability and contact you            │
│    within the day.                                       │
├──────────────────────────────────────────────────────────┤
│  YOUR STAY                                               │
│    Deluxe Room        × 2                                │
│    Suite Balcony      × 1                                │
│    Estimated total    12.450.000 ₫                       │
│                                                          │
│  Need to change something?                               │
│  Call +84 … · Zalo · reservations@…                      │
│                                    [ Cancel request ]    │
└──────────────────────────────────────────────────────────┘
```

**PROPOSED** — Timeline rules:

- Only guest-meaningful events appear. Assignment changes, internal notes, availability re-checks, and
  SLA events do **not**.
- Each entry: guest label, timestamp in property-local time, and one line of plain guidance.
- The current state is visually dominant. History is present but quieter.
- A named agent appears from the assignment event onward.
- **No progress bar with a fixed number of steps.** A request can branch to alternatives, decline, or
  expire; a 5-of-7 progress bar would promise a path that may not happen.

---

## 7. Status-specific content

**PROPOSED** — What each state must offer beyond a label. A status with no next action is a dead end.

| State | Primary content | Available actions |
|---|---|---|
| **Request received** | The promise, restated. Full stay summary | Cancel · Contact us |
| **Team is reviewing** | Named agent | Cancel · Contact agent |
| **Checking availability** | Reassurance that this is a real check, not a queue | Cancel · Contact |
| **We're contacting you** | Channel and time of contact; how to reply | Reply · Contact · Cancel |
| **Room is available** | **Confirmed rooms, dates, and final price** — the moment uncertainty ends | Accept · Ask a question · Cancel |
| **Alternative options available** | Each alternative with property, dates, rooms, price, and a clear difference from the original | Choose an option · Ask · Decline |
| **Payment instructions ready** | Amount, methods, deadline, reference. **VND only** | View instructions · Confirm sent · Ask |
| **Booking confirmed** | Full confirmation, directions, check-in details, contact | Add to calendar · Directions · Contact · Cancel *(per policy — OQ-045)* |
| **Ready for your arrival** | Directions, arrival time, front desk number | Directions · Contact |
| **Stay completed** | Thank you | **Write a review** |
| **Request cancelled / declined** | Reason, stated warmly. Alternatives if any | Start a new request · Explore other KAS hotels |
| **Request expired** | Plain explanation, no blame | Recreate this request *(one tap, pre-filled)* |

**PROPOSED** — "Recreate this request" on expiry is worth building. An expired request is a guest who
already wanted to stay; re-entering everything is the reason they will not.

---

## 8. Alternatives

**PROPOSED** — The state most likely to save a booking, and the one with no competitor precedent.

```
ALTERNATIVE OPTIONS AVAILABLE

We couldn't confirm Suite Balcony for 12–14 Sep. Here are three options —
each keeps the rest of your stay as requested.

┌────────────────────────────────────────────────────────────┐
│ ① Same hotel, different room                               │
│    Deluxe × 3 at KAS Milestone Premium Hotel               │
│    12 – 14 Sep · 11.100.000 ₫  (−1.350.000 ₫)              │
│    [ Choose this ]                                          │
├────────────────────────────────────────────────────────────┤
│ ② Same rooms, shifted dates                                │
│    Deluxe × 2 · Suite Balcony × 1                          │
│    13 – 15 Sep · 12.450.000 ₫                              │
│    [ Choose this ]                                          │
├────────────────────────────────────────────────────────────┤
│ ③ Another KAS hotel                                        │
│    KAS Sonata Luxury Hotel · District 3                    │
│    Deluxe × 2 · Suite × 1 · 12 – 14 Sep · 11.800.000 ₫     │
│    [ View hotel ]     [ Choose this ]                       │
└────────────────────────────────────────────────────────────┘

None of these work?   [ Talk to us ]     [ Cancel my request ]
```

**PROPOSED**

- Up to **three** alternatives. More becomes a search results page, which is not what a guest waiting
  on an answer wants.
- Each states **plainly what differs** from the original — a guest should not have to compare two
  screens to find the change.
- Alternatives at other KAS properties are presented **neutrally**, never as a downgrade, and never
  with comparative language ([02](02-brand-foundation.md) §4).
- Each alternative is **availability-checked at the moment of sending** and re-checked when chosen.
- Choosing one moves the request forward; it does not create a new request and does not lose history.
- An alternative offer carries its own expiry and its own reminder.

---

## 9. Notification map

**PROPOSED** — Timings require approval (OQ-019). "Within the day" wording is settings-driven (OQ-051).

| Trigger | Email | In-app | Timing |
|---|:--:|:--:|---|
| Request received | ✔ | ✔ | Immediate |
| Assigned to an agent | — | ✔ | Immediate |
| Availability being checked | — | ✔ | On transition |
| Sales contacted | optional | ✔ | On log |
| Availability confirmed | ✔ | ✔ | Immediate |
| Alternatives offered | ✔ | ✔ | Immediate |
| Payment instructions ready | ✔ | ✔ | Immediate |
| Payment reminder | ✔ | ✔ | 24h before deadline |
| Booking confirmed | ✔ | ✔ | Immediate |
| Check-in reminder | ✔ | ✔ | 48h and 24h before |
| Day of arrival | ✔ | ✔ | Morning |
| Check-out reminder | ✔ | — | Morning of departure |
| Post-stay thank-you + review invitation | ✔ | ✔ | 24h after check-out |
| Review reminder | ✔ | — | Day 7, **once only** |
| Request expiring | ✔ | ✔ | Before expiry |
| Request expired | ✔ | ✔ | On expiry |
| Request cancelled / declined | ✔ | ✔ | Immediate |

**PROPOSED**

- Every email restates the reference and links to the status page.
- Every email is idempotent by (event, booking, recipient) — a retry cannot double-send
  ([10](10-system-requirements.md) §7).
- **Amounts in VND only** ([25](25-i18n-currency-architecture.md) §6.3).
- Sent in the locale used at request time, overridden by the account preference.
- **SMS and Zalo are FUTURE** behind the same channel abstraction (OQ-032) — though for the Vietnamese
  market, Zalo is likely the highest-impact addition available to this stage.

---

## 10. Guest tracking without an account

**PROPOSED** — Guest submission is permitted (pending OQ-016), so status must be reachable without an
account.

| Aspect | Rule |
|---|---|
| Access | Signed, expiring token emailed at submission: `/track/{signedToken}` |
| Lifetime | Valid until the request reaches a terminal state, plus 30 days |
| Scope | This request only. Never a session, never account access |
| Content | Identical to the account view, minus account-only actions |
| Re-issue | "Email me a new link" — verified against the request's email address |
| Security | `noindex`, `nofollow`, `X-Robots-Tag`, no referrer leakage, revocable |
| Upgrade path | Persistent "Create an account to keep all your stays in one place" |

---

## 11. My Stays

**PROPOSED** — Three tabs, because a guest's mental model separates *waiting*, *coming*, and *been*.

```
MY STAYS
 ⦿ Upcoming (1)     Requests (2)     Past (4)
```

| Tab | Contains | Sort |
|---|---|---|
| **Upcoming** | `CONFIRMED`, `CHECK_IN_READY`, `CHECKED_IN` | Check-in date ascending |
| **Requests** | `REQUESTED` … `PAYMENT_PENDING`, `ALTERNATIVE_OFFERED` | Most recently updated first |
| **Past** | `COMPLETED`, `CHECKED_OUT`, `CANCELLED`, `DECLINED`, `EXPIRED` | Check-out date descending |

**PROPOSED** — The section is called **My Stays**, not "My Bookings", because it contains requests that
are not bookings. Calling it My Bookings would recreate the exact misunderstanding the product exists
to avoid ([19](19-sitemap.md) §3).

Each row: property, dates, room summary, **guest status label**, and the single most useful action.

---

## 12. Timing and expiry visibility

**PROPOSED**

| Concern | Guest sees | Guest does **not** see |
|---|---|---|
| Response promise | "We'll contact you within the day" | The SLA timer, breach state, or escalation |
| Request expiry | "This request is held until {date}" | Hold mechanics, inventory effects |
| Payment deadline | "Due by {date}" | Internal deadline configuration |
| Alternative offer expiry | "These options are held until {date}" | — |

**PROPOSED** — Expiry is communicated as **"held until"**, framed as KAS holding something *for* the
guest — which is true — rather than as a deadline being imposed on them. Same fact, correct emotional
register for a hospitality brand.

---

## 13. Cancellation by the guest

> ⚠ **NEEDS CONFIRMATION — OQ-045 / OQ-055.** The cancellation policy is undefined.

**PROPOSED** — The IA distinguishes two situations that must not be conflated:

| Situation | Nature | Status |
|---|---|---|
| Cancelling a **request** before confirmation | Withdrawing a request. Nothing has been agreed, no payment taken | **PROPOSED**: always permitted, one action, no penalty. Low risk |
| Cancelling a **confirmed booking** | Cancelling an agreed stay, possibly after payment | ⚠ **Blocked on OQ-045.** No terms may be invented |

**PROPOSED** — Until the policy is defined, a confirmed booking shows **"Contact us to change or
cancel"** with the phone number and Zalo, routing to a human. This is honest, safe, and consistent
with the sales-assisted model — but it is a stopgap, not a design, and it should not survive launch.

---

## 14. What the guest never sees

**PROPOSED** — A consolidated denylist for review and for the CI contract test
([04](04-room-architecture.md) §2.1):

```
roomNumber · floor · unitId · internalNote · salesQueue · assigneeWorkload
slaDueAt · slaBreached · escalationLevel · holdExpiresAt (raw) · reserved
occupied · maintenance · inventoryDayId · internalStatusCode · agentNotes
priceOverrideReason · marginData · otherGuestData · requestPosition
```

Guest-facing responses have **no field capable of carrying these**. They are absent by type, not
filtered by logic.

---

## 15. Open questions raised here

| ID | Question |
|---|---|
| **OQ-051** | Precise definition of "within the day" — cutoff, weekends, holidays, escalation |
| **OQ-053** | Is `ASSIGNED` a state or an attribute? Is `AVAILABILITY_CHECK` a state? Does availability check precede customer contact? |
| **OQ-054** | Is `DECLINED` a terminal state or a `CANCELLED` reason code? |
| **OQ-066** | Is `ALTERNATIVE_OFFERED` a distinct state with its own expiry? |
| **OQ-055** | What is shown in the pre-submit policies block before the cancellation policy exists? |
| **OQ-061** | Vietnamese status labels require native copywriter review |
