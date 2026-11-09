# 13 — Database & Domain Overview

**Status of this document:** Phase 1 conceptual model for approval
**Last updated:** 2026-08-14

> This is a **conceptual domain and data model**, not a migration and not production DDL. Column
> types are indicative. The physical schema is a Phase 2 deliverable and requires the pricing,
> voucher, and policy answers in [16-open-questions.md](16-open-questions.md).

---

## 1. Domain map

**PROPOSED**

```
                        ┌──────────────┐
                        │   PROPERTY   │  8 hotels
                        └──────┬───────┘
             ┌─────────────────┼─────────────────┬──────────────┐
             │                 │                 │              │
     ┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐ ┌─────▼─────┐
     │  ROOM TYPE   │  │   GALLERY    │  │   AMENITY    │ │  POLICY   │
     └───────┬──────┘  └──────────────┘  │ (shared      │ └───────────┘
             │                            │  taxonomy)  │
   ┌─────────┼──────────┐                 └─────────────┘
   │         │          │
┌──▼───┐ ┌───▼────┐ ┌───▼──────┐
│IMAGES│ │PRICING │ │INVENTORY │  per room type, per date
└──────┘ └────────┘ └────┬─────┘
                          │ consumed by
                    ┌─────▼──────────┐        ┌──────────────┐
                    │  BOOKING       │────────│   CUSTOMER   │
                    │  (request)     │        └──────┬───────┘
                    └─────┬──────────┘               │
        ┌─────────────────┼───────────┬──────────┐   │
   ┌────▼─────┐  ┌────────▼──┐  ┌─────▼────┐ ┌───▼───▼──┐
   │BOOKING   │  │  STATUS   │  │ PAYMENT  │ │  REVIEW  │
   │ LINES    │  │  HISTORY  │  │ (record) │ │(verified)│
   └──────────┘  └───────────┘  └──────────┘ └──────────┘
                        │
                  ┌─────▼─────┐   ┌──────────────┐  ┌─────────────┐
                  │  VOUCHER  │   │ NOTIFICATION │  │  AUDIT LOG  │
                  └───────────┘   └──────────────┘  └─────────────┘
```

## 2. Aggregates and boundaries

**PROPOSED** — Aggregate roots define transactional consistency boundaries.

| Aggregate root | Contains | Invariant it protects |
|---|---|---|
| **Property** | Content, gallery, amenity assignments, policies, location | A published property has a hero image, description, address, and at least one published room type |
| **RoomType** | Images, attributes, amenity assignments | Belongs to exactly one property; occupancy limits are internally consistent |
| **InventoryDay** | The five counts for one room type on one date | `total − reserved − occupied − maintenance ≥ 0` — **the oversell guarantee** |
| **Booking** | Booking lines, status history, payments, price snapshot | Line quantities never exceed availability at request time; only legal state transitions occur; the price snapshot is immutable |
| **Customer** | Profile, preferences, consent | Email is unique; consent state is explicit and timestamped |
| **Review** | Ratings, text, photos, admin reply | Requires a linked `COMPLETED` booking by the same customer; one review per booking |
| **Voucher** | Rules, usage records | Usage never exceeds limits |

**PROPOSED** — Cross-aggregate consistency: **Booking and InventoryDay must commit in a single
database transaction.** This is the one deliberate exception to strict aggregate isolation, and it is
the correct one — eventual consistency between a booking and its inventory hold is precisely how
oversells occur.

## 3. Core entities

Types are indicative. Every entity carries `id` (UUID), `createdAt`, `updatedAt`, and — where
meaningful — `createdBy` / `updatedBy`. Soft deletion is via `archivedAt` rather than physical delete.

### 3.1 Property

```
property
  id                  uuid pk
  slug                text unique
  status              enum  DRAFT | COMING_SOON | OPEN | TEMPORARILY_CLOSED | CLOSED
  is_flagship         boolean            -- true for Milestone only
  collection          enum | null        -- pending OQ-009
  star_rating         smallint | null
  opened_year         smallint | null
  total_rooms         int | null
  address_line        text               -- localised, see §5
  district            text
  ward                text | null
  city                text default 'Ho Chi Minh City'
  country             char(2) default 'VN'
  latitude            numeric(9,6)
  longitude           numeric(9,6)
  phone               text
  email               text
  zalo                text | null
  check_in_time       time
  check_out_time      time
  sort_order          int
  published_at        timestamptz | null
```

