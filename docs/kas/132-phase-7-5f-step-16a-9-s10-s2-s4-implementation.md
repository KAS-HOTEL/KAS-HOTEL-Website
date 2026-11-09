# PHASE 7.5F — STEP 16A.9 — S2 / S3 / S4 / S10 IMPLEMENTATION

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — all six owner decisions implemented, all four transitions live.

**Gates:** backend **155 unit + 410 integration = 565**, `BUILD SUCCESS`, 0 failures · frontend
**481**, 22 routes, `Compiled successfully` · **V27 applied**, Flyway validates 29 migrations, 0 failed ·
every reservation-side table **0** · `git diff --check` clean.

---

## 1. Owner decisions consumed

| # | Ruling | What it produced in code |
|---|---|---|
| **1** | OQ-172 **option B** — keep `expires_at NOT NULL`; firm = `status = 'CONVERTED'` | `convertRequestHolds` sets `ACTIVE → CONVERTED` and **never touches `expires_at`**. No migration for nullability. A test asserts zero holds with a null expiry after a win |
| **2** | B12 / OQ-017 **option A** — pay-at-hotel permitted; `DEPOSIT_REQUIRED_TO_CONFIRM = false` | `settings.requireBoolean(DEPOSIT_REQUIRED_TO_CONFIRM)` inside S10. Value set in `system_setting`, **not** in a migration — V20 forbids that. No payment endpoint, transaction, status, provider or ledger exists |
| **3** | S10 pre-state **option A** — no `REQUESTED → WON`; build S4 first | `WINNABLE_FROM = {AVAILABILITY_CHECK, CUSTOMER_CONTACTED, ALTERNATIVE_OFFERED}`, doc 54 verbatim. S4 implemented so the first of those is reachable |
| **4** | Assign permission **option A** — `sales.request.assign` | `@PreAuthorize` on `POST /assign`. `lead.assign` was not added; `sales.inquiry.manage` is untouched and still gates the inquiry routes |
| **5** | Assignment history **option A** — dedicated table; reassignment without a status change | **V27 `reservation_assignment`**. Current owner stays on `reservation.sales_owner_id` |
| **6** | S3 result **option B** — dedicated record | **V27 `reservation_availability_check`**, outcome enum + per-line jsonb evidence |

**No decision was reinterpreted, and none was invented.**

---

## 2. S2 — assignment

`POST /api/v1/admin/sales/requests/{reference}/assign` · `sales.request.assign` · **204**.

One transaction: `SELECT … FOR UPDATE OF r` (ownership filter in the same statement) → terminal check
→ same-owner check → target validation → `sales_owner_id` moved → assignment row appended → audit
`reservation.assigned`. From `REQUESTED` it then moves the status to `ASSIGNED` and writes a SALES
history row.

**Reassignment carries no status change**, which is the whole point of decision 5. From `ASSIGNED` or
`AVAILABILITY_CHECK` the owner moves and the status does not — `reservation_status_history` records
*which lifecycle moved and to what*, and here nothing moved. A test asserts the SALES history count is
unchanged across a reassignment while the assignment count goes 1 → 2 and the second row's
`from_owner_id` is the first's `to_owner_id`.

**Assigning the current owner to themselves is a 409**, not a no-op. V27's
`assignment_owner_changed CHECK (from_owner_id IS DISTINCT FROM to_owner_id)` would refuse the row
anyway; refusing in the service names the reason instead of surfacing a constraint violation.

### 2.1 What makes a target valid

`isAssignableOwner` decides in SQL: the target must be an `ACTIVE` `app_user` **and** hold a
non-revoked `role_assignment` whose scope reaches *this reservation's property* — `GLOBAL`, or
`PARTNER` matching `p.partner_id`, or `PROPERTY` containing `p.id`. The three arms mirror
`role_assignment_scope_valid` exactly, so the predicate and the database CHECK cannot disagree.
`OWN` is absent: a customer scope reaches no property and can own no request.

**A nonexistent user, a suspended one and another partner's agent all answer identically** — 400
`VALIDATION_FAILED` with `details[0].field = "salesOwnerId"`. The endpoint cannot be used to discover
which user ids are real. Both cases are tested against the same assertion.

---

## 3. S3 / S4 — the availability re-check

`POST /{reference}/availability-check` · `sales.request.manage` · **204**. No body: the reservation
already carries its property, dates and lines, and accepting any of them would let the caller choose
what gets checked.

