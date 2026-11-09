# 94 — Phase 7.5B: Room Type & Room Configuration

**Phase:** 7.5B — Room type and room configuration
**Status:** ✅ **COMPLETE — awaiting review.** Every applicable §31 gate item is proven.
**Last updated:** 2026-08-16

> **225 tests pass** — 143 unit/architecture, 82 integration. 0 failures, 0 skipped.
>
> **No migration was required.** V1–V23 byte-identical; Flyway still at v23,
> 25 rows, 0 failed. **No fabricated room data.** **No frontend.**
>
> `kas_web_dev` is unchanged from the 7.5A checkpoint: 8 DRAFT properties,
> 56 amenities, and **0 rows** in `room_type`, `room_type_bed_config`,
> `room_type_amenity`, `property_submission`, `app_user` and `audit_log`.

---

## 1. No stop conditions — everything resolved from frozen material

The §32 stop conditions were each checked and none fired:

| Question | Answer | Source |
|---|---|---|
| Is there a permission for room management? | **`roomtype.manage`** — already in the catalogue | doc 58 §8, doc 59 §4.5 |
| Do the API paths conflict? | No. `/admin/properties/{id}/room-types[/{rtId}]` is **already frozen** | doc 58 §8 |
| Can the schema support the requirement? | **Yes, entirely** | §3 below |
| Would a migration alter frozen semantics? | No migration was needed | §3 |
| Can publication be separated safely? | Yes — and tightened, see §7 | §7 |
| Would room data have to be invented? | No. Nothing was seeded | §10 |
| Must an architecture rule be weakened? | No. One was **strengthened** | §11 |
| Does OQ-098 create an immediate risk? | No, and this phase **reduces** the exposure | §8 |

Unlike Phase 7.5A's review routes, **no doc 58 amendment is needed here** — the
contract already names these endpoints.

---

## 2. Field classification (§5)

| Field | Class | Notes |
|---|---|---|
| `slug` | **A — implemented** | `room_type_slug_unique (property_id, slug)`, format CHECK |
| localised name | **A** | `room_type_translation.name`, Partner free text, both frozen locales |
| localised short/long description | **A** | same table |
| `area_sqm` | **A** | CHECK > 0 when present |
| `max_adults` / `max_children` / `max_occupancy` | **A** | four CHECKs incl. `occupancy_fit` |
| bed configuration | **A** | `room_type_bed_config`, N per room type |
| `view_type` | **A** | frozen enum, **not extended** |
| `status` | **A** | `DRAFT/PUBLISHED/UNLISTED/ARCHIVED` |
| room amenities | **A** | `room_type_amenity` + shared catalogue |
| `sort_order`, `smoking` | **A** | |
| `version` | **A** | used for optimistic locking |
| `base_price_minor`, `currency` | **C — deferred** | Rates are Phase 7.5E. Present in the schema, deliberately not exposed |
| room code | **D — OPEN** | No column exists. Brief §26 anticipates one; the schema has none. **OQ-104** |
| room images | **C** | Phase 7.5C |
| room policies | **C** | Phase 7.5D |
| inventory | **C** | Phase 7.5E |

---

## 3. Migration decision — none required

Every requirement mapped onto existing structures:

```
room_type                 identity, dimensions, occupancy, view, status, version
room_type_translation     PK (room_type_id, locale), locale CHECK in (vi,en), name non-blank
room_type_bed_config      N per room type, bed_count >= 1, is_default, sort_order
room_type_amenity         PK (room_type_id, amenity_id), FK to the shared catalogue
amenity                   56 rows, 9 frozen categories
```

**Optimistic locking needed no new column** — `room_type.version` already exists,
and doc 58 §2 already specifies version-guarded MASTER updates returning 409.

---

## 4. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/admin/properties/{propertyId}/room-types` | `roomtype.manage` |
| GET | `…/room-types/{roomTypeId}` | `roomtype.manage` |
| POST | `…/room-types` | `roomtype.manage` |
| PATCH | `…/room-types/{roomTypeId}?version=` | `roomtype.manage` |
| PATCH | `…/room-types/{roomTypeId}/amenities` | `roomtype.manage` |
| PATCH | `…/room-types/{roomTypeId}/status?status=` | `roomtype.manage` |

Paths and permission are **doc 58 §8 verbatim**. The three sub-resources are
narrower operations on the same resource, not new namespaces.

Public reads were already delivered in 7.5A at the doc 58 §3.1 paths.

---

## 5. Authorization and isolation

Ownership derives, exactly as before: `room_type → property → partner`. **No
partner id was added to `room_type`.**

Every statement carries the scope predicate — including the writes. A create is
`INSERT … SELECT … FROM property p WHERE p.id = ? AND <scope>`, so an
out-of-scope property yields no row and nothing is written. There is **no
fetch-then-check-in-Java** path.

`crossPartnerIsolation` proves it across read, list, update, status change and
create: **404 everywhere, never 403**, and the list simply returns empty.

---

## 6. Lifecycle — and one deliberate restriction

Doc 52 §3.2: `DRAFT → PUBLISHED → UNLISTED → ARCHIVED`. `UNLISTED` may return to
`PUBLISHED`; **`ARCHIVED` is terminal**, because archived room types may still be
referenced by historical reservation lines and reviving one would change what
that history appears to mean.

> **A Partner may never publish a room type.**

Withdrawing (`UNLISTED`, `ARCHIVED`) only ever *removes* content from the public
site, so it is safe unilaterally. Publishing *adds* content to a live property —
on an already-approved property that would let a Partner put arbitrary new rooms
in front of guests with nobody looking, routing around the 7.5A review workflow.

