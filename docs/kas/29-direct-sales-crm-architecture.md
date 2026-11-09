# 29 — Direct Sales CRM, Distribution Channels & Central Inventory

**Phase:** 1.5 — Business Model Correction
**Status:** Draft for approval
**Last updated:** 2026-08-14

> This document supersedes any earlier statement that treats reservation origin as a single field, or
> that routes OTA reservations through the KAS Sales workflow. Corrections applied to earlier documents
> are listed in §12.

---

## 1. The correction

**CONFIRMED** — KAS Sales does **not** manage OTA customers. The Sales team handles **direct customers
and direct leads**.

**CONFIRMED** — Direct lead sources: KAS Website · Facebook · Zalo · TikTok · Instagram · Phone ·
Walk-in · Referral · Returning Customer · other direct marketing channels. A customer who discovers KAS
through Facebook, Zalo, TikTok or Instagram and then contacts KAS Sales is a **DIRECT CUSTOMER**.

**CONFIRMED** — KAS distributes rooms through Booking.com, Agoda, Ctrip/Trip.com and Traveloka. These
are **external distribution channels**. OTA reservations must **not** be treated as KAS Sales CRM leads
and must **not** be routed through the Sales Queue, Sales Assignment, or the direct lead workflow.

**CONFIRMED** — The system must distinguish **three independent concepts**, never one generic field.

---

## 2. The three concepts

**CONFIRMED**

| Concept | Answers | Applies to |
|---|---|---|
| **DISTRIBUTION CHANNEL** | *"Where was this room reservation sold?"* | Every reservation |
| **LEAD SOURCE** | *"How did this direct customer reach KAS?"* | **Direct only** |
| **SALES OWNER** | *"Which KAS Sales employee is responsible for this direct lead?"* | **Direct only** |

### 2.1 Distribution channel

**CONFIRMED** — `DIRECT` · `BOOKING_COM` · `AGODA` · `CTRIP` · `TRAVELOKA`

**PROPOSED** — Modelled as a managed reference table, not a hard-coded enum, so a new OTA (Expedia,
Klook, Airbnb) is a configuration change. Each channel carries: code, display name, type
(`DIRECT` | `OTA`), active flag, and — **FUTURE** — commission basis.

### 2.2 Lead source

**CONFIRMED** — `WEBSITE` · `FACEBOOK` · `ZALO` · `TIKTOK` · `INSTAGRAM` · `PHONE` · `WALK_IN` ·
`REFERRAL` · `RETURNING_CUSTOMER` · `OTHER`

**PROPOSED** — Grouped for reporting without collapsing the detail:

| Group | Sources |
|---|---|
| **Owned** | `WEBSITE` |
| **Social** | `FACEBOOK` · `ZALO` · `TIKTOK` · `INSTAGRAM` |
| **Human** | `PHONE` · `WALK_IN` |
| **Relationship** | `REFERRAL` · `RETURNING_CUSTOMER` |
| **Unclassified** | `OTHER` |

**PROPOSED** — Two supporting fields:

- `leadSourceDetail` — free text or campaign tag. For `REFERRAL`, who referred them. For social, the
  post or campaign. For `OTHER`, what it actually was.
- `leadSourceNote` — the agent's own words, for cases the taxonomy does not fit.

### 2.3 Sales owner

**CONFIRMED** — The KAS Sales employee responsible for a direct lead.

**PROPOSED** — A user reference with a full assignment history (who, when, by whom, why). Ownership is
a fact about a **direct lead**, never about an OTA reservation.

---

## 3. The binding invariant

**PROPOSED** — This is the rule that makes the correction structural rather than a naming convention.
It is enforced by a database constraint, not by developer discipline.

```
IF distributionChannel.type = DIRECT
    leadSource   REQUIRED
    salesOwner   PERMITTED
    entersSalesQueue = TRUE

IF distributionChannel.type = OTA
    leadSource   MUST BE NULL
    salesOwner   MUST BE NULL
    entersSalesQueue = FALSE
```

```sql
CHECK (
  (channel_type = 'DIRECT' AND lead_source IS NOT NULL)
  OR
  (channel_type = 'OTA' AND lead_source IS NULL AND sales_owner_id IS NULL)
)
```

**PROPOSED** — Consequences that follow automatically:

- An OTA reservation **cannot** be assigned to a sales agent — the column must be null.
- An OTA reservation **cannot** appear in the direct lead queue — the queue's defining filter is
  `channel_type = 'DIRECT'`.
