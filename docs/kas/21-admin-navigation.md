# 21 — Admin & Super Admin Navigation

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Admin IA philosophy

**PROPOSED** — The admin console is a different product with different rules from the guest site.

1. **The queue is the front door.** For most staff the day begins with "what needs me now", not with
   a menu.
2. **Density over decoration.** Tables, filters, keyboard operation. Shares the brand's colour and
   type tokens; shares none of its editorial layout.
3. **Navigation is permission-filtered, never permission-disabled.** A user does not see a greyed-out
   module they cannot use — they do not see it at all.
4. **Guest-visible and internal are never visually ambiguous.** Different colour, different icon,
   explicit label. A note that reaches a guest by accident is a serious incident.
5. **Property scope is visible at all times**, even while `ADMIN` has access to everything. It costs
   nothing now and makes future roles additive ([06](06-user-roles.md) §3).
6. **Deep work gets a workspace, not a form.** A property, a room type, and a booking request are each
   a workspace with tabs — not a single long form.
7. **Every consequential action is logged**, and the log is reachable from the object it concerns.

---

## 2. Admin navigation tree

**PROPOSED** — Persistent left rail, grouped. Eight groups, never a flat list of twenty items.

```
┌──────────────────────────┐
│  KAS Admin               │
│  [All properties ▾]      │   ← property scope selector (always visible)
├──────────────────────────┤
│  ◉ Dashboard             │
│                          │
│  DIRECT SALES            │   ← CRM. DIRECT channel only
│    Inquiries          ④  │   ← NEW / QUALIFIED / LOST · V1 · holds no inventory
│    Direct Requests    ⑦  │   ← live count awaiting action
│    Follow-ups         ③  │
│    Sales Assignments     │
│    Lead Source Analytics │
│                          │
│  OPERATIONS              │   ← the operational hub. ALL channels
│    All Reservations      │
│    Arrivals              │
│    Departures            │
│    Occupancy             │
│    Inventory             │
│                          │
│  DISTRIBUTION            │   ← external channels. Never a sales queue
│    OTA Reservations      │
│    Channel Status        │
│    Sync Status    FUTURE │
│    Channel Manager FUTURE│
│                          │
│  PROPERTIES              │
│    Hotels                │
│    Room Types            │
│    Amenities             │
│    Media Library         │
│                          │
│  COMMERCIAL              │
│    Central Rates         │   ← rate management. NOT part of Direct Sales
│    Offers & Vouchers     │
│                          │
│  GUESTS                  │
│    Customers             │
│    Reviews            ③  │
│                          │
│  COMMUNICATIONS          │
│    Notifications         │
│    Emails                │
│                          │
│  INSIGHT                 │
│    Analytics             │
│                          │
│  CONTENT                 │
│    Pages                 │
│                          │
│  ── SUPER ADMIN ─────────│   ← only rendered for SUPER_ADMIN
│    Users & Roles         │
│    Audit Log             │
│    Settings              │
└──────────────────────────┘
```

**PROPOSED** — Badges show only *actionable* counts (requests awaiting action, reviews awaiting
moderation). A badge that never clears becomes invisible.

**PROPOSED — top bar:** global search (reference, guest name, email, phone, property) · quick actions
(new booking request, block inventory) · notifications · account. Global search is the single highest-value
admin feature for a sales team: a guest calls quoting a reference, and the agent must reach the record
in one action.

---

## 3. Module specifications

**PROPOSED** — For each module: purpose · primary users · main objects · primary actions ·
relationships · V1 or Future.

### 3.1 Dashboard

| | |
|---|---|
| **Purpose** | Answer "what needs attention now" in under five seconds |
| **Primary users** | All staff; content differs by role |
| **Main objects** | Requests awaiting action, SLA state, arrivals, reviews pending, failed emails, expiring holds |
| **Primary actions** | Open a request · assign to self · jump to arrivals · moderate a review |
| **Relationships** | Read-only aggregation across Requests, Bookings, Inventory, Reviews, Emails |
| **V1** | ✔ — without it, staff navigate by memory |

### 3.2 Direct Leads *(the Direct Sales Queue)*

> ⚠ **CORRECTED.** This module handles **direct leads only** — `channelType = DIRECT`. OTA
> reservations from Booking.com, Agoda, Ctrip and Traveloka **never** enter this queue, are never
> assigned a sales owner, and carry no lead source. See
> [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md).

