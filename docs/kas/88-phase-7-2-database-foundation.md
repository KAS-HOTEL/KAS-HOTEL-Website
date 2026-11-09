# 88 — Phase 7.2: Database Foundation

**Phase:** 7.2 — Database Foundation
**Status:** ✅ **COMPLETE — AWAITING REVIEW**
**Target:** `kas_web_dev` / `kas_web_app` / schema `kas`
**Executed:** 2026-08-14
**Last updated:** 2026-08-14

> **Legacy KAS objects `kas_dev`, `kas_test` and `kas_app` were never queried,
> connected to, or referenced in any executed statement. They are unchanged.**
> **Nothing outside `C:\Kas-Web` was written. Not committed. Not pushed.**

---

## 1. What was created

| Artefact | Count |
|---|---|
| Migration files | **22** (V1–V21 + 1 repeatable) |
| Tables | **53** |
| Views | 2 |
| Enum types | 38 |
| Constraints | **305** |
| Indexes | **135** |
| Functions | 2 (plus `citext`'s) |
| Triggers | 2 (audit append-only) |
| Validation suites | 2 (26 invariants + concurrency) |
| Runner script | 1 |

**Business data seeded: none**, other than the 5 distribution-channel codes, which are technical
enumeration values fixed by the frozen architecture.

---

## 2. Environment verified

| Property | Value |
|---|---|
| Server | PostgreSQL 17.10, service `postgresql-x64-17` |
| Database | **`kas_web_dev`** |
| Role | **`kas_web_app`** |
| Schema | **`kas`**, `search_path = kas` |
| Authentication | Non-interactive, `kas_web_app`-scoped. **Password never read, printed or echoed** |

**Least privilege confirmed by query** — every flag false:

```
rolname     | rolsuper | rolcreatedb | rolcreaterole | rolreplication | rolbypassrls
kas_web_app | f        | f           | f             | f              | f
```

**`postgres` was never used at runtime.** Every statement in this phase ran as `kas_web_app`.

---

## 3. Migration structure

```
backend/src/main/resources/db/migration/      Flyway default classpath location
  README.md                                   conventions and rules
  V1__extensions_and_enums.sql                citext + 38 enum types
  V2__partner_and_identity_root.sql           partner, app_user
  V3__property.sql                            property + translations, policies, landmarks, experiences
  V4__amenity_and_facility.sql                amenity taxonomy, facility
  V5__room_type.sql                           room_type + translations, bed configs
  V6__distribution_channel.sql                channel reference table
  V7__rbac_and_customer.sql                   role_assignment (4 scopes), customer, consent, match
  V8__media.sql                               media_asset (+partner_id), media_link
  V9__rates_taxes_buffer.sql                  rate_rule, tax_rule, ota_safety_buffer_rule
  V10__central_inventory.sql                  room_type_inventory_day + OVERSELL GUARANTEE
  V11__sales_inquiry.sql                      sales_inquiry (holds no inventory)
  V12__reservation.sql                        reservation (6 structural CHECKs), reservation_line
  V13__inventory_hold.sql                     inventory_hold (expires_at NOT NULL)
  V14__reservation_history.sql                history, contact log, notes, messages, changes
  V15__payment.sql                            payment (no card columns)
  V16__review.sql                             review (UNIQUE reservation_id)
  V17__voucher.sql                            voucher, redemption
  V18__notification_and_email.sql             notification, email_log, suppression
  V19__audit_log.sql                          audit_log + append-only triggers
  V20__system_setting.sql                     18 outstanding config keys, all NULL
  V21__fix_global_policy_uniqueness.sql       forward fix — see §9
  R__reference_distribution_channels.sql      5 channel codes (repeatable, idempotent)

backend/src/test/resources/db/validation/
  invariants.sql                              26 executable negative tests
  concurrency-oversell.sh                     N-way last-room contention test
  migrate.sh                                  interim runner (Flyway owns this from 7.3)
```

**Ordering deviation from the plan in §6 of the previous revision:** `app_user` moved from V7 into V2,
because every downstream table carries `created_by`/`updated_by` audit FKs referencing it. `partner`
and `app_user` are the only tables with no outbound dependencies.

---

## 4. Domain model implemented

Every entity from the frozen model. **Nothing prohibited was created.**

| Implemented | Deliberately absent |
|---|---|
| Partner, Property, RoomType | **PhysicalRoom** — room numbers cannot leak if they do not exist |
| InventoryDay, Hold | **DirectReservation / OTAReservation** |
| SalesInquiry, Reservation, ReservationLine | **Parallel Lead entity** |
| Payment, Review, Voucher | **Cart** |
| Amenity, Facility, RateRule, TaxRule | **OTAGuest** |
| DistributionChannel, AuditLog, Notification | **RatePlan as a V1 entity** (`rate_plan_id` is a NULL hook) |
| Customer (+ consent, identity match) | **`booking.source`** — three separate concepts instead |
| MediaAsset, MediaLink | **Generic `status` column** — two lifecycles instead |
| RoleAssignment (4 scope kinds) | Any card/credential/token column |

---

## 5. Critical constraints — implemented and TESTED

### 5.1 The oversell guarantee (V10)

```sql
CHECK (total - maintenance - other_blocks - direct_committed - ota_committed
       - GREATEST(buffer_target - ota_committed, 0) >= 0)
```

The corrected expression from [55](55-phase-4-inventory.md) §3: the buffer blocks only its **unused**
portion, and there is **no separate `occupied` counter** — check-in is a relabel, not a new
consumption. Occupancy derives from `stay_status`.

**`ota_reserved <= ota_allotment` is verifiably ABSENT** (test 19). Recording fails open; availability
fails closed.

### 5.2 Direct / OTA separation (V12) — six structural CHECKs

```sql
CHECK ((channel_type='DIRECT' AND lead_source IS NOT NULL)
    OR (channel_type='OTA'    AND lead_source IS NULL AND sales_owner_id IS NULL))
CHECK (channel_type <> 'OTA'    OR sales_status  IS NULL)
CHECK (channel_type <> 'OTA'    OR ota_reference IS NOT NULL)
CHECK (channel_type <> 'DIRECT' OR ota_reference IS NULL)
CHECK (check_out > check_in)
CHECK (adults >= 1)
```

An OTA reservation carrying a lead source, a sales owner or a sales status is **impossible at the
database level** — not filtered in application code.

### 5.3 Holds (V13)

`expires_at timestamptz NOT NULL` · XOR reservation/inquiry · `quantity >= 1` · unique per
(type, ref, room type, date). **No hold can permanently consume inventory.**

### 5.4 Partner isolation

`property.partner_id NOT NULL` · `media_asset.partner_id NOT NULL` (the one entity where partner does
not derive) · `property.slug` globally unique across partners.

### 5.5 Customer 360

`customer` has **no `partner_id` and no `property_id`** — verified structurally by test 18.

### 5.6 Audit append-only

Trigger-enforced on UPDATE **and** DELETE, raising `42501`. Blocks even the table owner — privilege
revocation alone does not restrain an owner.

---

## 6. Indexes

135 indexes. The load-bearing ones:

| Index | Serves |
|---|---|
| `reservation (stay_status, check_in)` | **Arrivals — the operational query** |
| `reservation (sales_status, requested_at) WHERE channel_type='DIRECT'` | **Direct sales queue** |
| `reservation UNIQUE (distribution_channel_id, ota_reference)` partial | **OTA duplicate detection** |
| `room_type_inventory_day PK (room_type_id, date)` | Availability + row locking |
| `inventory_hold (expires_at) WHERE status='ACTIVE'` | Expiry sweep |
| `property (partner_id, lifecycle_state, sort_order)` | Partner scope |
| `media_asset (partner_id, category, status)` | Media partner isolation |
| `media_link UNIQUE (owner_type, owner_id) WHERE is_cover` | Exactly one cover |
| `email_log UNIQUE (idempotency_key)` | Duplicate-send prevention |

**Two distinct status indexes** are deliberate — a query on the wrong field is visibly unindexed.

---

## 7. Inventory mechanisms

| Mechanism | Implementation |
|---|---|
| Availability calculation | `available_direct(room_type_inventory_day)` — a **function**, so availability can never be typed in by an operator |
| Derived read model | `v_room_type_availability` |
| Expired holds excluded | `v_active_hold_demand` filters `expires_at > now()` **regardless of sweep lag** |
| Deterministic locking | `SELECT … FOR UPDATE … ORDER BY room_type_id, date` — proven deadlock-free |
| No negative availability | Database CHECK |
| No double allocation | Row lock + CHECK, proven by the concurrency test |
| OTA recording fails open | Withdrawn constraint verifiably absent |
| Maintenance / other blocks | First-class columns in the availability expression |

---

## 8. Validation results

### 8.1 Invariants — **26 / 26 PASS**

Each is an executable **negative** test: attempt the violation, assert the database rejects it with the
expected SQLSTATE. All fixtures synthetic (`TEST_*`), entire suite rolled back.

| # | Invariant | Result |
|---|---|---|
| 1 | Partner → Property FK integrity | PASS `23503` |
| 2 | `property.partner_id NOT NULL` | PASS `23502` |
| 3 | Property slug globally unique across partners | PASS `23505` |
| 4 | Reservation property FK integrity | PASS `23503` |
| 5 | OTA cannot carry a lead source | PASS `23514` |
| 6 | OTA cannot have a sales owner | PASS `23514` |
| 7 | DIRECT requires a lead source | PASS `23514` |
| 8 | OTA cannot carry a sales status | PASS `23514` |
| 9 | **`sales_inquiry` has no stay/quantity columns** | PASS (structural) |
| 10 | `inventory_hold.expires_at NOT NULL` | PASS `23502` |
| 11 | Invalid quantity rejected | PASS `23514` |
| 12 | Invalid date range rejected | PASS `23514` |
| 13 | Foreign key integrity | PASS `23503` |
| 14 | `media_asset.partner_id NOT NULL` | PASS `23502` |
| 15 | RBAC PARTNER scope requires `partner_id` | PASS `23514` |
| 16 | **OVERSELL GUARANTEE** | PASS `23514` |
| 17 | Negative rate rejected | PASS `23514` |
| 18 | **Customer has no partner/property column** | PASS (structural) |
| 19 | **Withdrawn `ota_reserved<=ota_allotment` absent** | PASS |
| 20 | No generic `source`/`status` column | PASS |
| 21 | **No `room_number`/`floor`/`unit_id` column anywhere** | PASS |
| 22 | `audit_log` rejects UPDATE | PASS `42501` |
| 23 | `audit_log` rejects DELETE | PASS `42501` |
| 24 | Hold XOR reservation/inquiry | PASS `23514` |
| 25 | `review UNIQUE(reservation_id)` = Verified Stay | PASS |
| 26 | One cover per media owner | PASS `23505` |

### 8.2 Concurrency — **PASS**

```
12 concurrent transactions claim the LAST available room
  committed        : 1        (expected 1)
  rejected         : 11
  direct_committed : 1        (expected 1)
  available_direct : 0        (expected 0)
  deadlocks        : 0        (expected 0)
```

**Concurrency safety is now claimed, because it is verified.** Also run at N=8 with identical results.

### 8.3 Reproducibility — **PASS**

`DROP SCHEMA kas CASCADE` → recreate → apply all 22 migrations:

```
schema fingerprint (incremental build) : 3bd3516bc11d7d1bb44e072c50945a5b
schema fingerprint (clean rebuild)     : 3bd3516bc11d7d1bb44e072c50945a5b   IDENTICAL
```

Both validation suites re-run against the rebuilt schema: **26/26 and concurrency PASS.**

---

## 9. Defect found and fixed during validation

**V3 declared** `UNIQUE (property_id, policy_type, version)`.

In PostgreSQL, NULLs are **distinct** in a UNIQUE constraint. A global policy has `property_id = NULL`,
so that constraint permitted **two global CANCELLATION v1 policies to coexist** — exactly the ambiguity
that a reservation's `terms_version` pin exists to eliminate.

**Fixed forward in V21** with a partial unique index, **not** by editing V3. V3 had been applied;
editing it would break Flyway checksum validation in every environment that had already run it.

**Also caught during application:** V9 initially used a subquery inside a CHECK constraint, which
PostgreSQL forbids. Rewritten using array containment (`<@`). Caught because migrations were executed,
not merely written — and the failure was atomic, leaving nothing partially applied.

---

## 10. Security validation

| Control | Status |
|---|---|
| Runtime role is `kas_web_app`, not `postgres` | ✔ Every statement ran as `kas_web_app` |
| Least privilege | ✔ All six role flags `false`, verified by query |
| Password never printed, logged, or committed | ✔ |
| `pgpass.conf` never read or displayed | ✔ |
| No `.env` created | ✔ |
| No credential in any migration, doc or source file | ✔ |
| **Legacy `kas_dev`/`kas_test`/`kas_app` untouched** | ✔ **Never queried or referenced in any statement** |
| No cluster-wide operation | ✔ `DROP SCHEMA kas` was scoped to `kas_web_dev`, guarded by a `current_database()` check in the runner |
| `pg_dumpall` never used | ✔ |
| No writes outside `C:\Kas-Web` | ✔ |
| **`C:\Kas` / `C:\KasData` / `C:\Kas-Dev`** | ✔ **Not accessed, not inspected, not referenced** |

---

## 11. Outstanding business inputs

**18 configuration keys are registered in `system_setting` with `value = NULL`.** They are a
**registry of what is missing**, not values. The application must fail loudly at the point of use,
naming the setting — it must never default.

| Key | Blocks | Config |
|---|---|---|
| `SALES_FIRST_CONTACT_SLA` | Development | A6 / OQ-051 |
| `DEFAULT_LOCALE` | Development | A11 / OQ-065 |
| `INVENTORY_HORIZON_MONTHS` | Development | doc 55 §2 |
| `DIRECT_REQUEST_HOLD_DURATION` | Production | B2 / OQ-018 |
| `DIRECT_ALTERNATIVE_HOLD_DURATION` | Production | B1 / D-46 |
| `ALTERNATIVE_OFFER_RESPONSE_EXPIRY` | Production | B19 / OQ-066 |
| `OTA_RECORDING_LAG_THRESHOLD` | Production | B4 / OQ-081 |
| `RECONCILIATION_VARIANCE_TOLERANCE` | Production | B5 |
| `INQUIRY_FOLLOWUP_ATTEMPT_LIMIT` | Production | B18 / OQ-080 |
| `MAX_ROOMS_PER_REQUEST` | Production | B15 / OQ-015 |
| `MAX_STAY_NIGHTS` | Production | B21 / OQ-035 |
| `DEPOSIT_REQUIRED_TO_CONFIRM` · `DEPOSIT_PERCENTAGE` | Production | B12 / OQ-017 |
| `REVIEW_WINDOW_DAYS` | Production | B16 / OQ-040 |
| `USD_FX_RATE_SOURCE` · `USD_FX_REFRESH_INTERVAL` | Production | B22 / OQ-052 |
| `SAME_DAY_BOOKING_CUTOFF` | Production | B20 / OQ-047 |
| `NO_SHOW_CUTOFF` | Production | A5 / OQ-045 |

**Not seeded and not invented:** room types · room quantities · rates · VAT/service charge ·
cancellation policy · no-show policy · OTA safety buffer values · hotel names · addresses ·
amenity content.

`property.collection` is deliberately `text`, not an enum — inventing enum values would silently
resolve OQ-009.

---

## 12. Risks

| # | Risk | Severity | Note |
|---|---|:--:|---|
| R1 | **Flyway has not yet validated these migrations** | 🟠 | Applied via psql because no JDK exists. Flyway will compute checksums on first run in 7.3. Files must not change before then, or checksums shift |
| R2 | **JDK 21 absent** | 🔴 | Blocks Phase 7.3 entirely |
| R3 | Materialised counters can drift from derived truth | 🟠 | Reconciliation job is specified but **not yet built** — Phase 7.4 |
| R4 | `kas_web_test` not created | 🟢 | Deferred to 7.3, as planned |
| R5 | Shared PostgreSQL instance | 🟠 | Mitigated: `REVOKE ALL … FROM PUBLIC`, dedicated role, `current_database()` guard in the runner |
| R6 | Docker absent → Testcontainers unavailable | 🟠 | 7.3 integration tests must use a local `kas_test` DB, diverging from CI |
| R7 | Business config outstanding | 🟠 | Mechanism built and fails safely; values needed before launch |

---

## 13. Exit criteria

| # | Criterion | Status |
|---|---|:--:|
| 1 | `kas_web_dev` exists and is isolated | ✅ |
| 2 | `kas_web_app` least privilege | ✅ All flags false |
| 3 | No unrelated or legacy database modified | ✅ |
| 4 | Migration structure exists | ✅ 22 files |
| 5 | Frozen domain model represented | ✅ 53 tables |
| 6 | Critical constraints exist | ✅ 305 |
| 7 | Required indexes exist | ✅ 135 |
| 8 | Inventory integrity mechanisms exist | ✅ Tested |
| 9 | Partner/property isolation exists | ✅ Tested |
| 10 | Direct/OTA separation exists | ✅ Tested |
| 11 | Customer 360 intact | ✅ Tested |
| 12 | Media isolation exists | ✅ Tested |
| 13 | Database validation passes | ✅ **26/26 + concurrency** |
| 14 | `git diff --check` passes | ✅ |
| 15 | Documentation complete | ✅ |
| 16 | Boundary directories untouched | ✅ |

**16 / 16.**

---

## 14. Next phase

**Phase 7.3 — Backend skeleton.** Blocked on **JDK 21** (risk R2):

```
winget install EclipseAdoptium.Temurin.21.JDK
```

First action in 7.3: run Flyway against the existing schema. Because the schema was built by psql,
Flyway will need `baselineOnMigrate` **or** a clean rebuild via `migrate.sh --reset` followed by a
Flyway-managed run. The clean rebuild is preferred — it is proven reproducible (§8.3) and leaves
Flyway as the single source of migration truth from that point forward.
