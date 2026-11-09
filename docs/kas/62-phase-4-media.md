# 62 — Media Architecture

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative
**Last updated:** 2026-08-14

---

## 1. Hierarchy

**CONFIRMED**

```
PROPERTY ──► PROPERTY GALLERY
PROPERTY ──► ROOM TYPE ──► ROOM GALLERY
PROPERTY ──► FACILITY  ──► FACILITY GALLERY
```

**PROPOSED** — Implemented as **one asset library plus a polymorphic link table**, not three galleries.
An asset uploaded once can appear in a property gallery and a facility gallery without duplication, and
replacing it updates every usage at once — which matters when a property is rephotographed.

---

## 2. Model

### 2.1 `media_asset` — the library

```
media_asset
  id                uuid pk
  partner_id        uuid fk → partner  NOT NULL   -- the ONE place partner does not derive
  storage_key       text        -- INTERNAL. Never leaves the server (§6)
  mime_type         text
  width, height     int
  size_bytes        bigint
  checksum          text        -- deduplication + upload idempotency
  category          enum  EXTERIOR | LOBBY | ROOM | DINING | FACILITY | ROOFTOP
                          | NEIGHBOURHOOD | DETAIL | STAFF | EVENT | DOCUMENT
  visibility        enum  PUBLIC | INTERNAL      -- payment evidence is INTERNAL
  status            enum  DRAFT | PUBLISHED | ARCHIVED
  uploaded_by       uuid fk → app_user
  created_at, updated_at, archived_at
```

```
media_asset_translation (media_asset_id, locale)
  alt_text          text  NOT NULL     -- required before public use (§5)
  caption           text  NULL
```

### 2.2 `media_link` — the polymorphic attachment

```
media_link
  id                uuid pk
  media_asset_id    uuid fk → media_asset
  owner_type        enum  PROPERTY | ROOM_TYPE | FACILITY | OFFER | PAGE_BLOCK | REVIEW
  owner_id          uuid
  display_order     int   NOT NULL
  is_cover          boolean DEFAULT false
  status            enum  DRAFT | PUBLISHED
  created_at, updated_at
  UNIQUE (owner_type, owner_id, media_asset_id)
  UNIQUE (owner_type, owner_id) WHERE is_cover = true      -- exactly one cover
```

**PROPOSED — the partial unique index is the mechanism** that guarantees a property or room type has
at most one cover image, without application-level coordination.

**PROPOSED — why `media_asset.partner_id` is explicit** ([85](85-partner-property-model-amendment.md)
§4.3). An asset lives in a central library and is attached to owners via `media_link`; it is **not
owned by a property**, so partner cannot be derived through one — an asset may legitimately be linked
to several properties of the same partner. Without the column, nothing structurally prevents one
partner's asset being linked to another partner's property in a future multi-partner model.

**Rules:** a `media_link` may only attach an asset to an owner **within the same partner** — enforced
at the service layer and asserted in tests. Reuse **across properties of the same partner is
encouraged** — that is what the central library exists for. **No duplication.**
Index: `(partner_id, category, status)`.

### 2.3 Required capability coverage

| Requirement | Field |
|---|---|
| Upload | `media_asset` + pre-signed URL flow (§4) |
| Storage reference | `storage_key` — **internal only** |
| Alt text | `media_asset_translation.alt_text`, **required** |
| Caption | `media_asset_translation.caption` |
| Display order | `media_link.display_order` |
| Cover image | `media_link.is_cover`, one per owner |
| Draft / published | `media_asset.status` **and** `media_link.status` |
| Ownership | `media_asset.uploaded_by` |
| Property association | `media_link(PROPERTY, id)` |
| Room type association | `media_link(ROOM_TYPE, id)` |
| Facility association | `media_link(FACILITY, id)` |

**PROPOSED — two status levels are deliberate.** An asset can be `PUBLISHED` in the library while a
particular link is still `DRAFT`, so an image approved for one property page can be staged on another
without being live in both.

---

## 3. Physical folders are input, not identity

**CONFIRMED** — Physical folder structure is a migration and input concern, **not** the database
identity.

**PROPOSED** — Existing KAS image organisation maps in at import time:

```
/KAS Milestone Premium Hotel/Rooms/Deluxe/img_01.jpg
        │                      │      │
        ▼                      ▼      ▼
   property (matched      category   room type
   by name → slug)        = ROOM     (matched by name)
        │
        └──► media_asset (new storage_key assigned by the platform)
             + media_link(ROOM_TYPE, deluxe.id, display_order = 1)
```

Import rules:

1. Folder names are **hints for matching**, never stored as identity.
2. The platform assigns its own `storage_key`; the original path is retained only in an import log.
3. **Unmatched files are quarantined for manual assignment** — never guessed into a property.
4. `checksum` deduplicates repeated files across folders.
5. **Alt text is not inferable from a filename** and must be authored before public use (§5).

**PROPOSED** — Reorganising folders later has no effect on the platform. That is the point of not
treating paths as identity.

---

## 4. Upload flow

```
1. Admin requests an upload    POST /admin/media/upload-url
                               → { uploadUrl, mediaAssetId, expiresAt }
2. Browser uploads directly to object storage (pre-signed)
   — the application server never proxies image bytes
3. Admin confirms             POST /admin/media/{id}/complete
   → validate MIME + magic bytes, dimensions, size
   → malware scan
   → strip EXIF (location data in guest-facing photography is a privacy risk)
   → generate derivatives; retain the original
   → status = DRAFT
4. Admin adds alt text (both locales) and caption
5. Admin links to a property / room type / facility with order and cover flag
6. Publish
```

