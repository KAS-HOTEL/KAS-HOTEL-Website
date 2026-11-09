# 14 — Lifecycle State Machines

**Phase:** 3 — Final decision lock
**Status:** Approved. Values marked where they remain business configuration.
**Supersedes:** All prior revisions, including the Phase 3.5 draft that used `salesStatus = CONFIRMED`.
**Last updated:** 2026-08-14

---

## 1. Scope

**CONFIRMED** — KAS runs **two lifecycles over one reservation entity**, preceded by a lightweight
inquiry record.

```
SALES INQUIRY        NEW → QUALIFIED → creates Reservation
                     NEW | QUALIFIED → LOST
                     DIRECT only · V1 · holds no inventory
                          │
                          ▼
RESERVATION          salesStatus   direct only · NULL for OTA · terminal WON
                     stayStatus    all channels · NULL until confirmed
```

**CONFIRMED** — There is **one** reservation entity. There is no `DirectReservation` and no
`OTAReservation`. **There is no generic `status` field.** Direct and OTA differ by
`distributionChannel`, `leadSource`, `salesOwner`, the **entry point**, and channel metadata.

| | `salesStatus` | `stayStatus` |
|---|---|---|
| Question | "How did the sale progress?" | "Where is this stay right now?" |
| Applies to | **Direct only.** `NULL` for OTA | **All channels** |
| Owner | KAS Sales | Property operations |
| Terminal success | **`WON`** | `COMPLETED` |
| After terminal | **Frozen** — a historical record | Continues to the end of the stay |

## 2. Why two lifecycles

**PROPOSED** — A single combined status cannot express this. It would force OTA reservations to carry
sales states they never occupied, and would make an unqualified inquiry into a "reservation" that
reserves nothing.

### 2.1 Why an inquiry is not a reservation state

**CONFIRMED** — A reservation is *defined* by property + dates + room type + quantity. An unqualified
inquiry — *"Do you have rooms available in September?"* — has none of them. Admitting it to the
reservation entity would require making all four nullable, breaking `CHECK (check_out > check_in)`,
making the availability check meaningless, making the price snapshot impossible, and forcing every
downstream query to be null-aware for a state most reservations never occupy.

**The inquiry introduces no duplication.** Every field it holds is one that does not yet exist as
reservation data. At qualification, customer, lead source and sales owner transfer, and the inquiry
becomes terminal.

### 2.2 Why the sales terminal is `WON`, not `CONFIRMED`

**CONFIRMED (Decision 2)** — `salesStatus` terminates at **`WON`**. `CONFIRMED` belongs to
`stayStatus` alone.

An earlier draft used `CONFIRMED` for both fields. That created a genuine semantic collision: an OTA
reservation has `stayStatus = CONFIRMED` and `salesStatus = NULL`, so a developer reading
`status == CONFIRMED` without checking *which* field would silently drop every OTA reservation from
operational queries. `WON` removes the ambiguity at the vocabulary level rather than mitigating it
with discipline.

| | Direct, confirmed | OTA, confirmed |
|---|---|---|
| `salesStatus` | **`WON`** | **`NULL`** |
| `stayStatus` | `CONFIRMED` | `CONFIRMED` |

**`WON` means:** the Direct Sales process successfully converted the request into a sale.

---

## 3. Sales Inquiry lifecycle

**CONFIRMED (Decision 1)** — `sales_inquiry` **is included in V1.** KAS has an active direct/social
sales workflow, and a direct customer may contact KAS before providing enough information to create a
reservation.

```
        ┌─────────┐
        │   NEW   │ ── qualified ──► ┌───────────┐ ── creates ──► RESERVATION
        └────┬────┘  property+dates  │ QUALIFIED │                salesStatus = REQUESTED
             │       +type+quantity  └─────┬─────┘
             │                             │
             └──────────► LOST ◄───────────┘
                       terminal
```

