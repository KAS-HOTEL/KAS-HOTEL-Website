# PHASE 7.5F — STEP 16A.25 — THE SALES REQUEST QUEUE TAB STRIP

**Date:** 2026-08-29
**Status:** 🟢 **COMPLETE** — three of doc 69's six views, frontend only, no backend change.

**Gates:** backend **158 unit + 505 integration = 663**, unchanged, `BUILD SUCCESS` · frontend **710**
(+18), 38 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **0 backend files
changed** · **no migration** (29 validated, latest V27) · reservation-side tables **0** ·
`git diff --check` clean · **no OQ changed**.

---

## 1. Contract verified

**Doc 69 §4.2:117** — the tab strip, drawn above the queue:

```
 ⦿ New (7)  Mine (3)  Breaching (1)  Follow-up due (5)  Awaiting payment  All
```

**Doc 21 §5.1:514** draws the same six and calls them *"saved views per user"*, adding *"'Mine',
'Breaching' and 'Follow-up due' are the three that matter daily."*

**The two frozen mappings were confirmed in the backend, not assumed:**

- `SalesRequestService.SALES_STATUSES` (line 122) contains `REQUESTED`, so **`salesStatus=REQUESTED`**
  is accepted and validated against the `sales_status` enum (V1:49).
- `SalesRequestService.SLA_STATES` (line 136) is `Set.of("breached")` — **`slaState=breached`** is the
  one band with a frozen definition, and `within`/`approaching` are refused with a 400.

Both were already implemented by Step 16A.19 and are already reachable from the filter bar. **The tab
strip adds no request the queue could not already make**, which is why it needed no backend change.

**Route convention:** the console page is `/partner/requests`. `/admin/sales/requests` is the API path
behind it, not a UI route.

---

## 2. Tab matrix

| Tab | Shipped | Behaviour | Why |
|---|---|---|---|
| **New** | ✅ | `/partner/requests?salesStatus=REQUESTED` | a frozen enum value the backend already validates |
| **Breaching** | ✅ | `/partner/requests?slaState=breached` | the one SLA band with a definition |
| **All** | ✅ | `/partner/requests` | no parameters at all |
| Mine | ❌ absent | — | **doc 134**: nothing in this repository yields an assignable owner's identity — no endpoint, no response field, no session value. Matching "mine" against a session email or an `admin_id` would invent the identity semantics doc 134 left open |
| Follow-up due | ❌ absent | — | `next_follow_up_at` exists on **`sales_inquiry` (V11:48)**, a different entity from the reservation this queue lists. Nothing freezes the join, what "due" means, or whether NULL is "not due" |
| Awaiting payment | ❌ absent | — | `reservation` carries **no payment state**, and the B12/OQ-017 ruling made V1 pay-at-hotel. Equating the tab with `REQUESTED` or `WON` would be a payment semantic invented here |

**Absent, not disabled.** The console already answers this question elsewhere: doc 134's owner filter
is not greyed out, it is simply not there, and the queue has no Owner column. A disabled tab reads as
*"not built yet"*; these are *"not decided yet"* — and one of them, *Awaiting payment*, may never exist
under a pay-at-hotel V1. A test asserts the strip contains no `aria-disabled` element and exactly three
list items.

*(The property tabs do carry one disabled entry — `Hình ảnh (Bước 8)`. That is a page not yet written,
which is a different thing from a rule not yet decided.)*

---

## 3. Counts: none, and why

Doc 69's mockup writes `New (7)`. **No numeric badge was rendered**, and a test asserts the whole
navigation region contains no digit.

There is no count endpoint, no pagination contract and no frozen count semantics. A number could only
come from counting the rows currently on screen — which are the *current* filter's rows, not the tab's
— or from extra list calls nobody specified. Either would be a figure the agent could act on and the
contract could not defend.

---

## 4. Each tab owns the whole query string

A tab is an **absolute URL**, not a parameter merged into the current one.

That is what makes *All* mean anything: doc 69 lists it as a view, and a view that kept the filters
already applied would not be "all". Merging would also need a rule for the contradiction it creates —
what should *New* do when `salesStatus=WON` is already set? — and no document states one.

This also matches how the surface already behaves: the filter bar is a GET form whose submission
replaces the query string, and its clear link navigates to the bare URL.

**Active state is link equality, not a judgement.** A tab is current when the filters in force are
exactly the ones it sets. `?salesStatus=REQUESTED&property=kas-milestone` therefore lights **no** tab —
the New tab's link would navigate away from that view, and a highlighted tab that changes the list when
clicked is a lie about where you are. Hand-combining filters is a legitimate state that simply is not
one of the saved views. Because this is link equality rather than a rule about the queue's meaning, it
needs nothing frozen to justify it.