Localised text (name, signature line, descriptions, neighbourhood story, SEO fields) lives in
`property_translation` — see §5.

Related: `property_amenity`, `property_image`, `property_policy`, `property_nearby_landmark`,
`property_experience`, `property_character_tag`.

### 3.2 RoomType

```
room_type
  id                  uuid pk
  property_id         uuid fk → property
  slug                text                -- unique per property
  status              enum  DRAFT | PUBLISHED | UNLISTED | ARCHIVED
  area_sqm            numeric(6,2) | null
  max_adults          smallint
  max_children        smallint
  max_occupancy       smallint
  view_type           enum | null
  smoking             boolean default false
  base_price_minor    bigint              -- VND, zero-decimal (see §6)
  currency            char(3) default 'VND'
  sort_order          int
  UNIQUE (property_id, slug)
  CHECK (max_occupancy <= max_adults + max_children)
```

Related: `room_type_translation`, `room_type_image`, `room_type_amenity`, `room_type_bed_config`.

**Note:** `base_price_minor` is a display/default value. The authoritative price for a stay is
computed by the pricing module and **frozen into a snapshot on the booking**.

### 3.3 InventoryDay — the critical table

```
room_type_inventory_day
  id                  uuid pk
  room_type_id        uuid fk → room_type
  date                date
  total               int  not null  CHECK (total >= 0)
  ota_allotment       int  not null default 0  CHECK (ota_allotment >= 0)   -- TRANSITIONAL buffer
  ota_reserved        int  not null default 0  CHECK (ota_reserved >= 0)    -- OTA reservations recorded
  reserved            int  not null default 0  CHECK (reserved >= 0)        -- DIRECT holds + confirmed
  occupied            int  not null default 0  CHECK (occupied >= 0)
  maintenance         int  not null default 0  CHECK (maintenance >= 0)
  other_blocks        int  not null default 0  CHECK (other_blocks >= 0)    -- group, owner, staff, contingency
  updated_at          timestamptz
  UNIQUE (room_type_id, date)
  CHECK (total - ota_allotment - reserved - occupied - maintenance - other_blocks >= 0)
                                                              ← THE OVERSELL GUARANTEE
```

**PROPOSED** — `availableDirect = total − ota_allotment − reserved − occupied − maintenance −
other_blocks`. This is the number the website shows and the direct sales queue checks.

> ⚠ **WITHDRAWN (D-34).** An earlier draft carried `CHECK (ota_reserved <= ota_allotment)`. **That
> constraint is wrong.** It would refuse to record a real OTA reservation when a channel sold beyond
> its block — which does happen when an extranet is stale. Refusing the insert does not un-sell the
> room; it only makes the property blind to an arriving guest. Recording auto-expands the allotment and
> raises an alert instead. The principle: **availability fails closed; recording fails open.** See
> [50-phase-3-amendments.md](50-phase-3-amendments.md) §5.2.

Channel-aware central inventory: [29](29-direct-sales-crm-architecture.md) §7 and
[15](15-inventory-rules.md) §7. V1 strategy is the **hybrid transitional model** (D-34).

**PROPOSED — key decisions:**

- `available` is **not a column**. It is derived: `total − reserved − occupied − maintenance`.
  Admin cannot type it, so the counts cannot drift out of agreement.
- The final `CHECK` constraint means the database itself refuses an oversell, independently of any
  application logic.
- One row per room type per date. At ~15 room types × 8 properties × 730 days ≈ 90k rows, this is
  trivially small and indexes cleanly on `(room_type_id, date)`.
- Rows are generated ahead on a rolling horizon (**PROPOSED**: 24 months) by a scheduled job, seeded
  from the room type's default total.

### 3.4 Booking

