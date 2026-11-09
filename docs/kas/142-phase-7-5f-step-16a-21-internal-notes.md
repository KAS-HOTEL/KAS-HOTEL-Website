# PHASE 7.5F — STEP 16A.21 — INTERNAL NOTES

**Date:** 2026-08-29
**Status:** 🟢 **COMPLETE** — agents can write down what they know.

**Gates:** backend **158 unit + 500 integration = 658** (+14), `BUILD SUCCESS` · frontend **641**
(+19), 34 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration**
(29, latest V27) · every reservation-side table **0** · `git diff --check` clean · **no OQ changed** ·
no commit, no push.

---

## 1. Contract verified

**Doc 58 §5:252** — `GET/POST /sales/requests/{reference}/notes` · `sales.request.manage` ·
*"Internal. No guest surface exists."*

**V14:46** — `reservation_note (id, reservation_id, admin_id, body, created_at)` with
`CHECK (length(btrim(body)) > 0)` and index `(reservation_id, created_at DESC)`. **No migration was
needed and none was created.**

**V14:5-7**, the table's own boundary note: internal notes and guest-visible messages are *"TWO
SEPARATE TABLES, not one table with a visibility flag."*

**Doc 21 §592** freezes the UI: *"🔒 Distinct colour, lock icon, explicit 'Internal — never shown to
the guest' label."* **Doc 21 §604, CONFIRMED:** *"The public customer must never see internal notes."*

Doc 58 defines **no** response shape, request body, ordering, edit or delete behaviour beyond the two
verbs. So the implementation is create + read, and nothing else.

---

## 2. What was deliberately not built

**No author is returned.** `reservation_note.admin_id` is written on every row and no endpoint
discloses it. `app_user` has no name column, its only human-readable identifier is an email address,
and doc 134 §5 left staff-identity disclosure open — the status timeline withheld the same field one
step ago for the same reason. The authorship is kept in the record and waits for a ruling.

**No editing, deleting, categories, priorities, tags, mentions, attachments or pinning.** Doc 58 gives
the route two verbs; each of those would be a rule nobody has written.

**No visibility flag**, because V14 deliberately made a second table rather than one — there is
nothing here to toggle.

---

## 3. Backend

`GET /notes` → `SalesRequestNoteView(body, createdAt)[]`, **newest first**: V14's own index is
`(reservation_id, created_at DESC)`, which is the order the table was built to be read in. `id` breaks
a tie so repeated reads agree, and a test asserts two reads are byte-identical.

`POST /notes` → **204**, matching every other mutation on this controller; doc 58 states no response,
and the caller re-reads.

Both are scoped by the same `reservation → property → partner` join every other method uses, and the
write is an `INSERT … SELECT` behind that join — the row cannot be written for a reservation the
caller cannot reach, and `reservation_id` comes from the query rather than the caller.

**`admin_id` is the session and `created_at` is the server's.** Neither is accepted from the caller: a
note that could name someone else as its author, or claim a time it was not written, is not a record.
`fail-on-unknown-properties` turns any attempt into a **400**, tested for `adminId`, `createdAt`,
`reservationId` and `partnerId`.

Notes are permitted in every state including terminal ones — doc 54 freezes `salesStatus`, not the
team's ability to write down what happened afterwards.

---

## 4. The same latent defect, found again

`reservation_note.created_at` defaults to **`now()` — the transaction timestamp** — so three notes
written in one transaction tied, and "newest first" fell back to a random uuid. Step 16A.20 found this
in `reservation_status_history`; here it is again in the second append-only table.

**Fixed the same way:** the insert states `clock_timestamp()`, which advances within a transaction.
The column default stays `now()`, so **no migration** and nothing forced on a future writer.

`reservation_contact_log` and `reservation_assignment` have the same default and are not yet read in
an ordered way — worth the same one-line fix when either is.

---

## 5. Frontend

`InternalNotesPanel` — a client component on the request detail, below the timeline.

