# 53 — Database / Logical ERD

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative logical model. **No SQL migrations are produced in this phase.**
**Last updated:** 2026-08-14

---

## 1. Conventions

**PROPOSED**

| Concern | Rule |
|---|---|
| Primary keys | `id UUID` (v7 preferred — time-ordered, index-friendly) |
| Foreign keys | `<entity>_id`, `ON DELETE RESTRICT` unless stated |
| Timestamps | `created_at`, `updated_at` — `timestamptz`, UTC. **Stay dates are `date`, in property-local time** |
| Audit fields | `created_by`, `updated_by` → `app_user(id)`, nullable (null = system) |
| Soft delete | `archived_at timestamptz NULL` on MASTER and CONTENT. **TRANSACTIONAL rows are never deleted** |
| Localisation | Side tables `<entity>_translation (entity_id, locale)`; slugs are locale-independent |
| Money | `bigint` minor units + `char(3)` currency. **VND is zero-decimal** |
| Concurrency | `version int` for optimistic locking on MASTER; **pessimistic row locks on inventory** (§8) |
| Enums | Native PostgreSQL enum types except `distribution_channel`, which is a reference **table** |

---

## 2. ERD overview

```
                          property ─────┬──── property_translation
                             │ 1        ├──── property_policy
                             │          ├──── property_amenity ──── amenity
                             │          ├──── property_landmark
                             │          └──── media_link ──── media_asset
                             │ N
              ┌──────────────┼──────────────┐
              │              │              │
          room_type      facility     ota_safety_buffer_rule
              │ 1            │
              │              └──── media_link ──── media_asset
   ┌──────────┼──────────┬──────────────┐
   │ N        │ N        │ N            │ N
room_type_  room_type_  rate_rule   room_type_inventory_day
translation  amenity                     │
   │                                     │ referenced by
   │                                     ▼
   │                              inventory_hold
   │                                 │        │
   │                        reservation_id  inquiry_id
   │                                 │        │
   │                                 ▼        ▼
   └──────── reservation_line ─── reservation ◄──── sales_inquiry
                                     │  │  │  │
              ┌──────────────────────┘  │  │  └──────────────┐
              ▼                          ▼  ▼                ▼
      reservation_status_history    payment  review    reservation_note
      reservation_contact_log                             (internal)
                                     │
                        distribution_channel     customer ──── app_user
                                                    │            │
                                             customer_consent  role_assignment
                                                                 │
                                                              audit_log
```

---

## 3. Master data

### 3.0 `partner` *(added by [85](85-partner-property-model-amendment.md))*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text | **UNIQUE** slug, e.g. `kas` |
| `legal_name`, `display_name` | text | |
| `status` | enum | `ACTIVE`, `SUSPENDED`. **No onboarding lifecycle** |
| `created_at`, `updated_at` | timestamptz | |

**V1 contains exactly one row.** No billing, commission, contract or payout columns.

### 3.1 `property`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| **`partner_id`** | **uuid FK → partner NOT NULL** | **1 partner → N properties.** `ON DELETE RESTRICT` |
| `slug` | text | **UNIQUE globally** — not per-partner. Slugs are public URLs and must not collide across partners |
| `lifecycle_state` | enum | `DRAFT`,`COMING_SOON`,`OPEN`,`TEMPORARILY_CLOSED`,`CLOSED` |
| `is_flagship` | boolean | Placement weight only — never content capability |
| `collection` | enum NULL | Pending OQ-009 |
| `district`, `ward` | text | |
| `latitude`, `longitude` | numeric(9,6) | |
| `check_in_time`, `check_out_time` | time | |
| `sort_order` | int | |
| `published_at`, `archived_at` | timestamptz NULL | |
| `version` | int | Optimistic lock |

**Indexes:** `UNIQUE(slug)` · `(partner_id)` · `(partner_id, lifecycle_state, sort_order)` · `(district)`
**Checks:** `latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180`

### 3.2 `room_type`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid FK → property | **N:1** |
| `slug` | text | **UNIQUE(property_id, slug)** |
| `status` | enum | `DRAFT`,`PUBLISHED`,`UNLISTED`,`ARCHIVED` |
| `area_sqm` | numeric(6,2) NULL | |
| `max_adults`, `max_children`, `max_occupancy` | smallint | |
| `base_price_minor` | bigint | VND |
| `currency` | char(3) | `VND` |
| `sort_order`, `version` | int | |

