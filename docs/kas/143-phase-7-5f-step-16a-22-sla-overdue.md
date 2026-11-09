# PHASE 7.5F — STEP 16A.22 — SLA OVERDUE DISPLAY

**Date:** 2026-08-29
**Status:** 🟢 **COMPLETE** — frontend only, no backend change, no migration.

**Gates:** backend **158 unit + 500 integration = 658**, unchanged, `BUILD SUCCESS` · frontend **659**
(+18), 35 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **0 backend files
changed** · **no migration** (29, latest V27) · reservation-side tables **0** · `git diff --check`
clean · **no OQ changed**.

---

## 1. Contract verified

**Doc 69 §4.2** — the queue mockup, which turns out to freeze the format by example:

```
KAS-260912-4F7A  …  47m    ●    —
KAS-260912-3B21  …  6h12m  ▲    Linh
KAS-260911-9C04  …  1d 2h  ■    Minh
```

and beneath it: *"SLA: ● within promise · ▲ approaching · ■ breached — driven by config A6."*
**Doc 21 §534** repeats the same three markers.

**`SalesRequestSummaryView.slaDueAt`** is already an `OffsetDateTime` on the queue response — so
**no backend change was needed**, and none was made. The queue's permission is
`sales.request.view` (the brief said `sales.request.manage`; that is the notes route's).

---

## 2. SLA semantics — what was and was not derived

The displayed value is exactly **`now − slaDueAt`**, and only for a request the existing `slaState`
already calls `breached`. Nothing else.

**No threshold was invented.** Step 16A.19 refused to define the boundary between *within* and
*approaching*, and that refusal stands: this step adds a **measurement**, not a band. There is no
escalation level, no "critical after N hours", no colour that changes with magnitude. A five-minute
delay and a forty-day delay produce the same shape of answer, and a test pins that.

**The three output shapes are doc 69 §4.2's own**, reproduced exactly — including the space that
appears in the day form and not in the hour form:

| Elapsed | Shown |
|---|---|
| under 1h | `47m` |
| under 1d | `6h12m` |
| 1d or more | `1d 2h` — minutes dropped, as the mockup drops them |

**Only breached rows get a duration.** The mockup shows a number beside ● and ▲ too, but what that
number *means* for a non-breached row is undefined — remaining time, or age? Guessing would be the
same mistake 16A.19 avoided, so those rows show the band alone.

**No timezone rule was invented.** `slaDueAt` is parsed with `Date.parse`, exactly as the existing
`slaState` already does, and `now` is the **server clock** already threaded through the page from
`serverNow()` — the convention that exists so a wrong browser clock cannot move the banding. One clock,
already established, reused.

---

## 3. Boundary and edge cases, all explicit

| Case | Behaviour | Why |
|---|---|---|
| `slaDueAt` in the future | no duration | nothing is overdue |
| exactly `slaDueAt` | **`0m`** | `slaState` uses `now >= due`, so the badge already says breached; the duration agrees rather than contradicting it |
| in the past | elapsed duration | |
| `slaDueAt` null (A6 unset) | no duration, no crash | nothing is fabricated to fill the gap |
| unparseable timestamp | no duration | |
| terminal status | **still shown** | the existing badge does not hide on a terminal status and no document says the measurement should; hiding it would quietly rewrite the queue's history |

Sub-minute delays render as `0m`. Seconds never appear — the mockup has none.

---

## 4. Implementation

`overdueFor(request, now)` in `lib/domain/salesRequest.ts` — pure, beside `slaState`, unit-tested
directly rather than through the DOM. Rendered in the queue's SLA cell and the detail header, both
already receiving the same server `now`.

**No new component, no new route, no new API field, no new permission, no control.** The indicator
states a fact; a test asserts the SLA cell contains no button and no link.

---

## 5. Security

**Nothing changed.** No backend file was touched, so `ScopeFilter`, the queue's permission, its
ordering and its filters are all literally unmodified — the 500 integration tests that cover them ran
unchanged and pass.

A partner sees an overdue duration for exactly the rows their scoped queue already returned, because
it is computed from a field that response already carried. No id, no owner identity, no new query
parameter.

---

## 6. Tests

**+18**, all frontend (`overdue.test.tsx`), the formatter unit-tested directly and the rendering
asserted **inside the SLA cell** rather than page-wide:

null while the promise stands · null with no deadline · null on an unparseable timestamp · `0m` at the
boundary, asserted alongside `slaState` agreeing · minutes · hours and minutes · days and hours,
including minutes dropped · never seconds · no band invented · duration beside the breached badge ·
absent for within · absent for approaching · safe with no deadline · **still shown on a terminal
request** · other columns untouched · no control added · the detail header shows the same value ·
and hides it when the promise stands.

**No existing test was weakened, changed or deleted.** One of my own new tests had a wrong assumption
— `DUE − 1h` sits in the final quarter of a 24-hour window and so bands as *approaching*, not
*within* — and the **test** was corrected, since the implementation was right.

---

## 7. Database, OQ, browser

**No migration**, V1–V27 untouched, 29 total, latest V27, Flyway validated. Reservation-side tables
**0**. No seed data.

**No OQ changed.** OQ-162, OQ-163, OQ-066 remain OPEN; OQ-161 DEFERRED; A4, B24, B1, B19 untouched.

**Not browser-verified.** The dev database holds no reservations and browser verification needs
authenticated session state; the deterministic tests are the evidence for this step.

---

## 8. Next step

**`reservation.modify` is not fully unblocked.** Doc 58 §5 freezes
`POST /sales/requests/{reference}/modify` with `reservation.modify` and *"re-checks, re-prices,
**re-versions snapshot**"*, and `reservation_change` exists in V14. But re-pricing a request the guest
already saw raises a question no document answers: whether the guest's original quote is honoured or
the new price applies. That is a commercial decision, so **modify should be briefed only after an
owner ruling on which price governs**.

The smallest genuinely frozen alternative: **`GET /sales/requests/{reference}` already returns
everything the workspace needs except the request's own `leadSource`**, which doc 69 §4.2 makes *"a
first-class column, not a detail"* and which the queue filter now accepts but no response exposes. It
is one column on an existing DTO, one already-populated enum, and no decision — though it is small
enough that bundling it with a larger slice may be better use of a step.