```
booking
  id                    uuid pk
  reference             text unique         -- KAS-YYMMDD-XXXX, non-sequential
  customer_id           uuid fk | null      -- null for unauthenticated guest requests
  property_id           uuid fk → property
  check_in              date
  check_out             date
  nights                int generated       -- check_out - check_in
  adults                smallint
  children              smallint
  children_ages         smallint[]          -- needed for child pricing (OQ-007)
  guest_name            text
  guest_email           citext
  guest_phone           text
  guest_country         char(2) | null
  preferred_channel     enum | null         -- EMAIL | PHONE | ZALO
  arrival_time_est      time | null
  special_requests      text | null
  -- CHANNEL / LEAD / OWNERSHIP — three independent concepts, never one field.
  -- See 29-direct-sales-crm-architecture.md §2–§3.
  distribution_channel_id uuid fk → distribution_channel   -- DIRECT | BOOKING_COM | AGODA | CTRIP | TRAVELOKA
  channel_type          enum                -- DIRECT | OTA  (denormalised for constraints and indexes)
  lead_source           enum | null         -- WEBSITE | FACEBOOK | ZALO | TIKTOK | INSTAGRAM |
                                            -- PHONE | WALK_IN | REFERRAL | RETURNING_CUSTOMER | OTHER
                                            -- REQUIRED when channel_type = DIRECT, NULL when OTA
  lead_source_detail    text | null         -- campaign, referrer name, free text
  sales_owner_id        uuid fk → user | null   -- DIRECT leads only; NULL for OTA
  ota_reference         text | null         -- external reservation reference; OTA only
  next_follow_up_at     timestamptz | null  -- direct lead follow-up tracking
  inquiry_id            uuid fk | null      -- the inquiry this was qualified from, if any
  CHECK (
    (channel_type = 'DIRECT' AND lead_source IS NOT NULL)
    OR
    (channel_type = 'OTA' AND lead_source IS NULL AND sales_owner_id IS NULL)
  )

  -- TWO LIFECYCLES, NOT ONE STATUS. See 50-phase-3-amendments.md §11.
  sales_status          enum | null         -- DIRECT only; NULL for OTA
                                            -- REQUESTED | ASSIGNED | AVAILABILITY_CHECK
                                            -- | CUSTOMER_CONTACTED | ALTERNATIVE_OFFERED
                                            -- terminal: WON | DECLINED | CANCELLED | EXPIRED
                                            -- NOTE: terminal success is WON, never CONFIRMED.
                                            -- CONFIRMED belongs to stay_status alone.
  stay_status           enum | null         -- all channels; NULL until confirmed
                                            -- CONFIRMED | CHECK_IN_READY | CHECKED_IN
                                            -- | CHECKED_OUT | COMPLETED | CANCELLED | NO_SHOW
  CHECK (channel_type = 'OTA' AND sales_status IS NULL OR channel_type = 'DIRECT')
  price_snapshot        jsonb               -- immutable breakdown at request time
  currency              char(3) default 'VND'
  subtotal_minor        bigint
  tax_minor             bigint
  service_charge_minor  bigint
  discount_minor        bigint default 0
  total_minor           bigint
  voucher_id            uuid fk | null
  hold_expires_at       timestamptz | null
  sla_due_at            timestamptz | null
  requested_at          timestamptz | null
  confirmed_at          timestamptz | null
  cancelled_at          timestamptz | null
  cancellation_reason   text | null
  terms_version         text                -- which policy version applied
  CHECK (check_out > check_in)
  CHECK (adults >= 1)
```

```
booking_line
  id                  uuid pk
  booking_id          uuid fk → booking
  room_type_id        uuid fk → room_type
  room_type_name      text        -- denormalised snapshot; survives later renames
  quantity            int  CHECK (quantity >= 1)
  nightly_price_minor bigint      -- snapshot
  line_total_minor    bigint
  UNIQUE (booking_id, room_type_id)
```

> ⚠ **CORRECTED.** An earlier draft of this table carried a single `source` field
> (`WEB | PHONE | WALK_IN | EMAIL`). That conflated three independent facts — where the reservation was
> *sold*, how a direct customer *reached KAS*, and who *owns* the lead — and is explicitly prohibited.
> An OTA reservation is not a sales lead and must never carry a lead source or a sales owner. See
> [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md).

**PROPOSED — why snapshots matter.** A booking made in September must always show the price and room
type name that applied in September, even if rates change in October. Without a snapshot, historical
bookings mutate silently — a reconciliation and trust failure. `price_snapshot` (jsonb) stores the
full computed breakdown including which pricing rules applied.