One endpoint because doc 54 gives both transitions the same destination. From `ASSIGNED` it is **S3**;
from `REQUESTED` it is **S4**, whose side effects doc 54 states as *"S2 + S3"* — the same check
preceded by an implicit self-assignment, recorded exactly as an explicit S2 is. Any other source state
is a **409**: doc 54 has no `AVAILABILITY_CHECK → AVAILABILITY_CHECK` row, and inventing a
self-transition to permit re-checking would add a transition the frozen contract does not have.

The permission is doc 58 §5's for this route. Doc 54 makes S4's self-assignment a *side effect*, not a
second authorization, so `sales.request.assign` is **not** additionally required — that would be a
guard the contract does not have.

### 3.1 Why the reservation's own hold is added back

`available_direct()` subtracts `direct_committed`, and doc 55 §3.1 puts every ACTIVE hold inside that
cache — including the one this reservation already owns. Comparing the raw number against the line
quantity would demand the inventory **twice**: once for the rooms already committed to this guest, and
again to satisfy the same request.

So the check reads `min(available_direct(i.*) + own_active_hold)`, where the added-back term is bounded
by `h.reservation_id = r.id`. It asks the question S3 actually asks — *can this reservation still be
honoured?* A test pins this: one room per night, entirely consumed by this request's own hold, raw
availability **zero**, and the check passes.

`available_direct(i.*)` is **called, never reimplemented**. Doc 88 §7: it is character-for-character
the `inv_no_oversell` CHECK, so what the check reads and what the database will enforce cannot drift.

A short night count is a refusal, not a zero — doc 15 §12 makes a missing inventory row *unavailable*,
never unlimited. Tested by deleting one night's row while the hold still exists.

### 3.2 An honest limit found while testing

`inv_no_oversell` makes it **impossible** to withdraw inventory out from under a live hold: any
`total`/`maintenance` change that would push `available_direct` negative is refused by the database. So
the re-check cannot fail while its own hold is intact — which is the oversell guard working, not a gap.
The refusal tests therefore use the case that *can* happen: the hold lapsed and was swept, and the
rooms went to other guests meanwhile.

---

## 4. S10 — win

`POST /{reference}/win` · `reservation.win` · **204**. No body, for the same reason: doc 54 S10's guard
is availability, acceptance and config B12, none of which a caller may assert about itself.

Order, and why: lock → source-state check (409) → **B12** → availability re-verified **under lock**
(422 `NO_AVAILABILITY`) → holds converted → other holds released → `markWon` → both history rows →
both audit events.

### 4.1 B12 is read, not assumed

`requireBoolean` throws `MissingConfigurationException` when the value is unset, so an unsupplied B12
is a loud **422 `CONFIG_MISSING`** and never a silent default — the fail-closed behaviour every other
setting has, preserved. Tested by clearing the setting.

When it is `true`, S10 **refuses**: a deposit would have to be recorded, `POST /payments`
(`payment.record`) is not implemented, and inventing a payment record to get past a guard is the one
thing that must never happen. A test asserts `payment` stays at **0** in that case.

### 4.2 The hold becomes firm, and `direct_committed` does not move

`ACTIVE → CONVERTED`, `expires_at` untouched. Every consumer of a hold filters `status = 'ACTIVE'`
before it ever reads `expires_at` — `hold_expiry_sweep_idx`, `v_active_hold_demand`, doc 55 §3.1 — so a
CONVERTED row stops counting as demand, stops being swept, and stops occupying V26's ACTIVE-scoped
uniqueness, while remaining a complete record.

`released_at` **is** set, because `hold_released_has_timestamp CHECK (status = 'ACTIVE' OR released_at
IS NOT NULL)` requires every non-ACTIVE hold to carry one. That is the moment the hold left ACTIVE,
which is what the CHECK has always meant; `release_reason` says which transition did it, so a
conversion is never mistaken for a release. **No constraint was weakened to make this compile.**

**`direct_committed` is deliberately not adjusted.** Doc 55 §3.1 counts ACTIVE holds *plus* lines whose
`stayStatus` is CONFIRMED, and this transaction moves the reservation from the first term to the
second. Decrementing would hand the rooms back; incrementing would count them twice. A test captures
`direct_committed` and `available_direct()` before and after and asserts both are unchanged.

Doc 54 S10's second hold clause — *"all other holds on the reservation released"* — is implemented
(`hold_type <> 'REQUEST'`). It can match nothing today because S7 does not exist, and it is there
because the contract states it and a hold left ACTIVE on a WON reservation would lock inventory
nothing will claim.

