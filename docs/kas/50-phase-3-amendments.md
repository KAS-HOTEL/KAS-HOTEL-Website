# 50 — Phase 3 Amendments & Architecture Freeze

**Phase:** 3 → 3.5 — Amendment & transitional decisions
**Status:** Approved decisions applied. Draft for final approval.
**Last updated:** 2026-08-14

> **Phase 3.5 additions:** OQ-074 resolved structurally (§10.4 — configurable safety buffer) ·
> OQ-075 resolved (§10.5 — operational recording) · [14](14-booking-state-machine.md) fully rewritten
> against the split lifecycle · invented SLA thresholds removed throughout.

---

## 0. Repository state note

**Documents 30–49 do not exist in this repository.** The corpus is `00`–`29`. The amendment brief
referenced Phase 3 documents (38 domain model, 39 ERD, 40 booking state machine, 41 inventory model,
42 pricing model, 46 security, 47 channel manager, 49 Phase 3 decisions) that were never created here,
and assigned topics to `09`, `15`, `16`, `18`, `22` that differ from their actual content.

**No content is missing** — every topic in the brief has an existing home. This document has been
numbered `50` as requested; the gap `30`–`49` is intentional and unfilled.

| Brief reference | Actual document |
|---|---|
| 38 domain model · 39 ERD · 42 pricing model | [13 — Database & Domain Overview](13-database-domain-overview.md) |
| 40 booking state machine · "16 state model" | [14 — Booking State Machine](14-booking-state-machine.md) |
| 41 inventory model · "18 inventory" · "15 domain rules" | [15 — Inventory Rules](15-inventory-rules.md) |
| 46 security | [10 — System Requirements](10-system-requirements.md) §5 |
| 47 channel manager | [29 — Direct Sales CRM & Distribution](29-direct-sales-crm-architecture.md) §6.2 |
| 49 Phase 3 decisions · "28 decisions" | [28 — Decision Log](28-phase-2-decisions.md) |
| "09 booking/request model" | [05 — Booking & Sales Model](05-booking-sales-model.md) |
| "21 admin architecture" · "22 admin routes" | [21](21-admin-navigation.md) · [22](22-url-architecture.md) §8 |

---

## 1. What changed

**CONFIRMED** — Ten approved decisions applied. Five confirm existing design; **five change it**.

| # | Decision | Effect |
|---|---|---|
| D-28 | **KAS Admin is the operational hub** for all reservations across all 8 properties | **CHANGES.** Answers OQ-070, previously blocking. OTA reservations must now be recorded |
| D-29 | Three concepts structurally separated: distribution channel · lead source · sales owner | Confirms [29](29-direct-sales-crm-architecture.md) §2–3 |
| D-30 | One reservation entity; OTA enters at `CONFIRMED` | Confirms [29](29-direct-sales-crm-architecture.md) §4 |
| D-31 | Direct lead = booking request; no parallel Lead entity | Confirms [29](29-direct-sales-crm-architecture.md) §5.1 |
| D-32 | **`NEW` must not be forced into the reservation state machine.** Split the sales lifecycle from the stay lifecycle | **CHANGES.** Supersedes [29](29-direct-sales-crm-architecture.md) §5.2 and restructures [14](14-booking-state-machine.md) |
| D-33 | Central inventory **and central rate management** | **CHANGES.** Rate management is newly first-class |
| D-34 | **Hybrid transitional OTA model** — not pure allotment, not pure manual entry | **CHANGES.** Answers OQ-067. Supersedes the "allotment first" recommendation in [15](15-inventory-rules.md) §7 and [29](29-direct-sales-crm-architecture.md) §7.2 |
| D-35 | Future channel manager — clean integration boundary only, no APIs assumed | Confirms [29](29-direct-sales-crm-architecture.md) §6.2 |
| D-36 | **OTA guests eligible for completed-stay lifecycle and verified reviews; marketing separated from transactional** | **CHANGES.** Answers OQ-069 |
| D-37 | **Customer 360** — one customer across channels | **NEW** concept |
| D-38 | Admin IA has three areas: **Direct Sales · Operations · Distribution** | **CHANGES.** [21](21-admin-navigation.md) had two |

## 2. Why it changed

**PROPOSED** — The three substantive shifts and their reasoning.

**2.1 The operational hub decision resolves the largest open ambiguity.** OQ-070 asked whether KAS
Admin is a *direct sales platform* or the *property's operational system of record*. That single
question determined whether OTA reservations needed to exist in KAS at all, which in turn determined
the inventory strategy, the arrivals list, Customer 360, and OTA guest lifecycle. With "operational
hub" confirmed, four downstream decisions fall out consistently rather than being argued separately.

