# PHASE 7.5F — STEP 16A.14 — S12 CANCEL, END TO END

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — backend, API client and Partner Console UI, in one step.

**Gates:** backend **155 unit + 429 integration = 584** (+19), `BUILD SUCCESS` · frontend **560**
(+26), 30 files, typecheck clean, **lint 0 problems**, build compiled, **22 routes** (unchanged) ·
**no migration** (29, latest V27) · every reservation-side table **0** · `git diff --check` clean ·
**no OQ changed**.

---

## 1. The frozen contract, read from source

| | |
|---|---|
| Transition | doc 54 §4 S12 — **`any non-terminal → CANCELLED`** |
| Actors | **C / S** — customer *or* sales |
| Guard | **Reason required** |
| Side effects | **—** (nothing beyond the transition) |
| Holds | **All holds released** |
| Notification | Guest email + in-app |
| Audit | **`reservation.cancelled`** |
| Route | doc 58 §5:249 — `POST /sales/requests/{reference}/decline` **· `/cancel`**, permission **`reservation.cancel`**, "Reason required" |
| State-machine refusal | doc 58:409 — **`409 ILLEGAL_TRANSITION`** |

**The previous step's guess that S12 "shares S11's shape" was checked, not trusted.** It is broadly
right — same source set, same guard, same Hold column, same contract row, same permission — and wrong
in three specifics that the implementation reflects: the status reached, the audit event, and the two
columns below.

### 1.1 The one thing S12 writes that S11 does not

`reservation.cancelled_at` and `reservation.cancellation_reason` exist in V12:86-87 and, until this
step, **nothing in the codebase read or wrote them**. Step 16A.7 left them alone deliberately — they
are named for a cancellation and a decline is not one — and `SalesRequestDeclineIT` pins both at null.

S12 is the transition they are named for, and its guard already supplies the value. Writing them uses
the canonical columns the schema provides rather than inventing storage. **No frozen document states
it in those words**, so it is recorded here as an inference from the column names plus doc 54 S12's
"reason required", not as a quotation. Nothing else reads them, both are nullable, and the reason is
*also* written to the status-history row exactly as the decline's is — so no information depends on
the inference being right.

### 1.2 Only half of S12 is implemented, and the half is named

Doc 54 gives S12 the actors **C / S**. This is the **sales** half, on the admin surface doc 58 §5
freezes. The customer half is a different frozen route — `POST /me/stays/{reference}/cancel`, whose
post-`WON` behaviour doc 58 §4 additionally gates on config **A4** — and it is **not implemented**.
Said in the service javadoc, the controller javadoc, the API client and the UI panel, so nobody reads
this as "guests can cancel".

---

## 2. Backend

**S12 did not exist.** Only S11. Implemented as:

```
POST /api/v1/admin/sales/requests/{reference}/cancel
@PreAuthorize("hasAuthority('reservation.cancel')")   →  204
@Valid @RequestBody CancelRequestBody { @NotBlank String reason }
```

One transaction: lock → terminal check (**409**) → release everything → `markCancelled` → status
history → audit `reservation.cancelled`.

### 2.1 The release sequence is now shared, not duplicated

Doc 54 gives S11 and S12 the identical Hold column from the identical source set, so `decline` and
`cancel` call one `releaseEverything`. The order inside it is the part that can be got wrong, and it
is stated once:

1. **Lock the nights** in `room_type_id, date` order — the sequence S1 and the availability check also
   use, so none can deadlock against the others.
2. **Decrement `direct_committed` before releasing**, because the decrement reads `status = 'ACTIVE'`.
   Releasing first would leave the cache permanently high.
3. **Release the holds** — `RELEASED`, never deleted. V26's index is ACTIVE-scoped precisely so the
   row stays as history while the night is sold again.

`release_reason` is `"Reservation cancelled (S12)"`, so a cancelled hold is never mistaken for a
declined or expired one. A test asserts the exact string.

### 2.2 No migration, and why none was needed

