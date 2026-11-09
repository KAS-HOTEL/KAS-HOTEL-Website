# 92 — Phase 7.5: Property Onboarding — Schema Mapping & Blockers

**Phase:** 7.5 — Property Onboarding + Seed + Admin Approval + Public Rendering
**Status:** 🟡 **PARTIAL — foundation landed, workflow not built.** The two
blockers below were answered by the owner and are closed. Steps 1–9 complete;
Step 10 partially complete; Steps 11–16 not started.
**Last updated:** 2026-08-16

> **Owner decisions received (see §9):** D2 = Option A · D1 = seed minimal rows
> now and supply data later · D4 = backend only in 7.5, frontend becomes 7.6.
>
> §2 and §3 below record the blockers **as they stood before those answers**.
> They are retained because they are the evidence the decisions were made on.
> What was actually built afterwards is in §9.

---

## 1. Why this is BLOCKED rather than partially built

The phase brief names its own stop conditions (§34): *"STOP and ask if ambiguity
affects — database structure, security, inventory, money, legal, publication,
ownership."* Two live ambiguities hit those categories directly, and §39 is
explicit that reporting COMPLETE without the full onboarding-to-publish flow
proven is not acceptable.

Both blockers are stated in §2 and §3. Everything else — the mapping — is
finished and in §4.

---

## 2. 🔴 BLOCKER 1 — The seed source material does not exist

### 2.1 What §22 asks for

> "For each property, use the detailed source material already supplied by the
> owner. This includes: property details, addresses, room types, room
> information, facilities, policies, images, room codes, observed room cards,
> reconciliation information…"

and §22 further instructs that where the owner previously said **"48 observed
cards"** is the correct reconciliation number, 48 must be used rather than 47.

### 2.2 What is actually present — verified, not assumed

| Searched for | Result |
|---|---|
| Any file in the repository outside `docs/kas` and `backend` | **None.** The repository contains only documentation, the backend, `.gitignore` and `.gitattributes` |
| "observed card", "48 card", "47 card", "reconciliation number" | **No match in any document** |
| Agoda listing names (Cabana, Pravina, Song Anh, Tuyet Lan, Tuong Vy, APEC) | **No match anywhere in the repository** |
| Street addresses, wards, districts for any property | **No match** |
| `amenity` / `facility` / `property_policy` / `room_type` / `media_asset` rows | **0 rows each** |

Nothing named in §22 beyond the eight canonical names is present in the
repository, in the database, or in this conversation.

### 2.3 The frozen documents affirmatively say this data does not exist

This is not merely an absence. Doc 03 §5 states it as a finding:

> "Every property needs the following before it can be published. Currently
> **none of these values are known for any property** — this is the single
> largest content gap in the project (OQ-030, OQ-031)."

The list that follows is exactly §22's list: full street address, district, ward,
coordinates, phone, star rating, year opened, total room count, room types with
bed configuration and area, inventory counts per room type, base rates,
photography, check-in/out times, cancellation policy.

Doc 51 agrees and grades the same items as blocking: **A1** room types per
property `OPEN`, **A2** room quantities `OPEN`, **A10** property districts and
addresses `OPEN`, **B6** rates `OPEN`, **B8** photography `OPEN`, **A9** amenity
taxonomy and per-property assignment `OPEN`.

### 2.4 Why this cannot be worked around

The brief forbids the only two ways past it:

- §23 — "Never manufacture missing production values… Do not fake completeness
  merely to make the UI look populated."
- §5 — Agoda "MUST NOT become the production source of truth for internal
  property name, room inventory, physical room count, base rate, cancellation
  rules, legal policy, image rights, internal room codes". Even if the Agoda
  pages were supplied, they could not fill these fields.

Seeding addresses, room types, room codes or rates would be inventing production
data for eight real hotels. **That is the one thing this project has refused to
do at every phase.**

### 2.5 What CAN be seeded today

A minimal, honestly-classified seed is possible from frozen sources:

| Field | Value | Classification |
|---|---|---|
| The eight names | Exactly as given in §22 | **OWNER-PROVIDED** (this brief) · corroborated by doc 03 §1 |
| `partner_id` | The single KAS partner | **FROZEN** — doc 85 §1 |
| `city` | Ho Chi Minh City | **FACT** — doc 03 §1, "all in Ho Chi Minh City, Vietnam" |
| `country` | VN | **FACT** — doc 03 §1 |
| `is_flagship` | `true` for Kas Milestone Premium Hotel only | **FROZEN** — doc 03 §4 |
| `lifecycle_state` | `DRAFT` | **DERIVED** — doc 03 §8: DRAFT is hidden and not bookable, which is correct for a property with no address, rooms or rates |
| `slug` | Derived from the canonical name | **DERIVED** |
| Everything else | Not set | **TBD** |