**Checks:** `max_occupancy <= max_adults + max_children` · `max_adults >= 1` · `base_price_minor >= 0`
**Indexes:** `UNIQUE(property_id, slug)` · `(property_id, status, sort_order)`
**Deliberately absent:** any column capable of holding a room number.

### 3.3 `distribution_channel`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text | **UNIQUE** — `DIRECT`,`BOOKING_COM`,`AGODA`,`CTRIP`,`TRAVELOKA` |
| `type` | enum | `DIRECT` \| `OTA` |
| `display_name`, `is_active`, `sort_order` | | |
| `commission_basis` | jsonb NULL | **FUTURE** — unused in V1 |

A table, not an enum, so adding an OTA is configuration.

### 3.4 `amenity` · `facility`

`amenity(id, category, icon, is_highlight, sort_order)` + `amenity_translation`.
Join tables `property_amenity(property_id, amenity_id, is_highlight)` and
`room_type_amenity(room_type_id, amenity_id)` — both composite PK.

`facility(id, property_id, type, opening_hours, open_to_non_residents, sort_order)` +
`facility_translation`. `type ∈ {RESTAURANT, BAR, ROOFTOP, GYM, POOL, SPA, MEETING, LOUNGE, TERRACE}`.
**Available to every property** — this is what makes the flagship additive rather than privileged.

---

## 4. Operational data

### 4.1 `room_type_inventory_day` — the critical table

| Column | Type | Notes |
|---|---|---|
| `room_type_id` | uuid FK | |
| `date` | date | Property-local calendar date |
| `total` | int | Physical units that exist |
| `maintenance` | int | Out of service |
| `other_blocks` | int | Group holds, owner use, staff, contingency |
| `direct_committed` | int | Materialised cache — direct reservations + active direct holds |
| `ota_committed` | int | Materialised cache — OTA reservations recorded |
| `buffer_target` | int | Materialised from `ota_safety_buffer_rule` |
| `updated_at` | timestamptz | |

**PK:** `(room_type_id, date)`
**Checks:** every count `>= 0` · **the oversell guarantee** —
`total - maintenance - other_blocks - direct_committed - ota_committed - GREATEST(buffer_target - ota_committed, 0) >= 0`
**Indexes:** PK · `(date)` for portfolio-wide queries

**PROPOSED** — `available` is **not a column**. It is derived; the exact expression and the
double-count correction are in [55](55-phase-4-inventory.md) §3. The materialised columns are a
performance cache; the row-derived query in [55](55-phase-4-inventory.md) §4 is the reconciliation
authority.

### 4.2 `inventory_hold`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `hold_type` | enum | `REQUEST` \| `ALTERNATIVE_OFFER` |
| `reservation_id` | uuid FK NULL | ┐ exactly one |
| `inquiry_id` | uuid FK NULL | ┘ |
| `property_id`, `room_type_id` | uuid FK | |
| `date` | date | One row per night |
| `quantity` | int | |
| `status` | enum | `ACTIVE`,`CONVERTED`,`RELEASED`,`EXPIRED` |
| `created_by` | uuid FK NULL | NULL = system |
| `created_at` | timestamptz NOT NULL | |
| **`expires_at`** | **timestamptz NOT NULL** | Cleared only when firm on `sales_status = WON` |
| `released_at`, `release_reason` | | |

**Checks:** `quantity >= 1` · `(reservation_id IS NOT NULL) <> (inquiry_id IS NOT NULL)` — exactly one
**Unique:** `(hold_type, reservation_id, inquiry_id, room_type_id, date)`
**Indexes:** `(expires_at) WHERE status = 'ACTIVE'` — the expiry sweep · `(room_type_id, date) WHERE status = 'ACTIVE'` — availability

### 4.3 `ota_safety_buffer_rule`

`(id, property_id, room_type_id NULL, distribution_channel_id NULL, date_from NULL, date_to NULL,
days_of_week[] NULL, buffer_type enum{FIXED_ROOMS,PERCENTAGE}, buffer_value numeric, priority,
reason, status)`.

**No default rule ships.** With none configured, `buffer_target = 0` (§4.1).
**Index:** `(property_id, room_type_id, date_from, date_to) WHERE status = 'ACTIVE'`

---

## 5. Transactional data

### 5.1 `sales_inquiry`

`(id, status enum{NEW,QUALIFIED,LOST}, lead_source enum NOT NULL, lead_source_detail, sales_owner_id
FK NULL, customer_id FK NULL, contact_name/phone/email/channel_ref all NULL, inquiry_text,
property_interest FK NULL, date_hint text NULL, next_follow_up_at, attempt_count,
qualified_reservation_id FK NULL, lost_reason, created_by, timestamps)`