| State | Meaning | Inventory | Guest-visible |
|---|---|---|---|
| `NEW` | A direct enquiry exists; the stay is not yet specified | **None** | No — internal conversation record |
| `QUALIFIED` | Enough captured to create a reservation. Terminal | **None** | No |
| `LOST` | Not proceeding, or unreachable. Terminal | **None** | No |

### 3.1 Transitions

| # | From | To | Actor | Guard | Effects |
|---|---|---|---|---|---|
| I1 | — | `NEW` | Sales | `leadSource` required; some contact detail present | Follow-up scheduled; owner may be assigned |
| I2 | `NEW` | `QUALIFIED` | Sales | Property, check-in, check-out, ≥1 room type and quantity all present **and** availability confirmed | Creates a reservation at `salesStatus = REQUESTED`; `qualified_reservation_id` set; inquiry frozen |
| I3 | `NEW` | `LOST` | Sales | Reason required | Follow-ups cancelled; **any alternative-offer holds released** |
| I4 | `QUALIFIED` | `LOST` | Sales | Qualification abandoned before a reservation was created | As I3 |
| I5 | `NEW` · `QUALIFIED` | `LOST` | System | Follow-up attempts exhausted (**threshold: OQ-080**) | Owner notified; **holds released** |

### 3.2 The inquiry never holds inventory — with one precise exception

**CONFIRMED** — *The inquiry* holds no inventory. It has no dates, no room type and no quantity, so
there is nothing to hold. This is what makes it safe to leave open indefinitely.

**PROPOSED — the exception, and why it is not a contradiction.** During an inquiry conversation, sales
may make a **concrete alternative offer** — *"we have a Deluxe on 20–22 September, shall I hold it for
you?"* That offer has its own explicit property, room type, dates and quantity, which the inquiry does
not. The **hold** carries those parameters; the inquiry still does not.

Consequently an `inventory_hold` may reference an inquiry (§6), but:

- the hold has a **mandatory expiry** and is swept automatically
- an inquiry that is abandoned releases its holds via I3/I4/I5 and via expiry
- **no inquiry can permanently lock inventory** — this is a stated safety requirement (§6.4)

---

## 4. Reservation — `salesStatus`

**CONFIRMED** — Direct reservations only. **`NULL` for every OTA reservation.**

```
REQUESTED
   │
   ▼
ASSIGNED ──────────────────────────────────┐
   │                                       │
   ▼                                       │
AVAILABILITY_CHECK                         │
   │                                       │
   ▼                                       │
CUSTOMER_CONTACTED ◄──────────┐            │
   │                          │            │
   ├──► ALTERNATIVE_OFFERED ──┘            │
   │         (optional temporary hold)     │
   ▼                                       ▼
 WON                    DECLINED · CANCELLED · EXPIRED
   │
   └──► opens stayStatus = CONFIRMED
```

| State | Meaning | Inventory | Guest label |
|---|---|---|---|
| `REQUESTED` | Direct request submitted, or qualified from an inquiry | **Request hold placed** | Request received |
| `ASSIGNED` | A sales owner has taken it | Hold maintained | Our KAS team is reviewing your request |
| `AVAILABILITY_CHECK` | Sales is verifying availability | Hold maintained | We're checking availability |
| `CUSTOMER_CONTACTED` | Sales has made contact | Hold maintained | We're contacting you |
| `ALTERNATIVE_OFFERED` | Options proposed; awaiting the guest | Original hold maintained · **optional alternative hold** (§6) | Alternative options available |
| **`WON`** | **The sale converted. Terminal — frozen** | Request hold becomes firm | Booking confirmed |
| `DECLINED` | KAS could not accommodate. Terminal | **All holds released** | Request cancelled *(with reason and alternatives)* |
| `CANCELLED` | Withdrawn before conversion. Terminal | **All holds released** | Request cancelled |
| `EXPIRED` | Lapsed without resolution. Terminal | **All holds released** | Request expired |

### 4.1 Transitions

Actor: `C` customer · `S` sales · `Y` system.

