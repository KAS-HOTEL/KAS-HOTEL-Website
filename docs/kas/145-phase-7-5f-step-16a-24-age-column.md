# PHASE 7.5F — STEP 16A.24 — THE SALES REQUEST QUEUE'S AGE COLUMN

**Date:** 2026-08-29
**Status:** 🟢 **COMPLETE** — frontend only, no backend change, no migration.

**Gates:** backend **158 unit + 505 integration = 663**, unchanged, `BUILD SUCCESS` · frontend **692**
(+24), 37 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **0 backend files
changed** · **no migration** (29 validated, latest V27) · reservation-side tables **0** ·
`git diff --check` clean · **no OQ changed**.

---

## 1. Contract verified

**Doc 69 §4.2:119** — the queue mockup, whose header line names the column and fixes its position:

```
 Ref              Guest         Lead source  Property   Stay            Rooms  Value        Age    SLA  Owner
 KAS-260912-4F7A  Nguyen Van A  FACEBOOK     Milestone  12–14 Sep (2n)   3    12.450.000₫  47m    ●    —
 KAS-260912-3B21  Tran Thi B    WEBSITE      Sonata     20–22 Sep (2n)   1     3.200.000₫  6h12m  ▲    Linh
 KAS-260911-9C04  J. Smith      ZALO         Passion    01–05 Oct (4n)   2     8.900.000₫  1d 2h  ■    Minh
```

**Doc 21 §5.1:519** repeats the same header and the same three values, independently.

Two things this step found that the brief did not carry, both of which settled a decision rather than
opening one:

- **Doc 21:589** — *"**SLA visibility** | **Age and SLA state on the queue and the workspace**;
  escalation notification on breach."* Age is frozen on **both** surfaces, so the workspace got it
  too. **Doc 21:547** shows the workspace phrasing — `⦿ New · 47m old · within promise · unassigned`
  — and doc 69 §4.3:138 the same line without the word.
- The same line pairs *"Age **and** SLA state"* as **two separate things**. That is the contract's own
  statement that age is not a band, and it is why nothing in this step has a threshold.

**`requestedAt` is already on the response** — `SalesRequestSummaryView.requestedAt`, an
`OffsetDateTime`, populated at S1 by `ReservationRepository.insertReservation`. No backend change was
needed and none was made.

---

## 2. Age semantics — the whole of it

```
age = now − requestedAt
```

`now` is **the server clock** — `serverNow()`, already awaited by both pages and already threaded into
`slaState`. One clock for the band and the age, so they cannot disagree, and a wrong browser clock
cannot age a request.

**Formatted by Step 16A.22's formatter, unchanged.** `formatOverdue` was renamed `formatElapsed` and
is now shared by `overdueFor` and the new `ageFor`; **not one line of its behaviour changed**, and its
existing tests still pin it. Doc 69 §4.2's `47m` / `6h12m` / `1d 2h` are the Age column's own examples,
so the shapes were already right — that was the misattribution doc 144 §2 corrected.

| Elapsed | Shown |
|---|---|
| under 1h | `47m` |
| under 1d | `6h12m` |
| 1d or more | `1d 2h` — minutes dropped, as the mockup drops them |