**Checks:** at least one contact field non-null
**Indexes:** `(status, next_follow_up_at)` · `(sales_owner_id, status)` · `(lead_source)`

### 5.2 `reservation` — the central table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reference` | text | **UNIQUE**, `KAS-YYMMDD-XXXX`, non-sequential |
| `property_id` | uuid FK | |
| `customer_id` | uuid FK NULL | NULL for guest requests until linked |
| `distribution_channel_id` | uuid FK | |
| `channel_type` | enum | Denormalised from channel, so CHECKs need no join |
| `lead_source` | enum NULL | |
| `lead_source_detail` | text NULL | |
| `sales_owner_id` | uuid FK NULL | |
| **`sales_status`** | enum NULL | `REQUESTED`,`ASSIGNED`,`AVAILABILITY_CHECK`,`CUSTOMER_CONTACTED`,`ALTERNATIVE_OFFERED`,**`WON`**,`DECLINED`,`CANCELLED`,`EXPIRED` |
| **`stay_status`** | enum NULL | `CONFIRMED`,`CHECK_IN_READY`,`CHECKED_IN`,`CHECKED_OUT`,`COMPLETED`,`CANCELLED`,`NO_SHOW` |
| `check_in`, `check_out` | date | |
| `adults`, `children` | smallint | |
| `children_ages` | smallint[] | |
| `guest_name/email/phone/country` | | Denormalised at request time |
| `preferred_channel` | enum NULL | |
| `special_requests` | text NULL | |
| `ota_reference` | text NULL | |
| `inquiry_id` | uuid FK NULL | The inquiry it was qualified from |
| `price_snapshot` | jsonb | Full computed breakdown, **immutable after `WON`** |
| `subtotal/tax/service_charge/discount/total_minor` | bigint | |
| `currency` | char(3) | `VND` |
| `voucher_id` | uuid FK NULL | |
| `terms_version` | text | Which policy version applied |
| `sla_due_at`, `requested_at`, `won_at`, `confirmed_at`, `cancelled_at` | timestamptz NULL | |
| `created_by` | uuid FK NULL | The agent who created it on the customer's behalf |
| `version` | int | |

**Checks — the structural separation:**

```sql
CHECK (check_out > check_in)
CHECK (adults >= 1)
CHECK ((channel_type = 'DIRECT'  AND lead_source IS NOT NULL)
    OR (channel_type = 'OTA'     AND lead_source IS NULL AND sales_owner_id IS NULL))
CHECK (channel_type <> 'OTA' OR sales_status IS NULL)
CHECK (channel_type <> 'OTA' OR ota_reference IS NOT NULL)
CHECK (channel_type <> 'DIRECT' OR ota_reference IS NULL)
```

**Indexes:** `UNIQUE(reference)` · `(stay_status, check_in)` **← arrivals; the operational index** ·
`(property_id, stay_status, check_in)` · `(sales_status, requested_at) WHERE channel_type='DIRECT'`
**← the sales queue** · `(customer_id, created_at DESC)` · `(sales_owner_id, sales_status)` ·
`UNIQUE(distribution_channel_id, ota_reference) WHERE ota_reference IS NOT NULL` **← duplicate OTA
detection**

**PROPOSED** — Note the two distinct indexes on the two status fields. Operations reads
`(stay_status, check_in)`; sales reads `(sales_status, requested_at)` filtered to DIRECT. The physical
design mirrors the query rule and makes the wrong query visibly unindexed.

### 5.3 `reservation_line`

`(id, reservation_id FK, room_type_id FK, quantity, room_type_name_snapshot, nightly_price_minor,
line_total_minor)`
**Unique:** `(reservation_id, room_type_id)` · **Check:** `quantity >= 1`

### 5.4 History and log tables

| Table | Purpose | Notes |
|---|---|---|
| `reservation_status_history` | `(id, reservation_id, field enum{SALES,STAY}, from_status, to_status, actor_id, actor_type, reason, note, created_at)` | **`field` distinguishes which lifecycle moved** |
| `reservation_contact_log` | Channel, direction, outcome, notes, contacted_at, admin_id | Guest-adjacent but internal |
| `reservation_note` | **Internal only.** No guest surface exists | Separate table from guest messages, by design |
| `reservation_message` | Guest-visible, previewed before send | Distinct object, not a flag |
| `reservation_change` | before/after jsonb, reason, guest_notified boolean | Modification history |

### 5.5 `payment`

