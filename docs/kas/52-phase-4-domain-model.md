# 52 — Domain Model

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative for Phase 4 technical contracts
**Last updated:** 2026-08-14

> Business rationale lives in Phase 1–3. This document defines the **canonical entities**. Where it
> conflicts with an earlier document, this one governs and the supersession is recorded in §9.

---

## 1. Data classes

**PROPOSED** — Every entity belongs to exactly one class. The class determines retention, audit,
caching and access rules.

| Class | Characteristics | Examples |
|---|---|---|
| **MASTER** | Slow-changing, admin-authored, cacheable, public-safe | Property, RoomType, Amenity, Facility, DistributionChannel |
| **TRANSACTIONAL** | Guest- or sales-generated, immutable history, audited | Reservation, ReservationLine, SalesInquiry, Payment, Voucher redemption |
| **OPERATIONAL** | High-churn, date-scoped, authoritative for availability | InventoryDay, Hold, buffer rules |
| **CONTENT** | Editorial, localised, versioned, publishable | MediaAsset, Page blocks, Policy, translations |
| **SECURITY** | Identity, authorisation, audit. Never cached, never public | User, Role, Permission, RoleAssignment, AuditLog, Session |

---

## 2. Canonical naming freeze

**PROPOSED — supersedes earlier drafts.** Phase 1–3 used `booking` as the table name while Phase 3
language moved to *reservation*. Phase 4 freezes:

| Concept | Canonical name | Superseded name |
|---|---|---|
| The reservation aggregate | **`reservation`** | `booking` ([13](13-database-domain-overview.md) §3.4) |
| A line within it | **`reservation_line`** | `booking_line` |
| Status history | **`reservation_status_history`** | `booking_status_history` |
| Contact log | **`reservation_contact_log`** | `booking_contact_log` |
| Internal note | **`reservation_note`** | `booking_note` |

Rationale: one reservation entity serves direct and OTA; "booking" reads as a direct-sales artefact and
invites the split this architecture exists to prevent. Guest-facing vocabulary is unchanged — guests
still see **"booking request"** and **"Your Stay"** ([26](26-booking-ux-information-architecture.md) §13).

---

## 3. Entity catalogue

Each entry: **purpose · identity · key attributes · relationships · lifecycle · ownership · invariants ·
nullable · visibility.**

Visibility: **Public** (guest-facing API) · **Auth** (own records only) · **Admin** · **Internal**
(never leaves the server).

### 3.0 Partner — MASTER *(added by [85](85-partner-property-model-amendment.md))*

| | |
|---|---|
| **Purpose** | The management / ownership organisation above one or more properties. **Partner ≠ Property** |
| **Identity** | `id` UUID · `code` unique slug |
| **Key attributes** | `legalName`, `displayName`, `status` |
| **Relationships** | **1 → N Property** · 1 → N MediaAsset · 1 → N RoleAssignment |
| **Lifecycle** | `ACTIVE` · `SUSPENDED`. **No onboarding lifecycle in V1** |
| **Ownership** | `SUPER_ADMIN` only |
| **Invariants** | Every property has exactly one partner |
| **Visibility** | **Internal only.** Never reaches a public or `/me` response |

**CONFIRMED** — V1 has **exactly one partner** managing all **eight properties**. Deliberately minimal:
identity and ownership only. **No billing, commission, contract, KYC or payout fields** — those are the
marketplace this amendment explicitly excludes.

### 3.1 Property — MASTER

