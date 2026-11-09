# PHASE 7.5F — STEP 16A.29 — PROPERTY PUBLISH / OPEN

**Date:** 2026-08-31
**Status:** 🟢 **SHIPPED** — `POST /admin/properties/{id}/publish` implemented, and a hotel was
published to `OPEN` from a real browser.

**Gates:** backend **158 unit + 527 integration = 685** (+12), `BUILD SUCCESS` · frontend **735**
(+11), 41 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration**
(29 validated, latest V27) · database returned to baseline · `git diff --check` clean.

---

## 1. The ruling, and where it lives in the code

> **Inventory and rates are not preconditions for `OPEN`.** They are business inputs for
> sellability, not conditions of the lifecycle.

Applied literally: `PropertyPublicationService` contains **no inventory or rate check**, its class
javadoc says so and says none should be added, and two integration tests
(`inventoryIsNotAPrecondition`, `ratesAreNotAPrecondition`) fail the moment one appears.

Verified live afterwards: the published hotel returns `200 []` from
`GET /public/availability/properties/{slug}` — an empty result, exactly as the ruling predicted, not
an error.

---

## 2. Backend

**`POST /api/v1/admin/properties/{id}/publish`**, permission `property.manage`, returning the
existing `PropertyAdminView`. No new permission, no new response model, **no migration**.

Order of checks, each mapped to an existing convention:

| # | Check | Failure |
|---|---|---|
| 1 | existence and scope (`ScopeFilter.forProperties`) | **404** — doc 85 §6.3, before anything can distinguish "not yours" from "not ready" |
| 2 | source state | **409 ILLEGAL_TRANSITION** |
| 3 | completeness — `PropertyCompletenessChecker` **reused, not duplicated** | **400 VALIDATION_FAILED** listing every missing field, as `submit` already does |
| 4 | signature-line uniqueness | **400 VALIDATION_FAILED**, `signatureLines.<locale>` / `DUPLICATE` |
| 5 | version-guarded lifecycle write | **409 VERSION_CONFLICT** |

`@Transactional`, so a refused publish leaves the lifecycle exactly as it found it — asserted after
every refusal test.

**Files:** `PropertyPublicationService` (new) · `PublishPropertyRequest` (new) ·
`PartnerPropertyController` (endpoint) · `PropertyRepository.updateLifecycle(…, expectedVersion, …)`
(version-guarded overload) · `PublishedPropertyRepository.conflictingSignatureLocales(…)`.

**Optimistic locking.** `/publish` has no documented body, but doc 58 §2 puts `version` on every
MASTER update and publishing is the most consequential one a property has. The request carries it for
the same reason `UpdatePropertyRequest` does, and the version predicate sits in the same statement as
the identity and scope predicates.

**Audit.** `property.published`, `before {COMING_SOON}` → `after {OPEN}`, actor role reduced the way
`OnboardingService` already reduces it. Confirmed in `audit_log` after the live run.

### Source state — narrow, isolated, not guessed

`PUBLISHABLE_FROM = [COMING_SOON]`. Doc 03 §8 and doc 52 §3.1 both render the lifecycle as a chain —
`DRAFT → COMING_SOON → OPEN → …` — so `OPEN`'s predecessor is `COMING_SOON`, and a property arrives
there by approval.

**No document says whether a `DRAFT` property that already satisfies the whole checklist may skip
review.** That question now lives in exactly one constant with a javadoc that says so: if the owner
rules it may, add `DRAFT` to the list and nothing else changes. A test pins the current behaviour so
the change is deliberate rather than accidental.

### Signature-line uniqueness

Doc 52 §3.1 — *"`signatureLine` unique across published properties"*. Implemented in
`PublishedPropertyRepository`, which already owns doc 03 §8's visibility predicate and is the single
place that rule is stated.

- **Exact string comparison.** No case folding, no normalisation, no locale rules — none is specified,
  and each would be invented.
- **Not partner-scoped**, because the portfolio a guest sees is one list. This is the documented
  scope of "published properties", and doc 03 §9's P1 risk (*eight hotels reading alike*) is
  portfolio-wide.
- **It returns the caller's own locales and nothing about the other property**, so a uniqueness check
  cannot become a way to read another partner's editorial text. Asserted.

---

## 3. Frontend

`PublishPanel`, on the existing property overview beside the completeness card — the place the action
belongs, rather than a new page.

