# 69 — Admin Experience

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Last updated:** 2026-08-14

> Structure and permissions are frozen in [59](59-phase-4-rbac.md) and
> [60](60-phase-4-admin-operations.md). This document specifies the **experience**.

---

## 1. Design language — deliberately not the customer site

**PROPOSED** — [64](64-phase-5-ux-principles.md) §4. Admin shares the colour and type **tokens** and
almost nothing else.

| | Customer site | **Admin** |
|---|---|---|
| Density | Generous | **Dense** |
| Imagery | Dominant | Functional thumbnails |
| Motion | Subtle reveals | **State changes only** |
| Input | Guided, forgiving | **Keyboard-first** |
| Measured by | Trust, completion | **Actions per minute, error rate** |

Forcing the editorial language into a console used for hours a day would slow operators. That is not a
compromise of the brand; it is the brand serving the people who run it.

---

## 2. Shell

```
┌─────────────────────────────────────────────────────────────────────────┐
│ KAS Admin   [ All properties ▾ ]        ⌕ search    ⚡ quick    🔔   ◔  │
├──────────────┬──────────────────────────────────────────────────────────┤
│ ◉ Dashboard  │                                                          │
│              │                                                          │
│ DIRECT SALES │   Booking Requests — All properties                      │
│  Inquiries ④ │   ──────────────────────────────────────────────────     │
│  Requests  ⑦ │                                                          │
│  Follow-ups③ │                                                          │
│  Assignments │                                                          │
│  Lead Sources│                                                          │
│              │                                                          │
│ OPERATIONS   │                                                          │
│  Reservations│                                                          │
│  Arrivals    │                                                          │
│  Departures  │                                                          │
│  Occupancy   │                                                          │
│  Inventory   │                                                          │
│              │                                                          │
│ DISTRIBUTION │                                                          │
│  OTA Reserv. │                                                          │
│  Channels    │                                                          │
│  Sync  FUTURE│                                                          │
│              │                                                          │
│ COMMERCIAL   │  CONTENT · CUSTOMERS · REVIEWS · SECURITY                │
└──────────────┴──────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| **Property scope selector** | Always visible; scope **echoed in every page heading** so a filtered list can never be misread as the whole picture |
| **Global search** | Reference, guest name, email, phone, property. The highest-value admin feature: a guest calls quoting a reference and the agent reaches the record in one action |
| **Badges** | Only *actionable* counts. A badge that never clears becomes invisible |
| Areas | Eight, permission-filtered — **hidden, not greyed out** |

---

## 3. Dashboard

**PROPOSED** — Role-aware. Answers "what needs me now" in under five seconds.

| Panel | Field | Audience |
|---|---|---|
| Unactioned direct requests, SLA breaches highlighted | `salesStatus` | Sales |
| Follow-ups due / overdue | Inquiry + reservation | Sales |
| Expiring holds, with countdown | Holds | Sales |
| **Arrivals today / tomorrow** | **`stayStatus`, all channels** | Operations |
| Departures today | `stayStatus` | Operations |
| Occupancy next 7 / 30 days | Inventory | Operations |
| **OTA recording lag + buffer overflow alerts** | Distribution | Operations |
| Reviews awaiting moderation | Reviews | Content |
| Merge candidates awaiting review | Customer | Admin |
| Failed email deliveries | Email log | Admin |

---

## 4. Direct Sales

**CONFIRMED** — `channelType = DIRECT` only. **OTA reservations never appear as sales leads.**

### 4.1 Inquiries

```
Inquiries                            [ + New inquiry ]
 ⦿ New (4)   Mine   Follow-up due (2)   All

 Source     Contact        Interest        Question              Owner  Next follow-up  Hold
 ───────────────────────────────────────────────────────────────────────────────────────────
 FACEBOOK   Nguyen Van A   [Milestone]?    "rooms in September?"  —      —              —
 ZALO       Tran Thi B     —               "family room?"         Linh   Today 16:00    ⏳ 3h