| | |
|---|---|
| **Purpose** | Work every direct lead from arrival to resolution — website requests and sales-created leads from Facebook, Zalo, TikTok, Instagram, phone, walk-in, referral and returning customers |
| **Primary users** | KAS Sales (ADMIN) |
| **Main objects** | Direct lead, lead source, sales owner, lines, contact log, internal notes, availability check, alternatives, follow-up schedule, payment record, change history |
| **Primary actions** | Create lead manually · capture lead source · assign sales owner · check availability · log contact · offer alternative · confirm · decline · record payment · convert to confirmed stay · schedule follow-up · add note |
| **Relationships** | Customer · Property · Room Type · Central Inventory · Voucher · Emails · Audit |
| **V1** | ✔ — **this is the operational heart of the platform** |

Full architecture in §5 and [29](29-direct-sales-crm-architecture.md) §5.

### 3.2a Inquiries *(Direct Sales)* — **V1**

| | |
|---|---|
| **Purpose** | Capture a direct enquiry before enough information exists to create a reservation — *"Do you have rooms available in September?"* |
| **Primary users** | KAS Sales |
| **Main objects** | Inquiry, lead source, sales owner, contact fragment, inquiry text, optional property/date hint, follow-up schedule |
| **Primary actions** | Create · assign owner · log contact · **offer an alternative with an optional temporary hold** · **qualify → creates a reservation** · mark lost |
| **Relationships** | Customer · Reservation (on qualification) · Inventory (only via an alternative hold) |
| **V1** | ✔ **CONFIRMED (Decision 1).** KAS has an active direct/social sales workflow |

**CONFIRMED** — The inquiry **holds no inventory**. It has no property, dates, room type or quantity.
The only inventory footprint it can have is an explicit `ALTERNATIVE_OFFER` hold, which carries its own
stay parameters and its own mandatory expiry ([14](14-booking-state-machine.md) §3.2).

**PROPOSED — UI consequence:** the inquiry list shows an **inventory-hold indicator** where a hold is
active, with its expiry countdown, so an agent can see at a glance what is being held and for how long.

### 3.2b Follow-ups

| | |
|---|---|
| **Purpose** | Ensure no direct lead goes quiet unattended |
| **Primary users** | KAS Sales |
| **Main objects** | Follow-up schedule, attempt log, ageing |
| **Primary actions** | View due and overdue · log an attempt · reschedule · mark lost with a reason |
| **Relationships** | Direct Leads · Users |
| **V1** | ✔ — a social lead going quiet is the most common failure mode in messaging-channel sales |

### 3.3 Reservations

| | |
|---|---|
| **Purpose** | Operate confirmed stays across **every** distribution channel — arrivals, in-house, departures |
| **Primary users** | Sales; later RECEPTIONIST and HOTEL_MANAGER |
| **Main objects** | Reservation (direct or OTA), arrival list, in-house list, departure list, special requests |
| **Primary actions** | View arrivals by date · mark checked in / checked out · view special requests · modify · cancel · filter by channel |
| **Relationships** | Direct Leads (direct origin) · OTA register (OTA origin) · Inventory (occupancy) · Customers |
| **V1** | ✔ — one arrivals list. A front desk that cannot see its OTA arrivals is not operating |

### 3.3b OTA Reservations

| | |
|---|---|
| **Purpose** | A **register** of reservations sold through external distribution channels |
| **Primary users** | **Operational staff — Property Admin · Reservation Staff · Front Desk.** *(V1: property-scoped `ADMIN`.)* **Never KAS Sales** |
| **Permission** | `reservation.ota.record` · `reservation.ota.cancel` · `reservation.ota.reconcile` |
| **Main objects** | Reservation with `channelType = OTA`, OTA channel, OTA reference, safety buffer utilisation, recording lag |
| **Primary actions** | Record an OTA reservation · edit · record a cancellation · reconcile against the extranet |
| **Relationships** | Central Inventory (`ota_allotment` / `ota_reserved`) · Customers (Customer 360) · Distribution analytics |
| **V1** | ✔ manual register only. **No OTA integration, no assumed OTA APIs** (**CONFIRMED**) |

**PROPOSED — the recording screen (OQ-075).** Optimised for speed, because recording lag is the metric
that retires the safety buffer:

- **Distribution channel is explicit and required**: `BOOKING_COM` · `AGODA` · `CTRIP` · `TRAVELOKA`
- OTA reference, guest name and contact, property, dates, room type, quantity, rate
- **No sales owner field exists on this screen** — the column must be `NULL` by constraint
- **No lead source field exists** — same reason
- Creates the reservation at `stayStatus = CONFIRMED`, `salesStatus = NULL`
- Duplicate detection on `(distributionChannel, otaReference)`
- **Recording is never rejected.** Over-buffer recording auto-expands and alerts; a genuinely oversold
  date records and raises a P1 ([15](15-inventory-rules.md) §7.2)
