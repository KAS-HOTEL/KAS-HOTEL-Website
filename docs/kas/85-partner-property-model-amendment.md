# 85 — Partner / Property Model Amendment

**Type:** Focused architecture amendment — **not a new phase**
**Status:** Applied. Awaiting approval.
**Scope:** Domain, database, RBAC, API, media, reporting, security compatibility review.
**Last updated:** 2026-08-14

---

## 1. The clarified model

**CONFIRMED**

```
KAS Platform
│
├── Platform Admin
│
└── PARTNER  (one, in V1)
      ├── Property 1   KAS Passion Boutique Hotel
      ├── Property 2   KAS Elegance Hotel
      ├── Property 3   KAS Ancient Boutique Hotel
      ├── Property 4   KAS Milestone Premium Hotel   ← flagship
      ├── Property 5   KAS Zody Boutique Hotel
      ├── Property 6   KAS Sonata Luxury Hotel
      ├── Property 7   KAS Eliana Luxury Hotel
      └── Property 8   KAS Dilly Hotel
```

**CONFIRMED — the distinction**

| | **Partner** | **Property** |
|---|---|---|
| Is | The management / ownership organisation | An individual hotel branch |
| Cardinality | **1 → N properties** | Belongs to exactly one partner |
| V1 count | **1** | **8** |
| Owns | Nothing operational directly | Identity, rooms, inventory, rates, reservations, media, reviews |

**CONFIRMED** — The eight properties remain fully independent. **They are not merged into one hotel.**
Each retains its own identity, name, address, room types, room quantities, rates, inventory,
reservations, facilities, amenities, media, reviews and operational data.

---

## 2. The judgement: is a Partner entity required?

**CONFIRMED direction** — *"Do NOT add an entity merely because this prompt mentions it. If the existing
model already supports it correctly, preserve it."*

### 2.1 Does the existing model already work for V1?

**Yes — completely.** With one partner, `role_assignment.property_scope = ALL` is functionally
identical to "all of the partner's properties". V1 needs nothing.

### 2.2 Does the existing model preclude a future multi-partner model?

**No — but it makes the migration expensive and introduces a silent failure mode.** Three concrete
problems:

| # | Problem without a Partner entity |
|---|---|
| 1 | **`ALL` becomes wrong for a partner admin.** In a multi-partner world, a Partner A admin holding `ALL` would see Partner B's data. Every such assignment would need converting to an enumerated property-ID array |
| 2 | **Scope arrays must be hand-maintained.** Adding a 9th property to Partner A means updating every Partner A user's array. Miss one → the user silently cannot see the new property. Add a wrong ID → they see another partner's data. **Both failures are silent** |
| 3 | **No structural isolation guard.** Cross-partner leakage would be prevented only by correct arrays. There is no `partner_id` to filter on, so no constraint or query-layer rule can enforce it |

### 2.3 Recommendation

**PROPOSED — add a minimal `partner` entity now. Add nothing else.**

The reasoning is **exactly the argument already accepted for property scoping** in
[06](06-user-roles.md) §3: *"retrofitting property scoping into an authorisation layer that never had
it means auditing every query in the system."* The same is true of partner scoping, and the cost of
adding it now is one table, three columns and one scope kind.

**What is added:**

| Addition | Cost |
|---|---|
| `partner` table — 5 columns | One table |
| `property.partner_id` FK | One column |
| `media_asset.partner_id` FK | One column (§5.2 — the one place partner does **not** derive) |
| `role_assignment.partner_id` nullable FK | One column |
| `PARTNER` scope kind in RBAC | ~10 lines of scope resolution |
| `partnerId` added to the public response denylist | One denylist entry |

**What is explicitly NOT added:** partner registration · onboarding · approval workflow · subscription ·
billing · commission · KYC · marketplace · self-service acquisition · payout · partner-level settings
beyond identity · any partner UI beyond the existing property-scope selector.

---

## 3. Domain model changes

### 3.1 New entity — Partner (MASTER)

| | |
|---|---|
| **Purpose** | The management / ownership organisation above one or more properties |
| **Identity** | `id` UUID · `code` unique slug |
| **Key attributes** | `legalName`, `displayName`, `status`, `createdAt` |
| **Relationships** | **1 → N Property** · 1 → N MediaAsset · 1 → N RoleAssignment |
| **Lifecycle** | `ACTIVE` · `SUSPENDED` — **no onboarding lifecycle in V1** |
| **Ownership** | `SUPER_ADMIN` only |
| **Invariants** | Every published property has exactly one partner |
| **Nullable** | None |
| **Visibility** | **Internal only.** Never reaches a public or `/me` response |
| **Data class** | MASTER |