- A direct lead **cannot** be saved without a lead source — sales must record how the customer reached
  KAS.
- No report can accidentally merge the two, because there is no single field to group by.

---

## 4. Reservation model

**PROPOSED** — One reservation entity, two entry points. This is the central design decision of this
document, and the reasoning matters.

```
                    DIRECT                                  OTA
                      │                                      │
        ┌─────────────┴─────────────┐                        │
        │                           │                        │
   Website request            Sales-created lead        OTA reservation
   (guest self-serve)         (FB/Zalo/phone/walk-in)   (sold externally)
        │                           │                        │
        └─────────────┬─────────────┘                        │
                      ▼                                      ▼
              DIRECT LEAD                            arrives already sold
        (booking request + sales workflow)                   │
                      │                                      │
                      ▼                                      ▼
        ┌──────────────────────────────────────────────────────┐
        │                   RESERVATION                        │
        │   one entity · one inventory consumer · one stay     │
        └──────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    CENTRAL INVENTORY  (§7)
```

### 4.1 Why one reservation entity, not two

**PROPOSED**

| Argument | Detail |
|---|---|
| **The stay is identical** | Check-in, occupancy, housekeeping, departure and the guest experience do not vary by where the room was sold. The front desk does not care |
| **Inventory must be single-source** | Two reservation tables means two writers to the availability calculation — the exact structure that produces oversells |
| **Arrivals must be one list** | A property's arrivals for 12 September are all arrivals. Splitting them by channel would be operationally absurd |
| **What differs is the *sales process*, not the *stay*** | And that difference is fully expressed by `distributionChannel`, `leadSource`, `salesOwner`, and lifecycle entry point |

### 4.2 Two entry points into the lifecycle

**PROPOSED** — OTA reservations do not traverse the sales states; they enter the lifecycle already sold.

| | Direct | OTA |
|---|---|---|
| Enters at | `DRAFT` / `REQUESTED` | **`CONFIRMED`** |
| Sales states traversed | All ([14](14-booking-state-machine.md)) | **None** |
| Sales owner | Assigned | **Never** |
| Lead source | Required | **Null** |
| Sales queue | Yes | **No** |
| Availability check by sales | Yes | Already committed externally |
| Payment recording | KAS records it | Handled by the OTA per its own terms |
| Stay lifecycle | `CHECK_IN_READY` → `CHECKED_IN` → `CHECKED_OUT` → `COMPLETED` | **Identical** |
| Guest lifecycle emails | Full KAS programme | ⚠ **NEEDS CONFIRMATION — OQ-069** |

**PROPOSED** — This is a clean extension of the existing state machine, not a rewrite: an OTA
reservation simply **enters at a later state**. No new terminal states, no parallel lifecycle, no
duplicated inventory logic.

---

## 5. Direct Sales CRM — Lead Management

**CONFIRMED** — Design a future-ready Direct Sales CRM / Lead Management concept.

### 5.1 A direct lead *is* a booking request

**PROPOSED** — They are the same object created through different doors:

| Door | Who creates it | Lead source |
|---|---|---|
| Website "Request This Stay" | The guest, self-serve | `WEBSITE` |
| Facebook / Zalo / TikTok / Instagram message | Sales, on the customer's behalf | `FACEBOOK` etc. |
| Phone call | Sales | `PHONE` |
| Walk-in enquiry | Sales / front desk | `WALK_IN` |
| Referral | Sales | `REFERRAL` |
| Returning guest contacting KAS directly | Sales | `RETURNING_CUSTOMER` |

Modelling these as one entity means: one state machine, one availability check, one price snapshot, one
inventory hold, one set of guest communications, one conversion metric. A parallel "lead" entity beside
"booking request" would duplicate all of it and immediately drift.

**Guest-facing vocabulary is unchanged.** The guest sees **booking request**. The internal CRM term is
**direct lead**. These two vocabularies deliberately differ, consistent with the existing principle that
guests never see internal terminology ([27](27-request-status-architecture.md) §3.1).

### 5.2 Lead lifecycle

**PROPOSED**