- Late recording — including after arrival — is permitted, with the true dates and correct current
  `stayStatus`
- `receivedAt` captured alongside `recordedAt`, so **recording lag is measurable** (OQ-081)
- Labelled `TRANSITIONAL — V1` on screen

**PROPOSED** — Read-mostly by design: no assignment, no SLA, no follow-up, no sales workflow. Entry is
a single keyboard-driven screen with duplicate detection on the OTA reference.

> **AMENDED (D-28).** OQ-070 is answered: **KAS Admin is the operational hub**, so OTA reservations
> **must** be recorded. This module moves into the **DISTRIBUTION** area and is labelled
> `TRANSITIONAL — V1`. The recording process owner and acceptable lag are **OQ-075**.

### 3.3c Channel Status *(Distribution)*

| | |
|---|---|
| **Purpose** | Show, per distribution channel, what KAS believes is allotted, sold and outstanding |
| **Primary users** | ADMIN, reservations, revenue owner |
| **Main objects** | Distribution channel, allotment by room type and date, recorded reservations, recording lag, reconciliation variance |
| **Primary actions** | Set and adjust allotment · view utilisation · review overflow alerts · reconcile against the extranet |
| **Relationships** | Central Inventory · Reservations · Distribution analytics |
| **V1** | ✔ **TRANSITIONAL.** Retires as the channel manager arrives ([15](15-inventory-rules.md) §7.1) |

**PROPOSED** — This is where the stage-2 exit criteria are measured: recording lag, overflow count, and
reconciliation variance. Without a screen showing them, the allotment buffer never retires because
nobody can evidence that it is safe to shrink.

### 3.3d Sync Status · Channel Manager — **FUTURE**

Placeholders in the navigation so the Distribution area is legible as an intentional home for
automated distribution. **No OTA APIs are implemented or assumed in V1** (**CONFIRMED**). Integration
boundary in [29](29-direct-sales-crm-architecture.md) §6.2.

### 3.4 Availability

| | |
|---|---|
| **Purpose** | Answer "what can I sell for these dates?" across the whole portfolio |
| **Primary users** | Sales, while a guest is on the phone |
| **Main objects** | Read view over inventory by property, room type, date range |
| **Primary actions** | Look up · compare across properties · start a manual booking from a result |
| **Relationships** | Inventory (read) · Booking Requests (alternatives) |
| **V1** | ✔ — the alternative-offering step in the sales workflow depends on it |

### 3.5 Hotels

| | |
|---|---|
| **Purpose** | Manage each property's identity, content, media, amenities, location, policies, experiences |
| **Primary users** | ADMIN, content/marketing staff |
| **Main objects** | Property, translations, gallery, amenity assignments, landmarks, policies, signature experiences, lifecycle state, SEO fields |
| **Primary actions** | Create · edit · translate · reorder gallery · assign amenities · set coordinates · preview as guest · publish |
| **Relationships** | Room Types · Media · Amenities · Reviews · Bookings |
| **V1** | ✔ |

**PROPOSED** — Publish is gated by a checklist: hero image, signature line, description in both
locales, address and coordinates, at least one published room type, at least one signature
experience. The last item is what structurally prevents "the flagship plus seven thin pages".

### 3.6 Room Types

| | |
|---|---|
| **Purpose** | Define the customer-facing room product |
| **Primary users** | ADMIN |
| **Main objects** | Room type, translations, images, bed configurations, occupancy, area, amenities, base rate, status |
| **Primary actions** | Create · edit · translate · manage images · set occupancy · set base rate · reorder · publish |
| **Relationships** | Property (parent) · Inventory · Pricing · Booking lines |
| **V1** | ✔ |

**PROPOSED** — The room type editor has **no field capable of holding a room number**. The
customer/internal boundary is enforced by the absence of the field, not by a policy
([04](04-room-architecture.md) §2.1).

### 3.7 Amenities

| | |
|---|---|
| **Purpose** | Maintain the shared, controlled amenity vocabulary |
| **Primary users** | ADMIN |
| **Main objects** | Amenity, category, icon, translations, highlight flag |
| **Primary actions** | Create · edit · translate · categorise · reorder |
| **Relationships** | Properties · Room Types · Discovery filters |
| **V1** | ✔ — shared vocabulary is what makes filtering and comparison possible at all |