**Doc 21 §592's lock affordance is implemented as specified**: the 🔒, a distinct warning-toned band,
and the explicit sentence *"Nội bộ — khách không bao giờ nhìn thấy nội dung này."* — shown **before**
the agent types, so nobody writes here believing the guest will read it.

**Notes are not timeline entries.** Doc 54's history is lifecycle transitions; a note is an agent's own
context. They live in separate tables, separate routes and separate panels, and a test asserts a note's
text never appears inside the timeline's `<ol>`.

Empty and failed are **different states**: "nobody has written anything" and "the notes could not be
loaded" are different facts, and showing the first when the second is true would hide a problem.

A failed save **keeps what the agent typed**. Submission guards on state rather than the disabled
attribute; success clears the box only after the server accepted it, then `router.refresh()` re-reads
rather than appending locally. `white-space: pre-wrap` keeps an agent's own line breaks.

---

## 6. Tests

**Backend +14** (`SalesRequestNotesIT`): write then read · empty is success · many notes newest first ·
deterministic order · notes after a terminal state · **author stored but never returned**, and the
stored author is the session · undocumented fields refused (`adminId`, `createdAt`, `reservationId`,
`partnerId`) · blank refused · oversized refused rather than truncated, with 4000 accepted ·
**cross-partner read and write both 404, their note untouched** · unknown reference 404 · 401 without a
session and 403 without CSRF · **a note moves nothing else** (status, `direct_committed`, holds,
history, contact log, email log all unchanged) · **a note never reaches the guest's own receipt**.

**Frontend +19** (`notes.test.tsx`): order preserved · the lock and its sentence · empty distinguished
from failed · no author or identifier in the markup · machine-readable timestamp · line breaks kept ·
no edit or delete control · blank not submittable · trimmed body sent and nothing else · re-read on
success · no duplicate submit · **typed text kept on failure** · 400 field message · 403 and 404 kept
distinct · network failure · keyboard operable · sits beside the timeline without joining it · existing
actions intact · no guest-facing affordance.

**No existing test was weakened, changed or deleted.**

---

## 7. Security audit

| | |
|---|---|
| Partner A read Partner B's notes? | **No** — 404, tested |
| Partner A write Partner B's notes? | **No** — 404, and their note count unchanged |
| Spoof the author? | **No** — `admin_id` is the session; sending `adminId` is a 400 |
| Spoof reservation ownership? | **No** — the reference is the only selector, resolved through the scope filter |
| Mutate inventory or lifecycle? | **No** — asserted unchanged |
| Trigger guest communication? | **No** — `email_log` asserted empty |
| Leak into a guest surface? | **No** — asserted absent from the public receipt |
| Staff PII exposed? | **No** — no id, no email, no name |
| Any guard weakened? | **No** — all eight pass; `internalNote`/`reservationNote` were already on the public denylist and the admin package is outside its scan by design |

---

## 8. Database, OQ, browser

**No migration.** 29 total (27 versioned + 2 repeatable), latest **V27**, V1–V27 untouched. Flyway
validated. Every reservation-side table **0** after the suite, `reservation_note` included.

**No OQ changed.** B24, B1, B19, A4, OQ-162, OQ-163, OQ-066, OQ-161 all untouched. Staff-identity
disclosure stays open exactly where doc 134 §5 left it.

**Not browser-verified.** The page needs an authenticated session and a reservation; the dev database
deliberately holds zero, so a screenshot would prove nothing the 641 tests do not.

---

## 9. Next step

**The queue's overdue column.** The queue already bands SLA client-side with a threshold this author
chose, which Step 16A.19 refused to promote into a filter. The exact, decision-free slice is showing
**how overdue** a breached request is, from the `slaDueAt` the backend already returns — the one SLA
fact doc 69 §127 defines precisely.

Larger alternative, also unblocked: **`reservation_change`** (V14) records modifications and is unused;
doc 58 §5 freezes `POST /sales/requests/{reference}/modify` with `reservation.modify`. That is a real
transition with re-checking and re-pricing, so it is a full step rather than a small one.