```
NEW ──qualify──> REQUESTED ──> ASSIGNED ──> AVAILABILITY CHECK ──> CONTACT CUSTOMER
 │                                                                        │
 │ (unqualified enquiry:                          ┌───────────────────────┴──────────┐
 │  customer + source known,                      │            │                     │
 │  dates/rooms not yet)                     CONFIRM      ALTERNATIVE            DECLINE
 │                                                │            │                     │
 └──> LOST (no dates, no response)                └──> PAYMENT RECORDING ──> CONFIRMED
```

> ## ⚠ AMENDED — Phase 3 (D-32). The diagram above is superseded.
>
> Putting `NEW` into the reservation lifecycle was a **design error**. A reservation is defined by
> property + dates + room type + quantity; an unqualified inquiry has none of them. Forcing it in would
> make all four nullable, break every constraint depending on them, make the availability check and
> price snapshot meaningless, and name a thing "reservation" that reserves nothing.
>
> **Corrected model — two lifecycles, one reservation, one small inquiry:**
>
> ```
> SALES INQUIRY (optional, DIRECT only)     NEW → QUALIFIED → creates a Reservation
>                                               → LOST
>                       │ qualification
>                       ▼
> RESERVATION           salesStatus  (DIRECT only, NULL for OTA)
>                         REQUESTED → ASSIGNED → AVAILABILITY_CHECK
>                         → CUSTOMER_CONTACTED → ALTERNATIVE_OFFERED ⟳
>                         → CONFIRMED | DECLINED | CANCELLED | EXPIRED
>
>                       stayStatus   (all channels, NULL until confirmed)
>                         CONFIRMED → CHECK_IN_READY → CHECKED_IN
>                         → CHECKED_OUT → COMPLETED    exc: CANCELLED, NO_SHOW
> ```
>
> **This is not the parallel Lead entity Decision #4 prohibits.** The Reservation still represents the
> direct booking request (`salesStatus = REQUESTED`), created either by the customer on the website or
> by sales on their behalf. The Inquiry is a **pre-request conversation record** holding only fields
> that do *not* yet exist as reservation data — so there is **no duplication**. At qualification it
> hands off and becomes terminal.
>
> Full reasoning: [50-phase-3-amendments.md](50-phase-3-amendments.md) §11.
> **PHASE 3 FINAL DECISION LOCK — applied:**
> **(1)** `sales_inquiry` **is included in V1** (OQ-079 closed).
> **(2)** `salesStatus` terminates at **`WON`**, not `CONFIRMED` — `CONFIRMED` belongs to `stayStatus`
> alone, eliminating the semantic collision (OQ-082 resolved).
> **(3)** Alternative offers may create **temporary inventory holds** with mandatory expiry, duration
> from `DIRECT_ALTERNATIVE_HOLD_DURATION` (OQ-083 resolved).
>
> ```
> salesStatus  REQUESTED → ASSIGNED → AVAILABILITY_CHECK → CUSTOMER_CONTACTED
>              → ALTERNATIVE_OFFERED → WON
>              terminal: WON | DECLINED | CANCELLED | EXPIRED
> stayStatus   CONFIRMED → CHECK_IN_READY → CHECKED_IN → CHECKED_OUT → COMPLETED
> OTA          salesStatus = NULL · stayStatus = CONFIRMED
> ```
>
> Also resolves OQ-053, OQ-054, OQ-066, OQ-073. Canonical spec:
> [14-booking-state-machine.md](14-booking-state-machine.md).

### 5.3 Capabilities

**CONFIRMED** — Required sales capabilities, mapped to the IA.

| Capability | Where | Notes |
|---|---|---|
| Create a direct lead manually | `/admin/leads/new` | Property, dates, room types, quantities optional at `NEW` |
| Capture lead source | Lead header — **required** | Plus `leadSourceDetail` and note |
| Capture customer information | Guest panel | Search existing customers first; create or link |
| Capture requested property | Stay panel | Single property per lead (OQ-014) |
| Capture dates | Stay panel | Live availability preview as entered |
| Capture room types and quantities | Stay panel | Per-line, with per-night availability |
| Record customer conversation | Contact log | Channel, direction, outcome, notes, timestamp, agent |
| Record internal notes | 🔒 Internal notes | **Never guest-visible** ([21](21-admin-navigation.md) §5.4) |
| Assign sales owner | Header action | With assignment history |
| Check availability | Workflow panel | Live re-check at any moment |
| Offer alternatives | Workflow panel | Up to 3, availability-checked at send ([27](27-request-status-architecture.md) §8) |
| Send customer messages | 👁 Guest-visible messages | Explicit preview before send |
| Record payment information | Payment panel | Recording a fact, not processing a payment |
| Convert to confirmed stay | Workflow panel | Transitions the reservation to `CONFIRMED` |
| Track follow-up | Follow-up panel | See §5.4 |
| View lead history | Customer record | All leads and stays for this customer, any channel |

