# PHASE 7.5F — STEP 16A.23 — LEAD SOURCE ON THE SALES REQUEST RESPONSE

**Date:** 2026-08-29
**Status:** 🟢 **COMPLETE** — the queue can now filter on something it also shows.

**Gates:** backend **158 unit + 505 integration = 663** (+5), `BUILD SUCCESS` · frontend **668** (+9),
36 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration** (29, latest
V27) · reservation-side tables **0** · `git diff --check` clean · **no OQ changed**.

---

## 1. Contract verified

**Doc 69 §4.2:107** — *"**Lead source is a first-class column** | An agent should see at a glance where
the morning's enquiries came from."* Its mockup at line 119 gives the column order verbatim:

```
Ref              Guest         Lead source  Property   Stay            Rooms  Value        Age    SLA  Owner
KAS-260912-4F7A  Nguyen Van A  FACEBOOK     Milestone  12–14 Sep (2n)   3    12.450.000₫  47m    ●    —
```

**Doc 69 §4.3:138** puts it in the workspace too: `Distribution DIRECT   Lead source FACEBOOK`.

**V1:39** — the enum: `WEBSITE, FACEBOOK, ZALO, TIKTOK, INSTAGRAM, PHONE, WALK_IN, REFERRAL,
RETURNING_CUSTOMER, OTHER`. **V12:36** — the column, `DIRECT only`. **S1** records `WEBSITE`.

**Nullability is settled by the schema, not by inference.** V12's `reservation_channel_invariant`:

```sql
(channel_type = 'DIRECT' AND lead_source IS NOT NULL)
OR (channel_type = 'OTA' AND lead_source IS NULL AND sales_owner_id IS NULL)
```

Doc 58 §5 scopes this API to DIRECT at the data layer, so **every row it can return carries one**. No
fallback was invented — none is reachable.

---

## 2. A correction to doc 143

**Step 16A.22 said doc 69 §4.2's `47m` / `6h12m` / `1d 2h` were its SLA column. They are its *Age*
column** — the mockup's headers are `… Value | Age | SLA | Owner`, with SLA being the ●/▲/■ marker
alone.

The duration *shapes* remain the project's own convention, so 16A.22's implementation stands
unchanged; only its attribution was wrong. Two consequences worth recording:

- Doc 143's "doc 69 §4.2 freezes the format for the SLA column" should read **"for the Age column"**.
- **Doc 69 freezes an `Age` column the queue does not have** — `now − requestedAt`, shown on every row.
  That is a genuinely frozen, decision-free slice, and a better next step than it looked.

---

## 3. Implemented

**Backend** — `lead_source` added to the queue's existing `SUMMARY_COLUMNS` projection, its row record
and `SalesRequestSummaryView`. No new route, no new query, no permission change; `ScopeFilter`,
ordering, filters and pagination behaviour untouched. The detail response carries it too, because it
embeds the same summary.

**Frontend** — a queue column in doc 69's own position (third, between Guest and Property) and a fact
row in the detail workspace. The enum is rendered **verbatim**, as doc 69's mockup prints
`FACEBOOK`/`WEBSITE`/`ZALO` and as the status badge already prints `salesStatus`. Typed as `string`
rather than a union, so a value the enum gains later renders rather than crashing the queue — pinned
by a test.

**No business meaning was invented**: no "organic", no "paid", no grouping, no analytics, no ordering
by source, and no friendlier second name per value.

**Database** — unchanged. No migration, no schema change, no seed.

---

## 4. Two over-broad proxy assertions, narrowed

Both forbade `leadSource` on the **admin** response by borrowing doc 58 §9's INTERNAL list wholesale.
That list marks fields internal to the **guest**, and `PublicResponseDenylistTest` enforces it against
the public packages — which is where it belongs, and where `leadSource` remains listed.

The borrowed reading was **already inconsistent before this step**: the same denylist line contains
`salesStatus`, which the admin response has returned since Step 16A.5. Applying it to the partner's own
workspace would forbid the queue from showing its own status column.

- `SalesRequestIT` — `leadSource` removed from the list; every genuinely internal entry (rule ids, the
  price snapshot, idempotency key, fingerprint, `partnerId`, the surrogate key) kept, with the reasoning
  written into the test.
- `SalesQueueFilterIT` — the same removal, and the assertion's real intent restated: **filtering adds
  no field**, not "this field may never appear".

**No assertion was weakened**: both now say what they always meant, and neither lost a check that was
protecting something real.

---

## 5. Security

`ScopeFilter` is untouched — the field was added to a projection, not to a predicate. A partner sees a
lead source only for rows their scoped queue already returned, proven by a test that sets another
partner's request to `REFERRAL` and asserts the value never appears in the caller's queue body, that
filtering by it returns nothing, and that the detail read is still 404.

No id, no owner identity, no new route, no permission change, no guest surface: `leadSource` stays on
the public denylist and the admin package remains outside that guard's scan by design. All eight
architecture and security guards pass.

---

## 6. Tests

**Backend +5** (`SalesQueueFilterIT`): the queue returns the source it filters on · never null across
two rows · a second enum value reported verbatim, with filter and field agreeing · the detail carries
it · another partner's lead source unreachable three ways.

**Frontend +9** (`leadSource.test.tsx`): the column exists in doc 69's position, asserted by header
order · the value rendered unchanged · **all ten enum values** · an unknown value renders without
crashing · other columns untouched · no control added · the detail fact row · the workspace untouched ·
no internal identifier.

**Seven fixtures gained `leadSource`**, caught by the type system — the pinned DTO working again.

Two of my own new-test mistakes were fixed in **the tests**, since the implementation was right: a
bulk edit duplicated a key inside `queueFilters.test.tsx`'s filter objects, and one assertion expected
`× 2` for a fixture whose line quantity is 1.

---

## 7. Database, OQ, browser

**No migration.** V1–V27 untouched, 29 total (27 versioned + 2 repeatable), latest **V27**, Flyway
validated. Reservation-side tables **0**. No seed data.

**No OQ changed.** OQ-162, OQ-163, OQ-066 OPEN; OQ-161 DEFERRED; A4, B24, B1, B19 untouched.

**Not browser-verified.** The dev database holds no reservations and browser verification needs
authenticated session state.

---

## 8. Next step

**`reservation.modify` remains blocked, and the block is commercial.** Doc 58 §5 freezes
`POST /sales/requests/{reference}/modify` with `reservation.modify` and *"re-checks, re-prices,
**re-versions snapshot**"*, and `reservation_change` exists in V14 — but nothing states **which price
governs when a modification re-prices a request the guest has already seen**: the original quote, or
the new one. Doc 125 froze the snapshot as the record of what was quoted; it does not say a
modification supersedes it. That is an owner decision, and it should be taken before modify is briefed.

**The unblocked slice is the `Age` column** found in §2. Doc 69 §4.2 freezes it in the queue's own
mockup, it is `now − requestedAt` from a field the response already returns, the formatter written in
Step 16A.22 already produces its exact three shapes, and no threshold or decision is involved. It is
also the column that makes "oldest unactioned first" legible — doc 69 §4.2's stated reason for the
queue's ordering.
