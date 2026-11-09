# 04 — Room Architecture

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

> This is the most architecturally consequential document in Phase 1. The customer/internal boundary
> defined here is a **hard requirement**, not a design preference.

---

## 1. The three-layer model

**CONFIRMED**

```
PROPERTY
   └── ROOM TYPE          ← the only layer the customer interacts with
          └── INVENTORY   ← managed by admin, never exposed as individual units
```

| Layer | Owns | Guest sees |
|---|---|---|
| **Property** | Location, identity, facilities, policies, galleries | Yes — fully |
| **Room Type** | Product definition: description, images, area, bed, occupancy, amenities, price | Yes — fully |
| **Inventory** | Counts by state: total, available, reserved, occupied, maintenance | **Only the available count** |
| *(Physical Room — FUTURE)* | Room numbers, floor, physical attributes, assignment | **Never** |

## 2. The customer/internal boundary

**CONFIRMED** — Customers must **NOT** see:

- Room 101, Room 102, Room 202 — or any physical room number
- Internal room assignment information
- Which specific unit they will occupy
- Any internal inventory state other than the available count

**CONFIRMED** — Customers **see**, for each room type:

- Images
- Description
- Area
- Bed type
- Maximum guests
- Amenities
- Price per night
- Available quantity — e.g. **"6 rooms available"**

### 2.1 How the boundary is enforced

**PROPOSED** — A rule this important cannot rely on developers remembering it. It is enforced
structurally, at four independent levels, so that a single mistake cannot leak internal data:

1. **Separate API surfaces.** Public endpoints live under `/api/public/**`; admin endpoints under
   `/api/admin/**`. There is no shared controller and no "include internal fields if admin" flag on a
   public endpoint. The two surfaces have separate route trees, separate authorisation, and separate
   response types.
2. **Separate response models.** `RoomTypePublicView` and `RoomTypeAdminView` are distinct types.
   The public view **has no field** capable of carrying a room number, an internal note, or a
   non-available inventory count. Leaking is not a matter of forgetting to filter — the field does
   not exist on the type.
3. **Explicit mapping, never object spread.** Domain entities are never serialised directly to a
   public response. Every public DTO is built by an explicit mapper listing each field. Adding a
   sensitive field to a domain entity therefore cannot silently appear in a public payload.
4. **Automated tests as a gate.** A contract test asserts that no public endpoint response — for any
   fixture — contains keys matching a denylist (`roomNumber`, `floor`, `unitId`, `internalNote`,
   `occupiedCount`, `reservedCount`, `maintenanceCount`, `assignedTo`, …). This test runs in CI and
   fails the build. A second test asserts the public room-type response schema matches an approved
   allowlist exactly.

**PROPOSED** — Additionally: physical rooms are **not modelled at all in Phase 3–5**. The safest way
to guarantee room numbers never leak is for them not to exist in the system yet. The schema is
designed so a `PhysicalRoom` table can be added later without altering the guest-facing model.

## 3. Room Type — the customer-facing product

**PROPOSED** — Conceptual definition. Full schema in
[13-database-domain-overview.md](13-database-domain-overview.md).

### 3.1 Core attributes

| Attribute | Type | Notes |
|---|---|---|
| `propertyId` | ref | A room type belongs to exactly one property |
| `name` | localised text | e.g. "Deluxe Room". **NEEDS CONFIRMATION** — see §3.4 |
| `slug` | string | URL-stable, per property |
| `shortDescription` | localised text | Card and list contexts |
| `longDescription` | localised rich text | Detail page, editorial voice |
| `areaSqm` | decimal | Displayed as m² |
| `bedConfigurations[]` | list | e.g. 1 × King, or 2 × Twin. Supports alternatives |
| `maxAdults` | int | |
| `maxChildren` | int | |
| `maxOccupancy` | int | May be lower than adults + children |
| `viewType` | enum | City, Street, Courtyard, Rooftop, Interior — **PROPOSED** vocabulary |
| `smokingPolicy` | enum | Non-smoking / Smoking |
| `amenities[]` | refs | From the shared amenity taxonomy |
| `images[]` | media refs | Ordered, captioned, with a designated primary |
| `basePrice` | money (VND) | Nightly. See [15-inventory-rules.md](15-inventory-rules.md) for pricing layering |
| `status` | enum | `DRAFT`, `PUBLISHED`, `UNLISTED`, `ARCHIVED` |
| `sortOrder` | int | Admin-controlled display order |

