# Phase 7.5F — Step 7: Partner Room Types (read-only)

**Date:** 2026-08-19
**Status:** ✅ COMPLETE — the room-type list and detail, read-only, under the existing property
context. **No migration.**

---

## 1. The API, read from the Java

`onboarding.api.PartnerRoomTypeController`, path and permission both frozen by doc 58 §8.

| Endpoint | Method | Permission | Notes |
| --- | --- | --- | --- |
| `/api/v1/admin/properties/{propertyId}/room-types` | GET | **`roomtype.manage`** | ordered `sort_order, slug`; never paginated |
| `.../room-types/{roomTypeId}` | GET | `roomtype.manage` | **404, not 403**, for another partner |

`roomtype.manage` is a **different permission** from the `property.manage` the property endpoints
require — worth stating, because the two screens sit under one route tree.

**Not wrapped, deliberately:** `POST`, `PATCH`, `PATCH /{id}/amenities`, `PATCH /{id}/status`. Step 7
proves a Partner can safely *view* their rooms.

### 1.1 Isolation has two different shapes here

| Request | Backend | Frontend |
| --- | --- | --- |
| `GET .../{roomTypeId}` for another partner's room | **404** | `notFound()` |
| `GET .../room-types` for another partner's **property** | **`[]`** — the scope predicate matches no rows | the page never gets there: the property is resolved first and 404s |

The empty list is safe on its own — indistinguishable from a hotel that genuinely has no rooms — but
it would make a foreign property look like an empty one. So both room screens resolve the property
first, exactly as the overview and information screens do, and a foreign property id produces the
same not-found page as an absent one.

## 2. OQ-137 — room types had no readable name either

`POST` and `PATCH` on this route both accept a `name` and a `shortDescription` and write them to
`room_type_translation`. **`GET` returned neither.** That is the identical write-without-read
asymmetry OQ-132 closed for properties three steps ago, and an extranet listing rooms by slug alone
does not identify them.

Resolved the same way, and **no schema change**: `RoomTypeView` gained `translations`, a map keyed by
locale, holding exactly the two fields the write contract accepts.

| Decision | Reason |
| --- | --- |
| `name`, `shortDescription` exposed | both are already writable through this route |
| `long_description` **not** exposed | the column exists but no endpoint writes it — a field nobody can fill reads as a gap in the product rather than in the API |
| keyed by locale, not resolved | doc 25 freezes two locales and this is an authoring surface; "the English name is not set" is a fact the Partner needs |
| `basePriceMinor` still absent | doc 52 §3.2 keeps price in `pricing`; a test asserts it never appears |
| no `propertyId`, no partner reference, no room number | route implies the first; doc 52 §6 excludes `PhysicalRoom` from V1 entirely |

`RoomTypeView` lives in a package `PublicResponseDenylistTest` scans, so it is held to the **public**
standard even as an admin response. That test still passes with the added field.

The repository lookup is **batched** (`findTranslations(Collection<UUID>, scope)`) — the list renders
every room of a property, and a per-row query for something as basic as a name would add one query
per row to a handler that already makes several — and **scope-filtered in its own statement**, with a
test proving a foreign id in the batch contributes nothing.

## 3. What the screens show

Everything below is a field the API returns. Nothing is derived, defaulted or invented.

**List** — name (with slug beneath), status, occupancy, beds, view, area.
**Detail** — the same plus per-locale name and short description, bed configurations with the default
marked, amenity codes, smoking, sort order, id, and public visibility.

Three judgements worth recording:

- **Occupancy is three numbers, not one.** `max_occupancy <= max_adults + max_children` is a CHECK,
  not an identity, so a room can take 2 adults and 2 children with a maximum of 3. Collapsing them
  would quietly assert a sum the schema explicitly does not.
- **Amenity codes are shown verbatim.** There is no endpoint returning amenity labels, so translating
  them here would mean inventing a vocabulary nobody has approved.
- **`bedType` is free text.** The column has only a non-blank CHECK and there is no bed catalogue
  anywhere in the frozen schema (OQ-102), so the UI renders what was stored.

### 3.1 The Partner cannot publish, and the UI says so

`RoomTypeStatus.isPartnerPermittedTransition` refuses `PUBLISHED` outright: publishing adds content
to a live property, and doing it without review would route around the approval workflow. So the
detail page carries **no publish control** — a button there would come back 409 — and instead states
that public visibility happens through property approval. A test asserts the page renders no
`button`, `textbox` or `combobox` at all.

### 3.2 The empty state is the state that actually exists

All eight seed properties have **zero** room types, so the empty state is what an operator meets
first. It explains what a room type is, gives a concrete example, says at least one is required
before a property can be submitted, and says creation arrives in a later step. It is not an error and
carries no `role="alert"`.

### 3.3 Ready for what comes next

The room detail carries a sub-navigation naming **Hình ảnh (Bước 9)**, **Tồn phòng (Bước 10)** and
**Giá (Bước 11)** as disabled entries. Their endpoints exist and are tested; the screens do not. A tab
that navigated to a placeholder would be indistinguishable at a glance from one that is broken.

## 4. Routes

