# PHASE 7.5F — STEP 16A.16 — S13 HOLD EXPIRY

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — the expiry sweep runs, and the hold lifecycle is now closed at both ends.

**Gates:** backend **158 unit + 458 integration = 616**, `BUILD SUCCESS`, 0 failures · frontend **590**,
31 files, 22 routes, lint 0 problems, build clean, **0 production changes** · **no migration**
(29 total, latest V27, 0 failed) · every reservation-side table **0** · `git diff --check` clean ·
**no OQ changed**.

---

## 1. Contract verified

Doc 55 §5.1 states the algorithm as pseudocode and **freezes the cadence** — *"every 5 minutes"*. No
owner decision was owed, so nothing stopped.

| | |
|---|---|
| Selection | `WHERE status = 'ACTIVE' AND expires_at < now()`, grouped by reservation |
| Per group | lock inventory nights `ORDER BY (room_type_id, date)` → `direct_committed -= quantity` → `hold.status = 'EXPIRED', released_at = now()` |
| Reservation | *"if this was the last REQUEST hold on a reservation: transition salesStatus → EXPIRED (S13)"* |
| Doc 54 S13 | `any non-terminal → EXPIRED`, actor **Y** (system), audit `reservation.expired` |
| Idempotence | doc 55: *"a hold already EXPIRED/RELEASED/CONVERTED is skipped, so a re-run cannot double-decrement"* |

**Everything the schema needed already existed** — `expires_at`, the `EXPIRED` value of `hold_status`,
`released_at`, `release_reason`, `hold_expiry_sweep_idx`, and B2 supplied at `PT24H`. **No migration
was created and none was needed.**

---

## 2. Implemented

`HoldExpiryRepository` · `HoldExpiryWorker` (one transaction per reservation) · `HoldExpiryService`
(the batch loop) · `HoldExpiryScheduler` (`@Scheduled`, thin).

**`EXPIRED`, not `RELEASED`** — `hold_status` carries both and an expiry is not an agent releasing
something. `released_at` is set because `hold_released_has_timestamp` requires it of every non-ACTIVE
hold. **`expires_at` is never written**: it is the reason the row was swept.

The reservation transition writes a `reservation_status_history` row with **`actor_type = 'SYSTEM'`
and a null `actor_id`**, and an audit event with a null actor and role. Doc 54 gives S13 the actor
**Y** — a timer did this, and the record says so rather than naming whichever person happened to be
around.

Only `REQUEST` holds count toward *"the last hold"*, and only reservations are swept: an
`ALTERNATIVE_OFFER` hold attached to an inquiry has no S7 to create it and no transition here, so the
sweep leaves it alone rather than half-processing it.

---

## 3. Two real defects the tests caught

**Both were mine, both were found by the concurrency tests, and the code was fixed rather than the
test.**

### 3.1 A double decrement — the missing reservation lock

The first implementation locked only the inventory rows. `expiryRacesCancel` failed with a
`direct_committed >= 0` CHECK violation.

In READ COMMITTED, an `UPDATE` that blocks on a row lock re-evaluates its predicate **for the target
table only**. The decrement targets `room_type_inventory_day` and *joins* `inventory_hold`, so after
unblocking it could still read a hold as ACTIVE from a snapshot taken before the other transaction
committed — and decrement a second time.

**Fix:** take `SELECT … FOR UPDATE` on the **reservation row first**, exactly as win, decline and
cancel already do. That makes the reservation the single point at which every terminal transition
serialises. The CHECK constraint is what turned a silent oversell into a loud failure.

### 3.2 A `@Transactional` that never applied

`concurrentExpiriesDecrementOnce` still double-decremented after 3.1. The cause: `sweep()` called
`this.expireOne(...)` — a **self-invocation bypasses Spring's proxy**, so the annotation did nothing.
Every statement ran in its own auto-commit transaction and released the reservation lock the instant
the `SELECT … FOR UPDATE` returned.

**Fix:** the transactional unit became its own bean, `HoldExpiryWorker`. The transaction is the unit
of correctness here, so it has a type rather than an annotation that silently does nothing.

---

## 4. Scheduler

`@EnableScheduling` on `KasApplication`; one `@Scheduled` method.

`fixedDelayString = "${kas.holds.expiry-sweep.interval:PT5M}"` — **PT5M is doc 55 §5.1's own number**,
not a chosen one. The property exists so an operator can slow it and the test profile can switch it
off, not so a cadence can be picked casually. **`fixedDelay`, not `fixedRate`**: the gap is measured
from the end of a pass, so a slow sweep cannot queue a second on top of itself.

The method holds no business logic and no transaction, and **swallows exceptions** — an exception
escaping a `@Scheduled` method silently stops that schedule for the life of the process, and an expiry
that never runs again holds inventory out of sale forever.

