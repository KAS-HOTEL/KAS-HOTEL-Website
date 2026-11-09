# PHASE 7.5F — STEP 16A.5 — PARTNER RESERVATION QUEUE

**Date:** 2026-08-27
**Status:** 🟡 **PARTIAL — the read slice is complete; every status transition is blocked and none
was implemented.**

A guest request is now *visible and actionable by a human*, which it was not before. It is **not**
actionable *in the system*: no accept, no decline, no assign. Each is frozen in doc 54 §4 and each is
blocked on an open question or an unsupplied config, so none was built.

---

## 1. What the corpus already defined

Discovery answered the twenty contract questions from repository evidence. The decisive findings:

| # | Question | Answer, from the repository |
|---|---|---|
| 1 | What is PARTNER? | **A scope, not a role.** `UserRole` ships `CUSTOMER · ADMIN · SUPER_ADMIN`; `ADMIN` is *"KAS staff operating the platform, PARTNER-scoped"* and doc 85 §5.2 gives it PARTNER scope |
| 2–3 | Auth, and partner→property | Session cookies + `role_assignment`; ownership is the join **`reservation → property → partner`** (doc 85:223) |
| 4–5 | Multiplicity | One partner, many properties. `AuthorizationScope` forbids PARTNER scope carrying explicit properties, so the partner id *is* the reach |
| 6 | What may a partner see? | Doc 85 §11 row 7: *"Non-sequential references + **mandatory ownership check** — a reference is an identifier, never a credential."* 404, never 403 |
| 7–8 | Statuses and transitions | **All frozen** in doc 54 §4, S1–S13, with actor, guard, side effects, inventory, notification and audit per row |
| 9 | ACCEPT / REJECT? | **Yes — and both blocked.** See §4 |
| 15–16 | Guest PII | **Defined.** Doc 59:148 — `customer.view`, and *"**Audited** — staff access to guest data is logged"* |
| 17 | Audit requirement | Yes. `AuditLogger` and `audit_log` exist; the table rejects UPDATE and DELETE by trigger |
| 19 | Ownership server-side? | Yes — `ScopeFilter.forProperties`, the same predicate `PropertyRepository` uses |
| 20 | Partner frontend? | Yes — `/partner/**` route group, shell, nav, guards, `Table` primitive |

**The route contract was already frozen and did not need inventing.** Doc 58 §5 — *Sales API,
`/admin/sales`, scoped to `channelType = DIRECT` at the data layer*:

- `GET /sales/requests` · `sales.request.view` · **"The direct sales queue."**
- `GET /sales/requests/{reference}` · `sales.request.view` · **"Full workspace"**

**There is no `/api/v1/partner` namespace and none was created.** OQ-129 (resolved, doc 100 §14.1)
approved a separate `/partner/**` **frontend** IA while stating it creates *"no `PARTNER` role,
permission, authentication model or API namespace: the backend stays `ADMIN` role + `PARTNER` scope."*

---

## 2. Implemented

**Backend — 5 files, all in the existing `reservation` module** (no new module, so
`ModuleStructureTest` is untouched):

`SalesRequestRepository` · `SalesRequestService` · `SalesRequestSummaryView` ·
`SalesRequestDetailView` · `AdminSalesRequestController`.

```
GET /api/v1/admin/sales/requests            sales.request.view
GET /api/v1/admin/sales/requests/{reference} sales.request.view
```

Ordered **oldest unactioned first**, which doc 69 §4.2 freezes with its reason: *"a request model
fails by neglect, not by backlog order."*

**No filter, sort or page parameter is accepted.** Doc 58 §5 names
`?salesStatus,leadSource,owner,slaState,property` but defines no semantics for any of them, and this
project has no pagination convention to copy — OQ-158 already records the same gap on the admin
property list. Accepting one would freeze a meaning by accident.

**Frontend — 12 files**, two new routes under the existing partner shell:
`/partner/requests` and `/partner/requests/[reference]`. Route count **20 → 22**.

---

## 3. The data contract

**Queue** — reference · salesStatus · propertySlug · propertyName · checkIn · checkOut · nights ·
adults · children · rooms · **guestName** · requestedAt · slaDueAt · total.

**Detail** — the summary, plus lines (`roomTypeName`, `quantity`, `nightly`, `lineTotal`), plus a
**guest block that is null unless the caller holds `customer.view`**.

**Absent, deliberately:** the reservation's surrogate `id` (the reference is the addressable
identifier, doc 85 §11 row 7) · `priceSnapshot` · `ruleId` · `appliedRuleIds` (doc 58 §9 INTERNAL
denylist) · the idempotency key and request fingerprint, which are credentials of a submission rather
than facts about a booking · `partnerId` · `leadSource` and `salesOwner`, which would be empty on
every row because no assignment transition exists.

