# 93 — Phase 7.5A: Property Submission Workflow

**Phase:** 7.5A — Property onboarding submission, review and publication
**Status:** ✅ **CHECKPOINT GREEN — awaiting review.** The §22 completion gate is met.
**Last updated:** 2026-08-16

> **208 tests pass** — 143 unit/architecture, 65 integration. 0 failures, 0 skipped.
> The **ninth-property end-to-end acceptance proof passes.**
>
> V1–V21 byte-identical (23 checked, 0 differing). Flyway: 25 rows, 0 failed,
> 0 baseline. **No test pollution** — `kas_web_dev` holds exactly the 8 seed
> properties, all DRAFT, and 0 rows in `app_user`, `room_type`,
> `property_submission`, `media_asset` and `audit_log`.
>
> **No frontend was created.**

---

## 1. What this completes

Doc 92 §9.2 listed what was missing after the 7.5 foundation. All of it now
exists: submission repository, onboarding service, completeness validation,
submit, admin review, approve, reject, request changes, audit, controllers, and
the acceptance proof.

---

## 2. State machine

Four states, exactly those V22 froze. **`UNDER_REVIEW` was not added.**

```
                    ┌──────────────┐
   Partner submits  │  SUBMITTED   │  ← at most one open per property (V22 index)
                    └──────┬───────┘
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     ┌─────────┐     ┌──────────┐  ┌────────────────────┐
     │APPROVED │     │ REJECTED │  │ CHANGES_REQUESTED  │
     └─────────┘     └──────────┘  └─────────┬──────────┘
     publishes        reason              reason
                                              │
                              Partner edits, submits again
                              → a NEW submission row
```

Every decision is **terminal for its row**. `APPROVED → REJECTED` and
`REJECTED → APPROVED` are refused with `409 ILLEGAL_TRANSITION`.

**Why no `UNDER_REVIEW`:** the continuation brief sketches it, but also says not
to invent states, and V22 froze four. It would carry no data — an Admin opening
a submission changes nothing and nothing branches on it — and a submission left
in it by an Admin who closed their laptop would block the Partner with no way
out. "Review started" is recorded as an **audit event** instead, which keeps the
information without a state that can get stuck.

**Resubmission creates a new row.** That is what preserves history: a property
submitted, sent back, and approved keeps all three outcomes.

---

## 3. Completeness — the rule is frozen, not invented

Doc 52 §3.1, verbatim:

> Publishable only with hero image, signature line, both-locale descriptions,
> address, ≥1 published room type, ≥1 signature experience.

Those six are the checks, reported as five sections for the brief §18.2 progress
display. **Nothing else is mandatory.** Star rating, coordinates, year opened,
total room count, email, Zalo, check-in times, rates and policies are all
optional, because no frozen document makes them required and the brief forbids
inventing mandatory business fields.

Checked at **submit**, not approve — by approval it is too late to tell the
Partner what is missing. A refusal returns `400 VALIDATION_FAILED` listing
**every** missing field at once, not the first failure.

One adjustment: doc 52 §3.1 says "published room type", but room types are
created `DRAFT` and published *by* the approval, so requiring published rooms
before approval would be unsatisfiable. At submit, a room type must merely exist.

---

## 4. Publication safety

**The guarantee lives in SQL, not in a controller.**
`PublishedPropertyRepository` carries, in every statement:

```sql
lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')
```

which is doc 03 §8's visibility table and doc 58 §3.1's "Excludes DRAFT/CLOSED",
written once. A property that has never been approved is `DRAFT` and cannot be
returned by any public query — even if someone later adds a handler and forgets
to think about it.

`draftIsNeverPublic` proves it at four points: not submitted, submitted, opened
by a reviewer, and rejected. **None of them publishes anything.**

**Approval moves `DRAFT → COMING_SOON`, not `OPEN`.** Doc 03 §8 makes
`COMING_SOON` publicly listed but *not bookable*, which is the only honest state
for a property that has passed editorial review and has no inventory or rates —
neither exists until a later phase. Moving to `OPEN` is a separate operational
decision. A property already past `DRAFT` is left alone, so re-approving an edit
to a live hotel cannot demote it.

