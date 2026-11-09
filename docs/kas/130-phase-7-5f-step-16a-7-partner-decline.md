# PHASE 7.5F — STEP 16A.7 — PARTNER RESERVATION WORKFLOW: S11 DECLINE

**Date:** 2026-08-27
**Status:** 🟡 **PARTIAL — S11 decline is complete; S2/S4, S10 and S12 remain blocked and none was built.**

**Gates:** backend **155 unit + 382 integration = 537**, `BUILD SUCCESS` · frontend **481** (+15),
22 routes, 0 vulnerabilities · **no migration** (28, latest V26) · every reservation-side table **0**.

---

## 1. The correction this step is built on

**Step 16A.5 reported S11 as blocked by OQ-162. That was wrong, and doc 117 §8.1 says so.**

Doc 54 §4's transition table has **separate columns** for Guard and Notification. S11's guard is
"Reason required"; "guest email + in-app" sits in the Notification column. Doc 117 §8.1 freezes what
that distinction means:

> **Frozen:** Step 16A owes the *business effect* — the reservation reaching a state in which the
> acknowledgement and the sales-queue entry are due, and the durable record that makes them derivable.
> It does **not** owe delivery. … Delivery remains **OQ-162**.
>
> A request that cannot send an email must still succeed.

S1 shipped on exactly that basis, with `trackingUrlIssued: false`. S11 ships the same way: the
transition, the hold release and the record — and **nothing sent**. Reading the notification column as
a blocker was over-caution, not contract safety.

---

## 2. Contract matrix

| Operation | State before → after | Authorization | Transaction | Hold | `direct_committed` | Notification | Status |
|---|---|---|---|---|---|---|---|
| **A** queue | — | `sales.request.view` + PARTNER scope | read | — | — | — | ✅ 16A.5 |
| **B** detail | — | `sales.request.view`; guest block needs `customer.view` + audit | read (+audit write) | — | — | — | ✅ 16A.5 |
| **D** decline | non-terminal → `DECLINED` | `reservation.cancel` + scope | one, row-locked | all ACTIVE → `RELEASED` | **−q per night** | **none sent** | ✅ **this step** |
| **C** win (S10) | `AVAILABILITY_CHECK\|CUSTOMER_CONTACTED\|ALTERNATIVE_OFFERED` → `WON` | `reservation.win` | — | `expires_at` **cleared** | firm | — | ⛔ **BLOCKED ×3** |
| assign (S2/S4) | `REQUESTED` → `ASSIGNED` | `sales.inquiry.manage` | — | maintained | — | in-app | ⛔ BLOCKED |
| cancel (S12) | non-terminal → `CANCELLED` | `reservation.cancel` | — | all released | −q | guest email | ⛔ out of scope here |

**S10's three blockers**, all verified against the repository rather than assumed:
1. Doc 54 explicitly **prohibits** `REQUESTED → WON` without an availability check — S3/S4 do not exist.
2. The guard needs *"payment recorded or pay-at-hotel permitted"* — **config B12**, unsupplied.
3. Doc 55 row 5 requires the accepted hold's `expires_at` to be **cleared**. The column is
   `timestamptz NOT NULL` with `CHECK (expires_at > created_at)`, so clearing it is impossible
   without a migration. **That is OQ-172**, and it is a schema fact, not an opinion.

**S2/S4's blockers:** no assignment-history table, and configs **B24/B25** unsupplied — which is why
doc 59 §3 ships no `SALES` role to assign to.

---

## 3. What decline actually does

One transaction, in this order and for these reasons:

1. **`SELECT … FOR UPDATE`** on the reservation, ownership filter in the same statement. Two agents
   serialise here, so the second reads what the first *wrote*.
2. **Terminal check** → **409 `ILLEGAL_TRANSITION`**. Doc 54: *"any transition out of a terminal state"*
   is prohibited, and `salesStatus` *"freezes at its terminal value"*.
3. **Lock the inventory nights** in `room_type_id, date` order — the identical sequence S1 uses, so a
   release and a concurrent request cannot deadlock.
4. **Decrement `direct_committed`, then release the holds.** In that order: the decrement reads
   `status = 'ACTIVE'`, so releasing first would leave the cache permanently high.
5. **Status → `DECLINED`**, status-history row, `reservation.declined` audit event.

**Why the decrement is derived, not invented.** Doc 55 §3.1 defines the cache as direct reservation
lines *whose `stayStatus` is CONFIRMED / CHECK_IN_READY / CHECKED_IN* **plus ACTIVE holds**. A
`REQUESTED` reservation has `stayStatus = NULL`, so its entire contribution is the hold. Doc 55 row 14
does exactly this on expiry (`DirectCommitted −q`); doc 14 §6.3 freezes *"Reservation → DECLINED |
All holds RELEASED"*. Same hold, same release, same cache.

