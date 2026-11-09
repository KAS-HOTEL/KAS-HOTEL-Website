# Phase 7.5F — Step 8: Room-Type Authoring

**Date:** 2026-08-19
**Status:** ✅ COMPLETE. **OQ-138 resolved.** **No migration.**

**Gates:** frontend typecheck · lint (0 warnings) · **205 tests** · build (16 routes) · 0 npm
vulnerabilities · backend **390 tests** `BUILD SUCCESS` · Flyway **v23, 25 validated** ·
`git diff --check` clean · secret scan clean.

---

## 1. OQ-138 — resolved, and it was worse than reported

**The cause.** `RoomTypeRequest` carried a single `name` and a single `shortDescription` — the record
had no notion of locale at all. `POST` wrote that one string to **both** locales; `PATCH` wrote it to
**`en` only**. So the asymmetry was not a slip in the update path: the *request shape* was
monolingual, and the two handlers papered over it differently.

The consequence for a Partner: create a room called "Phòng Deluxe", then edit it, and the Vietnamese
name never changes again — while doc 25 freezes two locales and doc 52 §3.1 requires both-locale
content before publication.

**The fix — contract, service, repository. No migration.**

`name`/`shortDescription` were **replaced** by `translations`, a map keyed by locale holding
`{ name, shortDescription }` — the same shape `RoomTypeView` already returns since Step 7, so a
client reads, edits and sends back without reshaping. `room_type_translation` has held exactly these
columns since **V5**.

| Rule | Behaviour |
| --- | --- |
| create | writes **exactly** the locales supplied. Copying one name into both would make "the English name is missing" impossible to see |
| update | writes **every** locale supplied. An absent locale means "leave it alone", never "delete it" |
| at least one on create | `room_type_translation.name` is `NOT NULL`, so a room type with no name cannot exist → `400`, `field: translations` |
| unsupported locale | `400`, `field: translations.fr`, **every** bad locale reported at once — never a CHECK violation surfacing as a 500 |
| blank name | `400` — `room_type_tr_name_len` preserved at the boundary |

`RoomTypeAuthoringIT.patchChangesTheVietnameseName()` is the regression test: it edits only `vi` and
asserts both that `vi` changed and that `en` was left alone.

### 1.1 A second defect found on the way

`PATCH` was **four separate transactional calls** — attributes, translation, beds, amenities. A
request whose amenities were invalid still committed the attribute change before failing, so the
Partner saw an error and their data had moved anyway.

Replaced by one `@Transactional RoomTypeService.updateAll(...)`. Amenities are resolved *before*
anything is written, so an unknown code refuses the whole edit rather than being discovered halfway
through it. `arefusedAmenityWritesNothing()` pins it.

### 1.2 A third: the version was never readable

`RoomTypeView`'s javadoc has said *"Carries `version` because the update endpoint requires it"* since
Phase 7.5B — and **the field was not on the record**. Neither was it on `RoomType`. So `PATCH`
demanded a concurrency token that no caller could obtain; an edit form was impossible to build
correctly.

`room_type.version` has existed since V5. Added to the record, the projection and the view. Same
class of gap as OQ-132 and OQ-137, found the same way — by needing it.

## 2. Optimistic locking — examined, and deliberately left alone

`UpdatePropertyRequest` carries its version in the body; this endpoint takes `?version=N`. The brief
asked whether to align.

**Doc 58 §2 says "`If-Match` / `version` on MASTER updates" — it names the mechanism, not where it
travels.** Neither form is required and neither is forbidden. Checked further: the query form already
produces the correct doc 58 §2.1 shape — a missing parameter is answered `VALIDATION_FAILED` with
`field: "version"` by `GlobalExceptionHandler.handleMissingParameter`, which is exactly what the
property endpoint produces for its body field.

So there is no correctness defect, and "the other endpoint does it differently" is an aesthetic
argument — which the brief explicitly excluded. **Kept as-is**, documented in the controller, and
raised as **OQ-139** for an owner decision rather than settled unilaterally.

What *was* verified, either way:

| Requirement | Evidence |
| --- | --- |
| stale version → `409 VERSION_CONFLICT` | `staleVersionIsRefused()` — and the winning edit stands |
| scope checked **before** version | `updateAll` calls `require()` first; `crossPartnerIsNotFoundBeforeVersion()` sends a **right** and a **wrong** version at another partner's room and gets the identical `404` both times |
| no cross-partner leak via conflict | same test asserts the slug and the attempted name are absent from the body, and that nothing was written |
| no last-write-wins | compare-and-set in one statement; the loser matches zero rows |

## 3. The amenity catalogue had no endpoint

The brief required the backend's 56-row catalogue and forbade a frontend copy. **Neither existed** —
`AmenityRepository.findAll()` had no controller.

Doc 58 §8 already freezes `/admin/amenities` with permission `amenity.manage`, which the Partner's
ADMIN role holds (`RoleCatalogue`). Only the handler was missing, so it was implemented **read-only**:
code, category, `names` (locale → label), `isHighlight`, `sortOrder`. No `id` (the API is addressed by
code) and no `icon` (nothing renders it).