Everything S12 writes already exists: the `CANCELLED` enum value (V1:49), both cancellation columns
(V12:86-87), `hold_status.RELEASED`, and `reservation_status_history`. **`db/migration` is untouched**
— 29 migrations, latest V27, Flyway unchanged.

---

## 3. Security

| Check | Result |
|---|---|
| Permission | `reservation.cancel` at the endpoint, doc 58 §5's own |
| Scope | `markCancelled` carries `AuthorizationScope` and applies `ScopeFilter`; every other statement it calls already did. `ScopeEnforcementStructureTest` green |
| Property/partner | Derived from the reservation inside the SQL — never from caller input |
| Cross-partner | **404, never 403**, and *nothing moves*: status, `cancelled_at`, holds and `direct_committed` all asserted unchanged |
| Unknown reference | 404, identical answer |
| Unauthenticated / CSRF | 401 / 403, tested |
| Terminal | 409, tested from `CANCELLED`, `DECLINED` **and** `WON` |
| Bounded writes | Every statement filtered by `reservation_id` — a test cancels one of two requests and asserts the other is untouched |

**No guard was weakened.** All architecture and security tests pass unchanged.

### 3.1 Concurrency

Two new tests in `ReservationConcurrencyIT` (non-transactional):

- **Two simultaneous cancels** → one `OK`, one `ILLEGAL_TRANSITION`; two RELEASED holds,
  `direct_committed` back to zero **exactly once**, one `CANCELLED` history row.
- **Cancel racing win** → exactly one succeeds. Both holds end in **one** state — 2 converted or 2
  released, never a mix — none left ACTIVE, and `direct_committed` matches the winner: 1 if the win
  landed, 0 if the cancel did. Without the row lock the same nights would be counted two ways.

---

## 4. Frontend

`salesRequestsApi.cancel(reference, reason)` — `api.post` with the exact `{ reason }` body.

**One panel now serves both terminal transitions.** `TerminalRequestPanel` holds the interaction —
required reason, two deliberate clicks, busy guard in the handler, refusal mapping — and
`DeclineRequestPanel` and `CancelRequestPanel` supply copy and an endpoint. Doc 58 §5 puts the two on
one row under one permission and one guard; two components differing only in strings would drift, and
the mid-flight defect fixed in the decline panel in Step 16A.7 would have had to be found twice.

`DeclineRequestPanel` keeps its name, props and `DECLINE_COPY` export, so **all 14 decline tests pass
unchanged** — which is the evidence the refactor preserved behaviour rather than the claim that it
did.

Both panels are offered in every non-terminal state and none once terminal, mirroring doc 54's source
set for each. The gate is a convenience; the backend refuses on its own and a 409 is handled.

### 4.1 Two deliberate copy decisions

**The back-out button is "Quay lại", not "Huỷ".** Next to an action button reading "Huỷ yêu cầu",
"Huỷ" would leave an agent guessing which one abandons the form and which one cancels the guest's
request. A test pins it.

**Cancel shows a success toast and decline does not.** A decline is something KAS decided and the
changed badge says enough; a cancellation is something an agent records on a guest's behalf, and
confirming that it was written is worth a line. `success` is optional on the shared copy type, so
decline's behaviour is unchanged.

### 4.2 One small improvement to the shared mapping

The decline panel previously answered **401 and 403 with "a server error occurred"**. Both now fall
through to the shared doc 58 §2.1 mapping — an expired session and a missing permission — while
**404 keeps its own wording**, because it is the ownership boundary and "resource not found" says
less than "this request was not found". No existing test asserted the old behaviour; both panels get
the better one.

---

## 5. Tests

| | Before | After |
|---|--:|--:|
| Backend unit | 155 | **155** |
| Backend integration | 429 (16A.9 baseline 429 incl. later steps) | **429** → see below |
| Frontend | 534 | **560** (+26) |

Backend: **584 total** (155 + 429), up from 565 — `SalesRequestCancelIT` **17 new**,
`ReservationConcurrencyIT` 12 → **14**.