| # | From | To | Actor | Guard | Effects |
|---|---|---|---|---|---|
| S1 | — | `REQUESTED` | C / S | Availability confirmed for all lines on all nights; occupancy valid; contact details present; not a duplicate | Reference issued; price snapshot frozen; **request hold created with expiry**; acknowledgement email; sales notified |
| S2 | `REQUESTED` | `ASSIGNED` | S | Permission `lead.assign` | Owner recorded; assignment history written |
| S3 | `ASSIGNED` | `AVAILABILITY_CHECK` | S | — | Live availability re-check recorded |
| S4 | `REQUESTED` | `AVAILABILITY_CHECK` | S | Implicit self-assignment | As S2 + S3 |
| S5 | `AVAILABILITY_CHECK` | `CUSTOMER_CONTACTED` | S | A contact log entry exists | Contact recorded: channel, direction, outcome |
| S6 | `ASSIGNED` | `CUSTOMER_CONTACTED` | S | Permitted — e.g. to clarify dates before checking | Contact recorded |
| S7 | `CUSTOMER_CONTACTED` | `ALTERNATIVE_OFFERED` | S | ≥1 alternative, each availability-checked at send | Structured offer sent; **optional alternative hold created** with `expiresAt` (§6); offer expiry set |
| S8 | `ALTERNATIVE_OFFERED` | `ALTERNATIVE_OFFERED` | S | Revised offer | Prior offer superseded and retained in history; **superseded holds released** |
| S9 | `ALTERNATIVE_OFFERED` | `CUSTOMER_CONTACTED` | S | Guest responded, still negotiating | Alternative holds released unless explicitly extended |
| S10 | `AVAILABILITY_CHECK` · `CUSTOMER_CONTACTED` · `ALTERNATIVE_OFFERED` | **`WON`** | S | Availability re-verified **under lock**; guest accepted; permission `reservation.win`; payment recorded **or** pay-at-hotel permitted (OQ-017) | **Opens `stayStatus = CONFIRMED` in the same transaction.** Accepted hold becomes firm; **all other holds on this reservation released**; confirmation email; check-in reminders scheduled |
| S11 | any non-terminal | `DECLINED` | S | Reason required | **All holds released**; guest emailed with alternatives where possible |
| S12 | any non-terminal | `CANCELLED` | C / S | Reason required | **All holds released**; guest notified |
| S13 | any non-terminal | `EXPIRED` | Y | Request hold expired without resolution | **All holds released**; guest and owner notified |

**PROPOSED — prohibited:** no transition out of any terminal state; no `REQUESTED → WON` without an
availability check; no customer-initiated transition other than S12 on their own request. Illegal
transitions are rejected, logged, and returned as domain errors — never silently ignored.

### 4.2 `salesStatus` freezes at its terminal value

**PROPOSED — important.** Once `salesStatus` reaches `WON`, it never changes again. If the stay is
later cancelled, `stayStatus` becomes `CANCELLED` while `salesStatus` remains `WON` — because the sale
did happen, and the sales record is history, not live state.

This keeps sales reporting honest: a won-then-cancelled stay counts as a sales conversion **and** as a
cancellation, in their respective domains.

---

## 5. Reservation — `stayStatus`

**CONFIRMED** — All channels. `NULL` until confirmed. **This is the operational state field.**

```
CONFIRMED ──► CHECK_IN_READY ──► CHECKED_IN ──► CHECKED_OUT ──► COMPLETED
    │               │
    │               └──► NO_SHOW
    └──► CANCELLED
```

| State | Meaning | Inventory | Guest label |
|---|---|---|---|
| `CONFIRMED` | The stay is committed | Firm: direct → `reserved`; OTA → `ota_reserved` | Booking confirmed |
| `CHECK_IN_READY` | Within the arrival window; property prepared | Unchanged | Ready for your arrival |
| `CHECKED_IN` | Guest in residence | `reserved` **or** `ota_reserved` → `occupied` | You're checked in |
| `CHECKED_OUT` | Guest departed | `occupied` released | Checked out |
| `COMPLETED` | Stay finished and settled. **Unlocks reviewing** | Released | Stay completed |
| `CANCELLED` | Terminated before arrival | Released | Cancelled |
| `NO_SHOW` | Guest did not arrive | Released per policy (**OQ-045**) | *(not shown as a distinct label)* |