### 5.4 Follow-up tracking

**PROPOSED** — The capability most likely to be missing from a hotel's process and most likely to
recover revenue.

| Element | Behaviour |
|---|---|
| `nextFollowUpAt` | Set by the agent, or defaulted by lead state |
| Follow-up queue | A saved view: "Due today", "Overdue" |
| Reminder | In-app notification to the sales owner |
| Attempt log | Each attempt recorded with channel and outcome |
| Attempt limit | After *N* attempts with no response (**PROPOSED**: 3), prompt to mark `LOST`/`EXPIRED` with a reason |
| Ageing | Days since last customer contact, shown in the queue |

**PROPOSED** — A social lead that goes quiet is the most common failure mode in messaging-channel
sales. Follow-up must be a **scheduled obligation**, not a memory.

### 5.5 Lead workspace

**PROPOSED** — The Phase 1.5 request workspace ([21](21-admin-navigation.md) §5.2), extended with a
lead identity band:

```
KAS-260912-4F7A                                    ⦿ New · 47m · within promise

┌ LEAD ──────────────────────────────────────────────────────────────────────┐
│  Distribution   DIRECT          Lead source   FACEBOOK                      │
│  Sales owner    — [Assign to me]  Detail      "Sep rooftop post"            │
│  Next follow-up —                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌ CUSTOMER & STAY ───────┬ WORKFLOW ──────────────┬ HISTORY ──────────────────┐
│ Nguyen Van A           │ ① Availability check   │ Timeline                  │
│ +84 … · Zalo preferred │ ② Contact customer     │ Contact log               │
│ 2 previous stays       │ ③ Confirm / Alt / Dec  │ Internal notes 🔒         │
│                        │ ④ Payment              │ Guest messages 👁         │
│ Milestone · 20–22 Sep  │ ⑤ Confirm booking      │ Changes · Emails          │
│ Deluxe × 2             │                        │                           │
└────────────────────────┴────────────────────────┴───────────────────────────┘
```

### 5.6 Worked example — the confirmed scenario

**CONFIRMED example**, expressed in the model:

> A customer sends a Facebook message: *"I want 2 Deluxe Rooms at KAS Milestone from September 20 to
> September 22."*

```
Reservation
  reference             KAS-260914-7K2M
  distributionChannel   DIRECT
  channelType           DIRECT
  leadSource            FACEBOOK
  leadSourceDetail      "Rooftop reel, 12 Sep"
  salesOwner            Sales Agent A
  customer              Nguyen Van A
  property              KAS Milestone Premium Hotel
  lines                 Deluxe Room × 2
  checkIn / checkOut    2026-09-20 → 2026-09-22   (2 nights)
  status                REQUESTED
  createdBy             Sales Agent A            ← created on the customer's behalf
  enteredSalesQueue     true
```

This is a **direct social lead** handled by KAS Sales. It consumes central inventory identically to a
website request and appears in direct sales reporting under lead source `FACEBOOK`.

---

## 6. OTA reservations

**PROPOSED** — What OTA reservations are, and what they are not.

| They are | They are not |
|---|---|
| Reservations that consume central inventory | Sales leads |
| Guests who will arrive, stay, and depart | CRM records requiring assignment |
| A distribution performance data point | A direct sales performance data point |
| A future direct-conversion opportunity | A queue item |

### 6.1 The OTA reservation register

**PROPOSED** — `/admin/reservations?channel=OTA`. A **register**, not a queue: read-mostly, no
assignment, no SLA, no follow-up, no sales workflow.

| Field | Source in V1 |
|---|---|
| Distribution channel | Selected on entry |
| OTA reference | From the OTA extranet |
| Guest name and contact | As supplied by the OTA (often masked) |
| Property, dates, room type, quantity | Manually entered |
| Rate / net amount | As supplied — ⚠ commission data availability is OQ-072 |
| Status | Enters at `CONFIRMED` |

**CONFIRMED** — **Do not build OTA integrations in V1. Do not assume exact OTA APIs.** A future channel
manager is responsible for synchronisation.

