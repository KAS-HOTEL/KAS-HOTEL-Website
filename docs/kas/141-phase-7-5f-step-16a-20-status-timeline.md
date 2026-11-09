# PHASE 7.5F — STEP 16A.20 — PARTNER CONSOLE STATUS TIMELINE

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — six steps of write-only history is now readable.

**Gates:** backend **158 unit + 486 integration = 644** (+11), `BUILD SUCCESS` · frontend **622**
(+15), 33 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration**
(29, latest V27) · every reservation-side table **0** · `git diff --check` clean · **no OQ changed**.

---

## 1. Contract verified

`reservation_status_history` (V14:1): `field` (`status_field` = SALES | STAY), `from_status`,
`to_status`, `actor_id` (nullable, `ON DELETE SET NULL`), `actor_type` (SYSTEM | ADMIN | CUSTOMER),
`reason`, `note`, `created_at`. Populated by S1 and every transition Steps 16A.9–16A.16 built.

**Authorization is the detail read's own.** No new endpoint, no new permission: the timeline is a
field of `GET /admin/sales/requests/{reference}`, so whoever may open the request may see its history,
and whoever may not gets the same 404 they always did. There is no public history route.

---

## 2. What is exposed, and what is not

**`actor_id` is not selected at all.** `app_user` has no name column; its only human-readable
identifier is an email address, and no frozen document permits disclosing staff identity between
colleagues — doc 134 §5 recorded that as open when it blocked the assignment UI, and this view does
not settle it by the back door. Each entry reports **`actorType`** — whether a person or the system
acted — which is what a timeline needs.

**Status names are not translated.** `REQUESTED`, `WON`, `EXPIRED` appear exactly as recorded, the
same vocabulary the status badge already uses. A second friendly name per state is two names that can
drift apart in meaning. Only the `actor_type` enum is translated for display, which the console's
existing convention permits.

An empty timeline renders **"the history could not be recorded"**, not a bland empty state: S1 writes
an entry for every request, so empty means a record is missing rather than absent.

---

## 3. A real defect this step exposed

**Every history row shared one timestamp, so the log could not be ordered.**

The ordering test failed with entries in random order. `created_at` defaults to **`now()`, which is
the *transaction* timestamp** — so every row written inside one transaction carries an identical
value and `ORDER BY created_at` degenerates into ordering by a random `id`. The transactional test
harness made it total, but it was never only a test artifact: **S10 writes two rows in one
transaction** — sales `WON` and stay `CONFIRMED` — and would tie in production too.

**Fixed in the code, not the test.** The three history writers now state `clock_timestamp()`
explicitly, which advances within a transaction, so an event log records when each event actually
happened. The **column default stays `now()`** — no migration, and no change forced on a future
writer.

Ordering is `created_at ASC, id ASC`; the tiebreak remains for genuinely simultaneous rows, and a test
asserts two consecutive reads return byte-identical responses.

---

## 4. Backend

`SalesRequestRepository.history(reservationId, scope)` — read-only, parameterised, the same
`reservation → property → partner` join every other method applies. `SalesRequestDetailView.Event`
carries the seven fields above. One extra scoped read rather than a join: the history has a different
cardinality from the lines, and joining both would multiply the rows.

**No mutation, no inventory interaction, and no audit row is written by reading** — a test captures
history count, `direct_committed` and hold count, reads twice, and asserts all three unchanged.

---

## 5. Frontend

`SalesRequestTimeline` — a semantic `<ol>` inside the existing `Card`, using the existing `Badge`,
tokens and spacing. Placed between the facts grid and the action panels: what happened, then what to
do next. It displaces no action panel, and it is the whole point of the page once a request is
terminal and nothing can be done.

Everything rendered is server-derived. Nothing infers a transition from the current status, fills a
gap, reorders, or adds an optimistic entry — a test renders a `WON` request whose server history holds
one entry and asserts exactly one row appears.

Wraps to one column at 375px; `<time dateTime>` is machine-readable; the list is ordered so a screen
reader announces the sequence.

---

## 6. Tests

**Backend +11** (`SalesRequestTimelineIT`): S1's opening entry · the full six-row lifecycle in order,
including S10's SALES and STAY pair · reason present on a decline and absent on a check · cancel
distinguishable from decline · **expiry recorded as SYSTEM** · agent transitions as ADMIN · **no actor
id, email or internal identifier anywhere in the response** · cross-partner 404 · unknown 404 ·
unauthenticated 401 · reading mutates nothing · order stable across reads.

**Frontend +15** (`timeline.test.tsx`): entries in recorded order · status names untranslated · the two
lifecycles distinguished · actor types translated, unknown ones left alone · reason shown only where
given · from-status omitted on a first entry · machine-readable timestamp · no internal identifier ·
long reason rendered in full · missing history stated as missing · rendered on the detail page ·
nothing inferred · existing action panels still work · shown on a terminal request.

### 6.1 Two proxy assertions corrected, both narrowed rather than weakened

`salesRequest.test.tsx` asserted `getByText('REQUESTED')` page-wide to mean *"the header shows the
current status"* — a proxy that worked only while the string appeared once. It now legitimately appears
in the timeline too. **Narrowed to the header**, which is a *stronger* assertion than the original: it
pins where the status appears, not merely that it does.

One of my own new assertions had the same flaw — `getAllByRole('listitem')` caught the room-type list
as well — and was scoped to the timeline's own `<ol>`.

**Five existing fixtures gained a `timeline` field.** The type system caught them, which is the pinned
DTO working. Each carries one realistic S1 entry rather than an empty list, because every request has
one. **No assertion was weakened or deleted.**

---

## 7. Database, OQ, browser

**No migration.** 29 total (27 versioned + 2 repeatable), latest V27, none modified. Every
reservation-side table **0** after the suite.

**No OQ changed.** Staff identity disclosure stays open exactly where doc 134 §5 left it — this step
deliberately did not need it.

**Not browser-verified.** The page needs an authenticated partner session and a reservation with
history; the dev database deliberately holds zero reservations, so a screenshot would show an empty
page and prove nothing the 622 tests do not.

---

## 8. Self-audit

Read-only? **Yes** — one SELECT, asserted to mutate nothing. Inventory touched? **No.** UUID leaked?
**No** — `actor_id` is not selected, asserted absent from the response and the markup. Cross-partner
leakage? **No** — the detail read's own 404. Existing permission preserved? **Yes**, no new one added.
Existing tests preserved? **Yes** — two proxies narrowed and made stronger, none weakened. Migration?
**None.** Invented business semantics? **No** — no new status, label, event or rule. Frontend-generated
history? **No** — a test proves nothing is inferred. Stable ordering? **Yes**, and the defect that
prevented it is fixed. Build, lint, typecheck? **All green.** `git diff --check`? **Clean.**

---

## 9. Next step

**The queue's SLA column, driven by the same server clock as the timeline.**

The queue already bands SLA client-side using `slaState()`, whose "approaching" threshold this author
chose — Step 16A.19 refused to promote it into a filter for that reason. The honest slice is smaller
and needs no decision: the backend already returns `slaDueAt`, so the queue can show **how overdue**
a breached request is, which is exact, while leaving the unfrozen band alone.

If a larger slice is wanted instead: **`GET /admin/sales/requests/{reference}/notes`** (doc 58 §5,
`sales.request.manage`, *"Internal. No guest surface exists"*). `reservation_note` exists in V14, is
unused, and the route is frozen — the same shape as the contact log, which shipped cleanly in 16A.15.