**Off in the test profile** (`kas.holds.expiry-sweep.enabled: false`). A background job mutating
inventory on a timer would make every other integration test non-deterministic — a hold could vanish
mid-assertion.

**No lock table, leader election or advisory lock was added.** Two instances running this concurrently
is safe by the frozen design: the `status = 'ACTIVE'` predicate on every statement plus the row locks,
proven by `concurrentExpiriesDecrementOnce`.

---

## 5. Security and scope

`HoldExpiryRepository` deliberately does **not** implement `ScopedRepository`. It serves no caller —
doc 54 gives S13 the actor **Y** — and by design must reach every partner's expired holds. Handing it
a synthetic global scope would dress an unscoped job up as a scoped one and make the guard mean less
everywhere else. `ScopeEnforcementStructureTest` passes: its `unmarkedRepositories` rule covers the
`partner` and `property` packages, and `unscopedMethods` covers classes that *are* marked.

What replaces the scope: **nothing here takes an identifier from outside.** Every reservation id comes
from the repository's own selection query, and every subsequent statement is bounded by one of them.
No HTTP surface was added, so there is no authorization to bypass. **All eight architecture and
security guards pass unchanged.**

---

## 6. Tests

**+18** — backend unit 155 → **158**, integration 443 → **458**.

`HoldExpiryIT` (12): expired hold swept and rooms returned · `expires_at` survives, `released_at` and
reason set · history says `SYSTEM` with a null actor · unexpired hold untouched · **CONVERTED hold
never expired** (a won reservation's rooms are not handed back by a timer) · already-RELEASED hold
untouched · sweeping twice decrements once · many reservations across properties · bounded to expired
holds only · expired rooms immediately re-sellable (V26's ACTIVE-scoped index) · nothing sent · the
sweep is off in the test profile.

`ReservationConcurrencyIT` 14 → **17**: two expiry workers race one hold · expiry races WIN (both
orders legal, each with one correct end state — never a hold left ACTIVE, never both WON and EXPIRED)
· expiry races CANCEL (released exactly once, one terminal transition not two).

`HoldExpirySchedulerTest` (3): delegates · a failure does not kill the schedule · the cadence is
`PT5M` as a `fixedDelay`.

**No existing test was weakened, changed or deleted.**

---

## 7. Frontend

**0 production changes.** S13 defines no user-triggered endpoint, so no control was invented. The
detail view's terminal set already contains `EXPIRED`, so an expired request renders as terminal with
no actions — the existing contract already covered the resulting state. 590 tests, 31 files, 22
routes, all unchanged.

---

## 8. Database

**No migration.** 29 total (27 versioned + 2 repeatable), latest **V27**, 0 failed, none modified.
After the full suite every reservation-side table is **0** — reservation, inventory_hold,
reservation_status_history, reservation_contact_log, email_log — and property 8, partner 1.

---

## 9. OQ

**None changed, none raised.** OQ-162, OQ-163, OQ-066 remain `OPEN`; OQ-161 `DEFERRED`; OQ-171, 172,
173, 174, 017 `CLOSED`. Doc 55 §5.1's *"after commit: notify guest and sales owner"* and doc 54 S13's
*"warning sent before expiry"* are **not** delivered — doc 117 §8.1 freezes that a transition owes the
effect and the record, not delivery. A test asserts `email_log` stays empty.

---

## 10. Self-audit

Invented an expiry duration? **No** — B2, already supplied. A cadence? **No** — PT5M is doc 55 §5.1's.
Modified a migration? **No.** Created an unnecessary one? **No — created none.** Can a hold expire
twice? **No** — the ACTIVE predicate plus the reservation lock; tested. Can `direct_committed`
decrement twice? **No** — the defect that did is fixed and pinned by a test; the CHECK is the
backstop. Expiry races WIN safely? **Yes** — tested, both orders. CANCEL? **Yes** — tested. Can a
CONVERTED hold expire? **No** — tested. Can `expires_at` become NULL? **No** — nothing writes it;
tested. Can an expired hold stay in active demand? **No** — it leaves ACTIVE, and
`v_active_hold_demand` filters on that. Unrelated reservation state changed? **No** — the terminal
exclusion is in the UPDATE itself. Bypassed `ScopeFilter` or authorization? **No** — §5. Weakened a
guard? **No** — all eight pass. Invented a notification? **No.** Modified the frontend? **No.**
Weakened a test? **No.** Altered an OQ? **No.** Full regression passes? **Yes.**

---

## 11. Next step

**The guest-facing `/me/stays` surface.** Doc 58 §4 freezes `GET /me/stays` and
`POST /me/stays/{reference}/cancel`, and the reservation lifecycle now has enough states for a guest
to see something real. It is also S12's customer half, which doc 54 lists as actor "C / S" and which
is the only part of an implemented transition still missing — though its post-`WON` behaviour gates on
config **A4**, which should be checked before the step is briefed.