`price_snapshot` is not in any SET list. Doc 54 calls the snapshot *sealed*; a test compares it and
`total_minor` before and after.

---

## 5. Contract interpretation recorded, not silently applied

Doc 54 S10's Hold column reads *"Accepted hold becomes firm — `expiresAt` cleared"*, and doc 55 §5
rule 1 (marked **PROPOSED**) says the same. **Owner decision 1 governs**: firmness is `CONVERTED` and
`expires_at` is preserved. This report records that reading; **no frozen document was edited.**

---

## 6. Security

| Check | Result |
|---|---|
| Permission at the endpoint | `sales.request.assign` · `sales.request.manage` · `reservation.win`, each `@PreAuthorize`d. The frontend is never the boundary |
| Property/partner scope | Every one of the 11 new repository statements carries `AuthorizationScope` and applies `ScopeFilter`. `ScopeEnforcementStructureTest` passes |
| Cross-partner reservation | **404, never 403** — tested for assign, check and win; nothing moves |
| Cross-partner target user | 400, identical to a forged uuid — tested |
| Suspended target | 400, same answer — tested |
| Unauthenticated | 401 — tested on all three |
| Missing CSRF | 403 — tested on assign and win |
| Terminal state | 409 `ILLEGAL_TRANSITION` — tested |
| IDOR | The reservation is addressed by reference through a scoped, locked read; the target user is validated against the reservation's own property |

**No architecture or security guard was weakened.** Two guards caught real defects in this work and
**the code was fixed, not the guard**: `BusinessRuleException`'s "422 domain codes only" rule (a 400
belongs on `KasException`), and `ScopeEnforcementRule` on the first draft of the new methods.

---

## 7. Transactions and locking

Every transition is one `@Transactional` service method — no second transaction abstraction, no
`REQUIRES_NEW`, no retry loop, no sleep, no polling.

| Step | S2 | S3/S4 | S10 |
|---|---|---|---|
| 1 | `SELECT … FOR UPDATE OF r` + ownership | same | same |
| 2 | terminal / source-state guard | source-state guard | source-state guard |
| 3 | target validation | self-assign (S4 only) | B12 |
| 4 | `sales_owner_id` | lock stay nights `ORDER BY room_type_id, date` | lock stay nights, same order |
| 5 | assignment row | read availability, write the check record | re-check |
| 6 | status + history (S2 only) | status + history | convert holds, release others |
| 7 | audit | audit | `markWon`, two history rows, two audits |

**Lock order is `room_type_id, date` everywhere** — the sequence S1 and the decline path already use,
so no two paths can take these rows in opposite orders and deadlock. The reservation row is always
locked before any inventory row.

**No table-wide UPDATE.** Every write is bounded by `reservation_id` (or `r.id`) *and* the ownership
filter. Both inserts are `INSERT … SELECT` guarded by the ownership join, so a row cannot be written
for a reservation the caller cannot reach, and `property_id` comes from the reservation rather than
from the caller.

A failed assignment-history insert raises rather than returning, so the owner update rolls back with
it; a refused availability check throws, so its own record rolls back with the transition it would
have authorised — owner decision 6's *"rollback on refusal"*.

### 7.1 Concurrency, proven

`ReservationConcurrencyIT` (deliberately non-transactional):

- **Two simultaneous wins** → one `OK`, one `ILLEGAL_TRANSITION`; exactly 2 CONVERTED holds, 0 ACTIVE,
  `direct_committed` still 1, exactly one WON history row. **No double conversion, no double count.**
- **Two simultaneous checks** → one `OK`, one `ILLEGAL_TRANSITION`; exactly one check record and one
  assignment row.
- **Two simultaneous assignments** → both `OK` (assignment is not terminal); exactly one row with a
  null `from_owner_id`, and the current owner matches the newest row. **The chain is unbroken.**
- **A refused check commits nothing** — no check record, no assignment, no status or owner change.

---

## 8. Database

**One migration: `V27__assignment_and_availability_check.sql`.** V1–V26 untouched. Flyway validates
**29** migrations (27 versioned + 2 repeatable), **0 failed**.

`reservation_assignment` — reservation, property (scope), `from_owner_id` (null on the first
assignment), `to_owner_id`, actor, `actor_type`, reason, `created_at`; `CHECK (from_owner_id IS
DISTINCT FROM to_owner_id)`; two indexes.