**2.2 The `NEW` state was wrong, and the correction is structurally important.** My previous proposal
put `NEW` (an unqualified social inquiry) into the reservation state machine. That was a genuine
design error: a reservation is defined by property + dates + room type + quantity, and an unqualified
inquiry has none of them. Forcing it in would have made those columns nullable, weakened every
constraint that depends on them, and made "reservation" a name for something that is not a
reservation. §11 sets out the corrected model.

**2.3 Hybrid beats either pure strategy, once the hub decision is made.** My earlier recommendation —
allotment first — was correct *given the assumption that OTA reservations might not be recorded*. The
hub decision removes that assumption. With OTA reservations recorded, allotment stops being the
oversell defence and becomes a **transitional safety buffer** that can shrink as recording discipline
proves out. That is a materially better answer, and it is only available because D-28 was made.

---

## 3. Direct Sales model

**CONFIRMED** — KAS Sales manages **direct customers and direct leads only**.

### 3.1 The three concepts

```
DISTRIBUTION CHANNEL   "Where was the reservation sold?"          every reservation
   DIRECT | BOOKING_COM | AGODA | CTRIP | TRAVELOKA

LEAD SOURCE            "How did this DIRECT customer reach KAS?"  DIRECT only
   WEBSITE | FACEBOOK | ZALO | TIKTOK | INSTAGRAM | PHONE
   | WALK_IN | REFERRAL | RETURNING_CUSTOMER | OTHER

SALES OWNER            "Which Sales employee owns this DIRECT lead?"  DIRECT only
```

**CONFIRMED invariant, preserved unchanged from [29](29-direct-sales-crm-architecture.md) §3:**

```sql
CHECK (
  (channel_type = 'DIRECT' AND lead_source IS NOT NULL)
  OR
  (channel_type = 'OTA' AND lead_source IS NULL AND sales_owner_id IS NULL)
)
```

### 3.2 Direct lead = booking request

**CONFIRMED** — The same commercial object with different entry points. No parallel Lead entity.

| Entry point | Created by | Lead source | Enters at |
|---|---|---|---|
| Website "Request This Stay" | The customer | `WEBSITE` | `REQUESTED` |
| Facebook / Zalo / TikTok / Instagram, fully specified | Sales, on the customer's behalf | that channel | `REQUESTED` |
| Phone / walk-in, fully specified | Sales | `PHONE` / `WALK_IN` | `REQUESTED` |
| Social inquiry, **not yet specified** | Sales | that channel | **Inquiry — see §11** |

Approved example, in the model:

```
distributionChannel   DIRECT
leadSource            FACEBOOK
salesOwner            Sales Agent A
createdBy             Sales Agent A
customer              Nguyen Van A
property              KAS Milestone Premium Hotel
lines                 Deluxe Room × 2
```

---

## 4. OTA model

**CONFIRMED** — OTA reservations are **operationally visible** but **never** Direct Sales CRM property.

> **Operational visibility ≠ Direct Sales CRM ownership.**

| OTA reservations **are** | OTA reservations **are not** |
|---|---|
| Visible in Operations — arrivals, departures, occupancy | Direct Sales Queue items |
| Consumers of central inventory | Assignable to a sales owner |
| Distribution performance data | Lead source carriers |
| Real KAS guests with a stay lifecycle | Follow-up or SLA subjects |
| Eligible for completed-stay lifecycle (§9) | Automatically marketable (§9) |

**CONFIRMED** — V1 implements **no OTA API integrations** and assumes **no OTA API contracts**.

---

## 5. Central Inventory model

**CONFIRMED** — Central inventory must account for direct reservations, OTA reservations, occupied
rooms, maintenance, other inventory blocks, and future channel allocations.

### 5.1 The inventory day

**PROPOSED**

```
room_type_inventory_day (room_type_id, date)
    total              units that physically exist
    ota_allotment      transitional block for OTA distribution        (§10)
    ota_reserved       OTA reservations recorded in KAS
    reserved           DIRECT holds and confirmed direct stays
    occupied           units in use by an in-house guest
    maintenance        units out of service
    other_blocks       group holds, owner use, staff, contingency     ← NEW (D-33)
```

```
availableDirect = total − ota_allotment − reserved − occupied − maintenance − other_blocks
otaHeadroom     = ota_allotment − ota_reserved
```

**Invariant — the oversell guarantee, unchanged in intent:**

```sql
CHECK (total - ota_allotment - reserved - occupied - maintenance - other_blocks >= 0)
```

### 5.2 A correction to my own earlier constraint

**PROPOSED — important.** [29](29-direct-sales-crm-architecture.md) §7.1 specified
`CHECK (ota_reserved <= ota_allotment)`. **That constraint is wrong and is withdrawn.**

