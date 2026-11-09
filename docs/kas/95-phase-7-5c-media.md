# 95 — Phase 7.5C: Media & Image Management

**Phase:** 7.5C — Media, property and room-type images
**Status:** ✅ **COMPLETE — awaiting review**, with one capability explicitly deferred (§5)
**Last updated:** 2026-08-16

> **239 tests pass** — 143 unit/architecture, 96 integration. 0 failures, 0 skipped.
>
> **No migration was required.** V1–V23 byte-identical; Flyway still at v23,
> 25 rows, 0 failed. **No fabricated images, no third-party images.** **No frontend.**
>
> `kas_web_dev` is unchanged from the 7.5B checkpoint: 8 DRAFT properties,
> 56 amenities, and **0 rows** in `media_asset`, `media_link`,
> `media_asset_translation`, `room_type` and `audit_log`.

---

## 1. Resume note

This phase was interrupted mid-implementation. On resume the tree **did not
compile**: `MediaRepository` referenced a `MediaLink` record that had never been
written (3 unresolved symbols). The database was untouched — v23, media tables
empty — and V1–V21 were intact, so nothing had to be undone. Work continued from
that exact point rather than restarting.

---

## 2. No stop conditions

All ten §32 conditions were checked against frozen material; none fired.

| Question | Answer | Source |
|---|---|---|
| Can the schema represent ownership? | Yes | §3 |
| Can cover uniqueness be guaranteed? | Yes, by an existing partial unique index | §6 |
| Can publication be separated safely? | Yes — four independent conditions | §8 |
| Is there an RBAC permission? | **`media.upload`, `media.publish`, `media.delete`** already exist | doc 59 §4.5 |
| Does the API contract conflict? | No. `/admin/media`, `/{id}/links`, `/{id}/usages` and `/properties/{slug}/gallery` are frozen | doc 58 §8, §3.1 |
| Must storage be invented? | **No — and it was not.** See §5 | doc 62 §4, §6 |
| Must validation limits be invented? | No numeric limit was invented. See §9 | |
| Would a migration alter frozen semantics? | No migration was made | §4 |
| Would public media leak internals? | No — proven | §8 |
| Does OQ-098 create unacceptable risk? | Exposure identified and documented, not hidden | §11 |

---

## 3. Existing schema assessment — sufficient

Doc 62 §2's model carries the whole requirement:

```
media_asset            partner_id, storage_key UNIQUE, mime_type, width, height,
                       size_bytes, checksum, category, visibility, status,
                       focal_x/y, uploaded_by, archived_at
media_asset_translation PK (media_asset_id, locale), alt_text NOT BLANK, caption
media_link             media_asset_id, owner_type, owner_id, display_order,
                       is_cover, status
```

with three constraints that did the architectural work for us:

| Constraint | What it guarantees |
|---|---|
| `media_link_one_cover_idx (owner_type, owner_id) WHERE is_cover` | **Exactly one cover per owner**, "without application-level coordination" (doc 62 §2.2) |
| `media_link_unique (owner_type, owner_id, media_asset_id)` | One asset attaches to one owner once |
| `media_link_media_asset_id_fkey … ON DELETE RESTRICT` | An asset with live links cannot be destroyed |

**No `property_image`, `room_image`, `gallery` or `cover_image` table was
created.** Ordering already exists (`display_order` plus an index), so §16's
"record it as OPEN" branch did not apply.

---

## 4. Migration decision — none

Nothing was missing. The only new persistence concept in this phase — that an
attachment can be published separately from its asset — is already expressible:
`media_link.status` and `media_asset.status` are independent columns.

---

## 5. Upload and storage boundary — the one deferral

Doc 62 §4 specifies the flow: `POST /admin/media/upload-url` → browser uploads
directly to object storage → the platform assigns the `storage_key`. Doc 62 §6
specifies the shape: **"behind a `StorageProvider` port"**.

So the architecture is frozen; **the vendor is not**. No document names S3,
Cloudinary or anything else, and doc 12 goes only as far as "object storage
(S3-compatible)".

| Delivered | Deferred |
|---|---|
| The `StorageProvider` **port**, as doc 62 §6 specifies | Any vendor adapter |
| `DeliveryUrlStorageProvider` — composes `{base}/m/{assetId}`, no SDK | Pre-signed URL issuing |
| Asset registration, description, publication, linking, cover, ordering, detach | **`POST /admin/media/upload-url`** |