### 3.8 Media Library

| | |
|---|---|
| **Purpose** | One home for all imagery, with alt text and usage tracking |
| **Primary users** | ADMIN, content staff |
| **Main objects** | Media asset, derivatives, localised alt text and caption, tags, usage references |
| **Primary actions** | Upload (bulk) · tag · write alt text · replace · find usages · delete (blocked if in use) |
| **Relationships** | Properties · Room Types · Offers · Pages · Reviews |
| **V1** | ✔ — a photography-led brand cannot manage imagery per-entity without duplication |

### 3.9 Inventory

| | |
|---|---|
| **Purpose** | Maintain the availability truth. **Admin is the confirmed source of truth** |
| **Primary users** | ADMIN; later HOTEL_MANAGER, RECEPTIONIST |
| **Main objects** | Inventory day per room type: total, reserved, occupied, maintenance; derived available; holds |
| **Primary actions** | Edit total · set maintenance · block a date range · bulk edit · view breakdown · release a hold |
| **Relationships** | Room Types · Bookings · Availability · Audit |
| **V1** | ✔ |

**PROPOSED** — `available` is displayed but **never editable** ([15](15-inventory-rules.md) §2.1).
Every edit requires a reason and is audit-logged.

### 3.10 Pricing

| | |
|---|---|
| **Purpose** | Set and maintain rates. **Confirmed basis: price per room, per night, in VND** |
| **Primary users** | ADMIN, revenue owner |
| **Main objects** | Base rate per room type, rate rules (date range, day-of-week, season), minimum stay |
| **Primary actions** | Set base rate · create rule · bulk apply to a range · preview the resulting grid · commit |
| **Relationships** | Room Types · Bookings (price snapshot) · Vouchers |
| **V1** | ✔ base rate + date-range rules. Weekend/seasonal/child rules **pending OQ-006, OQ-007** |

**PROPOSED** — Bulk changes always show a **preview grid before commit**. Applying a rate across 90
days without seeing the result is how revenue accidents happen.

### 3.11 Customers

| | |
|---|---|
| **Purpose** | **Customer 360** — one profile per person, across every distribution channel |
| **Primary users** | ADMIN |
| **Main objects** | Customer, profile, **multi-channel reservation history**, first-touch attribution, direct leads with source and outcome, reviews, communications, **consent per purpose**, internal notes, merge history |
| **Primary actions** | Search · view · edit · **review and confirm merge candidates** · add note · anonymise (SUPER_ADMIN) |
| **Relationships** | Reservations (all channels) · Direct Leads · Reviews · Emails · Vouchers |
| **V1** | ✔. Export is SUPER_ADMIN and audited |

**PROPOSED (D-37)** — A customer holding a Booking.com stay in March, a website request in June and a
Facebook request in September is **one customer**, not three. Distribution channel never creates a
separate identity. First-touch (`firstDistributionChannel`, `firstLeadSource`) is recorded once and
never overwritten — this is what makes OTA→direct conversion measurable.

**PROPOSED — matching is confidence-tiered and never auto-merges on a weak signal.** A wrong merge
exposes one guest's stay history to another; that is a privacy incident, not a data-quality issue.
Merges are reversible and audit-logged. Full model in
[50-phase-3-amendments.md](50-phase-3-amendments.md) §7.

> ⚠ **Practical limit.** OTAs commonly supply masked or aliased contact details that stop routing after
> the stay, so matching on OTA-supplied email will frequently fail and post-stay email may never
> arrive. The reliable capture point for a real address is **at check-in, with consent** — an
> operational process, not a system feature. **OQ-077**.

**PROPOSED** — Merge is a genuine operational need, not a nicety: guest submissions and account
registrations will produce duplicates from day one.

### 3.12 Reviews

| | |
|---|---|
| **Purpose** | Moderate and reply to verified guest reviews |
| **Primary users** | ADMIN, property/brand owner |
| **Main objects** | Review, sub-scores, photos, linked completed booking, reply, moderation state |
| **Primary actions** | Approve · reject with a reason · reply · moderate photos · flag |
| **Relationships** | Bookings (proof of stay) · Customers · Properties |
| **V1** | ✔ |

**PROPOSED** — Editing a guest's review text is **not an available action**. Only SUPER_ADMIN may
delete (OQ-024). Ratings ≤ 2 raise an internal alert before publication so service recovery can
happen first.