It would cause the system to **reject the recording of a real reservation** when an OTA sold beyond its
allotment — which is entirely possible when the extranet has not been updated. The guest exists and is
arriving regardless of what our numbers say. Refusing to record them does not un-sell the room; it
only makes the property blind to an arrival.

**Corrected behaviour:**

```
recordOtaReservation(roomType, dates, qty):
    if ota_reserved + qty > ota_allotment:
        ota_allotment := ota_reserved + qty       -- auto-expand, consuming direct availability
        RAISE ALERT "OTA allotment exceeded"      -- operations must know
    ota_reserved += qty
    if the oversell CHECK would now fail:
        RECORD ANYWAY, RAISE P1 ALERT             -- the property is genuinely oversold
                                                  -- this needs a human, not a rejected insert
```

**PROPOSED — the principle:** *inventory availability fails closed; inventory recording fails open.*
Refusing to **sell** when uncertain is correct. Refusing to **record reality** is not.

### 5.3 Customer-facing availability

**CONFIRMED, unchanged** — Customers see `ROOM TYPE + AVAILABLE QUANTITY`. Physical room numbers are
never customer-facing. `availableDirect` is the number the website shows.

---

## 6. Central Rate Management

**CONFIRMED** — KAS has central rate management. The domain must be **capable** of base rate, rate
plan, direct rate, OTA rate, seasonal, weekend, promotional, restrictions, and taxes/fees — **without
over-engineering the V1 engine**.

### 6.1 The separation

```
┌─ V1 BASE PRICING MODEL ──────────────────────────────────────────┐
│  Base rate per room type, per room, per night, in VND            │
│  Date-range rules  ·  Day-of-week rules  ·  Seasonal periods     │
│  Minimum stay      ·  Taxes and service charge                   │
│  channelScope = ALL          ratePlan = NULL                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓ same tables, additional dimensions
┌─ FUTURE CHANNEL-SPECIFIC PRICING ────────────────────────────────┐
│  channelScope = DIRECT | BOOKING_COM | AGODA | CTRIP | TRAVELOKA │
│  Rate plans (breakfast included, non-refundable, advance)        │
│  Promotional rates  ·  Restrictions (CTA/CTD, min/max stay)      │
│  Channel-specific net vs sell rates                              │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 The rate rule shape

**PROPOSED** — Two nullable dimensions carry the entire future capability:

```
rate_rule
  scope             PROPERTY | ROOM_TYPE
  channel_scope     enum | null      -- NULL/ALL in V1. The channel-pricing hook
  rate_plan_id      uuid | null      -- NULL in V1. The rate-plan hook
  date_from, date_to
  days_of_week[]
  priority
  amount_minor | adjustment_percent
  min_stay, max_stay
  restrictions      jsonb | null     -- FUTURE: CTA, CTD, closed
  status
```

**PROPOSED** — V1 writes only `channel_scope = NULL` and `rate_plan_id = NULL`. Adding channel-specific
rates later is **data**, not a migration of the pricing engine. This is the "capable without
over-engineered" line.

### 6.3 Rate parity — a business constraint, not a technical one

**PROPOSED — flagged because it constrains what the model may be used for.** Rate parity clauses in
OTA contracts are predominantly *narrow parity* in this market: the **publicly visible direct rate**
must match OTA rates, while lower rates are permitted for **closed user groups** (members, logged-in
guests, targeted offers).

The domain is therefore built to support differential channel pricing, but **whether KAS may use it,
and how, is governed by its OTA contracts, not by this architecture.** Legal review required before
any channel-specific public rate is published. → **OQ-076**

### 6.4 Rate management is independent of the Sales CRM

**PROPOSED** — Central Rate Management sits in the **Commercial** area of admin, not in Direct Sales.
Rates are a property-level commercial asset consumed by every channel. A sales agent may apply a
voucher or an approved override to an individual lead, but does not set rates.

---

## 7. Customer 360

**CONFIRMED** — A customer may hold reservations from multiple channels over time and must remain one
Customer profile where identity matching is sufficiently reliable.

### 7.1 Model

```
Customer
  identity        verified email (primary) · phone · name
  reservations[]  every channel, every property, full history
  firstTouch      firstDistributionChannel, firstLeadSource   -- recorded once, never overwritten
  directLeads[]   direct requests, with source, owner, outcome
  reviews[]
  consent         per purpose and channel  (§9)
  preferences     language, currency, contact channel, contact time
  internalNotes
  mergeHistory