Publication therefore happens **only through property approval**, where a
reviewer sees the rooms. Requesting `PUBLISHED` returns `409 ILLEGAL_TRANSITION`.

This is a **PROPOSED** restriction: no frozen document states it. It was chosen
because the alternative silently widens what a Partner can publish unreviewed.
Recorded as **OQ-105** if the business wants direct publication.

---

## 7. Publication safety

Unchanged and re-proven. The public query requires **both** a publicly-visible
property lifecycle **and** `rt.status = 'PUBLISHED'`. `draftRoomIsNotPublic`
demonstrates the consequence: a room added *after* approval stays `DRAFT` and
does not appear, so a second review is required before it can.

`publicRoomResponseIsClean` asserts the public body contains no `partnerId`, no
`roomNumber`, no `id`, no `total` and no `status`.

---

## 8. OQ-098 — not solved, not worsened

OQ-098 (a Partner editing a published property overwrites live data, with no
draft/published split) remains **OPEN**. No `is_published` flag and no versioning
scheme were invented.

**This phase reduces the exposure.** The affected path is precisely:

- a Partner **edits an existing PUBLISHED room type** on a live property — the
  change is immediately public, unreviewed. *(This is the OQ-098 exposure,
  inherited.)*
- a Partner **adds** a room type to a live property — **not exposed**, because
  new rooms are `DRAFT` and a Partner cannot publish them (§6).

So the surface is narrower than it would have been with a publish action.

---

## 9. Amenities — controlled, and separated from property level

Codes are resolved against the 56-row catalogue. Unknown codes are **refused and
named back to the caller**, never silently dropped — doc 03 §6 makes amenities a
controlled vocabulary, and a Partner must not believe they set something they did
not.

**Property-level facilities are refused on room types.** `amenity.category =
PROPERTY_FACILITY` ("parking", "lift", "laundry", "luggage-storage",
"business-centre", "kids-area", "smoking-area") cannot be attached to a room. The
database does not prevent this — `room_type_amenity` carries only an FK — so the
rule lives in `RoomTypeService`.

> **This is the only category rule applied, and it is PROPOSED.** Doc 03 §6
> defines the nine categories but never says which are room-eligible. A fuller
> mapping would be invented — `ACCESSIBILITY` is genuinely both (a step-free
> entrance is the building; an accessible bathroom is the room) and is therefore
> left permitted. **OQ-103.**

No second catalogue was created and the 56 entries are untouched.

---

## 10. Seed data

**None added.** The eight properties remain minimal DRAFT rows with canonical
names — Kas Passion Boutique Hotel, Kas Elegance Hotel, Kas Ancient Boutique
Hotel, Kas Milestone Premium Hotel, Kas Zody Boutique Hotel, Kas Sonata Luxury
Hotel, Kas Eliana Luxury Hotel, Kas Dilly Hotel. No room types were invented to
make the database look populated.

---

## 11. Architecture

No rule was weakened. `ScopeEnforcementStructureTest` still requires every
partner-owned repository method to take an `AuthorizationScope`, and the new
`RoomTypeRepository` methods comply. `ForbiddenConceptsTest` continues to prove
no `PhysicalRoom`, no `roomNumber`, no generic `status`/`source`.
`LayeringRulesTest` still forbids JPA/Hibernate anywhere.

**No new module.** Room types live in `property` (persistence) and `onboarding`
(workflow and API), reusing the ten modules already established.

---

## 12. Concurrency evidence

| Race | Guard | Test |
|---|---|---|
| Two edits to one room type | `version` compare-and-set in the UPDATE | `optimisticLockingRejectsStaleUpdate` → 409 `VERSION_CONFLICT` |
| Duplicate room creation | `room_type_slug_unique (property_id, slug)` | `duplicateSlugIsRejected` |
| Invalid lifecycle move | transition table + `ARCHIVED` terminal | `partnerCannotPublish`, `archivedIsTerminal` |
| Amenity replacement | delete-then-insert inside one transaction | `amenitiesCanBeReplaced` |

---

## 13. Audit

Existing `audit_log`, no new table and **no V24**. `action` is `text`, so the new
event types needed no schema change: `room_type.created`, `room_type.updated`,
`room_type.translation_updated`, `room_type.beds_changed`,
`room_type.amenities_changed`, `room_type.status_changed`.

---

## 14. Open questions

| ID | Question | Severity |
|---|---|---|
| **OQ-102** | No controlled bed-type vocabulary exists — `bed_type` is free text. Should there be one? | 🟢 |
| **OQ-103** | Which amenity categories are room-eligible? Only `PROPERTY_FACILITY` is currently excluded | 🟠 |
| **OQ-104** | Brief §26 anticipates a room code; no column exists. Needed? | 🟢 |
| **OQ-105** | Should a Partner ever publish a room type directly, bypassing review? | 🟠 |
| **OQ-098** | *(inherited)* No draft/published split for live edits | 🟠 |

---

## 15. Completion gate — §31

All 25 applicable items proven. Room CRUD · N per property · Partner-authored
names · frozen localisation · bed configurations · occupancy semantics · frozen
view model · controlled amenities · property/room separation · lifecycle
enforced · scope at the repository boundary · cross-partner isolation ·
translation validation · data integrity · safe public contract · no
`PhysicalRoom` · no fabricated data · audit · concurrency · **225-test
regression green** · Flyway valid · V1–V23 unchanged · no frontend ·
`git diff --check` · secret scan · documentation.

---

## 16. Next

**7.5C — media.** Not started. `media_asset` + `media_link` already exist and the
hero-image completeness check already depends on them, so it is the natural next
step and needs no migration on current evidence.