### 3.13 Offers & Vouchers

| | |
|---|---|
| **Purpose** | Create and track direct-booking offers |
| **Primary users** | ADMIN, marketing |
| **Main objects** | Voucher/offer, rules, validity and stay windows, applicability, usage limits, redemptions |
| **Primary actions** | Create · edit · pause · apply to a request · view usage |
| **Relationships** | Bookings · Customers · Properties · Room Types · Content (`/offers` pages) |
| **V1** | ✔ basic percentage and fixed-amount. Rules **pending OQ-029** |

**PROPOSED** — In a request model a voucher is applied to the **estimate** and re-validated at
confirmation. The IA must show the agent both values and flag any divergence.

### 3.14 Notifications

| | |
|---|---|
| **Purpose** | Route lifecycle events to the right people on the right channel |
| **Primary users** | ADMIN; SUPER_ADMIN for rules |
| **Main objects** | Notification rule, recipient rule, channel, escalation, delivery log, per-user preferences |
| **Primary actions** | Configure rules · set escalation · view delivery · set own preferences |
| **Relationships** | All lifecycle events · Users · Emails |
| **V1** | ✔ in-app + email. SMS/Zalo **FUTURE** |

### 3.15 Emails

| | |
|---|---|
| **Purpose** | Own the guest-facing email programme |
| **Primary users** | ADMIN; bulk sending SUPER_ADMIN only |
| **Main objects** | Template (localised, versioned), trigger map, delivery log, bounces, suppression list |
| **Primary actions** | Edit template · preview · test send · view delivery · retry · manage suppression |
| **Relationships** | Bookings · Customers · Notifications |
| **V1** | ✔ transactional. Campaigns **FUTURE** |

### 3.16 Analytics

| | |
|---|---|
| **Purpose** | Measure **three separate domains** — direct sales, OTA distribution, and operations |
| **Primary users** | ADMIN, management |
| **Main objects** | **Direct Sales** *(`salesStatus`)*: conversion by lead source (`salesStatus = WON`), inquiry→reservation qualification rate, response time, SLA compliance, sales owner performance, lost requests (`DECLINED`/`CANCELLED`/`EXPIRED`), follow-up compliance, alternative-offer acceptance rate. **OTA Distribution** *(`salesStatus IS NULL`)*: reservations and room-nights by OTA, cancellation rate, lead time, channel mix, buffer utilisation, recording lag. **Operations** *(`stayStatus`)*: occupancy, arrivals, departures, room availability, room-type utilisation |
| **Primary actions** | Filter by date/property/channel/lead source · compare periods · export CSV |
| **Relationships** | Read-only across everything |
| **V1** | ✔ all three domains. Commission and net-revenue reporting depends on OQ-072 |

> ⚠ **CORRECTED.** An earlier draft described analytics "by property, source, and period" — a single
> generic source dimension. **Prohibited.** Direct lead sources and OTA distribution channels are never
> combined on one axis, and no metric named "bookings by source" exists. Full specification in
> [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md) §8.

**PROPOSED** — Two headline metrics, one per domain:

- **Direct Sales — conversion by lead source.** This is the single most commercially valuable number
  the platform produces. It tells KAS whether TikTok earns its effort, whether Zalo outperforms
  Facebook, and whether the website is earning its build cost.
- **Distribution — channel mix.** Direct share against each OTA. This is the group's core commercial
  question, and it is the one place the two domains legitimately meet — as a comparison of *channels*,
  never of *sales performance*.

**PROPOSED** — Sales response time and SLA compliance apply to **direct leads only**. An OTA
reservation has no response time and no owner, so it is excluded by construction.

### 3.17 Content — Pages

| | |
|---|---|
| **Purpose** | Manage editorial pages without deployment |
| **Primary users** | ADMIN, content staff |
| **Main objects** | Page, ordered content blocks, translations, SEO fields, publish state |
| **Primary actions** | Add/reorder/remove blocks · edit · translate · preview · publish |
| **Relationships** | Media · Properties (referenced by blocks) |
| **V1** | ✔ — required so the homepage is composed of data, not hard-coded sections ([23](23-content-architecture.md)) |

### 3.18 Modules deliberately **not** in V1

**PROPOSED** — Named so their absence is a decision, not an oversight.