| | |
|---|---|
| **Purpose** | One of the 8 KAS hotels |
| **Identity** | `id` UUID · `slug` unique, immutable after publish |
| **Key attributes** | **`partnerId` (required)**, `lifecycleState`, `isFlagship`, `collection`, district, ward, coordinates, contact, check-in/out times, `sortOrder` |
| **Relationships** | 1→N RoomType · 1→N Facility · 1→N MediaAsset · 1→N Policy · N↔N Amenity · 1→N Reservation |
| **Lifecycle** | `DRAFT → COMING_SOON → OPEN → TEMPORARILY_CLOSED → CLOSED` |
| **Ownership** | `ADMIN` property-scoped; delete `SUPER_ADMIN` only |
| **Invariants** | Publishable only with hero image, signature line, both-locale descriptions, address, ≥1 published room type, ≥1 signature experience. `signatureLine` unique across published properties |
| **Nullable** | `collection`, `starRating`, `openedYear` |
| **Visibility** | **Public** when `OPEN`/`COMING_SOON`/`TEMPORARILY_CLOSED` |

### 3.2 RoomType — MASTER

| | |
|---|---|
| **Purpose** | The customer-facing room **product**. Not a physical room, not a rate |
| **Identity** | `id` · `slug` unique **per property** |
| **Key attributes** | `areaSqm`, bed configurations, `maxAdults`, `maxChildren`, `maxOccupancy`, `viewType`, `smoking`, `basePriceMinor`, `sortOrder`, `status` |
| **Relationships** | N→1 Property · 1→N MediaAsset · N↔N Amenity · 1→N InventoryDay · 1→N ReservationLine · 1→N RateRule |
| **Lifecycle** | `DRAFT → PUBLISHED → UNLISTED → ARCHIVED` |
| **Ownership** | `ADMIN` property-scoped |
| **Invariants** | `maxOccupancy ≤ maxAdults + maxChildren`. **No field capable of holding a room number exists** |
| **Nullable** | `areaSqm`, `viewType` |
| **Visibility** | **Public** when `PUBLISHED` |

### 3.3 InventoryDay — OPERATIONAL

| | |
|---|---|
| **Purpose** | Availability truth for one room type on one date |
| **Identity** | Composite unique `(roomTypeId, date)` |
| **Key attributes** | `total`, `maintenance`, `otherBlocks`, plus derived commitment and buffer figures ([55](55-phase-4-inventory.md)) |
| **Relationships** | N→1 RoomType |
| **Lifecycle** | Generated on a rolling 24-month horizon; never deleted |
| **Ownership** | System writes commitments; `ADMIN` edits `total`, `maintenance`, `otherBlocks` |
| **Invariants** | **`available ≥ 0` enforced by CHECK.** `available` is derived, never an editable column |
| **Nullable** | None |
| **Visibility** | **Only the derived available count** reaches Public. All component figures are Admin |

### 3.4 Hold — OPERATIONAL

| | |
|---|---|
| **Purpose** | A time-bounded claim on inventory, pending a sales outcome |
| **Identity** | `id`; unique `(holdType, reservationId, inquiryId, roomTypeId, date)` |
| **Key attributes** | `holdType` (`REQUEST` \| `ALTERNATIVE_OFFER`), quantity, `status`, `createdBy`, `createdAt`, **`expiresAt` NOT NULL**, `releasedAt`, `releaseReason` |
| **Relationships** | N→1 Reservation **XOR** N→1 SalesInquiry · N→1 RoomType · N→1 Property |
| **Lifecycle** | `ACTIVE → CONVERTED \| RELEASED \| EXPIRED` |
| **Ownership** | System, or the sales agent who placed it |
| **Invariants** | Exactly one of `reservationId`/`inquiryId`. **`expiresAt` is mandatory at creation**, cleared only when firm on `salesStatus = WON` |
| **Nullable** | `releasedAt`, `releaseReason`, `createdBy` (null = system) |
| **Visibility** | **Internal.** Never public, in any form |

### 3.5 SalesInquiry — TRANSACTIONAL