`reservation_availability_check` — reservation, property, `checked_at`, actor, `actor_type`,
`outcome availability_check_outcome`, `detail jsonb` with `CHECK (jsonb_typeof(detail) = 'array')`;
one index. New enum `availability_check_outcome ('AVAILABLE','UNAVAILABLE')`.

**Owner columns are `ON DELETE RESTRICT`**, because the ruling requires the history preserve both
owners; `actor_id` is `ON DELETE SET NULL`, matching `reservation_status_history` and `audit_log`.

**`DEPOSIT_REQUIRED_TO_CONFIRM = 'false'` was set in `system_setting`, not in a migration.** V20 is
explicit: *"No production value is ever invented in a migration"* — the two existing supplied values
(A6, B2) were set the same way.

**No seed data was invented.** After the full suite: reservation, reservation_line, inventory_hold,
reservation_status_history, reservation_change, reservation_request_idempotency,
reservation_assignment, reservation_availability_check, customer, payment, email_log, room_type all
**0**; property 8, partner 1, unchanged.

---

## 9. Tests

| | Before | After |
|---|--:|--:|
| Backend unit | 155 | **155** |
| Backend integration | 382 | **410** (+28) |
| Frontend | 481 | **481** |

`SalesWorkflowIT` — **24 new**: 8 S2, 7 S3/S4, 9 S10. `ReservationConcurrencyIT` 8 → **12** (+4).

**Four existing tests were updated, none weakened:**

- `FlywayHistoryIT` — 28 → 29 migrations, highest version 26 → 27. A count of a fact.
- `FlywayHistoryIT` and `DatabaseConnectivityIT` — V27's two tables added to the **by-name exclusion**
  the assertion already used for V22's and V24's. The claim it makes — *"the 53 Phase 7.2 domain tables
  are all still present"* — is unchanged, and its own comment says additions are expected.
- `DatabaseConnectivityIT` — `DEPOSIT_REQUIRED_TO_CONFIRM` added to `OWNER_ANSWERED_KEYS`, because the
  owner answered it. `OwnerConfigurationIT` — supplied count 4 → 5, **plus a new assertion** that B12
  is exactly `false`. The guard "no value was invented" is strictly stronger afterwards.

Two test-harness facts worth recording, both discovered by failures:

- **`now()` is the transaction timestamp**, so two assignment rows written in one test transaction
  share `created_at` and no ORDER BY can separate them. The fixture addresses an assignment row by its
  **target owner** instead. (The same class of bug as the 16A.7 status-history fixture.)
- **`SecurityIntegrationTest` is `@Transactional` and MockMvc runs on the test thread**, so the service
  joins the *test's* transaction and a refusal cannot roll back independently of it. Asserting
  "nothing was written" there would assert something the harness cannot observe, so the rollback proof
  lives in `ReservationConcurrencyIT` where the boundary is real, and the transactional class asserts
  only what it can see. **No assertion was softened to pass** — one was moved to where it is true.

---

## 10. Frontend

**Untouched.** No file under `frontend/src` was modified; 481 tests, 22 routes, build clean.

The partner console still offers only decline. The three new endpoints have no UI, which is why
`decline.test.tsx`'s *"offers no accept, win or assign control"* still passes and is still correct.
**Two comments in the frontend tests are now stale** — they say S10 is blocked on B12 and OQ-172 and
that assignment needs B24/B25. The assertions remain true; only the stated reason has changed. Left
alone because this brief says the frontend stays untouched unless an integration is genuinely
required. **Recorded here rather than quietly fixed.**

---

## 11. OQ status

| OQ | Before | After |
|---|---|---|
| **OQ-172** `expiresAt` at S10 | 🔴 OPEN | 🟢 **CLOSED** — owner decision 1, option B, implemented and tested |
| **OQ-017** payment before confirmation (B12) | 🔴 OPEN | 🟢 **CLOSED** — owner decision 2, option A, implemented and tested |
| OQ-162 notification delivery | 🔴 OPEN | 🔴 **OPEN** — nothing sent; a test asserts `email_log` stays empty |
| OQ-163 rate limiting | 🔴 OPEN | 🔴 OPEN — untouched |
| OQ-066 alternative offer expiry | 🔴 OPEN | 🔴 OPEN — untouched |
| OQ-161 | 🟡 DEFERRED | 🟡 DEFERRED — untouched |
| OQ-171 · OQ-173 · OQ-174 | 🟢 CLOSED | 🟢 CLOSED — unchanged |

