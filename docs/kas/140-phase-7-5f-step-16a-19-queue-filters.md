# PHASE 7.5F — STEP 16A.19 — SALES REQUEST QUEUE FILTERS

**Date:** 2026-08-28
**Status:** 🟡 **PARTIAL — three of doc 58 §5's five filters shipped, plus one SLA band. Two withheld.**

**Gates:** backend **158 unit + 475 integration = 633** (+17), `BUILD SUCCESS` · frontend **607**
(+17), 32 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration**
(29, latest V27) · every reservation-side table **0** · `git diff --check` clean · **no OQ changed**.

---

## 1. Filter matrix

| Filter | Status | Source of semantics | Note |
|---|---|---|---|
| **salesStatus** | 🟢 shipped | `sales_status` enum, V1:49 — nine values | Unknown value → **400** naming the parameter |
| **leadSource** | 🟢 shipped | `lead_source` enum, V1:39 — ten values | S1 records `WEBSITE`, so it matches real rows today |
| **property** | 🟢 shipped | `property.slug`, already in every queue row | By slug, never by id — no internal identifier in a URL |
| **slaState** | 🟡 `breached` only | Doc 69 §127 / doc 21 §534 name three bands | `within` and `approaching` are **refused**, see §2 |
| **owner** | 🔴 withheld | — | Doc 134's blocker, see §2 |

Ordering is untouched: `requested_at ASC`, doc 69 §4.2's *"a request model fails by neglect, not by
backlog order."* No sort or page parameter was added — the backend accepts neither, and this project
still has no pagination convention (OQ-158).

---

## 2. What was withheld, and why

**`owner`** — doc 134 established that no endpoint, response field or session value in this repository
yields an assignable owner's identity. A filter would need either a picker that cannot be built or a
raw user id typed into a URL. The parameter is simply not mapped; a test asserts that supplying it
changes nothing, so no partial owner filtering leaked in.

**`slaState=within|approaching`** — doc 69 §127 names three bands *"driven by config A6"*, but **no
document freezes the threshold separating the first two**. The frontend's existing badge uses "the
last quarter of the window", which this author chose in an earlier step; that is defensible as a tint
and not as a filter. A filter is a stronger commitment — an agent filtering "approaching" gets a
worklist they will act on — so the server **refuses** those two values with a 400 rather than
promoting an invented threshold into the API contract.

**`breached` is exact and shipped**: `sla_due_at IS NOT NULL AND sla_due_at < now()`. A request with no
deadline (A6 unset) is *unknown*, not breached, and NULL correctly excludes it.

---

## 3. Backend

`GET /api/v1/admin/sales/requests` — same route, same permission (`sales.request.view`), same
response shape, same ordering. Every parameter is optional, and omitting all of them returns exactly
what the route returned before (pinned by a test).

`SalesQueueFilter` is a record with three nullable strings and a boolean. Each clause is a **fixed SQL
fragment from the repository class**; only values are bound, so nothing a caller sends becomes SQL.
Validation happens in the service against the two frozen enums — an unknown value is a **400** naming
the parameter, never a 500 from a failed cast, and never a silently ignored filter that would show an
agent a list they did not ask for.

**`property` is deliberately not validated.** A slug that does not exist, or belongs to another
partner, simply matches nothing once the scope filter applies. Refusing it would tell the caller which
slugs are real.

---

## 4. Security

The `ScopeFilter` predicate is ANDed into the same statement, **before** any filter clause. So naming
another partner's property slug narrows the caller's own rows to nothing — it cannot widen. Tested
three ways: their slug returns empty, `salesStatus` returns only mine, `leadSource` returns only mine.

Also tested: an unauthenticated filtered request is **401** · a SQL fragment in an enum parameter is a
refused *value* (400), and in the unvalidated `property` parameter is a bound parameter that matches
nothing · a filtered response carries no field an unfiltered one does not — no `salesOwnerId`, no
`partnerId`, no `propertyId`, no `leadSource`, no guest email.

All eight architecture and security guards pass unchanged.

---

## 5. Frontend

**A plain GET form**, so filtering works without JavaScript — the same approach the guest availability
search already uses. Submitting navigates with the values as search parameters and the server renders
the filtered queue, so **the URL is the state**: a refresh, a bookmark and a shared link all reproduce
it, and there is nothing to drift out of sync with the address bar. Clearing is a `next/link` to the
unfiltered URL rather than a form reset, which would restore the controls and leave the results
filtered.

Property options come from `propertyList()`, which the partner layout already loads and which is
request-memoised — so the select shows **names, not slugs or ids**, at no extra cost. A test asserts no
UUID appears anywhere in the markup.

`slaState` is **one checkbox**, not a three-way select: offering three options would promise a
distinction the contract has not made.

Four controls, each with a visible `<label>` and a 44px target, wrapping to a single column at 375px.
Keyboard order is tested end to end.

---

## 6. Tests

**Backend +17** — `SalesQueueFilterIT`: unfiltered unchanged · blank parameters are absent, not empty
matches · each filter individually · terminal states filterable · combinations AND rather than OR ·
ordering survives filtering · unknown enum → 400 with the field named · the two unfrozen SLA bands
refused · SQL-injection attempts are refused values · `owner` changes nothing · cross-partner
isolation ×3 · unauthenticated 401 · no extra fields exposed.

**Frontend +17** — `queueFilters.test.tsx`: URL parsing (absent, empty, unknown passed through,
repeated parameter, `slaState` narrowed) · what the client sends · a refused filter surfaces as an
**error state, not an empty queue** — an empty list would read as "no requests match", a different and
wrong statement about the partner's business · the bar is a GET form · both enum vocabularies present ·
properties named not slugged, no UUID in markup · no owner control and exactly three selects · breached
is a checkbox · active filters reflected back · clear link only when filtered · keyboard order · every
control labelled.

**No existing test was weakened, changed or deleted.**

---

## 7. Database, OQ, browser

**No migration** — 29 total (27 versioned + 2 repeatable), latest V27, none modified. After the suite
every reservation-side table is **0**.

**No OQ changed.** OQ-158 remains the open record of the missing pagination convention; this step did
not touch it, and adding filters without paging does not resolve it.

**Not browser-verified.** The page needs an authenticated partner session and the dev database
deliberately holds zero reservations, so a screenshot would show an empty filtered list and prove
nothing the 607 tests do not. Stated rather than dressed up.

---

## 8. Next step

**S7 alternatives is still blocked** (B1/B19), assignment UI on doc 134, and everything guest-facing on
OQ-162 — so the remaining ready work is inside the Partner Console.

The strongest candidate: **the request detail's status timeline.** `reservation_status_history` now
carries every transition this project implemented — assign, check, contact, win, decline, cancel,
expire — with actor, reason and timestamp, and **nothing reads it back**. Doc 58 §4 names a "stay
detail + status timeline" for the guest surface; the partner equivalent needs no new decision, no
migration and no owner input, and it turns six steps of write-only history into something an agent can
actually see.
