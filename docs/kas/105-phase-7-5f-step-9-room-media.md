# Phase 7.5F — Step 9: Room-Type Media — BLOCKED

**Date:** 2026-08-19
**Status:** 🔴 **BLOCKED — analysis only, no code written.** Three of the brief's own stop conditions
fire. Repository state is unchanged apart from this document.

---

## 1. What exists, and works

Phase 7.5C built the model properly and it is reusable exactly as the brief intends. Nothing here
needs duplicating.

| Piece | State |
| --- | --- |
| `media_asset` + `media_link` | the model carries both property and room-type media; `MediaOwnerType` distinguishes them |
| Cover invariant | one cover per owner, held by a **partial unique index** in the schema |
| Ordering | `media_link.display_order`, with `PATCH /{assetId}/links/{linkId}/order` |
| Publication ladder | four independent conditions, all in SQL in `PublishedMediaRepository` |
| Scope | `MediaRepository implements ScopedRepository`; every method takes an `AuthorizationScope` |
| **Public room gallery** | **`GET /public/properties/{slug}/room-types/{roomTypeSlug}/gallery` already exists** |
| Admin routes | library · get · register · translations · publish · usages · attach · detach · cover · order · link-status |
| `MediaService.links(ownerType, ownerId, scope)` | the owner-first query **exists at service level** |

So the brief's stop condition #1 (*"room media public route is undefined"*) does **not** fire, and #3
(*cover semantics*) and #4 (*ordering semantics*) do not either.

## 2. The three gaps that do block it

### Gap A — no admin endpoint lists a room type's media

Doc 58 §8 freezes the media routes as `/admin/media`, `/upload-url`, `/{id}/links`, `/{id}/usages` —
**all asset-first**. There is no owner-first listing.

`GET /admin/media/{assetId}/usages?ownerType=&ownerId=` is the closest thing, and its implementation
is telling:

```java
return media.links(ownerType, ownerId, scope).stream()
        .filter(link -> link.mediaAssetId().equals(assetId))
```

It computes the owner's **entire** link list and then throws all but one asset away. To render one
room's gallery the frontend would have to call it once per asset in the library — N+1 requests for
data the server already assembles in a single query.

The service method needed is already there. Only the route is missing, and inventing an admin route
that doc 58 does not name is exactly what §4 of the brief forbids doing silently.

### Gap B — the admin surface returns no image URL and no alt text

```
MediaAssetView : id · mimeType · category · width · height · sizeBytes · status
MediaLinkView  : id · mediaAssetId · ownerType · ownerId · displayOrder · isCover · status
PublicMediaView: url · width · height · alt · caption · isCover      ← the only view with a URL
```

`PublicMediaView` is served **only** by the public gallery, which requires the asset published, the
link published, and the owner publicly visible. Every seed property is `DRAFT`, so it returns nothing
for any of them by design.

Alt text is read in exactly one place — `PublishedMediaRepository` — for that same public path. There
is **no admin read path for alt text at all**, only `altTextLocaleCount(...)`, which returns a number
for the publish gate.

A Partner-facing gallery therefore cannot render a thumbnail, and cannot give an image an accessible
name. §16 of the brief requires alt text and forbids inventing it; there is nothing to read.

### Gap C — no URL can be produced, and no asset can be created

`DeliveryUrlStorageProvider` needs `kas.media.delivery-base-url`. It has **no default** and is set in
neither `application.yml` nor `application-dev.yml`; calling it throws `MissingConfigurationException`.

`POST /admin/media/upload-url` is **not implemented**, and `StorageProvider` says why in its own
javadoc: no frozen document names a vendor, and choosing one "would be an infrastructure decision this
phase has no authority to make — see OQ-106".

Database today: **0 assets · 0 links · 0 asset translations.**

So the library is empty, there is no legitimate way to put anything in it, and even if there were,
nothing could display it.

## 3. Which stop conditions fire

| # | Condition | Fires |
| --- | --- | --- |
| 1 | room media public route undefined | ❌ — it is defined |
| 2 | link ownership cannot be enforced | ❌ — `ScopedRepository` enforces it in SQL |
| 3 | cover semantics conflict with the DB invariant | ❌ — they agree |
| 4 | ordering semantics undefined | ❌ — `display_order` + a mutation route exist |
| 5 | **an API requires a migration that isn't justified** | ❌ — no migration needed for any of this |
| 6 | **an existing contract contradicts the frozen docs** | ⚠️ — doc 58 §8 lists `/upload-url`, which is deliberately unimplemented (already recorded as OQ-106) |
| 7 | **implementation would require fake upload/storage** | ✅ **FIRES** — §2 Gap C |
| 8 | publication safety cannot be preserved | ❌ — the ladder is intact and must stay in SQL |

Plus §4's rule against silently inventing routes, which Gaps A and B would both require.

## 4. What could still be built, and why I did not

A link-management surface over the existing `attach` / `detach` / `cover` / `order` routes is
technically possible **without any backend change** — listing links by id and status, with no imagery.

It would be a gallery with no pictures, over an empty library that cannot be filled, reached by N+1
requests. It would satisfy the letter of "gallery, link, cover, order" and none of its purpose, and
the screenshot of it would look like a finished feature. The brief's closing principle is explicit
that the goal is not to make the UI look finished.

## 5. What is needed to unblock — three owner decisions

**OQ-141 · An admin route to list an owner's media links.**
Missing: any owner-first listing on the admin surface. Needed: to render one room's gallery in one
request. Supported by: `MediaService.links(ownerType, ownerId, scope)`, which already exists and is
already scope-enforced. Proposed, for approval rather than assumed:

```
GET /api/v1/admin/media/links?ownerType=ROOM_TYPE&ownerId={uuid}   → MediaLinkView[]
```

Sits under the frozen `/admin/media` namespace, adds no table and no column, and needs **no
migration**. Alternative if a new path is unacceptable: widen `/{assetId}/usages` to make `assetId`
optional — but a path variable that may be ignored is worse than a sibling route.

**OQ-142 · An admin media view that can be rendered.**
Missing: `url` and `alt` on the admin surface. Needed: to show a thumbnail and give it an accessible
name — §16 of this brief requires alt text and forbids inventing it. Note the constraint this must
respect: `storage_key` is on the doc 58 §9 denylist and must never leave the server, so the addition
is a **derived delivery URL** via `StorageProvider`, never the key. Blocked in turn by OQ-106, since
no provider can produce a URL today.

**OQ-106 (existing) · Storage provider and upload.**
Until a vendor is chosen and `kas.media.delivery-base-url` is configured, no asset can be created and
no URL can be produced. This is the root blocker; the other two are only reachable behind it.

## 6. Repository state

**No code was written.** The only modified tracked file is `docs/kas/00-README.md`, carried over from
Step 8. Flyway remains **v23, 25 migrations**; media tables remain empty; no migration was created or
needed.

## 7. Recommendation

Answer **OQ-106** first — it gates the other two. Once a provider is chosen and configured, OQ-141 and
OQ-142 are small, migration-free additions under the frozen `/admin/media` namespace, and Step 9
becomes a straightforward build on a model that is already correct.

If media must wait, **Step 9 should be swapped for property policies** — Phase 7.5D implemented eleven
frozen policy types with effective-dated versioning and 259 tests, the endpoints are complete, the
room detail already carries a disabled *Chính sách* tab, and policies need no storage provider.