```
/partner/properties/{propertyId}/rooms                  list   (+ loading)
/partner/properties/{propertyId}/rooms/{roomTypeId}     detail (+ not-found)
```

The property tab strip gains **Phòng** as a real link; the remaining four stay disabled and were
renumbered to match the new step order.

## 5. Tests

| Suite | Count | Change |
| --- | --- | --- |
| Frontend | **180** | +35 (`roomType.test.tsx`, `load.test.ts`, plus the property tab assertion) |
| Backend integration | **233** | +9 (`RoomTypeReadIT`) |
| Backend unit | 146 | unchanged |
| **Backend total** | **379** | was 370 |

`RoomTypeReadIT` covers: translations returned as written · a partial translation reported honestly ·
an empty map rather than a missing key · an empty list for a property with no rooms · **another
partner's room type 404 with neither its name nor its slug in the body** · another partner's property
listing as empty · repository-level scope on the batch lookup · the empty-id-list case that would
otherwise emit `IN ()` · and a guard that the read surface exposes no price, no `propertyId`, no
`partnerId` and no room-number field.

Frontend tests cover the domain mappings pinned per value, the table in populated/empty/loading
states, the three-number occupancy, the "never manufacture a name from the slug" rule, both 404
shapes, malformed ids of either kind answered without a round-trip, 403 never becoming not-found, an
unreachable backend, and the no-publish-control assertion.

**One existing test was updated, not weakened:** the property tab assertion now expects three enabled
tabs instead of two, because Phòng became real. It still asserts exactly which tabs are links and
which are disabled.

### 5.1 Live in the browser

Against the running backend through the Next proxy, signed in as the dev Partner, on a **real seed
property** — all eight have zero room types, so this is the empty state as it actually is.

| Check | Result |
| --- | --- |
| `GET .../room-types` through the proxy | **`[]`** |
| `GET .../room-types/{bogus uuid}` | **404** |
| `/rooms` page | `h1` = *Kas Passion Boutique Hotel*, tab strip = **3 links + 4 disabled**, no table, **no `role="alert"`**, empty state headed *"Khách sạn này chưa có loại phòng nào"* |
| `/rooms/{bogus uuid}` | the not-found page; **no permission wording**, id not echoed back |

| Width | Page overflow | Tab strip | Sidebar | Targets < 44px |
| --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | **scrolls inside itself** | drawer | **none** |
| **768** | **none** (753/753) | scrolls inside itself | drawer | n/a |
| **1024** | **none** (1009/1009) | fits | **static column** | n/a |
| **1440** | **none** (1425/1425) | fits | static | n/a |

The tab strip mattered here: this step takes the property tabs from six to **seven**, and at 375 and
768 they no longer fit. `Tabs` already scrolls in its own container, so the page body still never
scrolls sideways — the doc 82 rule that the scroll container is the component, never the page.

> Measured at 280px as well, out of curiosity, and the **header** (property switcher + sign-out)
> overflows by ~10px there. 280px is below any width the design targets — the narrowest common device
> is 320px — so it is recorded rather than chased.

## 6. Database & migration

**No migration, and none was needed.** `room_type_translation` was created in V5 with `name`,
`short_description` and `long_description`; `room_type` already had every column the view exposes.
The change was projection and contract only.

Flyway remains **v23, 25 migrations**, and the highest file on disk is still
`V23__seed_kas_partner_and_properties.sql`.

## 7. Security

`localStorage` / `sessionStorage` / `indexedDB` / `Authorization` / `console.*` / `fetch` outside
`lib/api` / hardcoded UUIDs in product code: **all zero**. No CORS, no `SameSite` change, no CSRF
change — this step adds no mutation at all. Scope stays in SQL at the repository boundary; the two
new loaders map every 404 identically and never turn a 403 into one.

## 8. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-137** | room-type `GET` returned no name though `POST`/`PATCH` write one | ✅ **RESOLVED** — §2 |
| **OQ-138** | `PATCH /room-types/{id}` writes only the **`en`** translation, while `POST` writes both. A Partner editing a room can therefore not change its Vietnamese name at all | **new** |
| OQ-102 | `bedType` is free text with no catalogue | open (doc 94) |
| OQ-136 | `PATCH` cannot express "clear this field" | open |
| OQ-133 · OQ-135 | English-only completeness labels · `CONFIG_MISSING` on a public login page | open |
| carried | OQ-106 media upload · OQ-122 search · OQ-123 quote · booking API · `/me` · SUPER_ADMIN 2FA | open |

## 9. Recommended Step 8

> **Room-type authoring — create and edit, with the same optimistic lock as Step 6.**

The read surface now shows every field the write contract accepts, so the form has a known shape.
`POST` and `PATCH` are implemented, tested and scope-enforced, `PATCH` already takes a `version`
(as a query parameter rather than in the body — worth aligning with the property contract), and *"at
least one room type"* is the completeness blocker directly after the name and address Step 6 made
editable.

It also forces **OQ-138**: a Partner who can only edit the English name cannot complete a room type,
because doc 52 §3.1 requires both-locale content before publication. That should be settled before
the form is built, not after.