```

Approved example:

```
Nguyen Van A
  #001  BOOKING_COM        Mar 2026   completed
  #002  DIRECT / WEBSITE   Jun 2026   completed
  #003  DIRECT / FACEBOOK  Sep 2026   confirmed
  firstTouch: BOOKING_COM   ← the OTA→direct conversion is now measurable
```

### 7.2 Identity matching

**PROPOSED** — Confidence-tiered. **Never auto-merge on a weak signal.**

| Signal | Confidence | Action |
|---|---|---|
| Verified email exact match | High | Auto-link |
| Phone exact match (normalised E.164) + name similarity | Medium-high | Auto-link, flag for review |
| Name + partial contact | Low | **Surface as a merge candidate; never auto-merge** |
| Same OTA masked alias | — | See §7.3 |

Merges are reversible, audit-logged, and reviewed by a human. A wrong merge exposes one guest's stay
history to another — a privacy incident, not a data-quality issue.

### 7.3 The OTA identity problem

**PROPOSED — a real constraint that limits what Customer 360 and §9 can deliver.**

OTAs commonly supply **masked or aliased contact details** rather than the guest's real address
(Booking.com's `@guest.booking.com` virtual addresses are the common case), and those aliases often
**stop routing after the stay window closes**. Phone numbers may be similarly masked.

Consequences that must not be assumed away:

- Identity matching on OTA-supplied email will frequently **fail**, so an OTA guest may not link to an
  existing customer even when they are the same person.
- A post-stay review invitation sent to a masked alias may **never arrive**.
- The most reliable capture point for a real address is **at check-in, at the property**, with consent
  — an operational process, not a system feature.

→ **OQ-077**

---

## 8. Operational Hub

**CONFIRMED** — KAS Admin is the operational hub for all reservations across all 8 properties.

### 8.1 What this means concretely

| Capability | Includes |
|---|---|
| **Arrivals** | Direct **and** OTA **and** walk-in, one list per property per date |
| **Departures** | All channels |
| **In-house / occupancy** | All channels |
| **Inventory** | All consumption, whatever its origin |
| **Reservation search** | By reference, guest, property, dates — across all channels |
| **Guest history** | Customer 360 across channels |

### 8.2 What it does *not* mean

**CONFIRMED** — Operational visibility is **not** Direct Sales CRM ownership.

- OTA reservations appear in Operations. They **never** appear in the Direct Sales Queue.
- OTA reservations have **no** sales owner, **no** lead source, **no** SLA, **no** follow-up.
- The separation is enforced by the §3.1 CHECK constraint, not by UI filtering alone.

### 8.3 Admin information architecture — three areas

**CONFIRMED**

```
DIRECT SALES              OPERATIONS                DISTRIBUTION
  Direct Requests           All Reservations          OTA Reservations
  Follow-ups                Arrivals                  Channel Status
  Sales Assignments         Departures                Channel Manager (FUTURE)
  Lead Source Analytics     Occupancy                 Sync Status (FUTURE)
                            Inventory
```

**CONFIRMED** — These must not be collapsed into one generic "Sales" module. Applied to
[21-admin-navigation.md](21-admin-navigation.md) §2.

---

## 9. OTA guest lifecycle & communication separation

**CONFIRMED** — OTA guests are real KAS guests operationally. A recorded OTA reservation that reaches a
completed stay makes the guest eligible for the completed-stay lifecycle, post-stay communication,
review invitation, and a verified review. **OTA guests must not be automatically excluded from KAS
reviews.**

**CONFIRMED** — Marketing eligibility must **not** be assumed. Transactional and marketing
communication are separate.

### 9.1 Two communication classes

**PROPOSED**

| | **Transactional / Stay** | **Marketing** |
|---|---|---|
| Purpose | Operating the stay the guest has | Promoting future stays |
| Examples | Confirmation, pre-arrival, check-in, check-out, invoice, service messages | Offers, campaigns, newsletters, "book direct next time" |
| Direct guests | Permitted — operationally necessary | **Explicit opt-in required** |
| OTA guests | Permitted where contact details work — see §7.3 | **Never assumed.** Requires explicit consent **and** OTA-contract review |
| Legal basis | Performance of the stay | Consent |
| Consent record | Not required | Required, timestamped, per purpose, revocable |

### 9.2 The review invitation

**PROPOSED — flagged as a boundary case, deliberately not resolved unilaterally.**

A review invitation for a stay the guest actually completed is, in our reading, **service
communication** rather than marketing — it solicits feedback, not a purchase. On that basis OTA guests
receive it, satisfying the confirmed decision.

However: OTA agreements commonly restrict the use of guest data obtained through the channel for
solicitation, and the boundary between "please review your stay" and "book with us directly next time"
is exactly where those restrictions bite. **The invitation must contain no direct-booking
solicitation** for OTA guests, or it converts into marketing.

Legal and contract review required before launch. → **OQ-078**

### 9.3 Verified review eligibility

**PROPOSED** — Eligibility depends on a **completed stay**, not on the channel:

```
canReview(reservation) =
      reservation.stayStatus == COMPLETED
  AND reservation.customerId == currentUser.id
  AND no existing review for this reservation
  AND within the review window