```
booking_status_history
  id, booking_id, from_status, to_status, actor_id | null,
  actor_type (SYSTEM|ADMIN|CUSTOMER), reason, note, created_at
```

```
booking_contact_log
  id, booking_id, admin_id, channel (PHONE|EMAIL|ZALO|SMS|IN_PERSON),
  direction (OUTBOUND|INBOUND), outcome, notes, contacted_at
```

```
booking_note                -- internal only, never guest-visible
  id, booking_id, admin_id, body, created_at
```

### 3.4a Sales inquiry — pre-request, direct only

**PROPOSED (D-32)** — An unqualified social inquiry has no property, dates, room type or quantity, so
it cannot be a reservation. It is a **conversation record** that converts into one.

```
sales_inquiry
  id                  uuid pk
  status              enum   NEW | QUALIFIED | LOST
  lead_source         enum   not null      -- FACEBOOK | ZALO | TIKTOK | INSTAGRAM | PHONE | …
  lead_source_detail  text | null
  sales_owner_id      uuid fk → user | null
  customer_id         uuid fk | null       -- linked if the person is already known
  contact_name        text | null          -- fragmentary by nature
  contact_phone       text | null
  contact_email       citext | null
  contact_channel_ref text | null          -- FB/Zalo handle
  inquiry_text        text                 -- "Do you have rooms in September?"
  property_interest   uuid fk | null       -- optional hint
  date_hint           text | null          -- loose, unparsed
  next_follow_up_at   timestamptz | null
  attempt_count       int default 0
  qualified_reservation_id uuid fk | null  -- the reservation it became
  lost_reason         text | null
  created_by, created_at, updated_at
```

**PROPOSED — no data duplication.** Every field here is one that does *not* yet exist as reservation
data. At qualification, customer, lead source and sales owner transfer to the reservation and the
inquiry becomes terminal. It never carries stay state, never consumes inventory, and never appears in
Operations. See [50-phase-3-amendments.md](50-phase-3-amendments.md) §11.3.

**CONFIRMED (Decision 1)** — `sales_inquiry` **is included in V1.** KAS has an active direct/social
sales workflow, and a customer may contact KAS before providing enough information to create a
reservation. OQ-079 is closed.

**CONFIRMED** — The inquiry **holds no inventory** — it has no dates, room type or quantity. An
`ALTERNATIVE_OFFER` hold may reference an inquiry (§3.5), because that hold carries its own explicit
stay parameters; it always has a mandatory expiry, so an abandoned inquiry can never lock inventory.

### 3.4b Distribution channel

```
distribution_channel
  id                  uuid pk
  code                text unique        -- DIRECT | BOOKING_COM | AGODA | CTRIP | TRAVELOKA
  display_name        text
  type                enum               -- DIRECT | OTA
  is_active           boolean
  sort_order          int
  commission_basis    jsonb | null       -- FUTURE; unused in V1
```

**PROPOSED** — A managed reference table, not a hard-coded enum, so adding an OTA is a configuration
change rather than a migration. `booking.channel_type` is denormalised from `type` so the CHECK
constraint in §3.4 can be enforced without a join.

### 3.4c OTA safety buffer configuration (OQ-074)

**CONFIRMED (Phase 3.5)** — The V1 safety buffer is **not** a hard-coded universal percentage or room
count. It is **admin-configurable by property + room type + date range / season**.

```
ota_safety_buffer_rule
  id                  uuid pk
  property_id         uuid fk → property        not null
  room_type_id        uuid fk | null            -- NULL = all room types at this property
  distribution_channel_id uuid fk | null        -- NULL = all OTA channels combined
  date_from, date_to  date | null               -- NULL = always in effect
  days_of_week[]      smallint[] | null         -- NULL = every day (weekend/season patterns)
  buffer_type         enum   FIXED_ROOMS | PERCENTAGE
  buffer_value        numeric  not null  CHECK (buffer_value >= 0)
  priority            int                       -- most specific wins
  reason              text
  status              enum   DRAFT | ACTIVE | PAUSED
  created_by, created_at, updated_at
```

**PROPOSED — resolution and materialisation:**

1. Rules resolve by `priority`, most specific first: property + room type + date range beats
   property-wide.