- **`COMING_SOON` + complete** → enabled action.
- **`COMING_SOON` + incomplete** → disabled, with the server's own blocker list rendered verbatim.
  Nothing is computed client-side, so the button cannot disagree with the endpoint it calls.
- **Completeness read failed** → disabled, and says so. "Could not load" and "nothing is missing" are
  different states and only one may enable the button.
- **`DRAFT`** → no action, and explains approval comes first.
- **`OPEN`** → the published state, pointing at Tồn phòng and Giá — the only place inventory and rates
  are mentioned, because they are what makes an `OPEN` hotel *sellable*, not what lets it publish.
- Server refusals render with the fields they named; nothing is simulated locally, and `router.refresh()`
  re-reads the server after success.

---

## 4. Tests

**Backend +12** (`PropertyPublishIT`): publishes to `OPEN` and stamps `published_at`, version bumped ·
**no inventory does not block** · **no rate does not block** · incomplete refused with every field
named and lifecycle unchanged · duplicate signature line refused · **uniqueness spans partners**, and
the message discloses nothing about the other property · `DRAFT` refused · publishing twice refused
and `published_at` not moved · stale version 409 writing nothing · version required · unauthenticated
401 and no-permission 403 · cross-partner **404, never 403**, still unpublished.

**Frontend +11** (`publishPanel.test.tsx`): sends the server's version · refreshes and reports what
the server said · says *bookable*, not *visible* · **never lists inventory or rates as blockers** ·
disabled with the server's blockers · does not call the endpoint when blocked · a failed completeness
read is not "ready" · duplicate-line refusal shown with its field · version conflict not mistaken for
success · no action on `DRAFT` · `OPEN` state points at what is left to sell.

**One existing assertion narrowed, with the reason recorded in the test.** `property.test.tsx`'s
*"exposes no control that could change the property"* asserted "no button" as a proxy for "nothing
here edits a property", written when the overview was read-only. The overview now carries exactly one
control — Publish — which changes the lifecycle, not the property's data. The real invariant is
unchanged and still asserted: no editable field, no combobox, no save or submit.

---

## 5. E2E — performed

Backend restarted on the new classes, frontend rebuilt.

| Step | Result |
|---|---|
| Room type created | through the **real admin API** |
| Hero image, signature experience, editorial text, address, approval | direct SQL, mirroring `SecurityFixtures.makePropertyComplete` — the checklist items that still have **no authoring API** (OQ-106, and no experiences route in doc 58 §8) |
| `GET /completeness` | all five sections ✅ |
| Partner console | publish action **enabled, no blockers listed** |
| **Clicked Publish in the browser** | `lifecycle_state = OPEN`, `version 0 → 1`, `published_at` stamped |
| `audit_log` | `property.published`, `COMING_SOON → OPEN`, actor `ADMIN` |
| Overview after refresh | badge **"Đang hoạt động"**, publish action gone |
| `GET /public/properties` | the hotel, `lifecycleState: OPEN` |
| **`GET /public/availability/…`** | **`200 []`** — OPEN with no inventory is valid, exactly as ruled |

**Database returned to baseline**: room_type 0, media_asset 0, property_experience 0, editorial rows
0, non-DRAFT properties 0, reservation 0. The full backend suite was re-run green afterwards.

One row was deliberately left: the `audit_log` entry for the publish. `audit_log` is **append-only by
database trigger** — the delete was refused, which is the guard working. It records an action that
genuinely happened.

---

## 6. Remaining blockers

| Item | Status |
|---|---|
| **Hero image** | **OQ-106** — no storage provider, so the checklist item has no authoring path |
| **Signature experiences** | **no route in doc 58 §8** — building one would invent an API |
| `DRAFT → OPEN` directly | narrow open point, isolated in one constant |
| OQ-098 | no draft/published split — now reachable, since a live property exists |

Until the first two are answered, a property cannot pass the checklist through the product alone —
the endpoint is correct and complete, and the gate it enforces is not yet fully satisfiable.

---

## 7. Next step

**Amend doc 58 §8 with a signature-experience authoring route, then implement it.** It is the only
remaining checklist item that is pure engineering once its contract exists — `property_experience` and
`property_experience_translation` already exist and are already counted. That leaves the hero image
(OQ-106) as the single blocker between a partner and a hotel published without touching SQL.