```

`distributionChannel` does not appear. An OTA guest who creates a KAS account matched to their
reservation may leave a **Verified Stay** review on identical terms — subject to §7.3's practical
constraint that identity matching may fail.

---

## 10. V1 transitional process — hybrid inventory

**CONFIRMED** — Do not lock KAS into pure allotment. Do not lock KAS into pure manual entry. Use a
**hybrid transitional model** for V1, clearly marked as transitional.

### 10.1 The V1 process

```
OTA (Booking.com | Agoda | Ctrip | Traveloka)
        │
        ▼  reservation received in the OTA extranet
   KAS Admin records / imports the reservation      ← TRANSITIONAL, manual
        │
        ▼
   CENTRAL RESERVATION  (one entity, stayStatus = CONFIRMED)
        │
        ▼
   CENTRAL INVENTORY updated (ota_reserved)
        │
        ▼
   Visible in Operations: arrivals, occupancy, departures
```

### 10.2 The hybrid, and how it retires itself

**PROPOSED**

| Layer | Role | Retirement |
|---|---|---|
| **Safety buffer** (`ota_allotment`) | Transitional. **Configurable per property + room type + date range/season** (§10.4). Protects direct availability while recording discipline is unproven | Shrinks toward 0 as recording proves reliable |
| **Recording** (`ota_reserved`) | Operational truth — arrivals, occupancy, Customer 360, review eligibility | Replaced by automated import |
| **Channel manager** | Real-time two-way sync | Makes both layers unnecessary |

**PROPOSED — the transition, stated as a sequence so it is not open-ended:**

```
Stage 1 (launch)     Generous allotment + manual recording.  Safety over yield.
Stage 2 (+3 months)  Allotment reduced as recording reliability is measured.
Stage 3              Allotment → minimal. Recording is the operational truth.
Stage 4 (FUTURE)     Channel manager. Allotment → 0. Recording automated.
```

**PROPOSED — exit criteria for stage 2**, so the buffer is retired on evidence rather than optimism.
**The measurements are defined here; the thresholds are not — no SLA is invented.**

| Measurement | Threshold |
|---|---|
| OTA recording lag (received → recorded) | **Business-supplied — OQ-081** |
| Unexplained buffer overflows | **PROPOSED**: zero, over a business-agreed observation period |
| Daily reconciliation variance vs the extranets | **PROPOSED**: a business-agreed tolerance |

### 10.3 Transitional, explicitly

**CONFIRMED** — Manual OTA entry is **not** the permanent solution and must not be documented,
resourced, or designed as if it were. Every screen, process and metric supporting it is marked
`TRANSITIONAL — V1` in the admin console, so the organisation does not quietly accept it as normal.

### 10.4 OQ-074 resolved — the safety buffer is configurable, not fixed

**CONFIRMED (Phase 3.5)** — **No universal percentage or room count is hard-coded.** The V1 safety
buffer is admin-configurable by:

```
PROPERTY  +  ROOM TYPE  +  DATE RANGE / SEASON
```

Schema: `ota_safety_buffer_rule` ([13](13-database-domain-overview.md) §3.4c).

| Dimension | Why it must vary |
|---|---|
| Property | Eight properties with different OTA dependence |
| Room type | A type an OTA sells heavily needs a different buffer from one it rarely sells |
| Date range / season | Tết, holidays and high season have entirely different channel behaviour |

**PROPOSED mechanics:** rules resolve by priority, most specific first · `PERCENTAGE` is of `total` and
**rounds up** (under-buffering is the costlier error) · the effective buffer is **clamped** so it can
never drive availability negative:

```
effectiveBuffer = min(configuredBuffer,
                      total − reserved − occupied − maintenance − other_blocks)
```

> ⚠ **BUSINESS CONFIGURATION REQUIRED BEFORE PRODUCTION LAUNCH — OQ-074.**
> **No initial numerical value has been invented.** The system ships with the mechanism and **no
> default rule**; with none configured, `ota_allotment = 0`. Values per property, room type and season
> must be supplied by KAS, and sizing depends on the channel volume data still open under **OQ-033**.

**CONFIRMED** — The buffer is **transitional, not permanent architecture.**

### 10.5 OQ-075 resolved — who records OTA reservations

**CONFIRMED (Phase 3.5)** — OTA reservations are **operational reservations**, **not** handled by KAS
Sales.

```
OTA  →  Hotel operational staff / authorised Admin  →  Record OTA reservation in KAS
     →  Central Reservation  →  Central Inventory update