**PROPOSED** — Deliberately minimal. It carries **identity and ownership, nothing commercial.** No
billing terms, no commission rate, no contract dates, no payout details. Those are future concerns and
adding placeholders for them would invite the marketplace this amendment explicitly excludes.

### 3.2 Property — one added field

`property.partner_id` — required FK to `partner`. Everything else unchanged.

### 3.3 Customer — deliberately NOT partner-scoped

**PROPOSED — an important negative decision.**

`Customer` remains **platform-level**. A customer is a person, not a partner's asset.

| Rationale | Detail |
|---|---|
| V1 | A guest may stay at Property 1, then 4, then 8 — all one partner, one customer record. Already correct |
| Future | A guest may stay with Partner A and later Partner B. Splitting them would defeat Customer 360 and create duplicate identities |
| Privacy | Partner-scoping a customer implies a partner *owns* the person's record, which is the wrong model and a poor privacy posture |

**Future consideration flagged, not solved:** in a multi-partner world, *what a partner may see of a
customer's history at another partner's properties* is a genuine data-protection question. **Recorded
as OQ-085; not designed now** — V1 has one partner, so no cross-partner visibility exists.

### 3.4 Everything else unchanged

`RoomType` · `InventoryDay` · `Hold` · `SalesInquiry` · `Reservation` · `ReservationLine` · `Payment` ·
`Review` · `Amenity` · `Facility` · `RateRule` · `Voucher` · `DistributionChannel` · `AuditLog` ·
`Notification` — **no changes.** All derive partner through `property_id`.

---

## 4. Database changes

### 4.1 `partner`

```
partner
  id             uuid pk
  code           text UNIQUE          -- slug, e.g. 'kas'
  legal_name     text
  display_name   text
  status         enum  ACTIVE | SUSPENDED
  created_at, updated_at
```

**V1 contains exactly one row.**

### 4.2 `property` — one column

```
property
  ...
  partner_id     uuid FK → partner   NOT NULL
```

| Concern | Decision |
|---|---|
| **Relationship** | `partner 1 → N property` |
| **Cardinality** | A property belongs to exactly one partner. **Never zero, never many** |
| **Ownership** | The partner owns the property record; `SUPER_ADMIN` assigns |
| **Uniqueness** | `property.slug` remains **globally unique**, not per-partner — slugs are public URLs and must not collide across partners |
| **Index** | `(partner_id)` · `(partner_id, lifecycle_state, sort_order)` for partner-scoped listing |
| **Deletion** | `ON DELETE RESTRICT`. A partner with properties cannot be deleted. Partners are suspended, never deleted |
| **Audit** | `partner_id` changes are audit-logged. See §4.5 |

### 4.3 `media_asset` — the one non-derivable case

```
media_asset
  ...
  partner_id     uuid FK → partner   NOT NULL
```

**PROPOSED — why this one needs an explicit column.** A `media_asset` lives in a central library and is
attached to owners via `media_link`. It is **not owned by a property**, so partner cannot be derived
through one — an asset may legitimately be linked to several properties within a partner.

Without `partner_id`, nothing structurally prevents Partner A's asset being linked to Partner B's
property in a future multi-partner model.

| Concern | Decision |
|---|---|
| Constraint | `media_link` may only attach an asset to an owner **within the same partner** — enforced at the service layer and asserted in tests |
| Reuse | An asset **may** be linked to multiple properties of the same partner. **No duplication** — this is exactly what the central library exists for |
| Index | `(partner_id, category, status)` |

### 4.4 `role_assignment` — one column plus a scope kind

```
role_assignment
  user_id, role
  scope_kind     enum  GLOBAL | PARTNER | PROPERTY | OWN     ← was implicit
  partner_id     uuid FK | null      -- required when scope_kind = PARTNER
  property_ids   uuid[] | null       -- required when scope_kind = PROPERTY
  CHECK (
    (scope_kind = 'GLOBAL'   AND partner_id IS NULL AND property_ids IS NULL)
 OR (scope_kind = 'PARTNER'  AND partner_id IS NOT NULL AND property_ids IS NULL)
 OR (scope_kind = 'PROPERTY' AND property_ids IS NOT NULL)
 OR (scope_kind = 'OWN'      AND partner_id IS NULL AND property_ids IS NULL)
  )
```