**Two closed, both directly resolved by an owner decision and actually implemented. No unrelated OQ
was touched.** B24, B25, B1 and B19 remain unsupplied and remain non-blocking.

---

## 12. Files changed

**Production (4):** `SalesRequestRepository.java` (+11 scoped methods), `SalesRequestService.java`
(+3 transitions), `AdminSalesRequestController.java` (+3 endpoints), `AssignRequestBody.java` (new).

**Migration (1):** `V27__assignment_and_availability_check.sql`.

**Tests (6):** `SalesWorkflowIT.java` (new), `ReservationConcurrencyIT.java`, `SecurityFixtures.java`,
`FlywayHistoryIT.java`, `DatabaseConnectivityIT.java`, `OwnerConfigurationIT.java`.

**Docs (3):** this document, `00-README.md`, `16-open-questions.md`.

**Frontend: 0.**

---

## 13. Self-audit — the twenty questions

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Can unauthorized users assign? | **No** | `@PreAuthorize(sales.request.assign)`; 401 and 403 tested |
| 2 | Can assignments cross properties? | **No** | `isAssignableOwner` requires a role assignment reaching *this* property; foreign agent → 400, foreign reservation → 404 |
| 3 | Can reassignment lose history? | **No** | A failed insert raises and rolls back the owner update; 2 rows asserted after 2 assignments |
| 4 | Can reassignment without a status change be lost? | **No** | Its own table. Tested: SALES history unchanged, assignment count 1 → 2, chain intact |
| 5 | Can S3 record a false success? | **No** | The record is written from the values read under lock; `AVAILABLE` requires every line satisfied |
| 6 | Can S4 transition without a successful check? | **No** | `runCheck` throws before `updateSalesStatus` is reached |
| 7 | Can S4 oversell? | **No** | It creates no hold and moves no inventory; `direct_committed` asserted unchanged |
| 8 | Can S10 start from REQUESTED? | **No** | `WINNABLE_FROM` excludes it; tested → 409 |
| 9 | Can unauthorized users confirm? | **No** | `@PreAuthorize(reservation.win)`; 401/403/404 tested |
| 10 | Can S10 bypass B12? | **No** | `requireBoolean` before the re-check; `true` → 422, unset → 422 |
| 11 | Can payment be falsely recorded? | **No** | No payment code exists. `payment` count asserted 0 |
| 12 | Can a confirmed hold remain ACTIVE? | **No** | `convertRequestHolds` moves every ACTIVE REQUEST hold; asserted 0 ACTIVE, 2 CONVERTED, including under a race |
| 13 | Can `expiresAt` be illegally nulled? | **No** | Column is still `NOT NULL`; no statement writes it; `holdsWithNullExpiryFor` asserted 0 |
| 14 | Can `direct_committed` be double-counted? | **No** | S10 does not touch it; before/after asserted equal, and equal after a two-thread race |
| 15 | Can S10 partially commit? | **No** | One transaction. The refusal test asserts status, stay status, `won_at` and hold statuses all unmoved |
| 16 | Can concurrent confirmations both succeed? | **No** | `FOR UPDATE OF r`; race yields `OK` + `ILLEGAL_TRANSITION`, one WON history row |
| 17 | Can foreign reservations be accessed? | **No** | `ScopeFilter` in every statement; 404 tested on all three endpoints |
| 18 | Can a forged target user be assigned? | **No** | Random uuid → 400, identical to a foreign agent |
| 19 | Were old migrations modified? | **No** | V27 only; Flyway validates all 29 checksums |
| 20 | Was a guard weakened, or an unrelated OQ closed? | **No** | Two guards caught defects and the code was fixed. Only OQ-172 and OQ-017 changed status |

---

## 14. Remaining blockers

**None for S2, S3, S4 or S10.** Still open and still out of scope: **S5–S9** (contact, alternatives —
S7 additionally needs B1 and B19), **S12** (cancel), **S13**, **OQ-162** (no notification is sent by
any transition), **OQ-163**, and the **partner console UI** for the three new endpoints.

---

## 15. Exact next step

**Build the partner console UI for assign, availability-check and win** — the three endpoints exist,
are authorized, and have no surface. It needs no new decision: the routes, permissions and error codes
are all frozen and implemented, and `DeclineRequestPanel` is the pattern to follow.

The smallest useful slice is the **availability-check button on the request detail page**, because it
is the one transition with no body, and it is what makes a request reachable by S10.