```

| Element | Note |
|---|---|
| **Lead source is a first-class column** | An agent should see at a glance where the morning's enquiries came from |
| **Hold indicator ⏳** | Shows an active `ALTERNATIVE_OFFER` hold with its expiry countdown ([55](55-phase-4-inventory.md) §5) |
| Qualify action | Opens a panel for property, dates, room types, quantities → **creates a reservation** |
| No inventory by default | An inquiry holds nothing. The hold column is empty unless an agent explicitly placed one |

### 4.2 The direct request queue

```
Direct Requests                      [ + New direct request ]
                                     channelType = DIRECT
 ⦿ New (7)  Mine (3)  Breaching (1)  Follow-up due (5)  Awaiting payment  All

 Ref              Guest         Lead source  Property   Stay            Rooms  Value        Age    SLA  Owner
 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
 KAS-260912-4F7A  Nguyen Van A  FACEBOOK     Milestone  12–14 Sep (2n)   3    12.450.000₫  47m    ●    —
 KAS-260912-3B21  Tran Thi B    WEBSITE      Sonata     20–22 Sep (2n)   1     3.200.000₫  6h12m  ▲    Linh
 KAS-260911-9C04  J. Smith      ZALO         Passion    01–05 Oct (4n)   2     8.900.000₫  1d 2h  ■    Minh
```

- **Default sort: oldest unactioned first.** A request model fails by neglect, not by backlog order.
- SLA: ● within promise · ▲ approaching · ■ breached — driven by config A6.
- Filters: status, **lead source**, property, **sales owner**, dates, value, SLA state, follow-up due.
  **No generic "source" filter exists.**
- Bulk assign and export. **No bulk status transitions** — each request is a guest and a conversation.

### 4.3 Request workspace

```
KAS-260912-4F7A                    ⦿ New · 47m · within promise · unassigned  [Assign to me]

┌ LEAD ─────────────────────────────────────────────────────────────────────┐
│ Distribution DIRECT   Lead source FACEBOOK   Detail "[campaign]"           │
│ Sales owner  —                               Next follow-up  —             │
└───────────────────────────────────────────────────────────────────────────┘
┌ GUEST & STAY ──────────┬ WORKFLOW ───────────────┬ HISTORY ───────────────┐
│ Nguyen Van A           │ ① Availability check    │ Timeline               │
│ +84 … · Zalo preferred │   [Deluxe] ×2  4 avail ✔│ Contact log            │
│ Unverified email ⚠     │   [Suite]  ×1  1 avail ✔│ Internal notes 🔒      │
│ 2 previous stays       │   [Re-check]            │ Guest messages 👁      │
│                        │ ② Log contact           │ Changes                │
│ [Milestone]            │ ③ Confirm availability  │ Emails sent            │
│ 12–14 Sep · 2n         │    Offer alternative ▾  │                        │
│ 3 adults, 1 child (6)  │    Decline              │                        │
│                        │ ④ Record payment        │                        │
│ Est. [12.450.000] ₫    │ ⑤ [ Mark as WON ]       │                        │
└────────────────────────┴─────────────────────────┴────────────────────────┘
```

**PROPOSED — the alternative-offer panel** is where Decision 3 becomes an interface:

```
Offer alternatives                              up to 3
 ① [Deluxe] × 3, same dates        4 available   ☐ Hold this
 ② Same rooms, 13–15 Sep           available     ☐ Hold this
 ③ [KAS Sonata], same dates        available     ☐ Hold this

 ☐ Release the original hold when sending
 Holds expire after [DIRECT_ALTERNATIVE_HOLD_DURATION]
                                        [ Preview ]  [ Send offer ]