### 5.1 Transitions

| # | From | To | Actor | Guard | Effects |
|---|---|---|---|---|---|
| T1 | `NULL` | `CONFIRMED` | S / Ops | Direct: via S10 (`salesStatus = WON`). **OTA: on recording — see §7** | Firm inventory commitment; confirmation communications |
| T2 | `CONFIRMED` | `CHECK_IN_READY` | Y | Arrival window reached (**OQ-019**) | Property arrival list updated; guest reminder |
| T3 | `CHECK_IN_READY` | `CHECKED_IN` | Ops | On or after check-in date | `reserved`/`ota_reserved` → `occupied` |
| T4 | `CONFIRMED` | `CHECKED_IN` | Ops | Direct check-in, skipping T2 | As T3 |
| T5 | `CHECK_IN_READY` | `NO_SHOW` | Ops | Guest absent past the cutoff (**OQ-045**) | Inventory released; charge per policy |
| T6 | `CHECKED_IN` | `CHECKED_OUT` | Ops | On or after check-out date | `occupied` released; check-out email |
| T7 | `CHECKED_OUT` | `COMPLETED` | Y | Settlement window elapsed (**OQ-019**) | **Review eligibility unlocked**; thank-you and review invitation |
| T8 | `CONFIRMED` · `CHECK_IN_READY` | `CANCELLED` | Ops / C | Per cancellation policy (**OQ-045**) | Inventory released; guest notified |

`COMPLETED`, `CANCELLED` and `NO_SHOW` are terminal. Reopening is prohibited; a new reservation is
created instead, optionally linked to the original.

---

## 6. Alternative offer holds

**CONFIRMED (Decision 3)** — KAS supports **temporary holds for alternative offers**. When a requested
room is unavailable and sales offers another room type, KAS may temporarily hold that alternative
inventory while awaiting the customer's response.

### 6.1 Required fields

**CONFIRMED** — Every hold carries:

```
inventory_hold
  id                  uuid pk
  hold_type           enum   REQUEST | ALTERNATIVE_OFFER
  reservation_id      uuid fk | null          ┐ exactly one must be present
  inquiry_id          uuid fk | null          ┘
  property_id         uuid fk        not null
  room_type_id        uuid fk        not null
  date                date           not null      -- one row per night
  quantity            int            not null  CHECK (quantity >= 1)
  status              enum   ACTIVE | RELEASED | EXPIRED | CONVERTED
  created_by          uuid fk → user | null         -- NULL = system (website request)
  created_at          timestamptz    not null
  expires_at          timestamptz    not null       -- MANDATORY. No open-ended holds
  released_at         timestamptz | null
  release_reason      text | null
  CHECK (reservation_id IS NOT NULL OR inquiry_id IS NOT NULL)
  CHECK (NOT (reservation_id IS NOT NULL AND inquiry_id IS NOT NULL))
  UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
```

**PROPOSED — `expires_at` is `NOT NULL` for every hold at creation.** It is cleared only when a hold
becomes firm on `salesStatus = WON`. This is the structural guarantee that no hold can be open-ended.

### 6.2 Duration

**CONFIRMED** — **The hold duration is not invented here.** It is a business configuration:

```
Setting key:   DIRECT_ALTERNATIVE_HOLD_DURATION
Scope:         global, with optional per-property override      (PROPOSED)
Value:         ⚠ REQUIRED FROM KAS BEFORE PRODUCTION LAUNCH
```

**PROPOSED** — Until supplied, the system has no default. An agent attempting to place an alternative
hold with no configured duration receives a clear error naming the missing setting, rather than the
system inventing one.

### 6.3 Lifecycle