**Guest data is audited, not merely permitted.** Doc 59:148 requires that access be logged, so the
detail read writes `reservation.guest_contact_viewed` to `audit_log` before returning the block —
carrying the actor, the reservation and the scope, **never the contact values themselves**. A log that
copies the email in order to record that someone read the email has doubled the exposure it exists to
control. The queue carries no contact detail and therefore incurs no audit obligation.

---

## 4. Status transitions — none implemented, and why

Doc 54 §4 freezes every transition. From `REQUESTED`:

| Transition | Frozen requirement | Blocker |
|---|---|---|
| **S2 / S4** assign | "Owner recorded; assignment history"; notification "in-app: named agent" | No assignment-history table, no notification mechanism, and **config B24/B25** (sales team structure) unsupplied — which is exactly why doc 59 §3 ships no `SALES` role to assign to |
| **S10** win | Doc 54 **prohibits `REQUESTED → WON` without an availability check**; guard needs "payment recorded **or** pay-at-hotel permitted" (**config B12**) | Two configs plus **OQ-172** (`expiresAt` at S10) |
| **S11** decline | Reason required · **all holds released** · notification **"guest email + in-app"** | The release is implementable; the notification is **OQ-162**, and no mail sender exists |
| **S12** cancel | Same shape as S11 | Same |
| **S13** expire | Actor is the system | A scheduler, which **OQ-118** records as unresolved |

Implementing any of them would mean inventing the missing half — a decline that silently tells nobody,
or a win that guesses what happens to the hold. **The queue is the largest contractually complete
slice.** The detail screen says so in plain words rather than offering a button the server would
refuse.

---

## 5. Security

**One authorization model, reused.** `ScopeFilter.forProperties(scope, "p.partner_id", "p.id")` — the
same predicate `PropertyRepository` uses — applied inside **all four** repository queries, over the
`reservation → property → partner` join. `channel_type = 'DIRECT'` is in the SQL too, so an OTA
reservation is not addressable here at all (doc 58 §5).

**The existing guard caught a real defect in this work.** `ScopeEnforcementRule` refused
`lines(UUID)` for taking no `AuthorizationScope`. It was right — a repository method that trusts its
caller to have checked is one refactor from being called by one that did not. **I fixed the code, not
the guard**; `lines` now re-applies the ownership join.

Negative tests prove: Partner A gets **404** for Partner B's reservation; a guessed reference returns
**the same error code** as another partner's real one; unauthenticated reaches neither route.

---

## 6. Inventory safety

**Both endpoints are `GET` and the repository issues `SELECT` only** — no INSERT, UPDATE or DELETE.
The single write this slice can make is the audit row.

A test reads the queue once and the detail twice, then asserts that hold count, **active** hold count,
`direct_committed` and `available_direct()` are all unchanged, and that the reservation count is still
1. Nothing bypasses V26's ACTIVE-only hold uniqueness because nothing writes a hold.

---

## 7. Verification

| | |
|---|---|
| Backend | **155 unit + 369 integration = 524**, `BUILD SUCCESS` (+10) |
| Frontend | **466 tests / 26 files** (+19), typecheck clean, lint clean, build ✓, **22 routes** (+2) |
| Migrations | **28**, latest **V26**, **none added, none edited** |
| Database | `reservation` · lines · holds · idempotency · customer all **0** after tests; `property` 8 |
| `git diff --check` | clean |
| Architecture guards | all pass **unchanged** — none narrowed |

Two of my own test assertions were wrong and were fixed, not worked around: a document-wide `0 ₫`
regex matched the summary's legitimate `12.450.000 ₫`, and ESLint refused `Date.now()` during render
(the clock now comes from an async server read, which also keeps a request and its deadline on one
instant).

---

## 8. OQ status

**No OQ status changed.** OQ-172 · OQ-162 · OQ-163 · OQ-066 · OQ-122 · OQ-158 remain `OPEN`; OQ-161
remains `DEFERRED`; OQ-159 untouched.

**No new OQ was raised.** Every blocker in §4 is an existing OQ or an already-recorded unsupplied
config (B12, B24, B25), not a fresh ambiguity.

---

## 9. Known limitations

**The workflow is not live.** A guest request reaches an authenticated, authorized partner with real
data — and stops there. Nothing in the system can accept, decline or assign it, and **no notification
of any kind is sent to anyone**. The partner must contact the guest using the details on screen. The
detail page states this rather than implying otherwise.

**The console is Vietnamese-only, by design.** Doc 69 §325: *"One console language in V1 (config
A12)."* The new screens follow the existing partner surface; EN/VI parity applies to the guest
surface, which is a different contract.

**The `customer.view`-absent branch is unreachable today.** Every role holding `sales.request.view`
(`ADMIN`, `SUPER_ADMIN`) also holds `customer.view`, so the guest block is always present in practice.
The branch is defensive, and the frontend renders an honest sentence for it rather than blanks.

**OTA exclusion is enforced but not directly tested.** `channel_type = 'DIRECT'` is in all four
queries; no fixture creates an OTA reservation, so the exclusion is proven by inspection rather than
by a test that tries to read one.