### 3.2 What a room type is *not*

**PROPOSED** — A room type is a **product definition**, not a physical thing and not a rate. Three
separations that matter:

- **Room type ≠ physical room.** Ten physical rooms may all be "Deluxe Room". The guest requests *a*
  Deluxe Room, not a specific one.
- **Room type ≠ rate plan.** "Deluxe Room, breakfast included, non-refundable" is a *rate plan* over
  a room type. Rate plans are **FUTURE** (OQ-034) but the schema must not preclude them — which is
  why price does not live as a single immutable column on the room type.
- **Room type ≠ inventory.** Availability changes daily; the product definition does not.

### 3.3 Room type detail — guest view composition

**PROPOSED**

```
┌──────────────────────────────────────────────┐
│  Image gallery (primary + thumbnails)        │
├──────────────────────────────────────────────┤
│  Deluxe Room                                 │
│  28 m²  ·  1 King bed  ·  Up to 2 guests     │
│  City view  ·  Non-smoking                   │
├──────────────────────────────────────────────┤
│  Editorial description                        │
├──────────────────────────────────────────────┤
│  Amenities (grouped, iconographic)            │
├──────────────────────────────────────────────┤
│  From 1.850.000 ₫ / night                     │
│  6 rooms available for your dates             │
│  [ Add to Your Stay ]   [ − 1 + ]             │
├──────────────────────────────────────────────┤
│  Good to know: check-in, children, cancellation│
└──────────────────────────────────────────────┘
```

Nothing in this composition can express a room number.

### 3.4 Room type naming

**NEEDS CONFIRMATION** — Actual room type names per property are unknown (OQ-010). This blocks
content, pricing, and inventory setup.

**PROPOSED** — A naming convention for approval, because eight properties inventing names
independently will produce an incoherent portfolio:

```
[Character modifier?] + [Size/Class] + [Room|Suite] + [Feature?]
```

Recommended controlled base set: `Essential`, `Superior`, `Deluxe`, `Premier`, `Executive`,
`Junior Suite`, `Suite`, `Signature Suite`.
Recommended feature suffixes: `Balcony`, `City View`, `Rooftop`, `Corner`, `Terrace`.

Rules: a guest should be able to infer relative standing without any property using diminishing
language; the same name means broadly the same product across properties; features are suffixes, not
new base names. Note the interaction with the positive-framing rule — `Essential` is preferred over
`Standard` or `Basic`.

## 4. Inventory model

**CONFIRMED** — Admin manages: total inventory, available inventory, reserved inventory, occupied
inventory, maintenance inventory.

### 4.1 The five counts

**PROPOSED** — Definitions, and the invariant that binds them.

| Count | Meaning | Who changes it |
|---|---|---|
| `total` | Physical units of this room type that exist | Admin (rarely) |
| `reserved` | Units committed to confirmed or in-progress bookings for a given date | System, on booking transitions |
| `occupied` | Units currently physically in use (guest in residence) | Admin / **FUTURE** PMS |
| `maintenance` | Units out of service (renovation, repair, deep clean) | Admin |
| `available` | Units a guest may request | **Derived — never stored as an independent editable value** |

**Invariant:**

```
available(roomType, date) = total − reserved(date) − occupied(date) − maintenance(date)
available ≥ 0   must always hold
```

**PROPOSED — critical decision:** `available` is **computed**, not stored as an independently editable
field. If admin could type an availability number directly, the counts would drift out of agreement
and overbooking becomes possible. Admin edits `total`, `maintenance`, and (where no PMS exists)
`occupied`; the system derives `available`. This is a direct implementation of the confirmed
requirement that the system must prevent customers from requesting more rooms than available
inventory.

**NEEDS CONFIRMATION** — Whether KAS wants a deliberate **overbooking allowance** (a common revenue
practice). Default recommendation: **no overbooking** in v1 — it is incompatible with a
request-based model where sales confirms availability by hand. OQ-012.

### 4.2 Inventory is per date

**PROPOSED** — Availability is meaningless without a date. Inventory is modelled as a **daily record
per room type**:

```
RoomTypeInventoryDay { roomTypeId, date, total, reserved, occupied, maintenance }
```