| Event | Effect |
|---|---|
| Sales offers an alternative and chooses to hold it | `ALTERNATIVE_OFFER` hold created, `status = ACTIVE`, `expires_at = now() + DIRECT_ALTERNATIVE_HOLD_DURATION`. `reserved += qty` per night |
| Guest accepts the alternative | Hold `status = CONVERTED`; reservation lines updated; **the original request hold is released**; on `WON` the converted hold becomes firm |
| Guest declines | Hold `status = RELEASED`; `reserved -= qty` |
| Offer superseded by a revised offer (S8) | Prior hold `RELEASED`; new hold created |
| `expires_at` reached | **Automatic release.** Hold `status = EXPIRED`; `reserved -= qty` |
| Reservation → `DECLINED` / `CANCELLED` / `EXPIRED` | All holds `RELEASED` |
| Inquiry → `LOST` | All holds on that inquiry `RELEASED` |

**PROPOSED — holding an alternative is an explicit agent action, not automatic.** While both the
original request hold and an alternative hold are active, one guest temporarily consumes **two** sets
of rooms. That is a real cost, and it is why the duration is short and the agent is given an explicit
"release the original" action alongside the offer.

### 6.4 Inventory safety

**CONFIRMED** — The system must prevent negative availability, double allocation, expired holds
remaining active, and inventory being permanently locked by abandoned inquiries.

| Requirement | Mechanism |
|---|---|
| **No negative availability** | Database `CHECK (total − ota_allotment − reserved − occupied − maintenance − other_blocks >= 0)`. The write is refused before availability can go negative |
| **No double allocation** | Row-level `SELECT … FOR UPDATE` on affected inventory days in deterministic order, plus the unique constraint in §6.1. Two concurrent holds on the last room cannot both succeed |
| **No expired holds remaining active** | Mandatory `expires_at` + an idempotent sweep job (**PROPOSED**: every 5 minutes) + a reconciliation job asserting `reserved` equals the sum of `ACTIVE` holds and firm commitments. Drift is alerted, not absorbed |
| **No permanent lock by abandoned inquiries** | Every hold has a mandatory expiry regardless of what it references. An abandoned inquiry's holds expire on schedule; `LOST` releases them immediately |
| **Availability never counts an expired hold** | The availability query is defensive: it excludes holds whose `expires_at` has passed even if the sweep has not yet run |

**PROPOSED — the sweep, and why it is idempotent:**

```
every 5 minutes:
    holds = SELECT … WHERE status = 'ACTIVE' AND expires_at < now()
    for each affected reservation/inquiry:
        BEGIN
          lock affected inventory rows in deterministic order
          reserved -= quantity  for each expiring hold
          hold.status = 'EXPIRED', released_at = now()
        COMMIT
        after commit: notify guest and sales owner
```

A hold already marked `EXPIRED` or `RELEASED` is skipped, so a re-run cannot double-decrement.

---

## 7. OTA entry path

**CONFIRMED** — OTA reservations enter at `stayStatus = CONFIRMED` with **`salesStatus = NULL`**, and
skip the sales lifecycle entirely.

```
Booking.com | Agoda | Ctrip | Traveloka
        │  reservation received in the extranet
        ▼
Operational staff record it in KAS      ← Property Admin · Reservation Staff · Front Desk
        │                                  NEVER KAS Sales
        ▼
RESERVATION
   distributionChannel  BOOKING_COM | AGODA | CTRIP | TRAVELOKA
   leadSource           NULL       ← enforced by CHECK constraint
   salesOwner           NULL       ← enforced by CHECK constraint
   salesStatus          NULL       ← never entered a sales process
   stayStatus           CONFIRMED  ← enters here
   otaReference         external reference
        ▼
CENTRAL INVENTORY   ota_reserved += qty
        ▼
Operations: arrivals · occupancy · departures
```

```sql
CHECK (
  (channel_type = 'DIRECT' AND lead_source IS NOT NULL)
  OR
  (channel_type = 'OTA' AND lead_source IS NULL AND sales_owner_id IS NULL)
)
CHECK (channel_type = 'OTA' AND sales_status IS NULL OR channel_type = 'DIRECT')
```