2. The resolved value materialises into `room_type_inventory_day.ota_allotment` on a rolling horizon,
   and remains **manually overridable per day** in the inventory calendar.
3. `PERCENTAGE` is of `total`. With small room counts a percentage yields fractions — **round up**,
   because the buffer exists for operational safety and under-buffering is the costlier error.
4. **Effective buffer is clamped** so it can never drive availability negative:

```
effectiveBuffer = min(
    configuredBuffer,
    total − reserved − occupied − maintenance − other_blocks
)
```

Without this clamp, raising a buffer on a date that is already heavily booked would violate the
oversell CHECK and block the write. Clamping degrades safely and raises an advisory instead.

> ⚠ **NEEDS CONFIRMATION — OQ-074.** **No initial numerical value has been invented.** Buffer values
> per property, room type and season are a **business configuration that must be supplied before
> production launch.** The system ships with the mechanism and **no default rule**; with no rule
> configured, `ota_allotment = 0` and every room is direct-sellable — which is safe only once OTA
> recording is reliable. Sizing needs the channel volume data still outstanding under **OQ-033**.

**CONFIRMED** — The buffer is **transitional, not permanent architecture**. It shrinks as recording
reliability is demonstrated and reaches zero when the channel manager arrives.

### 3.5 Inventory hold

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
  expires_at          timestamptz    not null       -- MANDATORY. No open-ended holds.
                                                    -- Cleared only when firm on salesStatus = WON
  released_at         timestamptz | null
  release_reason      text | null
  CHECK (reservation_id IS NOT NULL OR inquiry_id IS NOT NULL)
  CHECK (NOT (reservation_id IS NOT NULL AND inquiry_id IS NOT NULL))
  UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
```

**PROPOSED (Decision 3)** — Two hold types. A `REQUEST` hold is created when a direct request is
submitted. An `ALTERNATIVE_OFFER` hold is created when sales offers an alternative room type and
chooses to hold it while awaiting the customer's response.

**`expires_at` is `NOT NULL` at creation for every hold.** This is the structural guarantee that no
hold — including one attached to an abandoned inquiry — can lock inventory permanently.

**Duration:** `DIRECT_ALTERNATIVE_HOLD_DURATION`, a **business configuration required before
production launch**. No default is invented; with none configured, placing an alternative hold fails
with an error naming the missing setting. See [14](14-booking-state-machine.md) §6.

**PROPOSED** — Holds are the mechanism behind `reserved`. Creating a hold increments
`reserved`; releasing or expiring it decrements. Keeping holds as explicit rows (rather than only a
counter) makes the counter auditable and reconcilable — the system can always answer "which bookings
account for these 4 reserved rooms on 12 September?"

### 3.6 Customer & user

```
app_user                      -- both customers and staff
  id, email (citext unique), password_hash, status (UNVERIFIED|ACTIVE|SUSPENDED|DISABLED),
  email_verified_at, last_login_at, two_factor_enabled, locale, created_at

role_assignment
  id, user_id, role (CUSTOMER|ADMIN|SUPER_ADMIN|…), property_scope (ALL | uuid[]), granted_by, granted_at

customer_profile
  user_id pk fk, full_name, phone, country, date_of_birth?, preferred_channel,
  marketing_consent, marketing_consent_at, notes

user_session
  id, user_id, refresh_token_hash, device, ip, created_at, last_seen_at, revoked_at, expires_at
```

**PROPOSED** — One `app_user` table for both customers and staff, differentiated by role assignment.
Two separate tables would duplicate authentication, sessions, and password handling. Staff and
customers still authenticate through separate routes with different session policies.

### 3.7 Review

```
review
  id                  uuid pk
  booking_id          uuid fk unique       -- ONE review per booking; proves Verified Stay
  customer_id         uuid fk
  property_id         uuid fk
  overall             smallint  CHECK (1..5)
  cleanliness         smallint | null
  service             smallint | null
  location            smallint | null
  room                smallint | null
  value               smallint | null
  title               text | null
  body                text
  language            char(2)
  status              enum  PENDING | APPROVED | REJECTED | HIDDEN
  rejection_reason    text | null
  moderated_by        uuid | null
  moderated_at        timestamptz | null
  published_at        timestamptz | null
  stay_month          date          -- month of stay, shown instead of exact dates (privacy)

