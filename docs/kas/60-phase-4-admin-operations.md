# 60 — Admin Operational Model

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative
**Last updated:** 2026-08-14

---

## 1. KAS Admin is the operational hub

**CONFIRMED** — KAS Admin is the operational hub for all reservations across all 8 properties.

> **Operational visibility is not Direct Sales CRM ownership.** OTA reservations are fully visible to
> Operations and Distribution, and **never** enter Direct Sales.

---

## 2. Eight areas

**CONFIRMED** — These must not collapse into one generic "Sales" module.

```
DIRECT SALES        OPERATIONS          DISTRIBUTION        COMMERCIAL
  Inquiries           All Reservations    OTA Reservations    Central Rates
  Direct Requests     Arrivals            Channel Status      Offers & Vouchers
  Follow-ups          Departures          Sync Status  FUTURE
  Sales Assignments   Occupancy           Channel Mgr  FUTURE
  Lead Source Analytics Inventory

CONTENT             CUSTOMERS           REVIEWS             SECURITY
  Properties          Customer 360        Moderation          Users & Roles
  Room Types          Merge Candidates    Replies             Audit Log
  Facilities          Consent             Reports             Settings
  Amenities                                                   Integrations
  Media Library
  Pages
```

| Area | Channel scope | Primary permission |
|---|---|---|
| **Direct Sales** | `channelType = DIRECT` **only** | `sales.*` |
| **Operations** | **All channels** | `reservation.*`, `inventory.*` |
| **Distribution** | `channelType = OTA` | `reservation.ota.*`, `distribution.*` |
| **Commercial** | Property-level | `rate.*`, `voucher.*` |
| **Content** | Property-level | `property.*`, `content.*`, `media.*` |
| **Customers** | All channels | `customer.*` |
| **Reviews** | All channels | `review.*` |
| **Security** | Global | `SUPER_ADMIN` |

---

## 3. Area contracts

### 3.1 Direct Sales

**Sees:** direct inquiries · follow-ups · direct reservations · lead sources · sales ownership.
**Never sees:** OTA reservations in any queue or list.

| Screen | Contents |
|---|---|
| **Inquiries** | `NEW`/`QUALIFIED`/`LOST`. Lead source, owner, follow-up due, **hold indicator with expiry countdown** where an alternative hold is active |
| **Direct Requests** | The queue. Columns: reference, guest, **lead source**, property, stay, rooms, value, age, SLA state, **sales owner**. Default sort: **oldest unactioned first** |
| **Request workspace** | Lead band (channel, source, detail, owner, next follow-up) · guest & stay · workflow · history |
| **Follow-ups** | Due and overdue, by owner |
| **Sales Assignments** | Ownership distribution and reassignment |
| **Lead Source Analytics** | **Conversion by lead source** — the single most commercially valuable number the platform produces |

**PROPOSED — the queue's defining filter is `channelType = DIRECT`**, applied at the data layer. An OTA
reservation is not addressable through any Direct Sales route.

### 3.2 Operations

**Sees:** all arrivals · all departures · all reservations · occupancy · room availability · **OTA
reservations and direct reservations together**.

| Screen | Query field |
|---|---|
| All Reservations | `stayStatus`, `?channelType` as an optional filter |
| **Arrivals** | **`stayStatus = CHECK_IN_READY \| CONFIRMED`** for the date |
| **Departures** | `stayStatus = CHECKED_IN` + check-out date |
| Occupancy | Derived from `stayStatus = CHECKED_IN` |
| Inventory calendar | Room types × dates. `available` displayed, **never editable** |

**CONFIRMED** — Operational screens query **`stayStatus`**, never `salesStatus`. A `salesStatus` filter
silently drops every OTA reservation ([54](54-phase-4-state-machines.md) §6).

**PROPOSED** — The arrivals list shows a channel indicator per row. Operations needs to *see* the
channel; it must never *filter by it* to produce the daily list.

### 3.3 Distribution