**Holds are released, never deleted.** V26's index is ACTIVE-scoped precisely so a released row can
coexist with a later one for the same night — proven by a test that declines and then re-books the
same night.

**The reason lives on the status-history row**, not on `reservation.cancellation_reason`. That column
and `cancelled_at` are named for cancellation; nothing in the corpus says a decline writes them, so
nothing does. A test asserts both stay NULL.

**204, not 200.** Doc 54 defines the transition's effect on the record, not a response document.

---

## 4. Security

**The existing guard caught a real defect again.** `ScopeEnforcementRule` refused all five new write
methods for taking no `AuthorizationScope`. **The code was fixed, not the guard** — every one now
carries the scope *and applies it*, including the INSERT, which became an `INSERT … SELECT` guarded by
the same ownership join. Each statement is safe read in isolation.

Tested: Partner A declining Partner B's request → **404, and nothing moves** (status, holds and
`direct_committed` all unchanged) · unauthenticated → 401 · **no CSRF token → 403** · blank reason →
400 before anything moves.

---

## 5. Concurrency

**Two simultaneous declines: exactly one succeeds.** The test lives in `ReservationConcurrencyIT`
because that class is deliberately **non-transactional** — `SecurityIntegrationTest` rolls back, so a
"concurrent" test there would race two threads over data neither can see.

The assertion that matters is not the status codes but the inventory: **`direct_committed` returns to
zero exactly once**, two holds are RELEASED, and one `DECLINED` history row exists. A double release
would either trip the `direct_committed >= 0` CHECK or silently credit the property with a room no
guest gave back.

---

## 6. Frontend

`DeclineRequestPanel` — reason required, **two deliberate clicks**, disabled in flight, and the panel
**says no notification is sent before the agent commits**, not after.

On success it calls `router.refresh()` rather than flipping a local badge: the server owns the new
state, and a locally-patched status could show something the record does not have. A **409** reads as
*"someone else already moved this"* and is **never retried automatically**.

The panel is absent once `salesStatus` is terminal. There is no Accept, Win or Assign control — a
button the server would refuse is worse than none.

**One real defect was found by its own test and fixed:** while submitting, `state` was no longer
`'confirming'`, so the confirm pair was replaced by the disabled action button mid-flight — swapping
the control under the agent's cursor and hiding the progress they were waiting on.

---

## 7. Tests

| | Before | After |
|---|--:|--:|
| Backend unit | 155 | **155** |
| Backend integration | 369 | **382** (+13) |
| Frontend | 466 | **481** (+15) |

`SalesRequestDeclineIT` (12) · `ReservationConcurrencyIT` 7 → 8 (the decline race) ·
`decline.test.tsx` (14) · `salesRequest.test.tsx` +1.

**One existing assertion was changed, and only because the contract changed under it.**
`salesRequest.test.tsx`'s *"offers no accept, decline or assign control"* asserted the absence of any
action — true in Step 16A.5, false now that S11 is frozen and implemented. It was replaced with a
**stronger** assertion: decline exists, and the still-blocked transitions do not. No test was weakened
or deleted.

**Three of my own test bugs, fixed rather than worked around:** a global `reservationCount()` that
another class's committed rows made fail; a status-history lookup ordered by a timestamp two rows can
tie on; and a first attempt at the race that MockMvc (not thread-safe) could not support.

---

## 8. OQ status

**No OQ status changed. No new OQ raised.**

| OQ | Status | Effect here |
|---|---|---|
| **OQ-162** notification delivery | 🔴 OPEN | **Untouched.** Nothing is sent; a test asserts `email_log` stays empty |
| **OQ-172** `expiresAt` at S10 | 🔴 OPEN | Blocks S10; not approached |
| **OQ-163** · **OQ-122** · **OQ-158** · **OQ-066** | 🔴 OPEN | Untouched |
| **OQ-161** | 🟡 DEFERRED | Untouched |
| OQ-171 · OQ-173 · OQ-174 | 🟢 CLOSED | Unchanged |

---

## 9. Database

**28 migrations, latest V26, no V27, none edited.** All required tables at **0**: reservation,
reservation_line, inventory_hold, idempotency, customer, reservation_change,
reservation_status_history. Property 8, partner 1.

### 9.1 Residue I created and cannot remove

`audit_log` holds **5** `reservation.declined` rows, and `app_user` holds **2 stray test users**
alongside the stable agent and the pre-existing dev account.

**They cannot be deleted.** V19 protects `audit_log` with a trigger refusing UPDATE and DELETE;
`audit_log.actor_id` is `ON DELETE SET NULL`, so deleting a user that has written an audit row fires an
UPDATE the trigger rejects. That is the schema working exactly as an audit table should.

The two strays came from earlier iterations of a test class I later deleted, before I introduced a
**stable agent id** so repeated runs reuse one row instead of accumulating one per run. Neither is in
the set the brief requires to be zero, but they are residue and are recorded rather than glossed over.