| Module | Why deferred |
|---|---|
| Channel Manager / OTA sync | **CONFIRMED out of scope for V1 — no OTA integrations, no assumed OTA APIs.** V1 uses allotment and/or a manual OTA register ([29](29-direct-sales-crm-architecture.md) §6–§7). Becomes necessary as OTA volume grows (OQ-033, OQ-067) |
| Social inbox integration (Facebook / Zalo / Instagram APIs) | V1 sales read social messages in the native apps and create direct leads manually. Automating the inbox is a later, separate integration (OQ-071) |
| Payment gateway administration | No gateway in V1 (**CONFIRMED**) |
| Rate plan management | Depends on OQ-034 |
| Loyalty / membership | Depends on OQ-041 |
| Housekeeping / physical room assignment | Operational module; would introduce room numbers ([04](04-room-architecture.md) §7) |
| Group & event enquiry workflow | Depends on OQ-015; V1 routes large requests to a contact form |
| Multi-currency rate management | USD is display-only over a VND base ([25](25-i18n-currency-architecture.md)) |
| Guest messaging inbox | V1 sales contact happens by phone, Zalo, and email outside the platform, logged inside it |
| A/B testing framework | Premature before launch traffic exists |

---

## 4. Super Admin navigation

**PROPOSED** — Same console, additional group. Only rendered for `SUPER_ADMIN`.

```
── SUPER ADMIN ────────────
   Users & Roles
     ├ Staff accounts
     ├ Roles & permissions
     └ Sessions
   Audit Log
   Settings
     ├ Organisation
     ├ Booking rules       (SLA, holds, limits, expiry)
     ├ Currency            (VND base · USD display · FX source)
     ├ Languages           (VI/EN, default, fallback)
     ├ Policies            (global defaults)
     ├ Content rules       (positive-framing banned phrases)
     ├ Integrations        (email, storage, maps — write-only)
     └ Feature flags
```

| Module | Purpose · Objects · Actions | V1 |
|---|---|:--:|
| **Users & Roles** | Staff accounts, role assignment with property scope, session revocation, permission bundles. Create · disable · assign · force reset · revoke | ✔ |
| **Audit Log** | Append-only record of privileged actions with before/after. Filter · export | ✔ |
| **Settings** | Global configuration. **One SLA value drives the guest-facing promise, the email text, the queue timer, and the escalation rule** — they can never disagree | ✔ |

**PROPOSED** — Settings that affect guest-visible text (SLA wording, policies, currency disclaimer)
show a **live preview of the guest-facing string** beside the field. A settings screen that silently
changes what guests read is a hazard.

---

## 5. Sales queue architecture

**CONFIRMED workflow (Phase 1.5):**

```
REQUESTED → ASSIGNED → AVAILABILITY CHECK → CONTACT CUSTOMER
          → CONFIRM / ALTERNATIVE / DECLINE → PAYMENT RECORDING → CONFIRMED
```

> ⚠ **NEEDS CONFIRMATION — OQ-053.** This ordering places the availability check **before** customer
> contact. [14-booking-state-machine.md](14-booking-state-machine.md) has `SALES_CONTACTED` before
> `AVAILABILITY_CONFIRMED`. Also unresolved: is `ASSIGNED` a real state or an attribute (OQ-053), and
> is `DECLINE` a distinct terminal state or a cancellation reason (OQ-054)? The IA below supports
> both readings; the state machine must be told which is canonical before build.

### 5.1 Queue view

**PROPOSED**

```
Direct Leads                [All properties ▾]  [+ New direct lead]
                            channelType = DIRECT — OTA reservations never appear here

 ⦿ New (7)  Mine (3)  Breaching (1)  Follow-up due (5)  Awaiting payment (4)  All

 Ref              Guest         Lead source  Property   Stay            Rooms  Est. value   Age    SLA  Owner
 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 KAS-260912-4F7A  Nguyen Van A  FACEBOOK     Milestone  12–14 Sep (2n)   3     12.450.000₫  47m    ●    —
 KAS-260912-3B21  Tran Thi B    WEBSITE      Sonata     20–22 Sep (2n)   1      3.200.000₫  6h 12m ▲    Linh
 KAS-260911-9C04  J. Smith      ZALO         Passion    01–05 Oct (4n)   2      8.900.000₫  1d 2h  ■    Minh
```

**PROPOSED**
- **The queue's defining filter is `channelType = DIRECT`.** OTA reservations are structurally
  incapable of appearing here — they carry no lead source and no sales owner, enforced by the CHECK
  constraint in [29](29-direct-sales-crm-architecture.md) §3.
- **Lead source is a first-class column**, not a detail. An agent should see at a glance whether the
  morning's leads came from Facebook, Zalo, or the website.