| | |
|---|---|
| **Purpose** | A direct enquiry captured before enough information exists to create a reservation |
| **Identity** | `id` |
| **Key attributes** | `leadSource` (required), `leadSourceDetail`, `salesOwnerId`, contact fragment, `inquiryText`, optional `propertyInterest`/`dateHint`, follow-up schedule, `attemptCount` |
| **Relationships** | N→1 Customer (optional) · N→1 User (owner) · 1→1 Reservation on qualification · 1→N Hold |
| **Lifecycle** | `NEW → QUALIFIED \| LOST` |
| **Ownership** | KAS Sales |
| **Invariants** | **DIRECT only.** `leadSource` required. **Holds no inventory itself** — only an explicit `ALTERNATIVE_OFFER` hold, which carries its own stay parameters and expiry |
| **Nullable** | Every contact field individually (enquiries are fragmentary); `salesOwnerId` until assigned |
| **Visibility** | **Internal.** Never guest-facing |

### 3.6 Reservation — TRANSACTIONAL · the central aggregate

| | |
|---|---|
| **Purpose** | The operational stay, whatever channel sold it |
| **Identity** | `id` · `reference` unique, format `KAS-YYMMDD-XXXX`, non-sequential |
| **Key attributes** | `distributionChannelId`, `channelType`, `leadSource`, `salesOwnerId`, **`salesStatus`**, **`stayStatus`**, dates, guest counts, contact, price snapshot, `otaReference`, `createdBy` |
| **Relationships** | N→1 Property · N→1 Customer (nullable for guest requests) · 1→N ReservationLine · 1→N Hold · 1→N Payment · 1→N StatusHistory · 1→N ContactLog · 1→N Note · 1→1 Review · N→1 Voucher |
| **Lifecycle** | **Two independent lifecycles** — see [54](54-phase-4-state-machines.md) |
| **Ownership** | Direct: sales owner. OTA: operations. Neither owns the stay lifecycle exclusively |
| **Invariants** | See §4 |
| **Nullable** | `salesStatus` (NULL ⇔ OTA) · `leadSource`/`salesOwnerId` (NULL ⇔ OTA) · `stayStatus` (NULL until confirmed) · `customerId` · `otaReference` (non-null ⇔ OTA) |
| **Visibility** | **Auth** for the owning customer, heavily filtered. **Admin** in full |

### 3.7 ReservationLine — TRANSACTIONAL

| | |
|---|---|
| **Purpose** | One room type × quantity within a reservation |
| **Identity** | `id`; unique `(reservationId, roomTypeId)` |
| **Key attributes** | `quantity`, `roomTypeNameSnapshot`, `nightlyPriceMinor`, `lineTotalMinor` |
| **Relationships** | N→1 Reservation · N→1 RoomType |
| **Lifecycle** | Follows the reservation; modifications recorded in change history |
| **Invariants** | `quantity ≥ 1`. Name and price are **snapshots** — a later rename or rate change must not alter history |
| **Visibility** | **Auth** (own) · **Admin** |

### 3.8 Customer — TRANSACTIONAL + SECURITY

| | |
|---|---|
| **Purpose** | One person, across every channel and property — Customer 360. **Platform-level: never partner-scoped** ([85](85-partner-property-model-amendment.md) §3.3) |
| **Identity** | `id`; verified email primary, phone secondary |
| **Key attributes** | Profile, `firstDistributionChannel`, `firstLeadSource` (write-once), consent per purpose, preferences, merge history |
| **Relationships** | 1→N Reservation (all channels) · 1→N SalesInquiry · 1→N Review · 1→1 User (optional) |
| **Lifecycle** | `UNVERIFIED → ACTIVE → SUSPENDED → ANONYMISED` |
| **Ownership** | Customer owns their profile; `ADMIN` may support; `SUPER_ADMIN` may anonymise |
| **Invariants** | Unique verified email. **Never auto-merge on a weak identity signal.** First-touch fields are write-once |
| **Nullable** | `userId` (guest requesters have no account), most profile fields |
| **Visibility** | **Auth** (own) · **Admin** (audited) |

### 3.9 Payment — TRANSACTIONAL