Frontend: `cancel.test.tsx` **26 new**; 30 files.

**No existing test was weakened or deleted.** One was **corrected**, and it was mine:

> `ReservationConcurrencyIT.concurrentAssignmentsAreBothRecorded` asserted "the current owner matches
> the **newest** assignment row", identifying newest by `max(created_at)`. **`now()` is the
> transaction-start timestamp**, so it orders those rows by when each transaction *began*, not by which
> won the row lock and committed last — a racer that starts first can commit second, making
> `max(created_at)` name the wrong row. It passed in Step 16A.9 by timing luck and failed once two
> tests were added to the class. Replaced with an order-independent and **stronger** claim: the second
> assignment's `from_owner_id` is the first's `to_owner_id`, and its `to_owner_id` is the reservation's
> current owner. The implementation was never wrong.

That is the third time this repository's `now()` semantics have caught a test of mine, and the first
time the fix made the assertion stronger rather than merely correct.

**Not browser-verified.** The page needs an authenticated partner session and a live reservation; the
dev database deliberately holds zero, and seeding one would invent commercial data.

---

## 6. Database

29 migrations, latest **V27**, none added or edited. After the full suite every reservation-side table
is **0** — reservation, line, hold, status history, assignment, availability check, idempotency,
payment, email_log — with property 8 unchanged. No seed data was created.

---

## 7. Files changed

**Backend production (3):** `SalesRequestRepository.java` (+`markCancelled`),
`SalesRequestService.java` (+`cancel`, +`releaseEverything`, +`terminalEvent`),
`AdminSalesRequestController.java` (+`cancel`); **(1 new)** `api/CancelRequestBody.java`.

**Backend tests (3):** `SalesRequestCancelIT.java` (new), `ReservationConcurrencyIT.java`,
`SecurityFixtures.java` (+`holdReleaseReason`).

**Frontend production (4):** `TerminalRequestPanel.tsx` (new), `CancelRequestPanel.tsx` (new),
`DeclineRequestPanel.tsx` (delegates), `SalesRequestDetailView.tsx`, `endpoints/salesRequests.ts`.

**Frontend tests (1):** `cancel.test.tsx` (new).

**Migrations: 0. Docs (2):** this document, `00-README.md`.

---

## 8. OQ status

**None changed, none raised.** OQ-171/172/173/174/017 remain `CLOSED`; **OQ-162, OQ-163, OQ-066
remain `OPEN`**; OQ-161 remains `DEFERRED`. Step 16A.11's assignment dependency is untouched.

S12's notification is not sent — doc 117 §8.1's basis — and a test asserts `email_log` stays empty.

---

## 9. Self-audit

**Can a cancel run from a terminal state?** No — 409, tested from `CANCELLED`, `DECLINED` and `WON`.
**Can it release a won reservation's converted holds?** No — the WON test asserts 2 still `CONVERTED`,
0 released, `stay_status` still `CONFIRMED`, `direct_committed` still 1. **Can `direct_committed` go
negative or be released twice?** No — one release, proven under a two-thread race. **Can a cancel and
a win both land?** No — exactly one, with the holds ending in a single state. **Can another partner
cancel?** No — 404, nothing moves. **Can a blank reason reach the database?** No — 400 at the edge,
before anything is locked. **Was any guard weakened?** No. **Was a migration created?** No. **Was an
existing test weakened?** No — one was corrected and made stronger.

---

## 10. Next step

**OQ-162 — notification delivery.** It is now the only gap a guest can perceive: five transitions
write correct records and every screen says nothing was sent. It needs an owner decision on channel
and provider before code, so the honest next implementation step is either that decision, or:

**S5 (contact logged) — `POST /{reference}/contact`, `sales.request.manage`**, doc 54's
`ASSIGNED|AVAILABILITY_CHECK → CUSTOMER_CONTACTED`. It needs no new decision, it is the transition
that makes S10's second source state reachable, and it follows the shape this step just established.
Its route should be verified from doc 58 §5 before starting.