**PROPOSED** — The V1 entry path is therefore manual, and the IA must make manual entry fast: a
single-screen form, keyboard-driven, with duplicate detection on OTA reference.

### 6.2 Future channel manager

**FUTURE** — When a channel manager arrives it becomes an **adapter behind a port**, consistent with the
confirmed vendor-independence rule ([12](12-recommended-stack.md) §4):

```
ChannelManagerProvider
  pushAvailability(roomType, dateRange, quantity)
  pushRates(roomType, dateRange, amount)
  pullReservations(since) → OtaReservation[]
  acknowledge(reservationId)
```

No OTA-specific API shape is assumed anywhere in the domain. Adding Booking.com, Agoda, Ctrip or
Traveloka is an adapter and a channel row — never a change to the reservation model.

---

## 7. Central inventory

**CONFIRMED** — Direct reservations + OTA reservations + operational inventory changes must eventually
feed a **centralised availability model**.

### 7.1 The extended inventory day

**PROPOSED** — Extending [15-inventory-rules.md](15-inventory-rules.md) §1 with channel awareness:

```
room_type_inventory_day (room_type_id, date)
    total              units that physically exist
    ota_allotment      units held back for OTA distribution        ← NEW
    ota_reserved       OTA reservations recorded in KAS            ← NEW
    reserved           DIRECT holds and confirmed direct stays
    occupied           units in use by an in-house guest
    maintenance        units out of service
```

```
availableDirect = total − ota_allotment − reserved − occupied − maintenance
availableOta    = ota_allotment − ota_reserved        (informational in V1)
```

**Invariant, enforced by a CHECK constraint:**

```
total − ota_allotment − reserved − occupied − maintenance ≥ 0
ota_reserved ≤ ota_allotment
```

**PROPOSED** — `availableDirect` is what the website shows and what the direct sales queue checks. It is
still **derived, never editable** — the Phase 1 rule is unchanged.

### 7.2 Two strategies for V1, and a recommendation

**PROPOSED** — With no channel manager, KAS must choose how OTA and direct inventory coexist.

| Strategy | How it works | Trade-off |
|---|---|---|
| **A · Allotment** *(recommended)* | A block of rooms per room type per date is reserved for OTA distribution. Direct availability excludes it. The OTA extranet remains authoritative for its own block | **Structurally cannot oversell.** No manual entry burden. Cost: allotted rooms unsold on an OTA are also unsellable direct — real revenue leakage |
| **B · Manual entry** | Every OTA reservation is entered into KAS as it arrives, consuming inventory | Maximum sellable inventory, full arrivals visibility. Cost: **correctness depends entirely on a manual process** — one missed entry is an oversell |
| **C · Hybrid** | A small allotment as a safety buffer, plus manual entry, with the buffer shrinking as the process proves itself | Balanced; needs care not to double-count. An entered OTA reservation must consume `ota_reserved`, never `reserved` |

> ## ⚠ AMENDED — Phase 3 (D-34). OQ-067 is answered: **Strategy C — hybrid transitional.**
>
> My earlier recommendation was "start with A (allotment)". That was correct **given the assumption
> that OTA reservations might never be recorded**. Decision D-28 — *KAS Admin is the operational hub* —
> removes that assumption. With OTA reservations recorded, allotment stops being the oversell defence
> and becomes a **shrinking safety buffer**.
>
> ```
> Stage 1 (launch)     Generous allotment + manual recording.  Safety over yield.
> Stage 2 (+3 months)  Allotment reduced as recording reliability is measured.
> Stage 3              Allotment minimal. Recording is the operational truth.
> Stage 4 (FUTURE)     Channel manager. Allotment → 0. Recording automated.
> ```
>
> **Stage 2 exit criteria — measurements defined, thresholds business-supplied.** No SLA is invented:
> OTA recording lag (**threshold: OQ-081**) · unexplained buffer overflows · daily reconciliation
> variance against the extranets.
>
> **Phase 3.5:** the buffer is **configurable by property + room type + date range/season**
> ([13](13-database-domain-overview.md) §3.4c). Initial values are a **business configuration required
> before production launch** — none has been invented (OQ-074).
>
> **CONFIRMED** — Manual OTA entry is **transitional, not permanent**, and is labelled
> `TRANSITIONAL — V1` throughout admin.
>
> Also withdrawn: the `CHECK (ota_reserved <= ota_allotment)` constraint in §7.1 — it would refuse to
> record a real reservation when a channel oversells its block. **Availability fails closed; recording
> fails open.** See [50-phase-3-amendments.md](50-phase-3-amendments.md) §5.2 and §10.
>
> Allotment sizing for stage 1 is **OQ-074**; the recording process owner and acceptable lag are
> **OQ-075**; channel volume data is still **OQ-033**.