**`upload-url` is not implemented, and could not honestly be**: signing a URL
requires a provider to sign against. `kas.media.delivery-base-url` has **no
default** — unset, it raises `CONFIG_MISSING` naming the property rather than
emitting URLs that resolve to nothing. **OQ-106** records the provider decision.

---

## 6. Cover semantics

**One cover per owner** — the partial unique index keys on
`(owner_type, owner_id)`, so a property's cover and one of its room types' covers
are independent. Proven by `coversAreScopedToTheOwner`.

Assignment clears the previous cover and sets the new one **in one transaction**,
in that order — the reverse would violate the index mid-statement. The service
never reads the current cover to decide what to do; the index is the authority.
`exactlyOneCover` and `repeatedCoverAssignment` show the count stays at 1 across
reassignment and repetition.

---

## 7. Ownership and isolation

Two different ownership paths, because doc 85 §4.3 made `media_asset.partner_id`
"the one place partner does not derive":

```
asset  →  partner            (direct — an asset exists before it is attached)
link   →  property → partner
       →  room_type → property → partner
```

**Both ends are checked on attachment**, and that is not belt-and-braces: since an
asset's owner cannot be inferred from what it is linked to, checking only one end
would let a Partner attach their own asset to another Partner's property, or
another Partner's asset to their own.

`crossPartnerIsolation` exercises six paths — read, publish, cover, detach, and
both attachment directions — and every one returns **404, never 403**.

---

## 8. Publication safety — four independent conditions

Public media requires **all four**, every one of them in SQL:

1. `media_asset.status = 'PUBLISHED'` and not archived
2. `media_asset.visibility = 'PUBLIC'` (not `INTERNAL`)
3. `media_link.status = 'PUBLISHED'` — attaching is not publishing
4. the owning property is publicly visible; for room media the room type is
   `PUBLISHED` too

`publicationRequiresAllFourConditions` walks the whole ladder: uploaded → linked
→ marked as cover → asset published → link published, asserting the gallery is
**empty at every step**, and only non-empty once the property is approved through
the real Phase 7.5A workflow.

`roomMediaRequiresPublishedRoom` covers the case a controller check would most
easily miss: asset published, link published, property published — but the room
type still `DRAFT`, so nothing appears.

`publicGalleryIsClean` asserts the response contains no `storageKey`, no
`partnerId`, no `checksum`, no `uploadedBy`, and not the actual storage key
value. The URL is built from the **opaque asset id**, which doc 62 §6 explicitly
permits.

---

## 9. Security

| Threat | Control |
|---|---|
| **SVG script injection** | `image/svg+xml` is refused. SVG is an XML document that can carry script; served from a delivery origin it is an XSS vector, not a photograph. Accepted: JPEG, PNG, WebP, AVIF |
| **Path traversal / object overwrite** | The client cannot supply a storage key — the request type has no such field. The platform generates `p/{partnerId}/{random}` |
| **Filename injection** | No client filename reaches an object key |
| **Cross-partner storage enumeration** | Keys are partitioned by partner and random |
| **Storage key disclosure** | Absent from `MediaAsset`, from every view, and never selected by the public query |
| **Cross-partner attachment** | Both ends scope-checked (§7) |
| **Unauthorised publication** | `media.publish` is required to publish an asset or a link; `media.upload` alone cannot |

**No numeric limit was invented.** Doc 62 §4 says size and dimensions are
"bounded per category" but gives no numbers — **OQ-107**. Malware scanning
(doc 62 §4) belongs with the upload pipeline and therefore with OQ-106.

---

## 10. API

| Method | Path | Permission | Source |
|---|---|---|---|
| GET · POST | `/api/v1/admin/media` | `media.upload` | doc 58 §8 |
| GET | `/api/v1/admin/media/{id}` | `media.upload` | doc 58 §8 |
| PATCH | `…/{id}/translations` | `media.upload` | addition |
| POST | `…/{id}/publish` | **`media.publish`** | addition |
| GET | `…/{id}/usages` | `media.upload` | **doc 58 §8** |
| POST | `…/{id}/links` | `media.upload` | **doc 58 §8** |
| DELETE | `…/{id}/links/{linkId}` | `media.upload` | addition |
| PATCH | `…/{id}/links/{linkId}/cover` · `/order` | `media.upload` | addition |
| PATCH | `…/{id}/links/{linkId}/status` | **`media.publish`** | addition |
| GET | `/api/v1/public/properties/{slug}/gallery` | public | **doc 58 §3.1** |
| GET | `…/room-types/{rtSlug}/gallery` | public | addition — **OQ-108** |

