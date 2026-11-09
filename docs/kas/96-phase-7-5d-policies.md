# 96 — Phase 7.5D: Property Policies & Policy Configuration

**Status:** ✅ COMPLETE — 259 tests pass, 0 failures, 0 skipped
**Date:** 2026-08-16
**Scope:** backend only
**Migration:** none required
**Seed data:** none — no policy value was invented

---

## 1. No stop conditions

The brief's stop conditions were checked against the live schema before any code was written.
None fired.

| Stop condition | Finding |
| --- | --- |
| Policy table missing | `property_policy` and `property_policy_translation` both exist (V1) |
| Policy types not frozen | Frozen by `property_policy_type_valid`, eleven values |
| Status vocabulary undefined | `rule_status` = `DRAFT`/`ACTIVE`/`PAUSED`/`ARCHIVED` |
| Versioning model undefined | `(property_id, policy_type, version)` unique, plus `effective_from` |
| Localisation missing | `property_policy_translation`, PK `(policy_id, locale)`, locale CHECK `vi`/`en` |
| Commercial values required | **None are.** `property_policy` has no numeric column at all |

The last row is the important one. It is not that policy calculation was avoided by discipline — the
table structurally cannot hold a percentage, a fee, a deadline or an age. Policy here is editorial
text and nothing else, which is exactly the data/calculation separation the brief §12 demands.

---

## 2. The frozen schema, as read

```
property_policy
  id              uuid  PK
  property_id     uuid  NULL  → property(id) ON DELETE CASCADE
  policy_type     text  NOT NULL   CHECK property_policy_type_valid (11 values)
  version         integer NOT NULL DEFAULT 1  CHECK version >= 1
  effective_from  date  NOT NULL
  status          rule_status NOT NULL DEFAULT 'DRAFT'
  created_at, updated_at  timestamptz NOT NULL

  UNIQUE CONSTRAINT property_policy_unique (property_id, policy_type, version)
  UNIQUE INDEX property_policy_global_unique_idx (policy_type, version)
         WHERE property_id IS NULL

property_policy_translation
  policy_id  uuid  ┐ PK
  locale     char(2) ┘  CHECK locale IN ('vi','en')
  summary    text  NULL
  body       text  NULL
```

`property_id` is **nullable**, and V21 added the partial unique index that only makes sense if it
is: a policy with `property_id IS NULL` is a platform-level document, not a property's. That is the
whole basis of §5.

`locale` is `char(2)`, so PostgreSQL blank-pads it. `PropertyPolicyRepository.findTranslations`
trims on read; without that, a map keyed `"en"` would never match a lookup for `en`.

---

## 3. The eleven types — and the four that are absent

Frozen list: `BOOKING`, `CANCELLATION`, `CHILDREN`, `PETS`, `SMOKING`, `PAYMENT`, `ACCESSIBILITY`,
`PRIVACY`, `TERMS`, `COOKIES`, `NO_SHOW`.

Four types a hotel platform would normally have are **not** in the CHECK, and none was added:

- **`CHECK_IN` / `CHECK_OUT`** — not policies in the KAS model. `property.check_in_time` and
  `property.check_out_time` are columns on the property. A policy type for the same fact would
  create a second place for it to live and a guaranteed future disagreement.
- **`EXTRA_BED` / `DEPOSIT`** — commercial terms. Doc 51 B11 and B12 record both as unresolved
  business inputs. They belong with the rate and settings model.

Adding a value means `ALTER TABLE … DROP CONSTRAINT` on a frozen CHECK. That was not done.
Registered as **OQ-110**.

`PolicyType` is a Java enum mirroring the CHECK. A request naming anything else fails at
deserialisation and returns `400 VALIDATION_FAILED` — proven for all four absent types in
`PolicyIT.unknownPolicyTypeIsRefused`.

---

## 4. Versioning — effective-dated, and why no migration was needed

The schema is effective-dated: each `(property_id, policy_type)` may hold many versions, each with
its own `effective_from` and its own status. **Several versions can legitimately be `ACTIVE` at
once** — a policy taking effect next month sits alongside the one in force today. That is what the
column is for, so no single-active constraint was added.

The current version is resolved as:

```sql
status = 'ACTIVE' AND effective_from <= current_date
ORDER BY effective_from DESC, version DESC
LIMIT 1
```

The `version DESC` tie-break makes the ordering **total**: even two versions sharing an
`effective_from` resolve deterministically. There is therefore no state in which "the current
policy" is ambiguous, and nothing for a migration to fix. Publication uses the same ordering under
`DISTINCT ON (policy_type)`.