**PROPOSED** — This replaces the implicit `property_scope = ALL | uuid[]`. `ALL` becomes `GLOBAL`;
a partner administrator becomes `PARTNER`. See §6.

### 4.5 No denormalisation elsewhere

**CONFIRMED direction** — *"Do not duplicate partner data into every transactional table unless there
is a documented reason."*

**PROPOSED — no transactional table gains `partner_id`.** Partner is derived:

```
reservation → property → partner
inventory   → room_type → property → partner
rate_rule   → property (or room_type → property) → partner
review      → property → partner
hold        → property → partner
```

At KAS's scale (8 properties, hundreds of reservations per month, ~90k inventory rows) a join is free.
Denormalising would create eight places for partner to become inconsistent.

**One documented exception considered and rejected for V1:** `audit_log` could freeze `partner_id` at
write time, so history survives a property being reassigned between partners. Since V1 has one partner
and no reassignment mechanism, this is **not added now** — recorded as **OQ-086**, to be resolved
before any property-reassignment capability is built.

---

## 5. RBAC changes

**CONFIRMED direction** — *"Prefer existing permission-based RBAC… document it as a scope, not as an
excuse to create unnecessary roles."*

### 5.1 One new scope kind. No new roles.

| Scope | Meaning | Resolution |
|---|---|---|
| **GLOBAL** | The whole platform | All properties |
| **PARTNER** ← **NEW** | One partner's properties | `properties WHERE partner_id = assignment.partner_id` |
| **PROPERTY** | Explicitly assigned properties | `properties WHERE id = ANY(assignment.property_ids)` |
| **OWN** | The actor's own records | — |

**No role is added, renamed or removed.** The role catalogue in [59](59-phase-4-rbac.md) §3 is unchanged.

### 5.2 V1 scope assignment

| Role | V1 scope | Reaches |
|---|---|---|
| `SUPER_ADMIN` | **GLOBAL** | Platform: users, roles, settings, audit, all partners |
| `ADMIN` | **PARTNER** → the one KAS partner | All 8 properties |
| *(future)* `HOTEL_MANAGER` · `RECEPTIONIST` · `RESERVATIONS_STAFF` | **PROPERTY** | Assigned properties only |
| `CUSTOMER` | **OWN** | Own records only |

**PROPOSED — the change from Phase 4.** `ADMIN` moves from `propertyScope = ALL` to
`scope_kind = PARTNER`. **In V1 these resolve to an identical set of eight properties**, so behaviour is
unchanged — but the *semantics* are now correct, and when a second partner appears nothing structural
changes.

### 5.3 The requested hierarchy, satisfied

| Requested | Satisfied by |
|---|---|
| Platform Admin → all partner data → all 8 properties | `SUPER_ADMIN` + `GLOBAL` |
| Partner Admin / Partner User → own partner → all 8 properties | `ADMIN` + `PARTNER` |
| Property-scoped staff → assigned property only | Future roles + `PROPERTY` |
| Customer → own data only | `CUSTOMER` + `OWN` |

### 5.4 Enforcement — unchanged in principle, extended in resolution

The Phase 4 rules stand: deny by default · server-side only authority · **scope applied at the data
layer, not only in controllers** · explicit object-level ownership checks · audit on privileged actions.

**PROPOSED — one addition.** The repository-boundary scope filter gains a `PARTNER` branch. Because the
filter is a single shared mechanism, this is one change, not a per-query audit — **which is the entire
reason for adding the scope now rather than later.**

---

## 6. API changes

### 6.1 Public and `/me` — no partner context

**CONFIRMED** — Customer-facing APIs operate on Property · RoomType · Availability · Reservation ·
Customer · Review · Media. **A guest has no reason to learn which organisation owns a hotel.**

**PROPOSED — one concrete change:** `partnerId`, `partnerCode`, `partnerName` and `partner` are added
to the **public response denylist** ([58](58-phase-4-api-contract.md) §9), enforced by the existing
blocking CI contract test.

### 6.2 Admin — scope applied, no new endpoints

No new endpoints in V1. The existing property-scope mechanism resolves through `PARTNER` scope.

**PROPOSED** — Optional `?partnerId=` filter on cross-property admin and reporting endpoints, **ignored
in V1** (one partner) and **rejected with `403`** if it names a partner outside the caller's scope.

### 6.3 Cross-partner isolation test

**PROPOSED** — A new blocking CI test, added to the Phase 4 test contract:

> Seed two partners with properties. Authenticate as Partner A's admin. Assert that **every** admin
> endpoint returns `404` (not `403`) for Partner B's property, room type, reservation, media asset,
> rate rule and review — **including when `property_id` is supplied directly in the path or body**.

`404` rather than `403`, so the existence of another partner's records is not disclosed.

---

## 7. Media

**CONFIRMED** — The hierarchy is preserved:

```
Partner → Property → RoomType / Facility → MediaAsset
```

| Requirement | Status |
|---|---|
| No duplication across properties of the same partner | ✔ Already satisfied — `media_asset` + `media_link` is a central library with polymorphic attachment. One asset, many links |
| Media cannot cross partner boundaries | ✔ **New** — `media_asset.partner_id` (§4.3) + service-layer check on `media_link` creation |
| Storage keys never public | ✔ Unchanged — already on the denylist |
| Property / room / facility scoping | ✔ Unchanged — `media_link.owner_type` |

---

## 8. Reporting

**PROPOSED** — Reporting is scope-resolved, not restructured.

| Level | V1 | Mechanism |
|---|---|---|
| **Partner-level aggregation** | Aggregates all 8 properties | `reservation → property → partner`, filtered by scope |
| **Property-level** | Individually filterable | Existing property filter |
| Cross-partner | **Not available** — no second partner exists | `GLOBAL` scope only, future |

The three analytics domains — Direct Sales, OTA Distribution, Operations
([60](60-phase-4-admin-operations.md) §6) — are unchanged. They gain a partner scope boundary, not a
new dimension. **No "by partner" axis is added in V1**; with one partner it would be a single bar.

---

## 9. Admin UI

**CONFIRMED** — No partner marketplace UI. No partner onboarding UI.

**PROPOSED — the existing property scope selector already is the partner view.** In V1 the selector's
"All properties" option means "all of this partner's properties". Two minimal changes:

| Change | Detail |
|---|---|
| Selector label | "All properties" → **"All KAS properties"** — makes the partner boundary visible without introducing a partner concept to operators |
| Cross-property overview | Already specified — the dashboard aggregates across the scope ([80](80-phase-6-admin-screens.md) §3) |

**Nothing else changes.** Property switching, per-property management, reservations, inventory, rates,
media and reviews are all unchanged. A partner administration screen exists only under `SUPER_ADMIN` →
Settings, and in V1 it shows one read-mostly record.

---

## 10. Security validation

| # | Requirement | Mechanism | Status |
|---|---|---|---|
| 1 | Partner accesses only its own properties | `PARTNER` scope resolved at the **data layer** | ✔ |
| 2 | Property staff cannot access another property | `PROPERTY` scope, unchanged | ✔ |
| 3 | Customer cannot access partner/admin data | Separate API surfaces; `partnerId` on the denylist | ✔ |
| 4 | Admin can access all V1 properties | `ADMIN` + `PARTNER` scope → 8 properties | ✔ |
| 5 | **Authorisation cannot be bypassed by changing `property_id`** | Scope filter applies at the repository boundary **before** the ID is used; mismatched ID → `404` | ✔ **New CI test** (§6.3) |
| 6 | Media cannot cross property boundaries without authorisation | `media_asset.partner_id` + service check on `media_link` | ✔ **New** |
| 7 | Reservations cannot be accessed by guessing IDs | Non-sequential references + **mandatory ownership check** — a reference is an identifier, never a credential | ✔ Unchanged |
| 8 | Reports respect partner/property scope | Same scope filter as list queries | ✔ |

**Deny by default** remains the governing principle: every endpoint declares its permission, an
undeclared endpoint fails closed and fails a CI check.

---

## 11. Compatibility sweep — 20 / 20