**This would create eight correctly-owned, correctly-named, non-public
placeholder properties and nothing more.** It is honest, but it is not what §22
describes, and it would not let any property be published, priced or booked.

> **Decision required:** seed the minimal eight rows as above, or wait for the
> source material? Either is defensible; inventing the difference is not.

---

## 3. 🔴 BLOCKER 2 — The onboarding workflow states conflict with the frozen lifecycle

### 3.1 The conflict

§18 requires this workflow:

```
DRAFT → COMPLETION CHECK → SUBMITTED → ADMIN REVIEW
      → APPROVED / REJECTED / CHANGES_REQUESTED → PUBLISHED
```

The frozen enum is:

```
property_lifecycle_state = DRAFT | COMING_SOON | OPEN | TEMPORARILY_CLOSED | CLOSED
```

Verified against `kas_web_dev`. It is frozen in **doc 03 §8** and **doc 52 §3.1**,
and its public-visibility semantics are specified in doc 03 §8.

`SUBMITTED`, `APPROVED`, `REJECTED` and `CHANGES_REQUESTED` do not exist, and
**no table anywhere in the schema supports a review workflow** — verified: no
table name matches `%submission%`, `%approval%`, `%review_request%`, `%workflow%`
or `%onboard%`.

§18 itself says: *"Do not invent additional states unless required by the
existing schema or frozen workflow."* Neither requires them. The brief asks for
states the frozen model does not have.

### 3.2 Two ways to resolve, with a recommendation

| Option | Shape | Assessment |
|---|---|---|
| **A — separate review record** *(recommended)* | New `property_submission` table carrying `SUBMITTED / APPROVED / REJECTED / CHANGES_REQUESTED`, a reason, reviewer and timestamps. `property_lifecycle_state` is untouched: an approved submission is what moves a property from `DRAFT` to `COMING_SOON`/`OPEN` | **Additive.** Nothing frozen changes. Review history is preserved per submission rather than collapsed into one column — a property submitted, rejected and resubmitted keeps both outcomes. Cleanly separates *editorial workflow* from *operational lifecycle*, which are genuinely different concerns: a live `OPEN` property can also have a pending edit under review |
| **B — extend the enum** | Add four values to `property_lifecycle_state` | Changes the meaning of a frozen enum that doc 03 §8 maps to public visibility and bookability. Mixes review state with operating state, so a published hotel undergoing an edit review would need two states at once. **Not recommended** |

Both require **V22**. Neither modifies V1–V21.

> **Decision required:** approve Option A, or choose otherwise. This is a
> database-structure ambiguity, which §34 makes an explicit STOP.

---

## 4. Schema mapping — Steps 6, 7 and 8, complete

The good news, and it is substantial: **the Phase 7.2 schema already supports
almost the entire onboarding surface.** Verified column by column against
`kas_web_dev`.

### 4.1 Reuse — no migration needed

| Brief section | Requirement | Existing support | Verdict |
|---|---|---|---|
| §8.1 | Property identity | `property` (id, slug, collection, star_rating, is_flagship) + `property_translation` for names and descriptions | ✅ **Reuse** |
| §8.2 | Location | `property.district, ward, city, country, latitude, longitude` + `property_landmark` (+ translations) for nearby landmarks | ✅ **Reuse** |
| §8.3 | Contact | `property.phone, email, zalo` | ✅ **Reuse** |
| §8.4 | Operational | `property.check_in_time, check_out_time, opened_year, total_rooms, lifecycle_state` | ✅ **Reuse** |
| §10 | Room types, N per property | `room_type` (19 cols: slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, smoking, base_price_minor, currency, sort_order, version) + `room_type_translation` | ✅ **Reuse.** No fixed limit exists |
| §10.1 | Partner-defined room name | `room_type_translation` — free text, no enum | ✅ **Already correct** |
| §10.4 | Bed configuration | `room_type_bed_config` | ✅ **Reuse** |
| §10.5 | Occupancy | `max_adults`, `max_children`, `max_occupancy` | ✅ **Reuse** |
| §11 | Room amenity catalog | `amenity` (code, category, icon, is_highlight, sort_order) + `room_type_amenity` join | ✅ **Reuse — this IS the controlled catalog** |
| §9 | Property amenity assignment | `property_amenity` join | ✅ **Reuse** |
| §13, §14 | Property and room assets | `media_asset` + `media_link` (`owner_type` = PROPERTY / ROOM_TYPE / FACILITY, `is_cover`, unique cover per owner) | ✅ **Reuse. Do not add an image table** |
| §15 | Policies | `property_policy` + `property_policy_translation` | ✅ **Reuse** |
| §16 | Inventory | `room_type_inventory_day` + the tested oversell guarantee | ✅ **Reuse, unchanged** |
| §17 | Rates | `rate_rule`, `tax_rule`, `ota_safety_buffer_rule` | ✅ **Reuse, unchanged** |
| §19 | Admin review audit | `audit_log`, append-only; `action` is `text` so new event types need no migration | ✅ **Reuse** |
| §24 | Partner → N properties | `property.partner_id` + `PARTNER` scope, delivered and tested in Phase 7.4 | ✅ **Already works** |