`amenity_translation` exists and is **empty**, so `names` is `{}` today and the picker shows codes.
That is the honest answer — inventing labels would freeze a vocabulary nobody has approved — and when
the owner seeds them every screen gets them with no code change. Recorded as **OQ-140**.

The picker hides `PROPERTY_FACILITY` entries, because `RoomTypeService` refuses them on a room type;
offering one would be offering a save that cannot succeed. The backend remains the authority, and a
code that reaches it anyway is still refused with a field-level error the form renders verbatim. A
code the room already carries but the catalogue no longer offers is **kept selected and shown** —
dropping it would silently strip an assignment the Partner never touched.

## 4. Routes and UX

```
/partner/properties/{propertyId}/rooms/new                       create
/partner/properties/{propertyId}/rooms/{roomTypeId}/edit         edit
```

One `RoomTypeForm` serves both, because the backend takes one `RoomTypeRequest` for both. Sections
follow the brief: **Thông tin phòng · Sức chứa · Phòng · Giường · Tiện nghi · Trạng thái**.

- **Beds** are dynamic rows with free-text `bedType` — the column has only a non-blank CHECK and there
  is no bed catalogue in the frozen schema (OQ-102), so a dropdown would invent one. Exactly one row
  can be default.
- **View type** offers the five frozen values and nothing else.
- **Sort order** is **not** in the form. The write contract accepts it, but nothing in the UI has a
  reason to reorder rooms yet, and a field with no purpose invites a value with no meaning.
- **Status is read-only** and there is no publish control. `isPartnerPermittedTransition` refuses
  `PUBLISHED` outright, and `PATCH /{id}/status` is **not even wrapped in `lib/api`** — a control
  there would be a save the backend answers 409 to.
- After a create the form navigates to **the id the API returned**, never a guessed one.
- The version is loaded, held, sent, and **replaced from each response**; a 409 offers a reload.

## 5. Tests

| Suite | Count | Change |
| --- | --- | --- |
| Frontend | **205** | +25 (`RoomTypeForm.test.tsx`) |
| Backend integration | **244** | +11 (`RoomTypeAuthoringIT`) |
| Backend unit | 146 | unchanged |
| **Backend total** | **390** | was 379 |

Frontend covers: field inventory (and the absence of price/room-number fields), the five frozen view
types, required validation before any request, per-locale sending, the **OQ-138 regression**, bed
add/remove/default/validation, the catalogue picker, `PROPERTY_FACILITY` exclusion, retired codes kept,
the backend's amenity rejection rendered verbatim, catalogue-load failure degrading gracefully,
version sent and re-adopted, 409 with reload, **404 identical to absent with no reload offer**, 403
without leaking CSRF internals, unreachable backend without leaking the host, no publish control, and
empty web storage.

Existing tests updated for the new request shape, not weakened: `RoomTypeIT`'s shared body helper and
two inline bodies now send `translations`. All 17 of its assertions are unchanged.

## 6. Database

**No migration, and none was needed.** `room_type_translation` (V5) already held `name` and
`short_description`; `room_type.version` (V5) already existed; `amenity` and `amenity_translation`
(V4) already existed. Every change was contract, service, projection or handler.

Flyway **v23, 25 migrations, validated**. After the full suite: 8 properties, **0 room types**, 0
room-type translations, 56 amenities, 0 amenity translations, 1 user, 0 rates/inventory/media/
reservations. No seed pollution — integration tests roll back.

## 7. Security

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `console.*` · `fetch` outside
`lib/api` · hardcoded UUIDs: **all zero** in product code. No CORS, `SameSite` or CSRF change; the
mutation carries `X-XSRF-TOKEN` via `lib/api`. `partnerId` and room numbers remain absent from every
response. Cross-partner remains an indistinguishable `404`, now verified with a correct version guess
as well as a wrong one. Architecture tests unchanged and green — `catalog` gained `identity` and `web`
as allowed module dependencies solely so the new endpoint can name its permission constant.

## 8. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-138** | `PATCH` wrote only `en` | ✅ **RESOLVED** — §1 |
| **OQ-139** | version in the body (property) vs query parameter (room type). Neither is required by doc 58 §2; left as-is pending an owner decision | **new** |
| **OQ-140** | `amenity_translation` is empty, so the catalogue has 56 codes and no approved labels | **new** |
| OQ-102 · OQ-136 · OQ-133 · OQ-135 | bed vocabulary · clearing a field · English completeness labels · `CONFIG_MISSING` on a public login page | open |

## 9. Recommended Step 9

> **Room-type media — the gallery, link/cover/order, upload still deferred.**

Media is the next completeness blocker (`hero image`), Phase 7.5C implemented and tested the
link/cover/order/publish surface, and the room detail already carries a disabled **Hình ảnh** tab
waiting for it. Binary upload stays blocked on **OQ-106** — no `upload-url` endpoint exists and no
storage vendor has been chosen — so Step 9 should build the linking and cover-selection surface and
mark the upload boundary honestly, exactly as Step 7 marked the authoring boundary.