### 4.1 The pending-edit question, answered

Brief §8 asks whether pending edits can overwrite published data. **They can** —
a Partner PATCHes the live property row directly, and there is no draft/published
split. This is **not a defect introduced here**; it is the frozen schema's shape,
and doc 58 §2 already anticipates the eventual answer (`If-Match` / `version` on
MASTER updates → 409). It is recorded as **OQ-098** rather than patched around
with a boolean, exactly as §8 requires.

Its practical impact today is nil: all eight seed properties are DRAFT and
nothing is published. It must be resolved before a live property is ever edited.

---

## 5. Authorization

**No permission was invented.** Doc 58 §8 maps
`/admin/properties[/{id}]`, **`/publish`**, `/preview` → `property.manage`.
Approving a submission is what publishes a property, so `property.manage` is the
permission the frozen contract already assigns to that act. It governs every
Partner and Admin endpoint here.

Scope decides who reviews what: `ADMIN` + `PARTNER` reviews their own partner's
submissions; a `GLOBAL` actor reviews across partners. Isolation is enforced in
the same statement as the lookup — `findById`, `create`, `decide` all `AND` the
scope predicate into the SQL, so an out-of-scope submission is never fetched and
the caller gets **404, never 403**.

**Open item — separation of duties.** In V1, KAS reviews its own submissions,
because one `ADMIN` holds both `property.manage` and `PARTNER` scope. Recorded as
**OQ-099**; resolving it means either a reviewer role (which doc 59 §3 does not
have) or requiring `GLOBAL` scope to approve. The earlier 2FA login blocker cited
in this discovery was removed by owner decision [150](150-owner-decision-no-2fa.md).

---

## 6. Concurrency

`decide` is a **compare-and-set in the database**:

```sql
UPDATE property_submission SET status = ? … WHERE id = ? AND status = 'SUBMITTED' AND <scope>
```

Two Admins deciding the same submission both target the same row; PostgreSQL
serialises them, the first flips the status, the second matches nothing and gets
`409 ILLEGAL_TRANSITION`. The loser is told, rather than silently overwriting a
decision that has already published a property.

Duplicate submission is prevented by the **V22 partial unique index**
(`WHERE status = 'SUBMITTED'`), not by a prior read — a check-then-insert would
leave a window in which two concurrent submits both pass the check.

---

## 7. API

| Method | Path | Permission | Source |
|---|---|---|---|
| GET | `/api/v1/admin/properties` | `property.manage` | doc 58 §8 |
| GET | `/api/v1/admin/properties/{id}` | `property.manage` | doc 58 §8 |
| POST | `/api/v1/admin/properties` | `property.manage` | doc 58 §8 |
| PATCH | `/api/v1/admin/properties/{id}` | `property.manage` | doc 58 §8 |
| GET | `/api/v1/admin/properties/{id}/completeness` | `property.manage` | **addition** |
| POST | `/api/v1/admin/properties/{id}/submit` | `property.manage` | **addition** |
| GET | `/api/v1/admin/properties/{id}/submissions` | `property.manage` | **addition** |
| GET | `/api/v1/admin/property-submissions` | `property.manage` | **addition** |
| GET | `/api/v1/admin/property-submissions/{id}` | `property.manage` | **addition** |
| POST | `/api/v1/admin/property-submissions/{id}/approve` | `property.manage` | **addition** |
| POST | `/api/v1/admin/property-submissions/{id}/reject` | `property.manage` | **addition** |
| POST | `/api/v1/admin/property-submissions/{id}/request-changes` | `property.manage` | **addition** |
| GET | `/api/v1/public/properties` | public | doc 58 §3.1 |
| GET | `/api/v1/public/properties/{slug}` | public | doc 58 §3.1 |
| GET | `/api/v1/public/properties/{slug}/room-types` | public | doc 58 §3.1 |