**CONFIRMED** — Recording target: **as soon as operationally possible after receipt.** No numeric SLA
is specified; recording lag is measured, and the threshold is business-supplied (**OQ-081**).

**CONFIRMED** — An OTA reservation **never** holds request or alternative holds — it is already sold,
and consumes `ota_reserved` directly.

---

## 8. Query rules

**CONFIRMED** — Operational queries **must** use `stayStatus`. Sales analytics **must** use
`salesStatus`. **Never create a generic status field.**

| Question | Correct | Never |
|---|---|---|
| Arrivals | `stayStatus = CHECK_IN_READY` | `salesStatus` |
| Current stays / in house | `stayStatus = CHECKED_IN` | `salesStatus` |
| Departures today | `stayStatus = CHECKED_IN` + check-out date | `salesStatus` |
| Completed stays | `stayStatus = COMPLETED` | `salesStatus` |
| Occupancy | `stayStatus` + inventory | `salesStatus` |
| Live reservations | `stayStatus NOT IN (CANCELLED, NO_SHOW, COMPLETED)` | `salesStatus` |
| Review eligibility | `stayStatus = COMPLETED` | `salesStatus` |
| **Direct sales conversion** | **`salesStatus = WON`** | `stayStatus` |
| Sales SLA / response time | `salesStatus` + `channelType = DIRECT` | `stayStatus` |
| Lost direct sales | `salesStatus IN (DECLINED, CANCELLED, EXPIRED)` | — |
| **OTA reservations** | **`salesStatus IS NULL`** | — |

> ### The failure this prevents
>
> OTA reservations have `salesStatus = NULL`. Any operational query filtering on `salesStatus`
> **silently drops every OTA reservation** — from arrivals, occupancy, and departures. Nothing errors.
> The list is simply short, and a guest arrives to a front desk that does not expect them.
>
> The `WON` / `CONFIRMED` split (§2.2) makes this far harder to write by accident, because the two
> fields no longer share a value. It does not make it impossible, so the enforcement below stands.

**PROPOSED — enforcement:**

1. **Operational read models expose `stayStatus` only.** Arrivals, departures, occupancy and in-house
   views are built on a query layer that does not surface `salesStatus` at all.
2. **A blocking CI channel-completeness test:** seed one direct and one OTA reservation for the same
   date, call each operational endpoint, assert **both** appear.
3. **Lint rule:** `salesStatus` may not appear in any query within the operations module.
4. Neither field is ever abbreviated to `status` in code, API, or reporting.

---

## 9. Inventory interaction

**PROPOSED** — Every movement occurs in the **same transaction** as the status change. Full mechanics
in [15-inventory-rules.md](15-inventory-rules.md).

| Transition | Inventory effect |
|---|---|
| Inquiry `NEW` / `QUALIFIED` / `LOST` | **None from the inquiry itself.** Any alternative-offer hold attached to it follows §6 |
| → `salesStatus = REQUESTED` | `reserved += qty` per night; `REQUEST` hold rows created with mandatory expiry |
| → `ALTERNATIVE_OFFERED` **with hold** | `reserved += qty` for the alternative; `ALTERNATIVE_OFFER` hold rows created with expiry |
| → `ALTERNATIVE_OFFERED` **without hold** | No change; alternatives are availability-checked at send and re-checked at accept |
| → **`salesStatus = WON`** + `stayStatus = CONFIRMED` | Accepted hold becomes firm, `expires_at` cleared; all other holds released |
| → `salesStatus` `DECLINED` / `CANCELLED` / `EXPIRED` | All holds released; `reserved -= qty` |
| **OTA recorded** → `stayStatus = CONFIRMED` | `ota_reserved += qty` (**not** `reserved`) |
| → `stayStatus = CHECKED_IN` | `reserved` or `ota_reserved` → `occupied` |
| → `stayStatus = CHECKED_OUT` | `occupied -= qty` |
| → `stayStatus = CANCELLED` / `NO_SHOW` | `reserved` or `ota_reserved` -= qty, per policy |
| Hold `expires_at` reached | `reserved -= qty`; hold `EXPIRED` (§6.3) |