- Default sort: **oldest unactioned first**. Not newest — a request-based model fails by neglect, not
  by backlog order.
- SLA indicator: ● within promise · ▲ approaching · ■ breached. Driven by the single settings value.
- Filters: status, **lead source**, property, **sales owner**, stay dates, lead date, value, SLA state,
  follow-up due. **There is no generic "source" filter** — distribution channel and lead source are
  separate fields, and distribution channel is always `DIRECT` in this queue.
- Saved views per user. "Mine", "Breaching" and "Follow-up due" are the three that matter daily.
- Bulk: assign, export. **No bulk status transitions** — each lead represents a guest and a
  conversation, and bulk-confirming is a category error.

### 5.2 Direct lead workspace

**PROPOSED** — Three columns on desktop: guest and stay (left) · workflow (centre) · history (right).

```
KAS-260912-4F7A          ⦿ New · 47m old · within promise · unassigned    [Assign to me]

┌ LEAD ────────────────────────────────────────────────────────────────────────┐
│ Distribution DIRECT   Lead source FACEBOOK   Detail "Rooftop reel, 12 Sep"    │
│ Sales owner  —                               Next follow-up  —                │
└──────────────────────────────────────────────────────────────────────────────┘

┌ GUEST & STAY ─────────────┬ WORKFLOW ────────────────┬ HISTORY ─────────────┐
│ Nguyen Van A              │ ① Availability check     │ Timeline             │
│ +84 …  ·  a@example.com   │   Deluxe  ×2   4 avail ✔ │  ● Request received  │
│ Prefers Zalo, evenings    │   Suite   ×1   1 avail ✔ │    14:03             │
│ Unverified email ⚠        │   [Re-check] [Confirm]   │                      │
│ Vietnam · returning guest │                          │ Contact log          │
│                           │ ② Contact customer       │  (empty)             │
│ KAS Milestone Premium     │   [Log contact ▾]        │                      │
│ Fri 12 – Sun 14 Sep, 2n   │                          │ Internal notes 🔒    │
│ 3 adults, 1 child (6)     │ ③ Outcome                │  (empty)             │
│                           │   [Confirm availability] │                      │
│ Deluxe Room        × 2    │   [Offer alternative]    │ Guest-visible msgs 👁 │
│ Suite Balcony      × 1    │   [Decline]              │  (empty)             │
│                           │                          │                      │
│ Estimate  12.450.000 ₫    │ ④ Payment                │ Changes              │
│ ≈ $492 indicative         │   [Record payment]       │  (none)              │
│ snapshot at 14:03         │                          │                      │
│                           │ ⑤ [Confirm booking]      │ Emails sent          │
│ "High floor if possible.  │                          │  ✔ Acknowledgement   │
│  Late arrival ~23:00."    │ [Cancel request]         │                      │
└───────────────────────────┴──────────────────────────┴──────────────────────┘
```

### 5.3 Required capabilities

**PROPOSED**

| Capability | Requirement |
|---|---|
| **Manual lead creation** | Create a direct lead from a Facebook, Zalo, TikTok or Instagram message, a phone call, a walk-in, or a referral. Consumes central inventory identically to a website request |
| **Lead source capture** | **Required on every direct lead.** Source, plus optional detail (campaign, referrer name) and free-text note |
| **Sales ownership** | Assign a sales owner; reassign with reason; full assignment history. **Applies to direct leads only — an OTA reservation has no owner** |
| **Follow-up tracking** | `nextFollowUpAt`, attempt log per channel, overdue view, reminder to the owner, prompt to mark lost after *N* unanswered attempts |
| **Lead history** | All leads and stays for this customer, across every channel, with their source and outcome |
| **Assignment** | Assign to self or another agent; reassign with reason; unassign. Visible in the queue |
| **SLA visibility** | Age and SLA state on the queue and the workspace; escalation notification on breach |
| **Availability check** | Live re-check against current inventory at any moment, per line, showing per-night minimum |
| **Contact history** | Every touch: channel (phone/email/Zalo/SMS/in person), direction, outcome, notes, timestamp, agent |
| **Internal notes** | 🔒 Distinct colour, lock icon, explicit "Internal — never shown to the guest" label |
| **Guest-visible messages** | 👁 Visually separate, with a preview of exactly what the guest will see before sending |
| **Alternatives** | Propose other dates, other room types, or **another KAS property**; system checks availability for each; send as a structured offer |
| **Alternative holds** | Optionally place a **temporary inventory hold** on an offered alternative. Explicit agent action, never automatic. Shows `expiresAt` with a countdown, who created it, and a manual release action. Duration from `DIRECT_ALTERNATIVE_HOLD_DURATION` — **business configuration required before launch**. Expired holds release automatically ([14](14-booking-state-machine.md) §6) |
| **Release the original** | Explicit action alongside an alternative offer, so one guest does not hold two sets of rooms longer than necessary |
| **Payment recording** | Method, amount, currency, reference, received date, evidence attachment, recorded-by. **Recording a fact, not processing a payment** |
| **Change history** | Every modification to dates, rooms, quantities, or price — with before/after, actor, reason, and whether the guest was notified |
| **Modification** | Change the request with the guest's agreement; re-check availability; recalculate; re-snapshot with an explicit new-price acceptance step |
| **Manual creation** | Create a request from a phone call or walk-in, consuming inventory identically |