**Version numbers are assigned by the platform, never by the caller.** `CreatePolicyRequest` has no
`version` field: a client-chosen number could collide with an existing version or silently supersede
one, and the constraint would surface as an opaque database error rather than a decision. The
service reads `max(version) + 1` and inserts; a concurrent creator racing to the same number is
stopped by `property_policy_unique`, not by the read being clever.

`max + 1`, not `count + 1`. A number is never reused even after every prior version is archived,
because a reservation may have pinned one through `terms_version`. Proven in
`PolicyIT.versionNumbersAreNeverReused`, which also asserts the constraint itself exists so the test
cannot be read as claiming the service logic is sufficient alone.

---

## 5. Platform-level policies — deliberately out of scope

`PRIVACY`, `TERMS` and `COOKIES` are legal documents KAS publishes once, as global policies with
`property_id IS NULL`. A Partner does not author them. `PolicyType.isPropertyScoped()` returns false
for those three, and `PolicyService.create` refuses them with
`400 VALIDATION_FAILED` / `NOT_PROPERTY_SCOPED`.

Doc 58 §3.1's `/public/policies/{type}` endpoint — which serves exactly these three — is **not
implemented**. The content is legal text KAS has not supplied (doc 51 B13), and writing placeholder
terms of service would be inventing the most consequential text on the site. Deferred, not forgotten.

---

## 6. Lifecycle

```
DRAFT ──► ACTIVE ⇄ PAUSED
  │         │        │
  └─────────┴────────┴──► ARCHIVED  (terminal)
```

`PAUSED` is what distinguishes a policy from the room-type lifecycle: a policy can be temporarily
withdrawn and brought back. `ARCHIVED` is terminal and **there is no DELETE endpoint** — a version
may be pinned by a reservation's `terms_version`, so it is retired and kept readable, never removed.
An illegal transition returns `409 ILLEGAL_TRANSITION` and writes no audit entry.

### The activation gate — PROPOSED, not frozen

**A version cannot become `ACTIVE` unless `body` is non-blank in both `en` and `vi`.**

This is a *proposed* rule. The schema permits a NULL body, and no frozen document states it. It is
applied because the alternative is worse: an `ACTIVE` policy with no text publishes an empty policy
to guests, and an empty cancellation policy is not a neutral outcome. Doc 25's both-locale principle
and doc 62 §5's precedent — alt text as a publish gate — both point the same way, and the brief §8
requires the system to fail safely rather than pretend a missing policy is complete.

Registered as **OQ-113**. If the owner wants single-locale activation, this is one predicate to
change.

---

## 7. Publication safety — three conditions, all in SQL

`PublishedPolicyRepository` implements `PublicReadRepository`. A guest has no scope, so the filter
is publication state, and all three conditions live inside the statement rather than in Java:

1. the owning property is publicly visible — `lifecycle_state IN ('OPEN','COMING_SOON','TEMPORARILY_CLOSED')`;
2. the policy version is `ACTIVE`;
3. `effective_from <= current_date`.

`PublicPolicyController` performs no filtering of its own. Each condition is tested independently:
a `DRAFT` policy on a live property is invisible; an `ACTIVE` policy on a `DRAFT` property is
invisible; an `ACTIVE`, effective policy on a live property appears; a `PAUSED` one disappears and
returns when resumed; a future-dated one waits.

A hidden property's policy endpoint returns **`200 []`, not `404`** — byte-identical to a visible
property that has published no policies. The response therefore discloses nothing about whether the
property exists, which is stronger than a 404 would be.

### On `current_date` — OQ-112

`effective_from` is a `date`: no time, no zone. No frozen document establishes a timezone
convention, so the comparison uses the **database server's** `current_date`. This is stated rather
than assumed: for a single-region operator it is unambiguous in practice, but it is not *specified*,
and a policy changing at midnight in the wrong zone is a real if narrow edge. The brief forbids
silently adopting UTC, `Asia/Ho_Chi_Minh` or the server zone — so the choice is recorded as
**OQ-112** instead of being buried in a converter.

---

## 8. Data vs calculation — structural, not disciplinary

The brief §12 requires policy *data* to be separate from policy *calculation*. It is, and not by
convention:

- `property_policy` has **no numeric columns**, so there is nowhere for a fee, percentage, deadline
  or age threshold to live.
- `PolicyService` computes nothing. It creates versions, stores text, moves status and audits.
- Commercial parameters are `system_setting` values (doc 51 §6); the engines that consume them
  belong to later phases.