```

| | |
|---|---|
| **Who** | **Property Admin · Reservation Staff · Front Desk** |
| **V1 mapping** | Property-scoped `ADMIN` and `SUPER_ADMIN`, via permission `reservation.ota.record` |
| **Future roles** | `HOTEL_MANAGER` (Property Admin) · `RECEPTIONIST` (Front Desk) · `RESERVATIONS_STAFF` — additive, no restructuring ([06](06-user-roles.md) §2.5) |
| **Never** | KAS Sales. **No sales owner is created for an OTA reservation** — enforced by CHECK constraint |
| **Channel recorded explicitly** | `BOOKING_COM` · `AGODA` · `CTRIP` · `TRAVELOKA` |
| **Timing principle** | **Record as soon as operationally possible after receipt** |
| **SLA** | ⚠ **Not invented.** Recording lag is measured and reported; the acceptable threshold is business-supplied — **OQ-081** |

**PROPOSED** — Delivered as a **permission**, not a hard-coded role, so authority moves cleanly as
roles are introduced without touching the recording workflow.

---

## 11. State machine separation

**CONFIRMED (Amendment #5)** — Do not force `NEW` into the reservation state machine. Evaluate the
direct sales/request lifecycle against the reservation/stay lifecycle.

### 11.1 Why `NEW` cannot be a reservation state

**PROPOSED** — A reservation is *defined* by property + dates + room type + quantity. An unqualified
inquiry — *"Do you have rooms in September?"* — has none of them. Forcing it into the reservation
entity would require making all four nullable, which:

- breaks `CHECK (check_out > check_in)` and every constraint depending on dates
- makes the availability check meaningless (nothing to check)
- makes the price snapshot impossible (nothing to price)
- makes every downstream query null-aware for a state most reservations never occupy
- names a thing "reservation" that reserves nothing

### 11.2 The corrected model — two lifecycles, one reservation, one small inquiry

**PROPOSED**

```
┌─ INQUIRY (optional, DIRECT only) ────────────────────────────────┐
│  NEW → QUALIFIED → (creates a Reservation)                       │
│      → LOST                                                      │
│  Holds ONLY: contact fragment, leadSource, salesOwner,           │
│              inquiry text, optional property/date hint, follow-up│
│  Holds NO stay data — because none exists yet                    │
└──────────────────────────────────────────────────────────────────┘
                              │ qualification
                              ▼
┌─ RESERVATION (one entity, all channels) ─────────────────────────┐
│                                                                  │
│  salesStatus   (DIRECT only; NULL for OTA)                       │
│    REQUESTED → ASSIGNED → AVAILABILITY_CHECK → CUSTOMER_CONTACTED│
│      → ALTERNATIVE_OFFERED ⟳                                     │
│      → CONFIRMED | DECLINED | CANCELLED | EXPIRED                │
│                                                                  │
│  stayStatus    (all channels; NULL until confirmed)              │
│    CONFIRMED → CHECK_IN_READY → CHECKED_IN → CHECKED_OUT         │
│      → COMPLETED                                                 │
│    exceptions: CANCELLED, NO_SHOW                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
        ▲
        │ OTA reservations are created here directly:
        │   salesStatus = NULL, stayStatus = CONFIRMED