`(id, reservation_id FK, method enum, amount_minor, currency, external_reference, received_at,
recorded_by FK, evidence_media_id FK NULL, status enum{RECORDED,VERIFIED,REVERSED}, notes)`
**No card or credential columns exist** — keeping KAS entirely out of PCI-DSS scope.

---

## 6. Customer, review, security

| Table | Key points |
|---|---|
| `app_user` | `email citext UNIQUE`, `password_hash`, `status`, `email_verified_at`, `two_factor_enabled`, `locale` |
| `customer` | `user_id FK NULL`, profile, **`first_distribution_channel` / `first_lead_source` write-once**, `merged_into_id FK NULL` |
| `customer_consent` | `(customer_id, purpose enum{TRANSACTIONAL,MARKETING}, granted boolean, granted_at, source, revoked_at)` — **consent per purpose, never one flag** |
| `customer_identity_match` | Candidate merges with `confidence enum{HIGH,MEDIUM,LOW}` and `reviewed_by`. **No auto-merge below HIGH** |
| `review` | `reservation_id UNIQUE FK` — **the structural proof of a verified stay**; sub-scores; `stay_month date`; moderation state |
| `review_photo`, `review_reply`, `review_report` | |
| `role_assignment` | `(user_id, role, scope_kind enum{GLOBAL,PARTNER,PROPERTY,OWN}, partner_id FK NULL, property_ids uuid[] NULL)` with a CHECK binding each scope kind to its required column ([85](85-partner-property-model-amendment.md) §4.4). **Supersedes** the earlier `property_scope = ALL \| uuid[]` |
| `audit_log` | Append-only. **No UPDATE/DELETE grant to the application role** |
| `user_session` | `refresh_token_hash`, device, IP, `revoked_at` |

---

## 7. Cardinality summary

| Relationship | Cardinality | Delete behaviour |
|---|---|---|
| **partner → property** | **1:N** | **RESTRICT** — a partner with properties cannot be deleted. Partners are suspended, never deleted |
| **partner → media_asset** | **1:N** | **RESTRICT** |
| property → room_type | 1:N | RESTRICT |
| property → facility | 1:N | CASCADE (facility is owned content) |
| room_type → inventory_day | 1:N | RESTRICT |
| room_type → reservation_line | 1:N | RESTRICT |
| reservation → reservation_line | 1:N | CASCADE |
| reservation → hold | 1:N | CASCADE |
| reservation → payment | 1:N | RESTRICT |
| reservation → review | 1:1 | RESTRICT |
| sales_inquiry → reservation | 0..1:1 | SET NULL |
| sales_inquiry → hold | 1:N | CASCADE |
| customer → reservation | 1:N | RESTRICT |
| media_asset → media_link | 1:N | RESTRICT if in use |

---

## 8. Locking strategy

**PROPOSED**

| Scenario | Strategy |
|---|---|
| **Reservation creation / hold placement** | **Pessimistic.** `SELECT … FOR UPDATE` on every affected `room_type_inventory_day` row, ordered by `(room_type_id, date)` — deterministic ordering is what prevents deadlock |
| Hold expiry sweep | Pessimistic, same ordering, batched per reservation |
| OTA recording | Pessimistic on affected inventory rows |
| Admin inventory edits | Pessimistic on the affected range |
| Property / room type / content edits | **Optimistic** via `version`; conflict returns 409 |
| Rate rule edits | Optimistic |
| Review moderation | Optimistic |

**PROPOSED** — Any transaction touching inventory acquires locks in the same deterministic order.
Two concurrent requests for the last room serialise; exactly one succeeds. Verified by a blocking
concurrency test ([63](63-phase-4-validation.md)).

---

## 9. Retention and deletion

| Class | Policy |
|---|---|
| MASTER / CONTENT | Soft delete via `archived_at`. Media deletion blocked while `media_link` rows exist |
| TRANSACTIONAL | **Never deleted.** Customer erasure anonymises personal fields and retains the commercial record |
| OPERATIONAL | Inventory days retained; holds retained with terminal status for audit |
| SECURITY | Audit log append-only, retention per **OQ-027 (BLOCKED on legal)** |

---

## 10. What this document deliberately does not contain

- SQL DDL or migrations — Phase 5
- Physical partitioning or sharding — unnecessary at ~90k inventory rows
- `physical_room` table — excluded from V1 ([52](52-phase-4-domain-model.md) §6)
- `rate_plan` table — `rate_rule.rate_plan_id` is a V1-null hook
- Any table storing card, credential or identity-document data