**No policy value was invented.** No default cancellation window, no deposit percentage, no child
age, no extra-bed fee, no maximum. The test fixtures use `TEST_POLICY_BODY_EN` / `TEST_POLICY_BODY_VI`
precisely so that nothing in this phase can be mistaken for a KAS commercial term.

---

## 9. Authorisation

**Permission used: `property.manage`. No new permission was invented.**

Doc 59 §4.5 has no `policy.manage`, `policy.edit` or `policy.publish`, and the brief forbids
inventing one. A policy is property configuration — it hangs off `property_id`, is edited on the
property, and doc 58 §8 assigns property administration to `property.manage`. If the business later
wants policy authoring separated from property administration, that is a new permission and an owner
decision: **OQ-114**.

Scope is enforced at the repository boundary, inside every statement, via
`ScopeFilter.forProperties(scope, "p.partner_id", "p.id")` — including the writes, so an
out-of-scope property yields no row and nothing is written. `PropertyPolicyRepository` implements
`ScopedRepository`; `ScopeEnforcementStructureTest` therefore requires an `AuthorizationScope`
parameter on every one of its public methods.

Cross-partner access returns **404, never 403** (doc 85 §6.3) — a 403 would confirm the row exists.
`PolicyIT.crossPartnerIsolation` exercises all five routes with the wrong session and then asserts
the target policy is untouched and no row was created under the other partner.

---

## 10. API

**Admin — `/api/v1/admin/properties/{propertyId}/policies`, all `property.manage`:**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | every version, newest first within each type |
| GET | `/{policyId}` | one version, with its translations |
| POST | `/` | create the next version as `DRAFT` |
| PATCH | `/{policyId}/translations` | set `summary`/`body` for one locale |
| PATCH | `/{policyId}/status` | activate, pause or archive |

**Public — `/api/v1/public/properties/{slug}/policies?locale=en`:** the current version of each
policy type for a publicly visible property.

### Route status — a documented amendment, OQ-111

**Doc 58 §8 has no policies row at all.** These paths are an addition to the frozen contract. They
sit inside the existing property tree rather than opening a new namespace, following the same shape
as the review routes of doc 93 §7 and the room gallery of doc 95 §10. Doc 58 §3.1 does say property
detail "includes … policies", but the detail response is a flat record and splitting it is a larger
contract change than adding a sibling path. **This needs an approved doc 58 amendment — OQ-111.**

There is **no DELETE**, by design (§6).

---

## 11. Public response safety

`PublicPolicyView` carries exactly four fields: `type`, `version`, `summary`, `body`.

Absent: the policy id, `propertyId`, `partnerId`, `status`, `effectiveFrom` and every timestamp. A
guest needs the words and the version, not the editorial state — and `status` in particular would
disclose that a newer draft exists.

`version` **is** public, deliberately: doc 58 §3.1 returns it so a reservation can pin
`termsVersion` and the guest can be shown what they agreed to.

`PublicPolicyView` lives in the `property` package beside the domain record it is mapped from, so
the denylist test's package scan cannot reach it. It is registered by name in
`ADDITIONAL_RESPONSE_TYPES`, and `PolicyIT.publicPolicyResponseIsClean` additionally asserts the
raw JSON contains no partner id, property id or policy id.

### A gap closed while here

Doc 95 §11 noted that the denylist scanner lists packages by hand. That list had no guard, and the
javadoc referred to an `ApiPackagesAreScannedTest` that did not exist. It exists now, as
`PublicResponseDenylistTest.everyApiPackageIsScanned`: it imports `com.kas.platform`, collects every
package whose last segment is `api` or `publicapi`, and asserts the set is a subset of
`RESPONSE_PACKAGES`. A new API package now fails the build until it is registered, instead of
silently going unscanned.

---

## 12. Audit

The **existing** audit model is used. No second audit table was created.

| Action | Entity | Recorded |
| --- | --- | --- |
| `policy.created` | `property_policy` | propertyId, type, version |
| `policy.translation_updated` | `property_policy` | locale |
| `policy.status_changed` | `property_policy` | from, to, type |

Each entry carries the actor, the actor's highest role, the correlation id and the scope, via the
same `AuditEvent` used since Phase 7.3. A **refused** transition writes nothing —
`PolicyIT.policyChangesAreAudited` asserts the count does not move after a 409, because an audit log
that records attempts as if they were changes is worse than none.