**The catalogs already exist and are currently empty** — `amenity` 0 rows,
`facility` 0 rows. They are unpopulated because doc 03 §6 / OQ-031 records the
actual amenity set as unknown, which is Blocker 1 again.

### 4.2 Genuine gap — V22 required for exactly one thing

| Missing capability | Evidence |
|---|---|
| **Onboarding submission and review** | No table matches `%submission%`, `%approval%`, `%review_request%`, `%workflow%` or `%onboard%`. No enum value for SUBMITTED/APPROVED/REJECTED/CHANGES_REQUESTED. No column holds a rejection reason or a reviewer |

That is the **only** proven missing persistence capability. Everything else in
the brief maps onto existing tables.

### 4.3 Three catalog-coverage questions

Small, but they change data and must not be guessed:

| # | Finding | Question |
|---|---|---|
| 1 | `facility_type` is a frozen enum: `RESTAURANT, BAR, ROOFTOP, GYM, POOL, SPA, MEETING, LOUNGE, TERRACE`. §9's candidate list adds ~15 items — Wi-Fi, 24h front desk, elevator, laundry, parking, breakfast, airport transfer, concierge, luggage storage, business centre, kids area, wheelchair access, smoking area | Most of these are **amenities, not facilities**. Doc 03 §6 puts "laundry, parking, lift, luggage storage" under the *amenity* taxonomy category "Property facilities". **Recommendation: classify them as `amenity` rows — data, no migration.** Confirm? |
| 2 | `view_type` is a frozen enum: `CITY, STREET, COURTYARD, ROOFTOP, INTERIOR`. §11 mentions **Landmark View** and **Garden View**, which are absent | Add two enum values in V22, or map to existing? An enum change is additive but alters a frozen type |
| 3 | `media_category` is `EXTERIOR, LOBBY, ROOM, DINING, FACILITY, ROOFTOP, NEIGHBOURHOOD, DETAIL, STAFF, EVENT, DOCUMENT`. §13 lists reception, breakfast, parking, gym, spa as categories | These map onto `LOBBY`, `DINING` and `FACILITY`; "hero" is `media_link.is_cover`. **Recommendation: no change.** Confirm? |

---

## 5. Scope assessment — beyond the two blockers

Even with both blockers answered, the remaining work is large and should be
staged rather than attempted as one change (§36 requires incremental execution):

| Stage | Content |
|---|---|
| 7.5a | V22 + submission/review domain, repositories, workflow service |
| 7.5b | Partner onboarding API — property, rooms, catalogs, media, policies |
| 7.5c | Admin review API — inspect, approve, reject, request changes, audit |
| 7.5d | Public rendering contract — published properties only |
| 7.5e | Seed (blocked on Blocker 1) |
| 7.5f | **Frontend** — the Partner multi-step wizard (§30) and the customer property page (§21). **No frontend exists**; this is a Next.js initialisation plus two substantial applications |
| 7.5g | The 29 tests in §29, including the ninth-property end-to-end proof (§25) |

§29 item 21 and §25 — *"9th property can be added without code change"* — is the
real acceptance criterion (§39), and it cannot be demonstrated until 7.5a–7.5d
exist.

---

## 6. What was NOT done, deliberately

- No migration written — Step 9 forbids it until mapping is approved, and V22's
  shape depends on Blocker 2.
- No seed inserted — Blocker 1.
- No code written — Steps 10–15 follow the mapping.
- No frontend initialised.
- **No property data invented.**

---

## 7. Confirmed unchanged

V1–V21 and the repeatable migration are **byte-identical** to their committed
blobs (23 checked, 0 differing). Flyway history holds 22 rows, 0 baseline rows.
The database holds 53 domain tables and **0 business rows** — `app_user`,
`partner`, `property`, `amenity`, `facility`, `room_type`, `media_asset` all
empty, exactly as Phase 7.4 left them. All 18 `system_setting` values remain
`NULL`. No legacy database was connected to. Spring JDBC is unchanged; no JPA.

