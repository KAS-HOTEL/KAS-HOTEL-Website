# PHASE 7.5F — STEP 16A.27 — CLOSING THE PUBLISH GATE'S WRITABLE HALF

**Date:** 2026-08-31
**Status:** 🟡 **PARTIAL BY DESIGN** — the two publish-gate fields nothing could write are now
writable, read-back and browser-verified. **OQ-101 was not guessed and not bypassed.**

**Gates:** backend **158 unit + 515 integration = 673** (+10), `BUILD SUCCESS` · frontend **724**
(+9), 40 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration**
(29 validated, latest V27) · database returned to baseline · `git diff --check` clean · **no OQ
changed**.

---

## 1. Classification

| | Item | Verdict |
|---|---|---|
| **IMPLEMENT NOW** | `signatureLine` and `shortDescription` authoring, per locale | ✅ **done** |
| **NEEDS OWNER DECISION** | `POST /admin/properties/{id}/publish` — **OQ-101** | 🛑 stopped |
| **NEEDS OWNER DECISION** | Hero image — **OQ-106** | 🛑 stopped |
| **NEEDS OWNER DECISION** | Signature-experience authoring — no route in doc 58 §8 | 🛑 stopped |
| **ALREADY IMPLEMENTED** | Room types, inventory, base rates, submit, approve, `updateLifecycle` | untouched |
| **NOT REQUIRED** | Story, introduction, neighbourhood, highlights, amenities | out of scope |

---

## 2. Why the editorial fields were IMPLEMENT NOW

Three documents freeze the same gate, and the schema already enforces the numbers.

- **Doc 52 §3.1 (Property invariants)** — *"Publishable only with hero image, **signature line,
  both-locale descriptions**, address, ≥1 published room type, ≥1 signature experience."*
- **Doc 23 §7** — *"**Publish gate** | A property cannot publish without `name`, `signatureLine`, and
  `shortDescription` in **both** locales."*
- **Doc 23 §9 (Publish checklist)** — the same list again, item by item.
- **Doc 23 §3.2** — `signatureLine` *"localised, ≤ 90 chars"*, `shortDescription` *"localised, ≤ 220
  chars"*.
- **The schema agrees**: `property_tr_sig_len` is `length(signature_line) <= 90` and
  `property_tr_short_len` is `<= 220`. **The bounds were read, not chosen.**
- **`PropertyCompletenessChecker`** has counted both since it was written.

So the contract, the limits and the consumer all existed. **Only the writer was missing** — the sole
INSERT into `property_translation` wrote `(property_id, locale, name)` and nothing else, which is the
defect Step 16A.26 found by trying to submit a property.

**No business decision was involved**, so this was implemented rather than reported.

---

## 3. What was built

**Backend** — no new route, no new permission, no migration.

| File | Change |
|---|---|
| `PropertyRepository` | `setEditorial(...)`, `findEditorial(...)`, `EditorialText` |
| `UpdatePropertyRequest` | `signatureLines`, `shortDescriptions` — per-locale maps, `@Size(max = 90)` / `@Size(max = 220)` |
| `PropertyInformationService` | writes them inside the existing transaction, after the names |
| `PartnerPropertyController` | passes them through; **reads them back** on `GET` and on the list |
| `PropertyAdminView` | returns both maps |

Three decisions worth recording, each derived from something that already existed rather than chosen:

1. **Update, never insert.** `property_translation.name` is `NOT NULL` with a non-blank CHECK, so a
   translation row cannot exist without a name and this cannot conjure one. A locale with no row
   yet is a **400 naming `names.<locale>`** — accepting the text and dropping it would be worse.
2. **Absent ≠ blank.** An omitted field keeps its stored value, so a draft can be built over several
   sessions; a blank one clears to NULL, because `PropertyCompletenessChecker` counts a blank string
   as missing and the column must agree with the check that reads it.
3. **Read back what is written.** Doc 101 §2 recorded the cost of the opposite — `PATCH` accepted
   address fields `GET` never returned, which became **OQ-132**. A Partner who cannot read their own
   draft cannot edit it.

**Frontend** — a `Nội dung giới thiệu` card on the property information screen: signature line per
locale (`maxLength` 90) and short description per locale as textareas (`maxLength` 220), each carrying
the requirement in its own description text. Server field errors map onto the right input for both
the `signatureLines[vi]` shape bean validation produces and the `signatureLines.fr` shape the service
produces.

**Database** — unchanged. The columns and their CHECKs have existed since V-property; nothing needed
adding, so **no migration was created**.

---

## 4. Where this stops, and why it stops there

### OQ-101 — not guessed, not bypassed

The question is *"Approval targets `COMING_SOON`; what moves a property to `OPEN`, and does it
require inventory and rates?"* Half of it is determined:

- **What moves it** — doc 58 §8:320 freezes `POST /admin/properties/{id}/publish` with
  `property.manage`; doc 93 §4 says *"Moving to `OPEN` is a separate operational decision"*;
  `PropertyRepository.updateLifecycle` already performs the write and already stamps `published_at`
  when the target is `OPEN`.
- **Whether it requires inventory and rates** — **undetermined.** Doc 52 §3.1 and doc 23 §9 both
  enumerate the publish preconditions and **neither mentions inventory or rates**, but doc 52 words
  it as *"publishable only with"*, which states necessity and not sufficiency. Implementing the
  endpoint means choosing whether that list is complete, and that choice is the open question itself.

**So `/publish` was not implemented.** An endpoint that either checks or does not check inventory
would answer OQ-101 by shipping, which is exactly what a validation-first project must not do. This
is one ruling away from being a small piece of work: the route, the permission, the repository write
and the checker all exist.

### OQ-106 — hero image

`PropertyCompletenessChecker` requires a `media_link` with `is_cover`. Object storage is unchosen and
the database holds zero media assets. Untouched.

### Signature experiences — no frozen route

`property_experience` exists and is counted by the checker, but **doc 58 §8 contains no experiences
endpoint at all** — no path, no permission, no request shape. Building one would invent an API rather
than implement one. This is the same class of gap OQ-100 records for the review endpoints, and it
needs a doc 58 amendment before code.

---

## 5. Security

**No new endpoint, no new permission, no new query parameter, no migration.** The write rides the
frozen `PATCH /admin/properties/{id}` behind `property.manage`, inside the transaction and the
optimistic lock that were already there.

`ScopeFilter.forProperties` guards both new repository methods — `setEditorial` calls `findById` under
scope before writing, and `findEditorial` carries the same predicate as `findNames`. Proven by tests:
another partner's property is **404 on write and 404 on read** (doc 85 §6.3 — never 403), its text is
absent from the scoped list, and a stale `version` still yields **409 with nothing written**. CSRF,
RBAC and all eight architecture guards unchanged and passing.

---

## 6. Tests

**Backend +10** (`PropertyEditorialIT`): writes both fields in both locales · reads back through
`GET` **and** the list — the OQ-132 lesson · absent keeps, blank clears · **the completeness gate
moves from incomplete to complete for Basic information**, with `$.complete` still false because the
hero image and experience remain · the 90/220 bounds refused with a **400 naming the field, and the
boundary value accepted** · unknown locale reports `signatureLines.fr` · a locale with no name is
refused rather than silently dropped · the optimistic lock still conflicts and writes nothing ·
cross-partner is 404 both ways · the list stays scoped.

**Frontend +9** (`propertyEditorial.test.tsx`): all four inputs exist · `maxLength` matches the frozen
bounds · stored values render and an unwritten locale is empty · the request uses the API's own field
names and still carries `version` · an untouched field is omitted rather than blanked · names and
address are unaffected · server errors map onto the right input for both field-path shapes · an
unrelated path is left alone.

**Four existing fixtures** gained the two maps — the type system catching the DTO change, as it should.
No existing test was weakened, changed or deleted.

---

## 7. E2E verification — performed

Against the running stack (backend `:8080` restarted on the new classes, frontend `:3000` rebuilt):

| Step | Result |
|---|---|
| `GET .../completeness` before | `Basic information` ❌ `["shortDescription (both locales)", "signatureLine"]`, `Location` ❌ |
| `PATCH /admin/properties/{id}` | **200**, response carried both maps back in both locales |
| `GET .../completeness` after | **`Basic information` ✅ · `Location` ✅**, `complete: false` |
| Partner console, real browser | the `Nội dung giới thiệu` card rendered all four fields, **populated from the server** |
| Edited the English signature line and saved | **`property_translation.signature_line` held the new text** |

Three of the five completeness sections are now satisfiable through the product — Basic information,
Location, and Room types (proven in 16A.26). **Two remain blocked**, both on registered questions.

**The database was returned to baseline**: reservation 0, room_type 0, inventory 0, non-DRAFT
properties 0, editorial rows 0, and the full backend suite re-run green afterwards.

---

## 8. Next step

**One owner ruling stands between this product and a bookable hotel.** In priority order:

1. **Rule on OQ-101.** Precisely: *does publishing to `OPEN` require inventory and rates, or is doc 52
   §3.1's list the whole gate?* Everything else for `/publish` already exists — route, permission,
   repository write, `published_at` stamp, and a completeness checker that already implements the
   documented checklist.
2. **Amend doc 58 §8 for signature experiences**, then implement the endpoint. It is the only
   remaining gate item that is pure engineering once its contract exists.
3. **OQ-106** — object storage — unblocks the hero image, and with it submission.

With (1) alone, a property that has room types can be published and the first half of the E2E chain
closes. With (1)–(3), the whole onboarding path runs through the product with no SQL at all.