Policy *text* is not copied into the audit payload. It is Partner-authored prose of unbounded
length, and doc 58 §10 keeps content out of logs.

---

## 13. Files

**Created — main (12):**

```
property/PolicyType.java                  the eleven frozen types, and why four are absent
property/PolicyStatus.java                lifecycle + canTransitionTo
property/PropertyPolicy.java              the domain record
property/PropertyPolicyRepository.java    ScopedRepository — every statement scope-filtered
property/PublicPolicyView.java            the guest-facing shape
property/PublishedPolicyRepository.java   PublicReadRepository — three conditions in SQL
onboarding/PolicyService.java             create / translate / status + audit
onboarding/api/PolicyView.java
onboarding/api/CreatePolicyRequest.java
onboarding/api/PolicyTranslationRequest.java
onboarding/api/PartnerPolicyController.java
onboarding/api/PublicPolicyController.java
```

**Created — test (1):** `security/it/PolicyIT.java` — 19 integration tests.

**Modified — test (2):** `SecurityFixtures` (+`policyStatusOf`, `policyCount`, `constraintExists`);
`PublicResponseDenylistTest` (+`PublicPolicyView`, +`everyApiPackageIsScanned`).

**No migration. No new module.** Policy code sits in the existing `property` and `onboarding`
modules; `ModuleStructureTest` was not touched.

---

## 14. Verification — what actually ran

| Check | Result |
| --- | --- |
| `mvnw -B verify` | **BUILD SUCCESS** |
| Unit tests | 144 run, 0 failures, 0 errors, 0 skipped |
| Integration tests | 115 run, 0 failures, 0 errors, 0 skipped |
| **Total** | **259 pass** (was 239 after 7.5C) |
| `PolicyIT` | 19 tests, all pass |
| Flyway version after run | `23` — unchanged |
| Flyway checksum validation | `validate-on-migrate: true`; validated on each of the 115 IT context boots |
| `clean-disabled` | `true` |
| `baseline-on-migrate` | `false` |
| Committed migrations vs HEAD | **no diff** — V1–V21 byte-identical, V22/V23 untouched |
| Test pollution in `kas_web_dev` | **zero** — 0 policies, 0 policy translations, 0 test partners, 0 test properties, 0 test users, 0 submissions, 0 `policy.*` audit rows |
| `git diff --check` | clean |
| Secret scan over `backend/src` + `docs` | no literal-secret matches |

Test rollback is by `@Transactional` on `SecurityIntegrationTest`, verified by querying the live
database after the suite finished rather than by assuming.

---

## 15. Open questions

| ID | Question | Impact |
| --- | --- | --- |
| **OQ-110** | Do `CHECK_IN`/`CHECK_OUT`/`EXTRA_BED`/`DEPOSIT` need policy types, or do the property columns and the rate model cover them? | Altering a frozen CHECK |
| **OQ-111** | Doc 58 §8 has no policies row. Approve the admin and public policy routes as a contract amendment. | API contract |
| **OQ-112** | Which timezone governs `effective_from`? Currently the database server's `current_date`. | A policy could change a day early or late |
| **OQ-113** | Confirm the both-locale body requirement for activation. Currently enforced; PROPOSED, not frozen. | Blocks activating an English-only policy |
| **OQ-114** | Should policy authoring be separable from `property.manage`? | New permission, doc 59 §4.5 |
| **OQ-098** | *(carried)* No draft/published split — activating a policy on a live property is immediately public. | Same exposure identified in 7.5A/B/C |

**OQ-098 narrows again but does not close.** A policy version can be prepared entirely as a `DRAFT`
and dated forward, so a Partner *can* stage a change safely. But the moment `ACTIVE` is set on an
already-effective version, guests see it — there is no review step between authoring and publication
for a property that is already live. Unchanged from previous phases, and still not papered over with
an invented `is_published` flag.

---

## 16. What this phase did not do

- No policy content was seeded. The eight KAS properties have **zero** policies.
- No commercial value was invented — no percentage, fee, window, age or threshold.
- No policy type was added to the frozen CHECK.
- No permission was invented.
- No second audit table.
- `/public/policies/{type}` (platform PRIVACY/TERMS/COOKIES) was not implemented — §5.
- No frontend. Backend only.
- Nothing was committed or pushed.

---

## 17. Next

**Phase 7.5E was not started**, per the brief.

The policy surface is complete and tested, but every property still has no policy text, and none can
be written without KAS supplying it. That is a business input, not an engineering gap — the same
material shortfall recorded in doc 92 for property content and doc 95 for photography.