| | |
|---|---|
| **Purpose** | **Records** a payment that happened elsewhere. V1 processes nothing |
| **Identity** | `id` |
| **Key attributes** | Method, `amountMinor`, currency, external reference, `receivedAt`, `recordedBy`, evidence attachment, status |
| **Relationships** | N→1 Reservation · N→1 User (recorder) |
| **Lifecycle** | `RECORDED → VERIFIED → REVERSED` |
| **Invariants** | **No card or credential data may ever be stored.** Multiple payments per reservation permitted (deposits) |
| **Visibility** | **Auth** (own, summary only) · **Admin** |

### 3.10 Review — TRANSACTIONAL

| | |
|---|---|
| **Purpose** | A verified guest review of a completed stay |
| **Identity** | `id`; **unique `reservationId`** |
| **Key attributes** | Overall + 5 sub-scores, title, body, language, `stayMonth`, moderation state |
| **Relationships** | 1→1 Reservation · N→1 Customer · N→1 Property · 1→N ReviewPhoto · 1→1 ReviewReply |
| **Lifecycle** | `PENDING → APPROVED \| REJECTED → HIDDEN` |
| **Invariants** | **Requires `stayStatus = COMPLETED`** — channel-agnostic. One review per reservation, enforced by the unique FK. **Staff may never edit review text** |
| **Visibility** | **Public** when `APPROVED` |

### 3.11 DistributionChannel — MASTER

Reference table: `code` (`DIRECT`, `BOOKING_COM`, `AGODA`, `CTRIP`, `TRAVELOKA`), `displayName`,
`type` (`DIRECT` \| `OTA`), `isActive`. A managed table, not an enum, so a new OTA is configuration.
**Visibility:** channel code is **Admin only** — a guest has no reason to learn which OTA sold a room.

### 3.12 LeadSource — MASTER (enumeration)

`WEBSITE · FACEBOOK · ZALO · TIKTOK · INSTAGRAM · PHONE · WALK_IN · REFERRAL · RETURNING_CUSTOMER ·
OTHER`. **Applies to DIRECT only.** Grouped for reporting (Owned / Social / Human / Relationship /
Unclassified). **Visibility: Internal.**

### 3.13 SalesOwner — a relationship, not an entity

**PROPOSED** — `reservation.salesOwnerId` and `salesInquiry.salesOwnerId` are foreign keys to `User`,
with an assignment history table. There is no `SalesOwner` entity. **Applies to DIRECT only; NULL for
OTA, enforced by CHECK.**

### 3.14 Amenity · Facility — MASTER

**Amenity** — a shared controlled vocabulary assigned to properties and room types. Category, icon,
localised name, `isHighlight`. **Public.**

**Facility** — a *physical thing at a property with editorial content*: restaurant, bar, rooftop, gym,
pool, spa. Has its own gallery, hours, description. **Distinct from Amenity**: an amenity is a
checkbox, a facility is a story with images. This distinction is what makes the additive flagship model
work ([23](23-content-architecture.md) §5). **Public.**

### 3.15 MediaAsset — CONTENT

Central library. `storageKey`, dimensions, checksum, category, localised alt text and caption, usage
tracking. Attached to Property, RoomType or Facility via a join carrying `displayOrder` and
`isCover`. **Public** for published assets — but **the storage key is never exposed**; the public API
returns resolved delivery URLs only ([62](62-phase-4-media.md)).

### 3.16 RateRule — MASTER

Scope (property \| room type), `dateFrom`/`dateTo`, `daysOfWeek`, priority, amount or adjustment,
min/max stay. Plus three **V1-null hooks**: `channelScope`, `ratePlanId`, `restrictions`
([56](56-phase-4-pricing.md)). **Visibility: Admin.** Guests see resolved prices, never rules.

### 3.17 User · Role · Permission · RoleAssignment — SECURITY