| Validation | Rule |
|---|---|
| Type | MIME **and** magic-byte check; allowlist only |
| Size / dimensions | Bounded per category |
| Malware | Scanned before any derivative is generated |
| EXIF | Stripped, including GPS |
| Execution | Served from a separate origin; never executable |
| Idempotency | Repeat upload of the same `checksum` returns the existing asset |

---

## 5. Alt text is a publish gate

**CONFIRMED** — WCAG 2.2 AA ([10](10-system-requirements.md) NFR-04).

**PROPOSED** — An asset **cannot be linked to a public surface without `alt_text` in both locales.**

Rationale: a photography-led hospitality site where the images carry the content is *inaccessible*
without alt text, and English alt text on a Vietnamese page is itself a failure. Making it a publish
gate is the only reliable mechanism — a backlog item never gets done for 2,000 images.

**PROPOSED** — Alt text describes the image; caption adds editorial context. They are different fields
because they do different jobs, and a caption is not a substitute for alt text.

---

## 6. Customer-facing delivery — no internal exposure

**CONFIRMED** — Customer-facing media must never expose internal storage implementation.

| Never public | Public |
|---|---|
| `storage_key` · bucket · region · provider | Resolved delivery URL |
| Original folder path | `width`, `height`, `alt`, `caption` |
| `checksum` · `uploaded_by` · internal IDs beyond the opaque asset ID | Responsive `srcset` |

**Public shape:**

```jsonc
{
  "id": "…",
  "url": "https://cdn.…/m/{opaqueId}/1600.avif",
  "srcset": [ { "w": 640, "url": "…" }, { "w": 1024, "url": "…" }, { "w": 1600, "url": "…" } ],
  "width": 2400, "height": 1600,
  "alt": "The rooftop terrace at dusk, looking north over District 1",
  "caption": "The Rooftop",
  "isCover": true
}
```

`storage_key`, `bucket` and `originalPath` are on the public response denylist
([58](58-phase-4-api-contract.md) §9) and enforced by the blocking CI contract test.

**PROPOSED** — Delivery URLs are content-hashed and long-cached. Behind a `StorageProvider` port, so
changing object-storage vendor changes one adapter and no URLs the guest has bookmarked.

---

## 7. Admin management without developer changes

**CONFIRMED** — Admin must upload and manage images without developer involvement.

| Capability | Screen |
|---|---|
| Bulk upload with drag-and-drop | Media Library |
| Tag, categorise, search | Media Library |
| Author alt text and caption in both locales | Asset detail |
| Attach to property / room type / facility | Owner screens, or from the library |
| Reorder by dragging | Gallery editor |
| Set cover image | Gallery editor |
| Replace an asset everywhere it appears | Asset detail |
| **See where an asset is used** | Asset detail → usages |
| Delete | **Blocked while `media_link` rows exist**; the block names the usages |
| Archive | Soft delete with a grace period |

**PROPOSED** — Deletion being blocked rather than cascading is deliberate. Cascading a delete silently
empties a published property gallery; naming the usages makes the operator's decision informed.

---

## 8. Aspect ratios and derivatives

**PROPOSED** — Ratios are defined per usage slot, with a guided crop per ratio, because the same
photograph serves a hero, a tile and a gallery frame differently.

| Slot | Ratio | Notes |
|---|---|---|
| Property hero | 16:9 / 21:9 | **Distinct composition per property** — if all eight heroes are the same shot type, the properties look interchangeable regardless of layout ([23](23-content-architecture.md) §9) |
| Property tile | 4:3 | Editorial-varied grid |
| Room type card | 3:2 | |
| Gallery | Native, letterboxed | Preserves the photographer's framing |
| Facility | 16:9 | |
| Social share | 1.91:1 | Open Graph — matters for Zalo and Messenger sharing |

Derivatives are generated on upload or on demand via an image CDN; originals are retained so
derivatives can be regenerated when ratios change.

---

## 9. Review photos

Guest-uploaded, `owner_type = REVIEW`, moderated separately from the review text
([61](61-phase-4-customer-review.md) §5.3). EXIF stripped. Not part of the property gallery and never
promoted into it without explicit permission.

---

## 10. Performance

**PROPOSED** — Media is the main determinant of this site's performance
([10](10-system-requirements.md) §2).

| Requirement | Target |
|---|---|
| Homepage image payload | ≤ 1.2 MB, lazy below the fold |
| Format | Modern formats with fallback, served by the CDN |
| Explicit dimensions | Always — CLS ≤ 0.1 |
| Loading | `priority` on hero only; lazy elsewhere |
| Gallery | Progressive with a blurred placeholder at the correct aspect ratio |
| Image sitemap | Generated — a photography-led brand gets real traffic from image search |

---

## 11. Open items

| ID | Item | Status |
|---|---|---|
| **Config B8** | **Photography for all 8 properties.** The longest lead time of any launch dependency | **OPEN** |
| Config A8 | Brand assets — logo, colours, typefaces | `OPEN` |
| Config B27 | Vietnamese alt text and captions | `OPEN` |
| — | Existing KAS image inventory and folder structure for import mapping | `OPEN` |

**PROPOSED** — The media architecture is complete and implementable. **It has no content.** Nothing in
this specification compensates for the absence of B8.