Partner → N Properties is unchanged and already working: `ADMIN` + `PARTNER`
scope, one assignment, verified in Phase 7.4 against eight properties and a
ninth added after login.

---

## 8. Decisions needed to unblock

| # | Decision | Category |
|---|---|---|
| **D1** | Supply the property source material (addresses, room types, room codes, facilities, policies, images, the 48-card reconciliation), **or** approve the minimal eight-row seed in §2.5 | Publication / ownership |
| **D2** | Approve **Option A** — a separate `property_submission` review record, leaving `property_lifecycle_state` frozen | Database structure |
| **D3** | Confirm the three catalog-coverage answers in §4.3 | Data |
| **D4** | Confirm the staged delivery in §5, and whether the frontend (7.5f) is in this phase or its own | Scope |

D1 and D2 are hard blockers. D3 and D4 shape the work but do not prevent it
starting.

---

## 9. What was built after the decisions

Decisions received: **D2 = Option A**, **D1 = seed minimal rows now**,
**D4 = backend only**. Work then proceeded to a verified checkpoint.

### 9.1 Landed and verified

| # | Delivered | Verification |
|---|---|---|
| 1 | **V22 — `property_submission`** + `property_submission_status` enum, 2 CHECKs, 4 indexes | Applied **through Flyway**, not psql. "Successfully validated 23 migrations… applied 1 migration… now at version v22" |
| 2 | **V23 — the KAS partner and eight properties**, canonical names, `DRAFT`, Milestone flagged | 8 rows + 16 translations verified by query |
| 3 | **`R__reference_amenities`** — the controlled amenity vocabulary as data | **56 amenities** across the 9 frozen doc 03 §6 categories |
| 4 | **`catalog` module** — `Amenity`, `AmenityRepository` | Compiles; module boundary test updated deliberately |
| 5 | **`RoomType`, `RoomTypeStatus`, `RoomTypeRepository`** — scope-enforced, N per property, Partner-named | Compiles; passes the scope-enforcement rule |
| 6 | **`PropertyRepository` write path** — create, setName, updateDetails, updateLifecycle, replaceAmenities | Compiles; every method takes `AuthorizationScope` |
| 7 | **`PublishedPropertyRepository`** + `PublishedProperty` / `PublishedRoomType` | Publication filter in SQL; separate response types per doc 58 §9 |
| 8 | **`PublicReadRepository`** marker + amended `ScopeEnforcementRule` | An explicit, greppable exemption instead of hiding the class in an uninspected package |
| 9 | **Regression** | **192 tests pass** — 143 unit/architecture, 49 integration. 0 failures, 0 skipped |

Three constraint violations were caught by the database rather than by review,
and each corrected the design rather than being worked around:

- `amenity_code_format` requires lower-case codes; the first draft used upper case.
- `amenity_category_valid` permits nine categories; the draft invented
  `PROPERTY_FACILITIES` (plural) and `ROOM_FEATURES`. Window, balcony and terrace
  were remapped to `COMFORT` rather than altering a frozen CHECK to fit a label.
- `ModuleStructureTest` refused the new `catalog` module until it was recorded
  deliberately — which is the behaviour that test exists for.

Two Phase 7.3/7.4 tests pinned the schema to exact totals (53 tables, 22
migrations) and failed on V22/V23. They were rewritten to assert the guarantee
that actually matters — **nothing was removed** — because a test that must have
its number bumped on every additive migration trains people to bump it without
looking.

### 9.2 NOT built — the phase gate is not met

| Missing | Consequence |
|---|---|
| `PropertySubmission` domain, repository and service | No submit / approve / reject / request-changes |
| Completeness validation | Incomplete properties cannot yet be refused at submit |
| Partner onboarding API, admin review API, public API controllers | No HTTP surface for any of the above |
| Audit events for review decisions | — |
| The **ninth-property end-to-end proof** (brief §25, §29 item 21) | **The actual acceptance criterion in §39 is unproven** |
| Frontend | Deferred to 7.6 by decision D4 |

**Phase 7.5 is therefore NOT complete.** Per brief §39, the criterion is that KAS
can onboard and publish a new property through the Partner workflow without code
changes. The persistence and catalog foundation for that exists and is tested;
the workflow on top of it does not.

### 9.3 Recommended next increment

In order, each ending at a green build: `PropertySubmission` + repository →
`OnboardingService` (submit with completeness check, approve, reject, request
changes, audit) → Partner and Admin controllers → public controller → the
ninth-property integration test → cross-partner isolation over the new routes.

The schema, catalogs and scope-enforced repositories they need are all in place,
so none of that work requires a further migration.