### 5.4 The internal/guest-visible boundary

**CONFIRMED** — The public customer must never see internal notes.

**PROPOSED** — Enforced structurally, not by discipline:

1. **Two separate objects**, not one object with a visibility flag: `booking_note` (internal, no guest
   surface exists) and `booking_message` (guest-visible, deliberately composed and previewed).
2. **No guest-facing API can return `booking_note`.** The public booking response type has no field
   for it ([04](04-room-architecture.md) §2.1).
3. **Visual separation in admin**: different column, different colour, lock vs. eye icon, persistent
   label.
4. **Guest-visible messages require an explicit preview step** showing the exact rendered text before
   sending.
5. **CI contract test** asserts no public or guest-account response contains internal note fields.

---

## 6. Property scoping

**CONFIRMED direction** — Design property scoping into the IA even though `ADMIN` currently has access
to all properties.

**PROPOSED**

- A **property scope selector** sits at the top of the left rail on every screen. For `ADMIN` and
  `SUPER_ADMIN` it defaults to **All properties**.
- Selecting a property scopes every list, queue, calendar, and report to it, and the selection
  persists across navigation and sessions.
- The current scope is stated in page headings ("Booking Requests — KAS Milestone Premium Hotel") so
  an operator can never misread a filtered list as the whole picture.
- Every list query carries the scope at the **data layer**, not only in the UI — so a future
  property-scoped role cannot see other properties through a forgotten endpoint
  ([06](06-user-roles.md) §3.1).
- Cross-property modules (Users, Roles, Settings, Audit, global Analytics) are exempt and say so.

**PROPOSED — why now.** When `HOTEL_MANAGER` and `RECEPTIONIST` arrive, they become a role
definition plus a scope value. Retrofitting scoping later means auditing every query in the system.

---

## 7. Admin language

**PROPOSED** — Admin operates in **one language in V1**, with a recommendation of **Vietnamese** if
the operating team is Vietnamese-speaking, or English if the team is mixed.

Rationale: the admin console has a far larger string surface than the public site (forms, tables,
validation, help text, email template labels) and localising it doubles the translation and QA burden
for an audience of perhaps a dozen people. That effort is better spent on guest-facing Vietnamese
quality.

**Two hard exceptions** — regardless of the console's own language, these are **always edited in both
locales** with an explicit untranslated indicator: guest-facing content (property and room copy, page
blocks, offers, policies) and guest-facing email templates.

**NEEDS CONFIRMATION — OQ-057:** which language for the console. See
[25-i18n-currency-architecture.md](25-i18n-currency-architecture.md) §5.

---

## 8. Admin mobile and tablet

**PROPOSED** — Not everything needs to work everywhere.

| Screen | Mobile | Tablet | Desktop |
|---|:--:|:--:|:--:|
| Dashboard | ✔ | ✔ | ✔ |
| Request queue | ✔ | ✔ | ✔ |
| Request workspace | ✔ single-column, stacked | ✔ | ✔ 3-column |
| Arrivals / departures | ✔ | ✔ | ✔ |
| Availability lookup | ✔ | ✔ | ✔ |
| Customers | ○ read | ✔ | ✔ |
| Reviews moderation | ○ read | ✔ | ✔ |
| Inventory calendar | ✖ | ○ | ✔ |
| Pricing bulk apply | ✖ | ○ | ✔ |
| Content and media editing | ✖ | ○ | ✔ |
| Settings, Users, Audit | ✖ | ○ | ✔ |

**PROPOSED** — The mobile priority is deliberate: an agent must be able to **see a new request,
check availability, log a contact, and confirm** from a phone. Everything else can wait for a desk.