The namespaces are doc 58's. The sub-resources are narrower operations within
them, not new namespaces. **OQ-108** records the doc 58 reconciliation for the
room gallery, which §3.1 anticipates as part of room-type *detail*.

---

## 11. OQ-098 — exposure identified, not hidden, not faked

No `is_published`, `draft_media` or versioning scheme was invented.

**The exposure is real and specific.** For a property that is already public:

| Action | Immediately public? |
|---|---|
| Register a new asset | No — `DRAFT` |
| Attach it | No — link is `DRAFT` |
| Publish asset **and** link | **YES — immediately, unreviewed** |
| Change alt text or caption on an already-published asset | **YES — immediately** |
| Re-assign the cover among published links | **YES — immediately** |
| Detach a published link | **YES — the image disappears immediately** |

So a Partner holding `media.publish` can change what guests see on a live
property without review. This is the same class of gap as OQ-098 and is the media
instance of it. Two mitigations already narrow it: publishing requires the
distinct `media.publish` permission, and alt text in both locales is required
first — so an unlabelled image cannot appear.

**This must be resolved before a property goes live.** It is not a defect
introduced here; it is the frozen schema having no draft/published split.

---

## 12. Audit

Existing `audit_log`, no new table, **no migration for audit** — `action` is
text. Events: `media.asset.registered`, `media.asset.described`,
`media.asset.published`, `media.attached`, `media.detached`,
`media.cover_changed`, `media.reordered`, `media.link_status_changed`.

---

## 13. Architecture

Two rules **caught real problems** during this phase and neither was weakened:

- `ScopeEnforcementStructureTest` rejected `altTextLocaleCount(UUID)` for taking
  no scope. Fixed by adding it — an exemption "because the caller already
  checked" is precisely the habit the rule exists to stop.
- `PublicResponseDenylistTest` rejected `MediaAsset` (it carries `partnerId`)
  when the whole `media` package was scanned. Fixed by moving `PublicMediaView`
  into `media.api` and scanning only api packages.

That second failure exposed a **pre-existing gap**: `PublishedProperty` and
`PublishedRoomType` live in the `property` module and were never scanned, despite
being returned straight to guests. They are now covered explicitly by
`ADDITIONAL_RESPONSE_TYPES`. Both were clean, but they were unchecked.

`media` is the eleventh module. It earns one: doc 62 gives it its own domain, and
its ownership rule genuinely differs from every other module's.

---

## 14. Seed data

**Unchanged.** No images fabricated, none downloaded, none copied from Agoda or
anywhere else. The eight properties remain minimal DRAFT rows — Kas Passion
Boutique Hotel, Kas Elegance Hotel, Kas Ancient Boutique Hotel, Kas Milestone
Premium Hotel, Kas Zody Boutique Hotel, Kas Sonata Luxury Hotel, Kas Eliana
Luxury Hotel, Kas Dilly Hotel — with `media_asset` and `media_link` at **0 rows**.

---

## 15. Open questions

| ID | Question | Severity |
|---|---|---|
| **OQ-106** | Which object-storage provider? Blocks `upload-url`, pre-signed uploads, derivatives, malware scanning | 🟠 |
| **OQ-107** | Size and dimension bounds per category (doc 62 §4 "bounded", no numbers) | 🟠 |
| **OQ-108** | Doc 58 §3.1 reconciliation for the room-type gallery path | 🟢 |
| **OQ-109** | `checksum` exists and doc 62 §4 specifies upload idempotency by it — unusable until uploads exist | 🟢 |
| **OQ-098** | *(inherited, extended)* Media edits on a live property are immediately public — §11 | 🟠 |

---

## 16. Completion gate — §31

All applicable items proven: schema sufficient without migration · property media ·
room media · Partner ownership · cross-partner isolation · categories respected ·
cover semantics and repetition · deletion/detachment safe · public filtering ·
unpublished media cannot leak · hero-image completeness still works (unchanged
`makePropertyComplete` path, 7.5A tests green) · denylist clean and extended ·
audit · API verified against doc 58 · existing RBAC only · no fabricated or
third-party images · no migration · **239-test regression green** · Flyway valid ·
V1–V23 unchanged · no frontend · `git diff --check` · secret scan · documentation.

**Not claimed:** pre-signed upload, malware scanning, derivative generation,
`srcset` — all blocked on OQ-106 and stated as deferred rather than glossed.

---

## 17. Next

**7.5D — policies.** Not started. `property_policy` and its translations already
exist, so it is likely another no-migration phase — but that must be proven, not
assumed.