review_photo         id, review_id, media_id, status, sort_order
review_reply         id, review_id, admin_id, body, published_at
```

**PROPOSED** — The unique foreign key to a booking is what structurally enforces the confirmed rule
that only guests with a completed stay may review. It cannot be bypassed by application logic error.
Application logic additionally requires `booking.status = COMPLETED`.

### 3.8 Voucher

```
voucher
  id, code (unique, case-insensitive), name, description,
  type (PERCENTAGE|FIXED_AMOUNT|VALUE_ADD),
  value_percent | value_minor | value_add_description,
  valid_from, valid_to,                     -- when it can be applied
  stay_from, stay_to,                       -- which stay dates it covers
  min_nights, min_total_minor,
  applicable_property_ids uuid[] | null,    -- null = all
  applicable_room_type_ids uuid[] | null,
  usage_limit_total, usage_limit_per_customer, used_count,
  stackable boolean default false,
  status enum DRAFT|ACTIVE|PAUSED|EXPIRED

voucher_redemption
  id, voucher_id, booking_id, customer_id, discount_minor, redeemed_at
  UNIQUE (voucher_id, booking_id)
```

### 3.9 Media, notifications, audit

```
media_asset
  id, storage_key, mime_type, width, height, size_bytes, checksum,
  category, uploaded_by, created_at
media_asset_translation   media_id, locale, alt_text, caption

notification
  id, user_id, type, title, body, entity_type, entity_id,
  read_at, created_at

email_log
  id, template_key, template_version, to_email, booking_id?, customer_id?,
  provider_message_id, status (QUEUED|SENT|DELIVERED|BOUNCED|FAILED|COMPLAINED),
  error, idempotency_key unique, sent_at, updated_at

audit_log                  -- append-only
  id, actor_id, actor_role, action, entity_type, entity_id,
  before jsonb, after jsonb, reason, ip, user_agent, created_at
```

**PROPOSED** — `email_log.idempotency_key` is unique, so a retried job physically cannot send a
duplicate booking confirmation.

## 4. Pricing model

**PROPOSED** — Deliberately layered so the undefined rules (OQ-005..008) can be added without
restructuring:

```
room_type.base_price_minor            layer 0 — default nightly rate
        ↓
rate_rule                             layer 1 — date range / day-of-week / season override
  id, room_type_id | property_id, name, priority,
  date_from, date_to, days_of_week[], price_minor | adjustment_percent,
  min_nights, max_nights, status
  channel_scope   enum | null         ← NULL/ALL in V1.  FUTURE: DIRECT | BOOKING_COM | …
  rate_plan_id    uuid | null         ← NULL in V1.      FUTURE: breakfast, non-refundable, advance
  restrictions    jsonb | null        ← NULL in V1.      FUTURE: CTA, CTD, closed
        ↓
occupancy_rule                        layer 2 — extra adult, child pricing (OQ-007)
        ↓
voucher                               layer 3 — discount
        ↓
tax_and_service_charge                layer 4 — VAT + service charge (OQ-022)
        ↓
= computed price → FROZEN into booking.price_snapshot
```

Rules are resolved by priority, most specific first. Every layer is optional in v1: with no rules
defined, the base price applies and the model still functions.

**PROPOSED (D-33) — Central Rate Management: capable, not over-engineered.** The three nullable
columns above carry the entire future capability without building it now:

| | V1 | Future |
|---|---|---|
| `channel_scope` | Always `NULL` (= all channels) | `DIRECT` vs per-OTA rates |
| `rate_plan_id` | Always `NULL` | Breakfast included, non-refundable, advance purchase |
| `restrictions` | Always `NULL` | Closed-to-arrival, closed-to-departure, stop-sell |

Adding channel-specific pricing later is **data**, not a re-architecture of the pricing engine. The
customer-facing website resolves the **direct** rate.

> ⚠ **Business constraint, not a technical one.** Whether KAS *may* publish different rates per channel
> is governed by its OTA contracts. Narrow rate-parity clauses typically require the publicly visible
> direct rate to match OTA rates while permitting lower rates for closed user groups. Legal review
> required before any channel-specific public rate is used — **OQ-076**. See
> [50-phase-3-amendments.md](50-phase-3-amendments.md) §6.3.

**PROPOSED** — Central Rate Management belongs to the **Commercial** area of admin, **not** to Direct
Sales. Rates are a property-level commercial asset consumed by every channel; a sales agent may apply
a voucher or an approved override to one lead, but does not set rates.

## 5. Localisation

**PROPOSED** — Side-table translations, not duplicated records:

```
property_translation    (property_id, locale) pk
                        name, signature_line, short_description, long_description,
                        neighbourhood_story, meta_title, meta_description