### 7.3 Arrivals and operations

**PROPOSED** — Regardless of strategy, the **arrivals list must be complete**. A front desk that cannot
see its OTA arrivals is not operating.

If strategy A is chosen without manual entry, OTA arrivals are **not** in KAS, and the property must
continue using the OTA extranets for its arrivals list. That is workable but it means KAS is not the
operational system of record for stays — only for direct sales and for direct availability.

**PROPOSED** — This is worth stating explicitly to the product owner, because it determines whether
KAS Admin is *a direct sales platform* or *the property's operational hub*. They are different products
with different scopes. → **OQ-070**

---

## 8. Admin dashboard — the two performance domains

**CONFIRMED** — The Admin system must distinguish **Direct Sales Performance** from **OTA Distribution
Performance**. Do not combine these into one generic "sales source" field.

**PROPOSED** — Two separate reporting surfaces, never one chart with mixed series.

### 8.1 Direct Sales Performance — `/admin/analytics/direct-sales`

| Metric | Dimension |
|---|---|
| Leads received | By lead source, source group, property, period |
| Lead → confirmed conversion | By lead source — *the single most valuable number in this whole system* |
| Time to first contact / SLA compliance | By sales owner, by lead source |
| Direct revenue and average stay value | By lead source, property |
| Sales owner performance | Leads handled, conversion, response time |
| Lost and expired leads | By reason, by source |
| Follow-up compliance | Overdue follow-ups by owner |
| Alternatives offered → accepted | Recovery effectiveness |

**PROPOSED** — Conversion by lead source is what tells KAS whether TikTok is worth the effort, whether
Zalo outperforms Facebook, and whether the website is earning its build cost. No other metric in the
platform answers a commercial question that directly.

### 8.2 OTA Distribution Performance — `/admin/analytics/distribution`

| Metric | Dimension |
|---|---|
| Reservations and room-nights | By OTA channel, property, period |
| Channel mix | Direct share vs each OTA — the headline number |
| Allotment utilisation | Allotted vs sold, by channel and date |
| Average rate and net value | By channel — ⚠ depends on commission data (OQ-072) |
| Lead time to arrival | By channel |
| Cancellation rate | By channel |

**PROPOSED — the one place the two domains meet:** a **channel mix** view showing direct share against
total. That is a legitimate, deliberate comparison — it is the group's core commercial question — and
it compares *channels*, not *sales sources*. It is presented as distribution mix, never as sales
performance.

### 8.3 Dashboard separation rules

**PROPOSED**

1. No chart groups direct lead sources and OTA channels on one axis.
2. No metric named "bookings by source" exists. It is either "leads by lead source" or "reservations by
   distribution channel".
3. Sales owner metrics **exclude** OTA reservations by construction — they have no owner.
4. SLA and response-time metrics apply to direct leads only. An OTA reservation has no response time.
5. Revenue reporting states channel explicitly, because net value differs materially once commission
   is accounted for.

---

## 9. Customer records across channels

**PROPOSED** — A customer is a person, not a channel.

| Rule | Detail |
|---|---|
| One customer record | A guest who books via Agoda in March and direct via Zalo in June is **one customer** with two reservations on two channels |
| Matching | By verified email, then phone. Duplicates surfaced for manual merge, never merged automatically on a weak signal |
| History view | The customer record shows all reservations with their channel and, where direct, lead source and owner |
| First-touch attribution | `customer.firstDistributionChannel` and `firstLeadSource` are recorded once and never overwritten — this is how "OTA guest converted to direct" becomes measurable |
| `RETURNING_CUSTOMER` as a lead source | Means *they came back directly because they had stayed before*. Distinct from the customer record simply showing prior stays. Both matter, and they are different facts |

**PROPOSED** — **OTA guests are the highest-value direct-conversion target KAS has.** They have already
stayed, already know the product, and cost commission last time. Recording their reservations (strategy
B or C in §7.2) is what makes a post-stay direct offer possible at all. This is a genuine commercial
argument for manual entry that has nothing to do with inventory.

---

## 10. Attribution