| Screen | Contents |
|---|---|
| **OTA Reservations** | Register. Read-mostly: no assignment, no SLA, no follow-up, no sales workflow. Labelled `TRANSITIONAL — V1` |
| **Record OTA reservation** | Channel explicit and required · OTA reference · guest · property · dates · lines · rate · `receivedAt`. **No sales owner field. No lead source field.** They do not exist on this form |
| **Channel Status** | Per channel: buffer configured vs used, recorded reservations, **recording lag**, reconciliation variance, overflow alerts |
| **Buffer Rules** | Configure by property + room type + date range/season |
| Sync Status · Channel Manager | **FUTURE** placeholders |

**PROPOSED** — Channel Status is where the stage-2 buffer exit criteria are measured. Without a screen
showing recording lag and overflow count, the buffer never retires, because nobody can evidence it is
safe to shrink.

### 3.4 Commercial · Content · Customers · Reviews · Security

| Area | Key contract |
|---|---|
| **Commercial** | Central Rates lives here, **not** in Direct Sales. Bulk rate application requires a **preview grid before commit** |
| **Content** | Publish checklist gates property publication: hero image · signature line · both-locale descriptions · address & coordinates · ≥1 published room type · **≥1 signature experience** |
| **Customers** | Customer 360 across channels. Merge candidates are **reviewed, never auto-merged** below HIGH confidence. Access is audited |
| **Reviews** | Approve / reject with a recorded reason / reply. **No edit action exists.** Delete is `SUPER_ADMIN` only |
| **Security** | Users, roles with property scope, audit log, settings. Settings affecting guest-visible text show a **live preview** of the resulting string |

---

## 4. Major workflows

### 4.1 Morning triage — Sales

```
Dashboard → unactioned direct requests, oldest first, SLA state visible
  → assign to self
  → check availability (live, under current inventory)
  → contact guest, log the touch
  → outcome: WIN / offer alternatives / decline
```

### 4.2 Handling a social inquiry

```
Facebook/Zalo message arrives (read in the native app — no integration in V1)
  → create Inquiry, leadSource = FACEBOOK, capture contact + question
  → schedule follow-up
  → customer supplies dates and rooms
  → QUALIFY → creates Reservation at salesStatus = REQUESTED (holds placed)
  → normal direct sales workflow
```

### 4.3 Offering an alternative with a hold

```
Requested room unavailable
  → propose up to 3 alternatives, each availability-checked at send
  → optionally place ALTERNATIVE_OFFER hold(s)
       requires DIRECT_ALTERNATIVE_HOLD_DURATION (config B1)
       unset → CONFIG_MISSING error naming the setting
  → agent may explicitly release the original hold
  → guest accepts → hold CONVERTED, original released, lines updated
     guest declines / hold expires → released automatically
```

### 4.4 Recording an OTA reservation

```
Reservation appears in the OTA extranet
  → operational staff (Property Admin / Reservations Staff / Front Desk) open
    Distribution → Record OTA reservation
  → channel + OTA reference + guest + property + dates + lines + rate + receivedAt
  → creates Reservation: salesStatus = NULL, stayStatus = CONFIRMED
  → ota_committed increases; buffer auto-expands and alerts if exceeded
  → appears immediately in Operations arrivals
```

**CONFIRMED** — Never enters Direct Sales. Never assigned a sales owner. Recording target is **as soon
as operationally possible**; the acceptable lag is config B4, measured not enforced.

### 4.5 Arrival day

```
Operations → Arrivals for today  (stayStatus, all channels)
  → verify guest and special requests
  → check in → stayStatus = CHECKED_IN
  → guest absent past cutoff → operator prompted to mark NO_SHOW (never automatic)
```

### 4.6 Closing rooms for maintenance

```
Operations → Inventory → select property, room type, date range
  → set maintenance, reason required
  → system blocks the change if it would fall below existing commitments,
    naming the conflicting dates
  → audit entry written
```

### 4.7 Seasonal rate change

```
Commercial → Central Rates → select properties/room types → date range
  → define rule → PREVIEW GRID (mandatory) → commit
  → existing reservations are unaffected: their price snapshots are sealed
```

### 4.8 Review moderation