```

- Holding is an **explicit, unticked choice** — never automatic.
- **"Release the original"** is offered inline, because otherwise one guest holds two sets of rooms.
- With the duration unconfigured, the checkbox is **disabled with an inline message naming the missing
  setting** — the UI never invents a value ([58](58-phase-4-api-contract.md) `CONFIG_MISSING`).

**CONFIRMED — the internal/guest boundary is visual and structural.** 🔒 internal notes and 👁 guest
messages are **two separate objects**, different colour, different icon, permanent label. Guest
messages require an explicit **preview of exactly what the guest will see** before sending.

---

## 5. Operations

**CONFIRMED** — All channels. Queries use `stayStatus`.

```
Arrivals — Tuesday 12 September            [ All properties ▾ ]

 Time   Guest          Property    Rooms              Channel   Nights  Notes
 ───────────────────────────────────────────────────────────────────────────────
 14:00  Nguyen Van A   Milestone   [Deluxe] × 2       ● Direct   2      High floor
 15:30  M. Dubois      Milestone   [Deluxe] × 1       ◆ Agoda    3      —
 ~23:00 J. Smith       Passion     [Suite] × 1        ● Direct   4      Late arrival
```

**PROPOSED** — The channel indicator is **shown, never used to filter the daily list**. Operations
needs to *see* the channel; producing the arrivals list from it would drop OTA guests entirely — the
highest-risk defect in the whole system ([63](63-phase-4-validation.md) R1).

| Screen | Behaviour |
|---|---|
| Arrivals / Departures / In-house | Date-scoped, all channels, print-friendly, mobile-usable |
| Reservations | All channels; **channel is an optional filter, never a default** |
| Occupancy | Derived from `stayStatus = CHECKED_IN` |
| **Inventory calendar** | Room types × dates. Cell shows `available / total`. **`available` is displayed and never editable.** Hover reveals the full breakdown; every edit requires a reason |

---

## 6. Distribution

```
Record OTA reservation                                  TRANSITIONAL — V1

  Channel *        [ Booking.com ▾ ]   ← required, explicit
  OTA reference *  [ ____________ ]    ← unique per channel
  Property *       [ ▾ ]     Dates *   [ ___ ] → [ ___ ]
  Rooms *          [ room type ▾ ] × [ qty ]        [ + add ]
  Guest            name · email · phone
  Rate             [ ______ ] ₫
  Received at *    [ date/time ]       ← measures recording lag

                                        [ Save and add another ]  [ Save ]
```

**CONFIRMED** — This form has **no sales owner field and no lead source field.** They cannot be
supplied even by a malformed client — the columns must be `NULL` by database constraint.

| Behaviour | Detail |
|---|---|
| Keyboard-driven | Recording lag is the metric that retires the safety buffer; speed matters |
| Duplicate detection | On `(channel, otaReference)` |
| **Never rejected** | Buffer overflow auto-expands and alerts; a genuinely oversold date records and raises a P1. **Availability fails closed; recording fails open** |
| Late recording | Permitted, including after arrival, with the true dates and correct `stayStatus` |
| Labelled | `TRANSITIONAL — V1` on screen, so nobody accepts it as permanent |

**Channel Status** shows, per channel: buffer configured vs used · recorded reservations · **recording
lag** · reconciliation variance · overflow alerts. This is where the buffer's retirement criteria are
measured — without the screen, the buffer never retires because nobody can evidence it is safe to
shrink.

---

## 7. Media management

**CONFIRMED flow:** UPLOAD → ASSIGN → ORDER → COVER → ALT TEXT → DRAFT → PUBLISH.
**No developer intervention for normal image management.**

```
Media Library                    [ ⬆ Upload ]   [ ▦ grid | ☰ list ]
 Filters: property · category · status · unused · missing alt text

 ┌──────┬──────┬──────┬──────┐
 │ img  │ img  │ img  │ img  │   each tile: category · usage count
 │ ⚠alt │  ✓   │  ✓   │ ⚠alt │   ⚠ = missing alt text, cannot publish
 └──────┴──────┴──────┴──────┘
