# 09 — Admin Scope

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Confirmed admin modules

**CONFIRMED** — Dashboard · Hotels (List, Details, Gallery, Amenities, Location) · Rooms (Room Types,
Room Images, Inventory, Pricing, Availability) · Booking Requests (New, Sales Contacted, Availability
Confirmed, Payment Pending, Confirmed, Cancelled, Completed) · Customers · Reviews · Vouchers ·
Notifications · Emails · Analytics · Settings

**PROPOSED** — Three additions required to operate the above safely: **Media Library**, **Users &
Roles** (`SUPER_ADMIN`), and **Audit Log** (`SUPER_ADMIN`).

## 2. Design principles for the admin console

**PROPOSED** — The admin console is an operations tool used for hours a day. It is optimised for
speed and accuracy, not for brand expression.

1. **Density over decoration.** Tables, filters, keyboard navigation. It shares the brand's colour
   and type tokens but not its editorial layout.
2. **The queue is the home screen.** For sales staff, the day begins with "what needs me now",
   ordered by urgency.
3. **Destructive actions are hard to do by accident and easy to undo.** Confirmation on destructive
   operations; soft delete and archive rather than hard delete.
4. **Everything consequential is logged** with actor, timestamp, before/after, and reason.
5. **Guest-visible vs. internal is always visually unambiguous.** Internal notes must never be
   mistakable for guest-facing content. Distinct colour, icon, and label.
6. **Publish is deliberate.** Draft → preview → publish. Nothing reaches the public site by accident.
7. **Bulk operations exist** — eight properties × room types × 365 days makes per-cell editing
   unusable.

## 3. Module specifications

### 3.1 Dashboard

**PROPOSED** — Role-aware. Answers "what needs attention now".

- New booking requests awaiting first contact, **with SLA countdown and breaches highlighted**
- Requests by status (funnel view)
- Arrivals today / tomorrow; departures today
- Occupancy and availability summary across all properties, next 7 and 30 days
- Reviews awaiting moderation
- Failed email deliveries
- Expiring soft holds
- Recent activity feed
- Quick actions: new booking request, block inventory, publish content

### 3.2 Hotels

**CONFIRMED** — Hotel List, Hotel Details, Gallery, Amenities, Location.

**PROPOSED** — Per property:

| Tab | Contents |
|---|---|
| **Overview** | Name (VI/EN), slug, status (`DRAFT`/`COMING_SOON`/`OPEN`/`TEMPORARILY_CLOSED`/`CLOSED`), flagship flag, collection, star rating, opened date, total rooms |
| **Content** | Signature line, short & long description, neighbourhood story, signature experiences, character tags — all localised, with the positive-framing lint |
| **Gallery** | Ordered images with captions and alt text, primary/hero designation, per-category grouping (exterior, lobby, rooms, dining, facilities, neighbourhood), drag-to-reorder |
| **Amenities** | Assignment from the shared taxonomy; highlight flags |
| **Location** | Address (VI/EN), district, ward, coordinates with map picker, directions, nearby landmarks with verified distances |
| **Policies** | Check-in/out times, children, extra bed, pets, smoking, cancellation, accepted payment methods, accessibility facts |
| **Contact** | Phone, email, Zalo, front desk hours |
| **SEO** | Title, meta description, social share image |
| **Room Types** | Link into the Rooms module |

**PROPOSED** — Preview-as-guest for any draft state, and a publish checklist that blocks publishing a
property with no hero image, no description, no room types, or no address.

### 3.3 Rooms

**CONFIRMED** — Room Types, Room Images, Inventory, Pricing, Availability.

**Room Types** — list per property with name, area, bed configuration, max occupancy, base price,
inventory total, status, sort order. Editor covers all fields in
[04-room-architecture.md](04-room-architecture.md) §3.1, localised, with an amenity picker and image
manager.

**Inventory** — the calendar described in [04-room-architecture.md](04-room-architecture.md) §4.3:

- Room types down, dates across; each cell shows `available / total`
- Colour weight by availability; sold-out and maintenance states distinct
- Editable: `total`, `maintenance` (and `occupied` where no PMS exists)
- **`available` is derived and never directly editable**
- Bulk edit by date range and day-of-week
- Hover reveals the full breakdown: total / reserved / occupied / maintenance / held
- Every change audit-logged with reason

**Pricing** — base rate per room type; date-range overrides; day-of-week rules; seasonal periods;
minimum stay. All **PROPOSED** pending the pricing decisions in OQ-005..008. Bulk apply across a date
range with a preview of the resulting rate grid before commit.