```

### 11.3 Why this is not the parallel Lead entity that Decision #4 prohibits

**PROPOSED** — Decision #4 prohibits a parallel Lead entity *"if the same object can represent the
direct booking request"*. It can, and it does: the **Reservation** represents the booking request in
`salesStatus = REQUESTED`, whether the customer created it on the website or sales created it from a
Facebook message. That requirement is fully satisfied.

The Inquiry is **not** a parallel booking request. It is a **pre-request conversation record**, and it
introduces **no data duplication** — because the fields it holds (a question, a contact fragment, a
lead source) are precisely the fields that do *not* yet exist as reservation data. At qualification it
hands off and becomes terminal; it never carries stay state, never consumes inventory, and never
appears in Operations.

The test that matters: *does any field exist in both objects at the same time for the same booking?*
**No.** Customer, lead source and sales owner transfer at qualification and the inquiry closes.

### 11.4 The handoff

**PROPOSED**

| Event | `salesStatus` | `stayStatus` | Inventory |
|---|---|---|---|
| Website request submitted | `REQUESTED` | `NULL` | direct hold placed |
| Inquiry qualified by sales | `REQUESTED` | `NULL` | direct hold placed |
| Sales confirms | `CONFIRMED` | `CONFIRMED` | hold becomes firm |
| OTA reservation recorded | **`NULL`** | `CONFIRMED` | `ota_reserved` |
| Arrival | `CONFIRMED` *(frozen)* | `CHECKED_IN` | `occupied` |

**PROPOSED — implementation note that prevents a whole class of bug:** *"confirmed reservations"* must
always be queried on **`stayStatus`**, never `salesStatus`. OTA reservations have no `salesStatus`, so
a `salesStatus` filter silently excludes every OTA reservation — from arrivals lists, occupancy, and
operational reporting. This is precisely the failure the operational hub decision exists to prevent.

**Phase 3 final:** Decision 2 makes this far harder to write by accident — `salesStatus` terminates at
**`WON`**, so the two fields no longer share the value `CONFIRMED` (§13.2).

### 11.5 Is the Inquiry stage needed in V1?

**PROPOSED — recommended yes, minimally.** The failure mode it prevents is the one the Direct Sales
CRM exists to address: a social message that never becomes a system record, goes quiet, and is lost
invisibly. It is a small object — a contact fragment, a source, an owner, a question, a follow-up date.

✅ **RESOLVED (Decision 1).** `sales_inquiry` **is included in V1** — KAS has an active direct/social
sales workflow. OQ-079 is closed. See §13.1.

---

## 12. Remaining open questions

### 12.1 Answered by these amendments

| ID | Question | Answer |
|---|---|---|
| **OQ-067** | V1 OTA inventory strategy | **Hybrid transitional** — allotment as a shrinking safety buffer plus recording (D-34, §10) |
| **OQ-069** | OTA guest lifecycle and review eligibility | **Eligible** for completed-stay lifecycle and verified reviews; marketing separated (D-36, §9) |
| **OQ-070** | Operational hub or direct sales platform | **Operational hub** (D-28, §8) |
| **OQ-073** | Unqualified `NEW` state | **Not a reservation state.** A separate lightweight Inquiry (D-32, §11) |
| **OQ-034** | Rate plans | **In the model, not in the V1 engine** (D-33, §6) |

### 12.2 New

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-074** | Inventory | Safety buffer | ✅ **RESOLVED STRUCTURALLY (Phase 3.5, §10.4)** — configurable by property + room type + date range/season. ⚠ **Initial values remain a business configuration required before production launch** |
| **OQ-075** | Operations | Who records OTA reservations | ✅ **RESOLVED (Phase 3.5, §10.5)** — operational staff: Property Admin, Reservation Staff, Front Desk. Never Sales. ⚠ **Recording SLA not invented — OQ-081** |
| **OQ-076** | Commercial / legal | Do KAS's OTA contracts permit differential channel pricing, and under what parity terms? | `OPEN` |
| **OQ-077** | Customer data | How are masked OTA contact details handled for identity matching and post-stay contact? Is real-address capture at check-in feasible? | `OPEN` |
| **OQ-078** | Legal | Does a post-stay review invitation to an OTA guest fall within OTA contract terms? | `OPEN` |
| **OQ-079** | Workflow | Is the lightweight Inquiry entity in V1 scope? | ✅ **RESOLVED (Decision 1)** — **yes, `sales_inquiry` is V1.** Closed and removed |

### 12.4 Phase 3.5 — new

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-080** | Workflow | Inquiry follow-up attempt limit before auto-`LOST` | `OPEN` |
| **OQ-081** | Operations | **Acceptable OTA recording lag.** The measurement is defined; the threshold is a business decision | `OPEN` |
| **OQ-082** | Engineering | `CONFIRMED` on both status fields, or rename the sales terminal? | ✅ **RESOLVED (Decision 2)** — `salesStatus` terminates at **`WON`**. `CONFIRMED` belongs to `stayStatus` alone. The semantic collision is eliminated |
| **OQ-083** | Inventory | Are alternative offers held in inventory, and for how long? | ✅ **RESOLVED (Decision 3)** — yes, via `ALTERNATIVE_OFFER` holds with mandatory expiry. Duration is `DIRECT_ALTERNATIVE_HOLD_DURATION`, a **business configuration required before launch** |

---

## 13. Final decision lock — Decisions 1 to 3

**CONFIRMED** — Applied across [14](14-booking-state-machine.md), [13](13-database-domain-overview.md),
[15](15-inventory-rules.md), [21](21-admin-navigation.md), [29](29-direct-sales-crm-architecture.md).

### 13.1 Decision 1 — `sales_inquiry` is V1

KAS has an active direct/social sales workflow, so the inquiry stage ships in V1. **OQ-079 is closed
and removed.**

```
NEW → QUALIFIED → creates Reservation
NEW | QUALIFIED → LOST
```

- Not a parallel booking entity. Once enough information exists it **continues into** the reservation
  workflow rather than running alongside it.
- **Holds no inventory** — it has no property, dates, room type or quantity.
- An `ALTERNATIVE_OFFER` hold may reference an inquiry, because *the hold* carries explicit stay
  parameters that the inquiry does not. That hold always has a mandatory expiry, so an abandoned
  inquiry can never lock inventory ([14](14-booking-state-machine.md) §3.2).

### 13.2 Decision 2 — `salesStatus` terminates at `WON`

**Resolves OQ-082.**

```
salesStatus   REQUESTED → ASSIGNED → AVAILABILITY_CHECK → CUSTOMER_CONTACTED
              → ALTERNATIVE_OFFERED → WON
              terminal: WON | DECLINED | CANCELLED | EXPIRED