> ⚠ **NEEDS CONFIRMATION — OQ-068.** A customer sees a TikTok post, then submits a request on the
> website. Is the lead source `TIKTOK` or `WEBSITE`?

**PROPOSED** — A two-field answer, because one field cannot carry both facts honestly:

| Field | Definition | Example |
|---|---|---|
| `leadSource` | **The channel through which the lead reached KAS Sales.** Mechanical, unambiguous, always knowable | `WEBSITE` |
| `leadSourceDetail` / `discoveryChannel` | **How the customer says they found KAS.** Self-reported, optional | `TIKTOK` |

For website requests this is captured by an optional *"How did you hear about us?"* field on the
details step — one control, optional, no impact on completion rate.

**PROPOSED** — This keeps `leadSource` clean and reportable (it is never a guess), while preserving the
marketing attribution that makes social spend measurable. Conflating them would make every conversion
number arguable.

---

## 11. Terminology

**CONFIRMED** — Required terms, and the generic usage that is prohibited.

| Use | Definition | Never use |
|---|---|---|
| **DIRECT CUSTOMER** | A customer who reached KAS through a direct channel | "Our customer" as a catch-all |
| **DIRECT LEAD** | A sales opportunity from a direct customer, owned by a sales agent | "Booking" before it is confirmed |
| **DIRECT BOOKING** | A confirmed reservation with `distributionChannel = DIRECT` | "Sale" |
| **LEAD SOURCE** | How a direct customer reached KAS | "Source", "channel", "origin" |
| **DISTRIBUTION CHANNEL** | Where the reservation was sold | "Source", "booking source", "sales channel" |
| **SALES OWNER** | The KAS Sales employee responsible for a direct lead | "Assignee" without qualification |
| **OTA RESERVATION** | A reservation sold through an external distribution channel | "OTA lead", "OTA sale", "OTA booking request" |
| **CENTRAL INVENTORY** | The single availability model all channels consume | "Stock", "the calendar" |

**PROPOSED — prohibited constructions**, in code, UI, reports, analytics event names, and conversation:

- A single `source` field on a reservation — **the prohibition that motivated this document**
- "Sales" as a generic word for every reservation origin
- "Sales channel" — it conflates distribution and lead source in one phrase
- Any queue, view, or metric that mixes direct leads and OTA reservations
- `bookings_by_source`, `sales_source`, `booking_origin` as field or event names

**PROPOSED** — Guest-facing vocabulary is unaffected. Guests see **booking request**, **Your Stay**,
and **stay**. None of the vocabulary in this document is customer-facing
([27](27-request-status-architecture.md) §3.1).

---

## 12. Corrections applied to earlier documents

**PROPOSED** — Statements that were wrong under this correction, and how they were fixed.

| Document | Was | Now |
|---|---|---|
| [13](13-database-domain-overview.md) §3.4 | `booking.source enum — WEB \| PHONE \| WALK_IN \| EMAIL` — **a single generic source field, explicitly prohibited** | Replaced with `distribution_channel_id`, `channel_type`, `lead_source`, `lead_source_detail`, `sales_owner_id`, plus the §3 CHECK constraint |
| [15](15-inventory-rules.md) §7 | "Non-platform bookings are entered as manual bookings (`source = PHONE \| WALK_IN \| EMAIL`)" — used the prohibited field and conflated OTA with direct | Rewritten around channel-aware central inventory and the allotment/manual-entry strategies in §7.2 |
| [21](21-admin-navigation.md) §3.2, §5.1 | "Booking Requests" queue with a generic `source` column | **Direct Leads** queue, `channelType = DIRECT` by construction, with distribution channel and lead source as separate columns |
| [21](21-admin-navigation.md) §3.16 | Analytics "by property, source, and period" | Split into Direct Sales Performance and OTA Distribution Performance (§8) |
| [09](09-admin-scope.md) §3.4, §3.10 | Same generic `source` treatment | Same corrections |
| [05](05-booking-sales-model.md) §4 | "Sales-side workflow" with no channel qualification | Scoped explicitly to **direct leads** |
| [18](18-information-architecture-v2.md) §11.6, [28](28-phase-2-decisions.md) §4.6 | OQ-033 framed as "OTA bookings must be entered manually or we oversell" | Reframed — allotment is now the recommended V1 answer; manual entry is one option, not the only one |
| [16](16-open-questions.md) OQ-033 | "What proportion of bookings come through OTAs?" | Channels now named. Volume and mix still open, and now feed the allotment decision (OQ-067) |