**Availability** — a read-oriented view answering "what can I sell for these dates", across all
properties, used by sales when offering alternatives.

### 3.4 Booking Requests

**CONFIRMED** — Views for New, Sales Contacted, Availability Confirmed, Payment Pending, Confirmed,
Cancelled, Completed.

**PROPOSED** — Queue view:

> ⚠ **CORRECTED.** This queue holds **direct leads only** (`channelType = DIRECT`). OTA reservations
> from Booking.com, Agoda, Ctrip and Traveloka never enter it, are never assigned a sales owner, and
> carry no lead source. The generic `source` filter below has been replaced by two separate fields.
> See [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md).

- Columns: reference, guest, **lead source**, property, dates, nights, rooms, guests, estimated value,
  status, age, SLA state, **sales owner**
- Default sort: oldest unactioned first
- Filters: status, **lead source**, property, **sales owner**, date range, stay date range, value,
  SLA state, follow-up due. **No generic "source" filter** — distribution channel and lead source are
  distinct fields, and distribution channel is always `DIRECT` here
- Saved views per user ("My unactioned", "Breaching today", "Follow-up due", "Milestone this week")
- Bulk assign; export

**PROPOSED** — Detail view:

```
┌─ KAS-260912-4F7A ──────────────── REQUESTED · 47m old · SLA 2h ─┐
│ Guest      Nguyen Van A · +84 … · a@example.com · Zalo preferred │
│ Property   KAS Milestone Premium Hotel                            │
│ Stay       Fri 12 Sep → Sun 14 Sep 2026 · 2 nights                │
│ Rooms      Deluxe × 2 · Suite Balcony × 1                         │
│ Guests     3 adults, 1 child (age 6)                              │
│ Estimate   12.450.000 ₫  (snapshot at request time)               │
│ Requests   "High floor if possible. Late arrival ~23:00."         │
├───────────────────────────────────────────────────────────────────┤
│ [Assign to me] [Log contact] [Confirm availability] [Offer alt.]  │
│ [Record payment] [Confirm booking] [Cancel]                       │
├───────────────────────────────────────────────────────────────────┤
│ Availability check   Deluxe 4 avail · Suite Balcony 1 avail  ✔    │
├───────────────────────────────────────────────────────────────────┤
│ Timeline   requested → assigned → contacted → …                   │
│ Contact log · Internal notes · Guest messages · Payments · Changes│
└───────────────────────────────────────────────────────────────────┘
```

Required capabilities: live availability check against the requested dates; modify rooms/dates/
quantities with change history and guest notification; propose alternatives (other dates, room types,
or KAS properties) and send; record payments with evidence; templated messages; internal notes
visually distinct from guest-visible content; full status transitions per
[14-booking-state-machine.md](14-booking-state-machine.md); manual booking creation for phone and
walk-in enquiries.

### 3.5 Customers

**PROPOSED** — List with search, filters (has stayed, request count, value, language, marketing
consent), and a detail view showing profile, booking history, review history, communication history,
vouchers, internal notes, and consent state. Access is audit-logged; export requires `SUPER_ADMIN`.
Merge duplicate customers (a real operational need when guest requests and accounts coexist).
Anonymise on request. **NEEDS CONFIRMATION** — retention rules (OQ-027).

### 3.6 Reviews

**CONFIRMED** — Admin moderation and admin reply.

**PROPOSED** — Moderation queue with pending/approved/rejected; review detail showing the linked
completed booking (proving Verified Stay); per-dimension scores; photo moderation; reject with a
reason recorded and communicated; public reply with its own approval step; report/flag handling;
aggregate rating recomputation on publish. `SUPER_ADMIN` only may delete (OQ-024). Editing a guest's
review text is **prohibited** — the platform must not put words in a guest's mouth.

### 3.7 Vouchers

**PROPOSED** — Code, name, description, type (percentage / fixed amount / value-add such as free
breakfast or upgrade), value, validity window, stay-date window, applicable properties and room
types, minimum nights, minimum value, usage limits (total and per customer), stackability, status.
Usage report per voucher.

**NEEDS CONFIRMATION** — Voucher rules are substantially undefined (OQ-029). In a request model,
vouchers are *applied to the estimate and confirmed by sales*, not redeemed at payment — which means
a voucher must be able to be validated at request time and re-validated at confirmation time.

### 3.8 Notifications

**PROPOSED** — Configuration of in-app and email notifications per event; recipient rules (guest,
assigned agent, property team, all admins); channel per event; quiet hours; escalation rules for SLA
breach; delivery log with retry. Staff notification preferences per user.

### 3.9 Emails