room_type_translation   (room_type_id, locale) pk
                        name, short_description, long_description

amenity_translation     (amenity_id, locale) pk  name, description
policy_translation, page_block_translation, email_template_translation …
```

Rules: `locale` is `vi` | `en`; a missing translation falls back to the default locale and is flagged
in admin as untranslated; slugs are **not** translated (one stable URL per language prefix).

## 6. Money

**PROPOSED** — Getting this wrong is expensive and hard to unwind:

- Stored as `bigint` **minor units** with an explicit `currency` column. Never floating point.
- **VND is a zero-decimal currency** — 1 VND = 1 minor unit. A generic "divide by 100" assumption
  will produce prices 100× wrong. This must be handled by an explicit per-currency exponent from the
  first line of code.
- Formatting: `1.850.000 ₫` (Vietnamese convention), not `1,850,000.00`.
- Every stored amount is accompanied by the currency; totals are never summed across currencies.
- Rounding rules are defined once, centrally, and applied consistently.

## 7. Key indexes

**PROPOSED**

| Table | Index | Purpose |
|---|---|---|
| `room_type_inventory_day` | `UNIQUE (room_type_id, date)` | Availability lookups and locking |
| `room_type_inventory_day` | `(date)` | Portfolio-wide date queries |
| `booking` | `(status, requested_at)` | Admin queue ordering |
| `booking` | `(property_id, check_in)` | Arrivals view |
| `booking` | `(customer_id, created_at desc)` | My Bookings |
| `booking` | `UNIQUE (reference)` | Lookup by reference |
| `booking_line` | `(room_type_id)` | Room type performance |
| `review` | `(property_id, status, published_at desc)` | Published reviews per property |
| `inventory_hold` | `(expires_at) WHERE released_at IS NULL` | Expiry sweep |
| `email_log` | `UNIQUE (idempotency_key)` | Duplicate-send prevention |
| `property` | `UNIQUE (slug)`, `(status, sort_order)` | Routing and listing |

## 8. Data integrity rules

**PROPOSED** — Enforced in the database wherever possible, not only in application code:

1. `total − reserved − occupied − maintenance ≥ 0` on every inventory day. **The oversell guarantee.**
2. `check_out > check_in` on every booking.
3. One review per booking (unique FK).
4. Unique voucher redemption per booking.
5. Unique booking reference.
6. Unique room type slug per property.
7. Unique email per user.
8. `max_occupancy ≤ max_adults + max_children` on room types.
9. Booking status transitions validated against the state machine — application-enforced, with full
   history recorded.
10. Audit log is append-only; no update or delete permission granted, even to the application role.

## 9. What is deliberately absent

**PROPOSED**

| Absent | Reason |
|---|---|
| `physical_room` table | **FUTURE**. Room numbers cannot leak if they do not exist ([04](04-room-architecture.md) §7) |
| `available` column | Derived, never stored — prevents count drift |
| Card or payment credential storage | Keeps KAS entirely out of PCI-DSS scope |
| Passport / ID document storage | **NEEDS CONFIRMATION** — recommended out of scope (OQ-028) |
| `rate_plan` table | **FUTURE**; the pricing layering in §4 leaves room for it (OQ-034) |
| Hard deletes | Archive and soft-delete throughout; booking and financial records are retained |

## 10. Open modelling questions

Blocking or shaping the physical schema: OQ-005 (pricing basis), OQ-006 (weekend/seasonal),
OQ-007 (child pricing and age bands), OQ-008 (extra bed), OQ-011 (source of truth for inventory),
OQ-018 (holds), OQ-022 (tax and service charge), OQ-027 (retention), OQ-029 (voucher rules),
OQ-034 (rate plans). See [16-open-questions.md](16-open-questions.md).