**PROPOSED** — Admin route rename: `/admin/requests` → `/admin/leads`; `/admin/bookings` →
`/admin/reservations`, with `?channel=OTA` as the OTA register. Admin URLs are not indexed and not
guest-facing, so this rename carries no SEO or link cost.

---

## 13. V1 vs Future

| In V1 | Future |
|---|---|
| Three-concept separation with the CHECK constraint | Channel manager integration |
| Direct lead CRM: manual creation, source capture, ownership, contact log, follow-up, alternatives, payment recording, conversion | Automatic OTA reservation import |
| Website requests as `WEBSITE` leads | Rate and availability push to OTAs |
| OTA reservation register (manual, read-mostly) | Commission and net-revenue reporting |
| Channel-aware central inventory with `ota_allotment` | Social inbox integration (Facebook / Zalo / Instagram APIs) |
| Direct Sales Performance analytics | Automated OTA-guest → direct conversion campaigns |
| OTA Distribution Performance analytics | Per-channel dynamic allotment |
| Channels as a managed reference table | Additional OTAs as configuration |

**CONFIRMED** — No OTA integrations in V1. No assumed OTA APIs.

---

## 14. Open questions raised here

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-067** | Inventory | OTA inventory strategy for V1 — allotment, manual entry, or hybrid? If allotment, what split per property and season? | `BLOCKING` |
| **OQ-068** | Attribution | Lead source when a customer touches several channels before contacting KAS | `OPEN` |
| **OQ-069** | Guest lifecycle | Do OTA guests receive KAS lifecycle emails, and are they eligible for verified reviews? | ✅ **ANSWERED (D-36)** — eligible for completed-stay lifecycle and verified reviews. **Marketing is separate and never assumed.** See below |
| **OQ-070** | Scope | Is KAS Admin the property's operational hub (all arrivals, all channels) or a direct sales platform? Determines whether OTA reservations must be recorded at all | `BLOCKING` |
| **OQ-071** | Sales | Who monitors the Facebook, Zalo, TikTok and Instagram inboxes, and during what hours? Extends OQ-048 | `OPEN` |
| **OQ-072** | Reporting | Is OTA commission or net-rate data available for distribution performance reporting? | `OPEN` |
| **OQ-073** | Workflow | Is an unqualified `NEW` lead state wanted for social enquiries without dates? Is `LOST` distinct from `EXPIRED`? | `OPEN` |
| **OQ-033** | Distribution | *(updated)* Channels now named. **Volume and mix per channel still unknown** and now block the allotment decision | `BLOCKING` |

**Recommendation on OQ-069 and OQ-070:** answer them together. ✅ **Both answered in Phase 3.**
KAS Admin **is** the operational hub (D-28), so OTA reservations are recorded, OTA guests are visible,
and they are eligible for the completed-stay lifecycle and verified reviews (D-36).

---

## 15. OTA guest lifecycle & communication separation (D-36)

**CONFIRMED** — OTA guests are real KAS guests operationally. A recorded OTA reservation reaching a
completed stay makes the guest eligible for the completed-stay lifecycle, post-stay communication,
review invitation, and a **verified review**. OTA guests must **not** be automatically excluded from
KAS reviews.

**CONFIRMED** — Marketing eligibility must **not** be assumed.

| | **Transactional / Stay** | **Marketing** |
|---|---|---|
| Purpose | Operating the stay the guest has | Promoting future stays |
| Examples | Confirmation, pre-arrival, check-in, check-out, invoice, service | Offers, campaigns, "book direct next time" |
| Direct guests | Permitted — operationally necessary | **Explicit opt-in required** |
| OTA guests | Permitted where contact details work | **Never assumed.** Explicit consent **and** OTA-contract review |
| Legal basis | Performance of the stay | Consent |

**PROPOSED** — Review eligibility depends on a **completed stay**, not on the channel.
`distributionChannel` does not appear in the eligibility rule.

> ⚠ **Two constraints that must not be assumed away.**
> **(1)** OTA agreements commonly restrict using channel-obtained guest data for solicitation. A review
> invitation to an OTA guest must therefore contain **no direct-booking solicitation**, or it converts
> into marketing — **OQ-078**.
> **(2)** OTA-supplied contact details are commonly masked aliases that stop routing after the stay, so
> a post-stay invitation may never arrive — **OQ-077**.