**PROPOSED** — Template management (localised, versioned, with a preview and test-send), the trigger
map from [05-booking-sales-model.md](05-booking-sales-model.md) §7, a delivery log with status
(queued, sent, delivered, bounced, failed) and retry, bounce and complaint handling, sender identity
configuration, and a suppression list. Bulk/campaign sending is `SUPER_ADMIN` only and must respect
marketing consent.

### 3.10 Analytics

> ⚠ **CORRECTED.** An earlier draft specified "conversion by property, source, and period" — a single
> generic source dimension. **Prohibited.** Analytics is split into two domains that are never combined
> on one axis. See [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md) §8.

**PROPOSED — Direct Sales Performance:** booking funnel (search → property → room → stay → request →
confirmed); **leads and conversion by lead source** (website, Facebook, Zalo, TikTok, Instagram, phone,
walk-in, referral, returning); response time and SLA compliance; sales owner performance; lost and
expired leads by reason; follow-up compliance; alternatives offered vs accepted.

**PROPOSED — OTA Distribution Performance:** reservations and room-nights by distribution channel;
channel mix (direct share vs each OTA); allotment utilisation; lead time to arrival; cancellation rate
by channel; net value where commission data exists (OQ-072).

**PROPOSED — Operational Performance (D-38):** occupancy; arrivals and departures; room availability;
room-type utilisation — **across all channels**, since KAS Admin is the operational hub.

**PROPOSED — shared:** review scores over time; voucher performance. Date-range comparison and CSV
export throughout.

**CONFIRMED** — No generic "Bookings by Source" metric exists. The three domains are never combined on
one axis. The one legitimate cross-domain view is **channel mix** — direct share vs each OTA — which
compares *channels*, not *sales performance*.

**PROPOSED** — Response time and SLA compliance are the metrics most likely to be new to KAS and most
likely to change behaviour. They should be prominent, not buried.

### 3.11 Settings — `SUPER_ADMIN`

**PROPOSED** — Organisation details and legal entity; brand assets; global policies; **SLA
configuration** (single source driving the promise text, timers, and escalation); booking rules
(maximum rooms per request, group threshold, hold duration, request expiry, maximum stay length);
currency and tax configuration; language configuration and default; email/storage/maps provider
configuration; banned-phrase list for the positive-framing lint; feature flags; integration
credentials (write-only, never displayed after saving).

### 3.12 Media Library — **PROPOSED**

Central asset store with upload (drag-drop, bulk), automatic derivative generation, alt text and
caption per asset (localised), tagging by property and category, usage tracking (where an asset
appears — essential before deleting anything), and replacement that updates all usages.

### 3.13 Users & Roles — `SUPER_ADMIN` — **PROPOSED**

Create and disable staff accounts, assign roles and property scope, force password reset,
view active sessions and revoke them, and edit role permission bundles. Staff 2FA is not required
in V1 per [owner decision 150](150-owner-decision-no-2fa.md).

### 3.14 Audit Log — `SUPER_ADMIN` — **PROPOSED**

Immutable, append-only record of privileged actions: actor, action, entity, before/after, timestamp,
IP, user agent. Filterable and exportable. Retention per OQ-027.

## 4. Operational workflows the console must support

**PROPOSED**

| Workflow | Path through the console |
|---|---|
| Morning triage | Dashboard → unactioned requests by SLA → assign → contact |
| Handling a request | Booking detail → check availability → log contact → confirm/offer alternative → record payment → confirm |
| Closing a room for maintenance | Inventory calendar → select range → set maintenance → reason → save |
| Seasonal rate change | Pricing → select properties/room types → date range → apply → preview → commit |
| Publishing a new property | Hotels → create → content → gallery → amenities → location → room types → inventory → pricing → publish checklist |
| Moderating reviews | Reviews → pending → verify booking → approve/reject → optional reply |
| Arrival preparation | Dashboard → arrivals today → per-booking details and special requests |
| Investigating a complaint | Customers → booking → timeline → contact log → audit trail |

## 5. Admin non-functional requirements

**PROPOSED**

- List views usable at 10,000+ bookings: server-side pagination, filtering, and sorting
- Inventory calendar renders 8 properties × room types × 90 days without stalling
- Optimistic concurrency on shared records — two agents must never silently overwrite each other
- Session timeout shorter than the customer site, with unsaved-work protection
- Keyboard shortcuts for high-frequency actions
- Works on tablet for on-property use; the queue and booking detail must be usable on mobile
- Full audit coverage of privileged actions
- No guest personal data in admin URLs
- Admin routes excluded from search indexing and served under a distinct path