**PROPOSED** — `occupied` is channel-agnostic. A guest in a room is a guest in a room, whichever
channel sold it.

---

## 10. Guest-facing labels

**CONFIRMED** — Guests never see internal state names, field names, or sales workflow terminology.

| Guest label (EN) | Internal |
|---|---|
| Request received | `salesStatus = REQUESTED` |
| Our KAS team is reviewing your request | `salesStatus = ASSIGNED` |
| We're checking availability | `salesStatus = AVAILABILITY_CHECK` |
| We're contacting you | `salesStatus = CUSTOMER_CONTACTED` |
| Alternative options available | `salesStatus = ALTERNATIVE_OFFERED` |
| Your requested room is available | `salesStatus = WON`, payment outstanding |
| Payment instructions ready | `salesStatus = WON`, payment pending |
| **Booking confirmed** | `stayStatus = CONFIRMED` |
| Ready for your arrival | `stayStatus = CHECK_IN_READY` |
| You're checked in | `stayStatus = CHECKED_IN` |
| Checked out | `stayStatus = CHECKED_OUT` |
| Stay completed | `stayStatus = COMPLETED` |
| Request cancelled | `salesStatus` `CANCELLED` / `DECLINED`, or `stayStatus = CANCELLED` |
| Request expired | `salesStatus = EXPIRED` |

**PROPOSED** — The guest never sees the word `WON`. It is a sales-internal term; the guest sees
"Booking confirmed" once `stayStatus = CONFIRMED`. An OTA guest with a KAS account sees only stay
labels — they never had a sales process. Vietnamese labels: [20](20-customer-navigation.md) §7,
pending native copywriter review (**OQ-061**).

---

## 11. Timers

**PROPOSED** — Thresholds marked where they remain business decisions. All timer jobs are
**idempotent**.

| Timer | Applies to | Threshold |
|---|---|---|
| First-contact SLA | Direct only | **"Within the day"** — boundary is **OQ-051** |
| Request hold expiry | Direct only | **OQ-018** |
| **Alternative offer hold expiry** | Direct only | **`DIRECT_ALTERNATIVE_HOLD_DURATION`** — business configuration required before launch |
| Alternative offer response expiry | Direct only | **OQ-066** |
| Payment deadline | Direct only | **OQ-017** |
| Inquiry follow-up | Inquiry | **OQ-080** |
| `CHECK_IN_READY` | **All channels** | **OQ-019** |
| Check-in reminders | All channels | **OQ-019** |
| No-show cutoff | All channels | **OQ-045** — prompts an operator, never automatic; a late arrival is not a no-show |
| Auto-complete | All channels | **OQ-019** |
| Review invitation | All channels | **OQ-019**, subject to §12 |
| **OTA recording lag** | OTA | **Measured, not enforced.** Threshold is **OQ-081** |

SLA and hold timers apply to **direct** reservations only. An OTA reservation has no response time, no
sales owner, and no hold to expire.

---

## 12. Review eligibility

**CONFIRMED** — Eligibility depends on a **completed stay**, not on the channel.

```
canReview(reservation) =
      reservation.stayStatus == COMPLETED          ← stayStatus, never salesStatus
  AND reservation.customerId == currentUser.id
  AND no existing review for this reservation
  AND now() <= checkOut + reviewWindow             (OQ-040)
```

`distributionChannel` and `salesStatus` do not appear. Enforced at three levels: the unique
`review.reservation_id` foreign key, a service guard, and the UI.

> ⚠ **Two practical constraints.** OTA-supplied contact details are commonly masked aliases that stop
> routing after the stay (**OQ-077**), and a review invitation to an OTA guest must carry **no
> direct-booking solicitation** or it becomes marketing under the OTA contract (**OQ-078**).

---

## 13. Edge cases