**Doc 58 §8 defines no review endpoints**, so the seven marked "addition" are
additions to the frozen contract. They sit inside the existing admin tree rather
than opening a new namespace. Like the staff auth route in doc 91 §7,
**they need an approved doc 58 amendment before they can be called frozen —
OQ-100.**

Error contract reused unchanged: 401 unauthenticated · 403 authenticated but
forbidden · 404 out of scope or absent (indistinguishable) · 400
`VALIDATION_FAILED` · 409 `ILLEGAL_TRANSITION`. No second JSON error shape.

---

## 8. Audit

Existing `AuditLogger` and `audit_log`. No second audit system, and **no
`correlation_id` / `scope` columns added** — still deferred, per instruction.
Events: `submitted`, `review_started`, `approved`, `rejected`,
`changes_requested`. `action` is `text`, so these needed no migration.

Actors holding several roles are recorded at the most privileged one — the
authority the action was actually taken under.

---

## 9. The ninth-property proof

`NinthPropertyE2EIT` creates a partner with eight properties, then drives a ninth
from nothing to public through the same HTTP endpoints:

create → 9 visible to one PARTNER assignment → not public → edit → **incomplete
submit refused** → complete → submit → not public → appears in the review queue →
Admin inspects → Admin approves → **publicly readable**, room type published,
`partnerId` and `id` absent from the public body.

Plus: another Partner gets 404 on read, edit and submit; and a reflective test
asserts **no production type is named after any of the eight properties**, so the
"no code change" claim is checked rather than stated.

**Limitation, stated plainly:** room types, media and signature experiences are
seeded directly, because their endpoints are Phase 7.5B+. Every *workflow* step —
create, edit, completeness, submit, queue, inspect, approve, public read — is
real HTTP.

---

## 10. Database

**No new migration.** V22, V23 and the two repeatables are unchanged from the
7.5 foundation. V1–V21 byte-identical.

---

## 11. Module structure

`onboarding` added (10 modules total). It owns the workflow and its controllers,
which also let `AdminPropertyController` move out of `security.api` — **the
compromise doc 90 §7 recorded is now resolved.**

`PublicReadRepository` remains the single, explicit exemption from the scope
rule; `ScopeEnforcementStructureTest` permits it only for repositories that
declare it, and `PublishedPropertyRepository` is the only one.

---

## 12. Completion gate — §22

| Criterion | Status |
|---|:--:|
| Submission repository · OnboardingService · completeness validation | ✅ |
| Partner submit · Admin review · approve · reject · request changes | ✅ |
| State transitions enforced · reasons persisted · audit events persisted | ✅ |
| Publication safety proven | ✅ four points, SQL-level |
| Partner isolation proven | ✅ every new route |
| Concurrency tested | ✅ compare-and-set + unique index |
| **Ninth-property E2E passes** | ✅ |
| Phase 7.3 / 7.4 regression | ✅ 143 unit+arch, all green |
| Flyway validation · V1–V21 unchanged | ✅ |
| No frontend · no fabricated content · `git diff --check` · secret scan | ✅ |

---

## 13. Open questions

| ID | Question | Severity |
|---|---|---|
| **OQ-098** | A Partner editing a published property overwrites live data with no draft/published split. Doc 58 §2 anticipates `If-Match`/`version`; the split does not exist | 🟠 Must be resolved before any property goes live |
| **OQ-099** | Separation of duties: in V1 KAS reviews its own submissions | 🟠 |
| **OQ-100** | Doc 58 §8 amendment for the seven review endpoints | 🟠 |
| **OQ-101** | Approval targets `COMING_SOON`; what moves a property to `OPEN`, and does it require inventory and rates? | 🟢 |

---

## 14. Remaining 7.5 work

7.5B room-type API · 7.5C media upload and linking · 7.5D policies · 7.5E
inventory and rates onboarding · 7.5F frontend. None started; none begun
automatically.