```
Reviews → pending → verify the linked COMPLETED reservation (verified stay)
  → approve, or reject with a reason from a fixed list
  → optional public reply
  → rating ≤ 2 alerts the property team before publication, for service recovery
```

### 4.9 Daily reconciliation

```
Distribution → Reconciliation
  → cached counters vs derived truth        → alert on drift, never auto-correct
  → KAS position vs OTA extranet            → alert beyond tolerance (config B5)
  → active holds past expiry                → alert on sweep lag
  → recording lag distribution              → reported against config B4
```

---

## 5. Dashboard

**PROPOSED** — Role-aware; answers "what needs attention now" in under five seconds.

| Panel | Source | Audience |
|---|---|---|
| Unactioned direct requests, SLA breaches highlighted | `salesStatus` + SLA | Sales |
| Follow-ups due / overdue | Inquiry + reservation | Sales |
| **Arrivals today / tomorrow** | **`stayStatus`, all channels** | Operations |
| Departures today | `stayStatus` | Operations |
| Occupancy next 7 / 30 days | Inventory | Operations |
| **OTA recording lag + overflow alerts** | Distribution | Operations |
| Expiring holds | Holds | Sales |
| Reviews awaiting moderation | Reviews | Content |
| Failed email deliveries | Email log | Admin |
| Merge candidates awaiting review | Customer | Admin |

**PROPOSED** — Badges show only *actionable* counts. A badge that never clears becomes invisible.

---

## 6. Analytics — three domains, never combined

**CONFIRMED**

| Domain | Field | Metrics |
|---|---|---|
| **Direct Sales** | `salesStatus` + `channelType = DIRECT` | **Conversion by lead source** · response time · SLA compliance · sales owner performance · lost requests by reason · follow-up compliance · inquiry→reservation qualification rate · alternative acceptance rate |
| **OTA Distribution** | `salesStatus IS NULL` | Reservations and room-nights by OTA · cancellation rate · lead time · **channel mix** · buffer utilisation · recording lag |
| **Operations** | `stayStatus` | Occupancy · arrivals · departures · room availability · room-type utilisation |

**CONFIRMED** — **No generic "Bookings by Source" metric exists.** No chart places direct lead sources
and OTA channels on one axis. The one legitimate cross-domain view is **channel mix** — direct share vs
each OTA — which compares *channels*, not *sales performance*.

**PROPOSED** — Sales SLA and owner metrics **exclude OTA by construction**: an OTA reservation has no
`salesStatus` and no owner, so it cannot enter those aggregates even by mistake.

---

## 7. Cross-cutting requirements

| Requirement | Detail |
|---|---|
| **Property scope selector** | Visible on every screen; scope echoed in page headings |
| **Internal vs guest-visible** | Two separate objects, not a flag. 🔒 internal notes vs 👁 guest messages, with distinct colour, icon and label. Guest messages require an explicit preview before send |
| **Audit** | Every privileged action logged with actor, before/after, reason |
| **Destructive actions** | Confirmation required; archive rather than delete; soft delete with grace period |
| **Publish is deliberate** | Draft → preview-as-guest → publish |
| **Bulk operations** | Preview before commit; conflicts listed, never silently skipped. **No bulk status transitions on reservations** — each represents a guest and a conversation |
| **Optimistic concurrency** | Two operators must never silently overwrite each other |
| **Performance** | List views usable at 10,000+ reservations; inventory calendar 8 properties × 90 days ≤ 2s |
| **Mobile** | Queue, request workspace, arrivals, availability lookup and OTA recording must work on a phone. Inventory calendar, pricing and settings are desktop |
| **Language** | One console language in V1 (config A12). **Guest-facing content and email templates are always bilingual regardless** |

---

## 8. Open items

| ID | Item | Impact |
|---|---|---|
| Config B24 | Sales team structure | Whether a `SALES` role ships |
| Config B25 | OTA recording process owner | **The hub decision depends on this process existing** |
| Config B4 / B5 | Recording lag and reconciliation thresholds | Channel Status alerting |
| Config A12 | Admin console language | UI |
| OQ-023 / OQ-024 | Price override limit; review moderation authority | Permission bounds |