| Case | Behaviour |
|---|---|
| Inquiry never qualifies | Stays `NEW` until follow-ups exhaust, then `LOST`. No inventory footprint unless an alternative hold was placed, which expires |
| Inquiry qualifies but availability has gone | Reservation not created; sales offers alternatives from the inquiry, or marks it `LOST` |
| Alternative hold expires while the guest is deciding | Hold released automatically; sales notified; the offer can be re-made if availability allows |
| Guest accepts an alternative after its hold expired | Availability re-checked under lock; if gone, treated as a new alternative round |
| Both original and alternative holds active | Permitted, deliberately short-lived. Agent has an explicit "release the original" action |
| Guest changes dates pre-conversion | Sales-mediated: old holds released, availability re-checked, new holds placed, price recalculated — one transaction |
| Availability lost between request and conversion | Sales offers alternatives; if declined, `salesStatus = DECLINED` with reason |
| Won stay later cancelled | `stayStatus = CANCELLED`; `salesStatus` stays `WON` (§4.2) |
| **OTA reservation cancelled at the OTA** | Operational staff record it; `stayStatus = CANCELLED`; `ota_reserved` released |
| **OTA reservation recorded late, after arrival** | Permitted. Record with true dates and correct current `stayStatus`. **Never reject the record** |
| **OTA sold beyond its safety buffer** | Recording succeeds, buffer auto-expands, alert raised. Availability fails closed; recording fails open |
| Duplicate OTA recording | Detected on `(distributionChannel, otaReference)`; returns the existing reservation |
| Walk-in | Direct reservation, `leadSource = WALK_IN`, may go straight to `salesStatus = WON` + `stayStatus = CHECKED_IN` |
| Guest extends on arrival | New reservation linked to the original; availability checked normally |
| Admin error requiring reversal | No un-transition. A compensating action is recorded with a reason |

---

## 14. Implementation requirements

1. Transitions execute **only** through the state machine service. No code path sets `salesStatus` or
   `stayStatus` directly.
2. Every transition validates legality, guard, **and** the actor's permission.
3. Every transition writes a status-history row: from, to, actor, actor type, reason, timestamp.
4. Every transition emits a domain event. Email failure must never roll back a business transaction.
5. Transition + inventory movement + hold changes + history are **one atomic transaction**.
6. Exhaustive tests: every legal transition succeeds under its guard; every illegal transition is
   rejected.
7. **Blocking CI tests:** the channel-completeness test (§8), a concurrency test proving exactly one
   of *N* simultaneous requests for the last room succeeds, and a hold-expiry test proving released
   inventory becomes available again.
8. `expires_at` is `NOT NULL` on every hold at creation (§6.1).
9. `salesStatus` is frozen once terminal (§4.2).
10. OTA reservations are created with `salesStatus = NULL` — never a placeholder value.
11. **No generic `status` field exists on the reservation entity.**
12. State names are internal. Guest strings come from §10 via the translation catalogue.

---

## 15. Open questions

| ID | Question | Status |
|---|---|---|
| **OQ-080** | Inquiry follow-up attempt limit before auto-`LOST` | `OPEN` |
| **OQ-081** | Acceptable OTA recording lag threshold | `OPEN` |
| OQ-017 | Payment required before conversion? Deposit percentage and deadline | `OPEN` |
| OQ-018 | Request hold duration | `OPEN` |
| OQ-019 | Lifecycle communication timings | `OPEN` |
| OQ-040 | Review window | `OPEN` |
| OQ-045 | Cancellation and no-show policy | **`BLOCKING`** |
| OQ-051 | Precise definition of "within the day" | **`BLOCKING`** |
| OQ-066 | Alternative offer *response* expiry (distinct from the inventory hold duration) | `OPEN` |

**Resolved and removed:** OQ-079 (`sales_inquiry` is V1 — Decision 1) · OQ-082 (`WON` — Decision 2) ·
OQ-083 (alternative holds — Decision 3, §6).

**Business configuration required before production launch:** `DIRECT_ALTERNATIVE_HOLD_DURATION`.