stayStatus    CONFIRMED → CHECK_IN_READY → CHECKED_IN → CHECKED_OUT → COMPLETED
```

| | `salesStatus` | `stayStatus` |
|---|---|---|
| Direct, confirmed | **`WON`** | `CONFIRMED` |
| OTA, confirmed | **`NULL`** | `CONFIRMED` |

`WON` means the Direct Sales process successfully converted the request into a sale. The two fields no
longer share a value, so `status == CONFIRMED` can no longer be written ambiguously.

**The guest never sees `WON`** — it is sales-internal. The guest sees "Booking confirmed" once
`stayStatus = CONFIRMED`.

### 13.3 Decision 3 — alternative offer holds

**Resolves OQ-083.** When a requested room is unavailable and sales offers an alternative, KAS may
temporarily hold that inventory while awaiting the customer's response.

Required fields (all present in `inventory_hold`): `createdAt` · `expiresAt` · `createdBy` ·
reservation **or** inquiry reference · `propertyId` · `roomTypeId` · `quantity` · `status`.

| Safety requirement | Mechanism |
|---|---|
| No negative availability | Database CHECK constraint refuses the write |
| No double allocation | Row locking in deterministic order + unique constraint per (type, ref, room type, date) |
| No expired holds remaining active | Mandatory `expires_at` + idempotent 5-minute sweep + reconciliation job asserting `reserved` matches active holds |
| No permanent lock by abandoned inquiries | Every hold has a mandatory expiry regardless of what it references; `LOST` releases immediately |
| Availability never counts an expired hold | The availability query defensively excludes holds past `expires_at` even before the sweep runs |

> ⚠ **`DIRECT_ALTERNATIVE_HOLD_DURATION` is a business configuration required before production
> launch.** No default is invented. With none configured, placing an alternative hold fails with an
> error naming the missing setting rather than the system choosing a duration.

**PROPOSED** — Holding an alternative is an **explicit agent action**, not automatic. While both the
original request hold and an alternative hold are active, one guest temporarily consumes two sets of
rooms. That is a real cost, and it is why the duration is short and the agent is given an explicit
"release the original" action.

### 12.5 Business configuration required before production launch

**Not open questions — configuration values the system cannot invent.**

| Item | Owner |
|---|---|
| **OTA safety buffer values** per property, room type and season (OQ-074) | Revenue / Operations |
| **`DIRECT_ALTERNATIVE_HOLD_DURATION`** (Decision 3) | Sales / Revenue |
| **OTA recording lag threshold** (OQ-081) | Operations |
| Reconciliation variance tolerance | Operations |
| Direct hold duration (OQ-018) | Sales |
| "Within the day" boundary (OQ-051) | Sales |
| Cancellation and no-show policy (OQ-045) | Commercial / Legal |

### 12.3 Still blocking from earlier phases

| ID | Question |
|---|---|
| OQ-005 | Actual rates per room type per property |
| OQ-010 | Actual room type names and configurations |
| OQ-030 | Professional photography for all 8 properties |
| OQ-033 | Room-nights and revenue per distribution channel — now needed to size allotments |
| OQ-039 | Data residency / hosting region |
| OQ-045 | Cancellation and no-show policy |
| OQ-051 | Precise definition of "within the day" |
| OQ-055 | Pre-submit policies block before the cancellation policy exists |
| OQ-063 | Existing site URL inventory before cutover |
| OQ-027 | Vietnamese data protection review *(launch-blocking)* |
| OQ-004 | Brand assets *(blocks design)* |

**Total: 83 raised · 11 answered · 72 open · 11 blocking.**

*(Phase 3.5 resolved OQ-074 structurally and OQ-075 fully, and raised OQ-080 to OQ-083. OQ-074's and
OQ-075's residual numeric values moved to §12.5 as business configuration rather than open questions.)*