**The landing default is unchanged.** Bare `/partner/requests` still shows the unfiltered list, and
*All* is marked current. Doc 69's mockup shows `⦿ New` selected, but nothing freezes a landing filter
and adding one would change what an agent sees on arrival.

---

## 5. Implementation

`features/salesRequest/tabs.ts` — `SALES_QUEUE_TABS` and the pure `activeQueueTab(filters)`. This
mirrors the convention `features/property/tabs.ts` already set.

**The existing `Tabs` primitive was reused, not re-implemented.** It already renders a labelled
`<nav>` of real `next/link` anchors in a `<ul>`/`<li>`, marks the current one with
`aria-current="page"`, and needs no JavaScript — every requirement of this step's UX section was
already satisfied by a component in `ui/primitives`. **No new component and no new CSS were written.**

The strip sits above the filter bar, where doc 69's mockup draws it.

---

## 6. Security

**No backend file was touched.** No route, no permission, no query parameter, no database query, no
API contract: every parameter in every tab href is one of doc 58 §5's, already implemented and already
validated server-side — a test enumerates the hrefs and asserts exactly that.

`ScopeFilter` is untouched, so a tab narrows only what the caller's own scoped queue already returned.
No owner identity, no staff identity, no internal id, no guest surface, no mutation, no inventory
effect, no lifecycle effect, no payment behaviour.

The three absent tabs are absent precisely because implementing them would have required inventing an
identity, a join or a payment state.

---

## 7. Tests

**+18, all frontend** (`queueTabs.test.tsx`), rendering the real `Tabs` primitive with the real items:

Each of the three hrefs · the strip offers these three and no others · *All* current when unfiltered ·
*New* current for `salesStatus=REQUESTED` · *Breaching* current for `slaState=breached` · **no tab
current for another status** · **no tab current for hand-combined filters** (three combinations) ·
*All* current when every parameter is empty · **no digit anywhere in the navigation** · no *Mine* ·
no *Follow-up due* · no *Awaiting payment* · **no `aria-disabled` element and exactly three items** ·
a labelled nav of three links and no button · every tab keeps the whole query string, proven against a
three-filter starting state · **every parameter in every href is one the queue already understands**.

**No existing test was weakened, changed or deleted.** None needed to be: the strip is a separate
component, and every filter-bar test renders `SalesQueueFilterBar` on its own. The *All* tab is
labelled `Tất cả yêu cầu` rather than `Tất cả` so it does not collide with the filter selects' "any"
option.

---

## 8. Database, OQ, browser

**No migration.** V1–V27 untouched; Flyway validated **29** migrations, latest **V27**. Reservation-side
tables **0**. No seed data, no index, no enum change.

**No OQ changed.** OQ-162, OQ-163, OQ-066 remain OPEN; OQ-161 DEFERRED; A4, B24, B1, B19 untouched.

**Not browser-verified.** The dev database holds no reservations, so every tab would render the same
empty state; verification also needs authenticated partner session state. Seeding commercial data for
a screenshot was out of bounds and was not done.

---

## 9. Next step — the console is ahead of the product

This step completes the frozen, decision-free work on the queue surface. What doc 69 still draws and
this console still lacks — the *Owner* column, *Mine*, *Follow-up due*, *Awaiting payment*, the counts,
`reservation.modify` — is **blocked on decisions, not on effort**, and no amount of further frontend
work will unblock any of it.

Meanwhile the product has never been run end to end. The pieces are all present and wired:

- **Guest side:** `ReservationRequestForm` (rendered by `QuoteSelector` on the hotel page) posts to
  `POST /api/v1/public/reservations/requests` — S1, with the V24 idempotency key.
- **Partner side:** the queue, filters, tabs, age, SLA, lead source, timeline, notes, and the S2–S13
  transitions all read and write real rows.

But `reservation` has **0 rows**, so nothing built since Step 16A.5 has ever been seen working against
real data — which is exactly why every step since has honestly reported *"Not browser-verified"*.

**The recommended next step is a first end-to-end run against the running stack**: start the backend
and the frontend, submit a request as a guest through the hotel page, then work that reference through
the partner console — assign, availability-check, contact, win — confirming each transition in the
database. That is not a screenshot exercise: it is the first proof that the guest surface, the S1
endpoint, the scoped queue and the transition endpoints agree with each other outside the test suite,
and it will either validate the last fifteen steps or find the first real integration defect.

It also turns *"Not performed"* into a real answer for every browser-verification section that follows.