One `User` table for customers and staff, differentiated by role assignment. `RoleAssignment` carries
`role` **and a scope**: `GLOBAL` · **`PARTNER`** · `PROPERTY` · `OWN` — modelled from day one so future
partner- and property-scoped roles are additive ([59](59-phase-4-rbac.md),
[85](85-partner-property-model-amendment.md) §5). **Visibility: Internal.**

### 3.18 AuditLog — SECURITY

Append-only: actor, action, entity, before/after, timestamp, IP, user agent. **No update or delete
permission is granted, even to the application role.** **Visibility: `SUPER_ADMIN` only.**

### 3.19 Notification — OPERATIONAL

In-app notification with read state, plus `EmailLog` with a **unique idempotency key** so a retried job
cannot double-send. **Visibility:** own notifications are **Auth**; delivery logs are **Admin**.

### 3.20 Voucher — MASTER + TRANSACTIONAL

`Voucher` (rules) is MASTER; `VoucherRedemption` (usage) is TRANSACTIONAL. Unique redemption per
reservation. **Public** for published public offers; targeted offers are **Auth**.

---

## 4. Reservation invariants — the contract

**PROPOSED** — Enforced in the database wherever expressible.

| # | Invariant | Enforcement |
|---|---|---|
| R1 | `channelType = DIRECT` ⟹ `leadSource IS NOT NULL` | CHECK |
| R2 | `channelType = OTA` ⟹ `leadSource IS NULL AND salesOwnerId IS NULL` | CHECK |
| R3 | `channelType = OTA` ⟹ `salesStatus IS NULL` | CHECK |
| R4 | `channelType = OTA` ⟹ `otaReference IS NOT NULL` | CHECK |
| R5 | `checkOut > checkIn` | CHECK |
| R6 | `adults ≥ 1` | CHECK |
| R7 | `reference` unique and non-sequential | UNIQUE + generator |
| R8 | One reservation, one property | FK, single column |
| R9 | `salesStatus` frozen once terminal | Application + status history |
| R10 | `stayStatus` non-null ⟹ the reservation is committed | Application |
| R11 | Price snapshot immutable after `salesStatus = WON` | Application + audit |
| R12 | One review per reservation | UNIQUE FK on `review.reservationId` |
| R13 | **No generic `status` column exists** | Schema review + lint |

---

## 5. Aggregate boundaries

| Aggregate root | Contains | Transactional boundary protects |
|---|---|---|
| **Property** | Content, gallery links, amenities, facilities, policies | Publish completeness |
| **RoomType** | Images, attributes, amenity links | Occupancy consistency |
| **InventoryDay** | The counts for one room type on one date | **`available ≥ 0` — the oversell guarantee** |
| **Reservation** | Lines, status history, holds, payments, notes | Legal transitions; line quantities within availability; immutable snapshot |
| **SalesInquiry** | Contact log, follow-up schedule | Qualification completeness |
| **Customer** | Profile, consent, preferences | Unique verified email; no weak-signal merge |
| **Review** | Ratings, photos, reply | Verified-stay eligibility |

**PROPOSED — one deliberate cross-aggregate rule:** **Reservation and InventoryDay must commit in a
single database transaction.** Eventual consistency between a reservation and its inventory claim is
precisely how oversells occur.

---

## 6. Entities evaluated and deliberately excluded

**CONFIRMED direction** — Do not create entities merely because a list contains them.

| Candidate | Decision | Reason |
|---|---|---|
| `PhysicalRoom` | **Excluded from V1** | Room numbers cannot leak if they do not exist. Additive later without touching the guest path ([04](04-room-architecture.md) §7) |
| `DirectReservation` / `OTAReservation` | **Prohibited** | One reservation entity. Splitting creates two writers to availability |
| `Lead` (parallel to Reservation) | **Prohibited** | A direct lead **is** the booking request. `SalesInquiry` is a pre-request record, not a parallel booking |
| `RatePlan` | **Deferred** | `rateRule.ratePlanId` is a V1-null hook. Building the table without values is speculative |
| `SalesOwner` | **Not an entity** | A FK to `User` plus assignment history (§3.13) |
| `Booking` | **Renamed** | → `Reservation` (§2) |
| `Cart` / `Basket` | **Prohibited** | "Your Stay" is client/session state until submitted; it never becomes a persisted commercial entity |
| `OTAGuest` | **Prohibited** | An OTA guest is a `Customer`. Separate identities would defeat Customer 360 |
| `ChannelManagerSync` | **Future** | No integration in V1; no assumed API shape |