| # | Check | Result |
|---|---|---|
| 1 | V1 = 1 Partner | ✔ §1, §4.1 — exactly one row |
| 2 | V1 = 8 Properties | ✔ §1 — unchanged from Phase 1 |
| 3 | Partner manages all 8 properties | ✔ §5.2 — `ADMIN` + `PARTNER` scope |
| 4 | Properties remain independent | ✔ §1 — no property attribute moved to Partner |
| 5 | Partner ≠ Property | ✔ §1, §3.1 — separate entities, distinct purposes |
| 6 | Reservations remain property-specific | ✔ §4.5 — `reservation.property_id` unchanged |
| 7 | Inventory remains property-specific | ✔ Unchanged — per room type per date |
| 8 | Rates remain property-specific | ✔ Unchanged — `rate_rule` scoped to property/room type |
| 9 | Media remains property-specific | ✔ §7 — via `media_link`, with partner as an isolation boundary only |
| 10 | Customer may stay across multiple properties | ✔ §3.3 — Customer is **platform-level, never partner-scoped** |
| 11 | Partner scope does not replace property scope | ✔ §5.1 — both scope kinds coexist |
| 12 | Existing RBAC remains coherent | ✔ §5 — one scope kind added, **no role changes** |
| 13 | Existing API contract remains coherent | ✔ §6 — no endpoint changes in V1 |
| 14 | Public APIs expose no partner internals | ✔ §6.1 — denylist entry + CI test |
| 15 | Future multi-partner remains structurally possible | ✔ §2.3 — the whole purpose of the amendment |
| 16 | No partner marketplace | ✔ §2.3 — explicitly excluded |
| 17 | No partner billing | ✔ §3.1 — no commercial fields on `partner` |
| 18 | No partner commission | ✔ §3.1 |
| 19 | No partner onboarding | ✔ §3.1 — lifecycle is `ACTIVE`/`SUSPENDED` only |
| 20 | No Phase 4/5/6 visual decision changed | ✔ §9 — one selector label; no layout, token or component change |

---

## 12. Contradiction found — one, non-blocking

### 12.1 "KAS is the only tenant"

**Source** — [01-product-foundation.md](01-product-foundation.md) §5.3:

> *"we are not building… a multi-tenant SaaS product for other hotel groups. KAS is the only tenant."*

**Assessment — a refinement, not a contradiction.**

| Statement | Status |
|---|---|
| KAS is the only tenant **in V1** | ✔ Still true. One partner, eight properties |
| No marketplace, billing, onboarding or commission is built | ✔ Still true. Explicitly excluded (§2.3) |
| The model **precludes** multi-tenancy forever | ✖ **Superseded.** The domain no longer makes future expansion structurally impossible |

**PROPOSED** — Doc 01 receives a clarifying note. Its scope decision is unchanged; only the permanence
claim softens. **No other document contradicts the partner model.**

### 12.2 No blocking contradiction exists

All eight reviewed Phase 4 documents ([52](52-phase-4-domain-model.md), [53](53-phase-4-database-erd.md),
[58](58-phase-4-api-contract.md), [59](59-phase-4-rbac.md), [60](60-phase-4-admin-operations.md),
[61](61-phase-4-customer-review.md), [62](62-phase-4-media.md), [63](63-phase-4-validation.md)) are
compatible. Phase 5 and Phase 6 require **no change** beyond one admin selector label.

---

## 13. New open questions

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-085** | Privacy / future | In a multi-partner model, what may a partner see of a customer's stay history at another partner's properties? | `FUTURE` — no cross-partner visibility exists in V1 |
| **OQ-086** | Audit / future | If a property is ever reassigned between partners, must `audit_log` and historical reservations freeze the partner at write time? | `FUTURE` — blocks any property-reassignment capability |
| **OQ-087** | Configuration | Are any settings (SLA, hold durations, policies) partner-level rather than global? | `OPEN` — V1 treats all as global; one partner makes them equivalent |
| **OQ-088** | Commercial / future | Should `voucher` become partner-scoped? It does not derive partner through property | `FUTURE` — V1 has one partner |

**None of these blocks Phase 7.** All four are future-model questions that V1's single partner makes
moot.

---

## 14. Summary of changes

| Document | Change |
|---|---|
| **85** *(this)* | New — the amendment |
| [52](52-phase-4-domain-model.md) | `Partner` entity added; Customer confirmed platform-level; `Property.partnerId` |
| [53](53-phase-4-database-erd.md) | `partner` table; `property.partner_id`; `media_asset.partner_id`; `role_assignment` scope columns |
| [58](58-phase-4-api-contract.md) | `partnerId` family added to the public response denylist; cross-partner isolation test |
| [59](59-phase-4-rbac.md) | `PARTNER` scope kind; `ADMIN` moves from `ALL` to `PARTNER`. **No role changes** |
| [62](62-phase-4-media.md) | `media_asset.partner_id`; cross-partner link prohibition |
| [80](80-phase-6-admin-screens.md) | Selector label "All properties" → "All KAS properties" |
| [01](01-product-foundation.md) | Clarifying note on the "only tenant" statement |
| [00](00-README.md) | Index and confirmed-decisions update |

**Unchanged:** all inventory, pricing, reservation, state machine, booking flow, customer, review,
typography, colour, layout, component and screen specifications.