**What was not invented.** No band, no "old", no "critical after N hours", no escalation, no colour
that changes with magnitude, no cap or `30d+`, no business-day arithmetic, no timezone rule
(`Date.parse` on the server's own ISO string, exactly as `slaState` already does), no rounding the
formatter did not already do. A four-hundred-day request and a five-minute one produce the same shape
of answer, and a test pins that.

---

## 3. Edge cases, all decided by something that already existed

| Case | Behaviour | Why |
|---|---|---|
| just arrived | `0m` | the formatter's floor, not a special case |
| 47m / 6h12m / 1d 2h | as the mockup | doc 69 §4.2 |
| very large | `400d 7h` | the formatter's existing behaviour, uncapped |
| **`requestedAt` in the future** | **`0m`** | `formatElapsed` already clamps at zero (`Math.max(…, 0)`). **Preserved, not invented** — the brief's stop condition asked for exactly this. Reachable only through clock skew between the database and the renderer, since `requested_at` is written server-side at S1 |
| unparseable timestamp | `—` | `reservation.requested_at` is **nullable** in V12:83 and `slaState` is already defensive about the same field. A dash, never a fabricated duration |
| terminal request | **still shown** | the SLA badge does not hide on a terminal status and no document says the measurement should. Age is a fact about how long the guest waited; hiding it would rewrite the queue's history |

Sub-minute ages render as `0m`. Seconds never appear — the mockup has none.

---

## 4. Implementation

`ageFor(request, now)` in `lib/domain/salesRequest.ts` — pure, beside `slaState` and `overdueFor`,
unit-tested directly rather than only through the DOM.

**The queue column** sits between `Giá trị` and `Hạn phản hồi`, which is doc 69 §4.2's position
exactly. It is a cell of the existing `Table` primitive, so it inherits the real `<th scope="col">`
relationship the primitive already provides — no grid of divs, no redesign, no new component.

**The workspace** shows the same value in its header line, labelled, beside the status and SLA badges
— doc 21:589's second surface.

The label is **`Tuổi yêu cầu`**. Doc 69:326 gives the console one language in V1 (config A12) and
every label already on this screen is Vietnamese, so this follows them. It is a **neutral** rendering
of doc 21's "Age" — it stays truthful on a `WON` row, where "waiting" would not.

**No tint.** The duration carries `--text-secondary` and nothing else: the badge beside it is the
thing with a state, and colouring the number would read as a threshold nobody has set.

**Not added:** no route, no API field, no permission, no query parameter, no control, no sort, no
filter. A test asserts the cell contains neither a button nor a link.

---

## 5. Security

**No backend file was touched**, so `ScopeFilter`, the queue's permission (`sales.request.view`), its
ordering and its filters are literally unmodified — the 505 integration tests covering them ran
unchanged and pass, as do all eight architecture and security guards.

A partner sees an age for exactly the rows their scoped queue already returned, because it is computed
from a timestamp that response already carried. No internal identifier, no staff identity, no guest
surface, no mutation, no inventory or lifecycle effect. Nothing new is sent to the server, so there is
no new input to validate.

**Ordering is untouched.** `ORDER BY r.requested_at ASC, r.reference ASC` stays in the SQL; the table
renders the rows it is given in the order it is given them, and a test feeds three rows whose ages
would sort differently and asserts the DOM order is the input order. The column makes the existing
ordering *legible*; it does not perform it.

---

## 6. Tests

**+24, all frontend** (`age.test.tsx`), the formatter's new caller unit-tested directly and every
rendering assertion scoped to the Age cell — located through its own header rather than a literal
index, so the test says "the Age column", not "the eighth column".

`0m` on arrival · minutes · hours and minutes · days and hours, minutes dropped · 400 days uncapped ·
never seconds · null on an unparseable timestamp · **`0m` under clock skew, the existing clamp pinned**
· age and overdue proven to be different measurements · the column between Value and SLA · the three
mockup shapes rendered · measured against the passed-in server clock, not `Date.now()` · a dash rather
than a fabricated duration · no control · **shown on a terminal request** · **age does not band** — a
20-hour-old request inside a four-day promise is still `within` · the badge unchanged across three
ages · **ordering is the backend's**, with each row carrying its own age · lead source still third and
SLA still last · every other column intact · the workspace age · age and overdue side by side, both
labelled · age with no overdue · the workspace otherwise untouched · no internal identifier.

**No existing test was weakened, changed or deleted — none needed to be.** Age went in where doc 69
puts it, which left both existing cell-locating helpers correct by construction: `leadSource.test.tsx`
takes cell `[2]` and lead source is still third; `overdue.test.tsx` takes the last cell and SLA is
still last, because the queue has no Owner column (doc 134). That the two suites still pass unmodified
is itself the evidence that the column landed in the right place.

---

## 7. Database, OQ, browser

**No migration.** V1–V27 untouched; Flyway validated **29** migrations (27 versioned + 2 repeatable),
latest **V27**. Reservation-side tables **0**. No seed data.

**No OQ changed.** OQ-162, OQ-163, OQ-066 remain OPEN; OQ-161 DEFERRED; A4, B24, B1, B19 untouched.

**Not browser-verified.** The dev database holds no reservations, so the queue would render its empty
state and prove nothing about the column; browser verification also needs authenticated partner
session state. Seeding commercial data to obtain a screenshot was explicitly out of bounds and was not
done. The 24 deterministic tests are this step's evidence.

---

## 8. Next step

**`reservation.modify` is still blocked, and the block is still commercial** — unchanged from doc 144
§8. Doc 58 §5 freezes the route and `reservation_change` exists in V14, but nothing states **which
price governs when a modification re-prices a request the guest has already seen**. That is an owner
decision and should precede the brief.

Doc 69 §4.2's queue is now complete except for one column: **`Owner`**. It stays blocked for the reason
doc 134 gave and Steps 16A.11 and 16A.13 reported twice — `app_user` has no name column, its only
human-readable identifier is an email address, and no frozen document permits disclosing staff identity
between colleagues. That is a decision, not an implementation.

The smallest genuinely frozen and unblocked slice remaining on this surface is the queue's **saved
views** — doc 69 §4.2's tab strip `⦿ New (7) · Mine (3) · Breaching (1) · Follow-up due (5) ·
Awaiting payment · All`. Three of the six are pure re-expressions of filters the backend already
accepts and Step 16A.19 already implemented:

| Tab | State |
|---|---|
| **New** | frozen — `salesStatus=REQUESTED` |
| **Breaching** | frozen — `slaState=breached`, the one band with a definition; already a checkbox |
| **All** | frozen — no filter |
| Mine | **blocked** — needs the sales owner, doc 134 |
| Follow-up due | **blocked** — `next_follow_up_at` exists on `sales_inquiry` (V11:48), a different entity; `reservation` has no such column |
| Awaiting payment | **blocked** — `reservation` carries no payment state, and the B12/OQ-017 ruling made V1 pay-at-hotel |

One caveat that belongs in the brief rather than in the discovery: **the counts in `(7)` cannot be
implemented.** The backend offers no count endpoint and no pagination, so a per-tab count would mean
either five extra list calls or a number invented on the client. Tabs without counts are the honest
shape; a step that ships the three frozen tabs and says plainly why the other three and the counts are
absent is the right size.