For a stay of *N* nights, a room type is requestable only if `available ≥ requestedQuantity` on
**every** night from check-in to the night before check-out. Full algorithm in
[15-inventory-rules.md](15-inventory-rules.md).

### 4.3 What admin sees

**PROPOSED** — An inventory calendar per property: room types down, dates across, each cell showing
available/total with colour weight, and inline editing of `maintenance` and `total`. Bulk operations
by date range and by day-of-week. Every change written to an audit log with actor, timestamp, before,
after, and reason.

## 5. Multi-room and multi-type selection

**CONFIRMED** — A guest can select one room, multiple rooms, and multiple room types in a single
booking, adjusting quantity up and down.

**PROPOSED** — Rules governing selection:

1. **One property per booking request.** All room types in a single "Your Stay" belong to the same
   property. Mixing properties in one request creates ambiguity for sales (different teams, different
   confirmations) and a confusing guest experience. Multi-property trips are handled as separate
   requests, with the UI offering to start a second stay. *(Decision required — OQ-014.)*
2. **One date range per booking request.** All selected room types share the same check-in and
   check-out. Split stays are separate requests.
3. **Quantity ceiling per room type** = availability across the whole date range.
4. **Portfolio-level ceiling** — a maximum rooms-per-request threshold above which the request is
   routed as a **group enquiry** with a different sales workflow. **PROPOSED** default: 5 rooms or 10
   guests. *(OQ-015.)*
5. **Occupancy validation** — total guests must fit within the summed occupancy of selected rooms.
   The UI guides rather than blocks: "2 rooms fit up to 4 guests. Add another room for your 5th
   guest?"
6. **Live re-validation** — availability is re-checked when Your Stay is opened, when quantity
   changes, and immediately before submission. A stale selection must fail gracefully with a clear
   explanation and alternatives, never with a silent quantity reduction.

## 6. "Your Stay" model

**CONFIRMED** — Customer-facing concept is **"Your Stay"**, never "Shopping Cart".

**PROPOSED** — Structure:

```
Your Stay
─────────────────────────────────────────
KAS Milestone Premium Hotel

  Deluxe Room            × 2 rooms
  Suite Balcony          × 1 room

  Check-in    Fri 12 Sep 2026 · from 14:00
  Check-out   Sun 14 Sep 2026 · until 12:00
  2 nights

  Guests      3 adults, 1 child

  Estimated total     12.450.000 ₫
  Taxes and service charge estimated

  [ Request This Stay ]
─────────────────────────────────────────
```

**PROPOSED** — Behavioural requirements:

- Persisted server-side for authenticated guests; persisted locally (and merged on login) for guests.
- Survives navigation, refresh, and device change when signed in.
- Expires after a configurable period of inactivity (**PROPOSED**: 24 hours) with the guest warned,
  not silently emptied.
- Never described as a purchase. The estimated total is labelled **estimated** and states plainly
  that the final amount is confirmed by the KAS team.
- Fully editable up to submission; after submission it is immutable and changes go through sales.

## 7. Physical rooms — future module

**FUTURE** — Physical room numbers may exist in a later operational module. Design constraints
recorded now so the future addition is additive:

- A `PhysicalRoom` entity would attach to a room type: `{ id, roomTypeId, roomNumber, floor, status,
  notes }`.
- It would be reachable **only** from `/api/admin/**` and never referenced by any public DTO.
- Guest-facing availability continues to be computed from counts, not from counting physical rooms —
  so the public path is unchanged whether or not physical rooms exist.
- If a PMS becomes the source of truth for occupancy, the platform consumes it through an
  `OccupancyProvider` abstraction rather than reading a vendor schema directly.

## 8. Open risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A developer adds an internal field to a shared DTO and it appears publicly | Separate types + explicit mappers + CI denylist contract test (§2.1) |
| R2 | Admin edits `available` directly, desynchronising counts | `available` is derived, not editable |
| R3 | Race between two guests requesting the last room | Reservation semantics and DB-level constraints — [15-inventory-rules.md](15-inventory-rules.md) |
| R4 | Room type names diverge across 8 properties | Controlled naming convention, pending OQ-010 |
| R5 | Displayed price misleads because pricing rules are undefined | Show as "from" estimates, label as estimated, until OQ-005..008 are resolved |
| R6 | Inventory truth actually lives outside the platform | Reconciliation process and a documented source of truth — OQ-011 |