---

## 7. Public / internal visibility boundary

**CONFIRMED** — The guest never learns operations.

| Never public | Where enforced |
|---|---|
| Physical room number | Field does not exist |
| `salesStatus`, `salesOwnerId`, `leadSource` | Absent from public/auth DTOs |
| Hold rows, `expiresAt`, hold mechanics | Internal only |
| `total`, `maintenance`, `otherBlocks`, buffer, commitments | Only the derived available count is public |
| `distributionChannel`, `otaReference` | Admin only |
| Internal notes, contact log, audit rows | Internal only |
| Identity-match confidence, merge history | Internal only |
| SLA timers, breach state, escalation | Internal only |
| Media `storageKey` | Public API returns resolved delivery URLs |

Enforced structurally by separate API surfaces, separate DTO types, explicit mappers and a blocking CI
denylist test ([58](58-phase-4-api-contract.md) §9).

---

## 8. Domain map

```
                    ┌──────────────┐
                    │   PROPERTY   │ MASTER
                    └──┬────┬────┬─┘
         ┌─────────────┘    │    └──────────────┐
   ┌─────▼─────┐      ┌─────▼────┐        ┌─────▼─────┐
   │ ROOM TYPE │      │ FACILITY │        │  AMENITY  │
   └──┬─────┬──┘      └────┬─────┘        └───────────┘
      │     │              │
      │  ┌──▼───────────┐  │        ┌──────────────┐
      │  │ INVENTORY DAY│  └────────│ MEDIA ASSET  │ CONTENT
      │  │ OPERATIONAL  │           └──────────────┘
      │  └──┬───────────┘
      │     │ consumed by
      │  ┌──▼────────────────────────────────┐
      │  │            HOLD                   │ OPERATIONAL
      │  │  REQUEST | ALTERNATIVE_OFFER      │
      │  └──┬──────────────────────┬─────────┘
      │     │                      │
┌─────▼─────▼──────┐        ┌──────▼────────┐
│   RESERVATION    │◄───────│ SALES INQUIRY │ TRANSACTIONAL
│  salesStatus     │qualify └───────────────┘
│  stayStatus      │
└──┬───┬───┬───┬───┘
   │   │   │   └────────────┐
┌──▼─┐ │ ┌─▼──────┐   ┌─────▼────┐
│LINE│ │ │PAYMENT │   │  REVIEW  │
└────┘ │ └────────┘   └──────────┘
       │
   ┌───▼──────┐   ┌──────────┐   ┌───────────┐
   │ CUSTOMER │   │   USER   │   │ AUDIT LOG │ SECURITY
   └──────────┘   └──────────┘   └───────────┘
```

---

## 9. Supersessions recorded

| Superseded | By | Change |
|---|---|---|
| [13](13-database-domain-overview.md) §3.4 `booking` | §2 | Renamed `reservation`; `status` split into `salesStatus`/`stayStatus` |
| [13](13-database-domain-overview.md) §3.4 `booking_line` | §2 | Renamed `reservation_line` |
| [13](13-database-domain-overview.md) §3.3 inventory counters | [55](55-phase-4-inventory.md) | Availability is derived from commitments, not from a `reserved`/`occupied` counter pair — a double-count bug is corrected there |
| Earlier "Booking State Machine" single chain | [14](14-booking-state-machine.md), [54](54-phase-4-state-machines.md) | Two lifecycles; sales terminal is `WON` |

**Historical correction notes in Phase 1–3 documents are preserved unchanged.**