```

### 7.1 The flow as screens

| Step | Screen | Behaviour |
|---|---|---|
| **Upload** | Drag-and-drop, bulk | Direct-to-storage; progress per file; EXIF stripped |
| **Assign** | From the asset, or from a gallery editor | Property · room type · facility |
| **Order** | Gallery editor | Drag to reorder; order is per attachment, not global |
| **Cover** | Gallery editor | One cover per owner, enforced by a partial unique index |
| **Alt text** | Asset detail | **Both locales. A publish gate — an asset without alt text cannot go public** |
| **Draft → Publish** | Asset **and** attachment | Two levels: an asset can be published in the library while one attachment is still draft |

### 7.2 Gallery editor

```
KAS Milestone Premium Hotel — Property gallery       ● 18 published · ○ 3 draft

 ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 │ ★COVER │ │   2    │ │   3    │ │  + Add │      drag to reorder
 │  ✓ alt │ │  ✓ alt │ │ ⚠ alt  │ │        │
 └────────┘ └────────┘ └────────┘ └────────┘
 Categories: Exterior · Lobby · Rooms · Dining · Facilities · Neighbourhood
                                            [ Preview as guest ]  [ Publish ]
```

| Rule | Detail |
|---|---|
| **Preview as guest** | Any draft, either locale, any breakpoint |
| **Deletion blocked while in use** | The block **names the usages**. Cascading would silently empty a published gallery |
| Replace everywhere | One action updates every usage — essential when a property is rephotographed |
| Published content is live | The website reflects it without a deploy |

---

## 8. Commercial, Content, Customers, Reviews, Security

| Area | UX note |
|---|---|
| **Central Rates** | Lives in Commercial, **not Direct Sales**. Rate grid shows which rule won each cell. **Bulk apply requires a preview grid before commit** — applying a rate across 90 days blind is how revenue accidents happen |
| **Content** | Publish checklist blocks incomplete properties, listing exactly what is missing |
| **Customers** | Customer 360 with a multi-channel timeline. **Merge candidates are reviewed, never auto-applied** below HIGH confidence; the merge screen shows both records side by side with the confidence signal |
| **Reviews** | Approve / reject with a reason from a fixed list / reply. **No edit action exists** — the UI has no field for it. Ratings ≤ 2 raise an internal alert before publication |
| **Security** | Users, roles with property scope, audit log, settings. Settings producing guest-visible text show a **live preview** of the resulting string beside the field |

---

## 9. Analytics — three domains, never combined

**CONFIRMED**

| Domain | Field | Headline |
|---|---|---|
| **Direct Sales** | `salesStatus` + DIRECT | **Conversion by lead source** — the most commercially valuable number the platform produces |
| **OTA Distribution** | `salesStatus IS NULL` | **Channel mix** — direct share vs each OTA |
| **Operations** | `stayStatus` | Occupancy, arrivals, utilisation |

**CONFIRMED** — No chart places lead sources and OTA channels on one axis. **No "Bookings by Source"
metric exists.** Sales SLA and owner metrics exclude OTA by construction — an OTA reservation has no
`salesStatus` and no owner.

---

## 10. Cross-cutting

| Requirement | Detail |
|---|---|
| Keyboard shortcuts | `/` search · `g` then area · `a` assign · `Esc` close. Discoverable via `?` |
| Destructive actions | Confirmation; archive over delete; soft delete with grace |
| Optimistic concurrency | Two operators never silently overwrite; conflict shows both versions |
| Audit | Every privileged action logged with actor, before/after, reason |
| Performance | Lists usable at 10,000+ reservations; inventory calendar 8 × 90 days ≤ 2s |
| **Mobile** | Queue, request workspace, arrivals, availability lookup and **OTA recording** must work on a phone. Inventory calendar, pricing and settings are desktop |
| Language | One console language in V1 (config A12). **Guest-facing content and email templates are always bilingual regardless** |
| Accessibility | Full keyboard operability, visible focus, semantic tables, labelled form controls ([71](71-phase-5-responsive-accessibility.md)) |

---

## 11. Open dependencies

| ID | Blocks |
|---|---|
| B24 | Sales team structure — whether a `SALES` role ships and how the queue is scoped |
| **B25** | **OTA recording process owner** — the Distribution UX assumes a human process nobody has described |
| B1 | `DIRECT_ALTERNATIVE_HOLD_DURATION` — the hold checkbox is disabled without it |
| B3 / B7 | Buffer values and channel volume — Channel Status has no baseline |
| B4 / B5 | Recording lag and variance thresholds — alerting has no trigger |
| A12 | Console language |
| OQ-023 / OQ-024 | Price override limit; review moderation authority |
