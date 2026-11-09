# Phase 7.5F — Step 10: Partner Inventory Calendar

**Date:** 2026-08-19
**Status:** ✅ COMPLETE. **No migration. No backend change.**

**Gates:** frontend typecheck · lint (0 warnings) · **255 tests** · build (18 routes) · 0 npm
vulnerabilities · backend **390 tests** `BUILD SUCCESS` · Flyway **v23, 25 validated** ·
`git diff --check` clean.

---

## 1. Route

```
/partner/properties/{propertyId}/inventory?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Inside the existing property tab strip, where *Tồn phòng* is now a real link. The dates are query
parameters so a range is shareable and restorable, and so navigation is a route change rather than
hidden component state.

## 2. API contract used — doc 58 §6 verbatim

| Endpoint | Permission | Notes |
| --- | --- | --- |
| `GET /admin/ops/inventory?propertyId=&from=&to=` | `inventory.view` | property-wide; **returns only days that exist** |
| `PATCH /admin/ops/inventory/{roomTypeId}/{date}` | `inventory.adjust` | body `{ total?, maintenance?, otherBlocks? }` |
| `POST /admin/ops/inventory/bulk/preview` | `inventory.adjust` | writes nothing |
| `POST /admin/ops/inventory/bulk` | `inventory.adjust` | all-or-nothing |

Both permissions are doc 59 §4.2 and the Partner's ADMIN role holds them (`RoleCatalogue`). The paths
are **not** property-scoped — `propertyId` is a query parameter and the write endpoints address a
room type — but scope is enforced in SQL either way.

**`availableDirect` is not writable.** Doc 58 §6 names exactly three operator columns; availability is
derived by the frozen `available_direct()` function. A test asserts the client never sends it.

**Bulk inventory exists** — it did not have to be assumed. `POST /bulk/preview` and `POST /bulk` are
implemented, and doc 58 §6 makes preview before commit mandatory, so the apply button stays disabled
until a preview has run and come back clean.

## 3. Inventory semantics — the rule this step exists to protect

The calendar returns **only days that exist**. A `room_type_inventory_day` row that was never written
is simply absent, and the grid renders it as `—` / *"chưa cấu hình"*.

| State | Cell | Secondary | Accessible name |
| --- | --- | --- | --- |
| unconfigured | `—` | *chưa cấu hình* | *"… — chưa cấu hình tồn phòng"* |
| configured zero | `0` | *hết phòng* | *"… — 0 phòng — hết phòng"* |
| configured positive | `5` | *tổng 7* | *"… — 5 phòng còn trống"* |

Doc 15 §12 treats a missing row as unavailable, never as zero available, and the two mean different
things to an operator: *still to do* versus *deliberately closed*. Three tests pin the distinction,
including one asserting an unconfigured cell contains no `0` at all.

The primary number is `availableDirect` — what the direct channel may still sell — with `total`
underneath. Both come from the backend; **no arithmetic is performed anywhere in React**.

## 4. Concurrency

The oversell guarantee stays exactly where Phase 7.5E put it: a database CHECK, with the service
pre-computing conflicts so they can be named. Nothing was reimplemented, no `occupied` counter was
introduced, and no SQLSTATE is caught and retried.

There is **no optimistic-locking token on inventory**, and none was invented. A refused edit is a
**422 `NO_AVAILABILITY`** carrying every conflicting date in `details[]`, and the UI renders those
dates rather than a generic failure. A test asserts a refused write never produces a success toast.

Bulk is all-or-nothing (doc 15 §8): applying the days that fit and dropping the rest would let an
operator believe the whole range went through.

## 5. Horizon

`INVENTORY_HORIZON_MONTHS = 24` (owner-approved, Phase 7.5E, stored in `system_setting`) is mirrored
in the frontend **for navigation only** — the *Kỳ sau* control disables at the horizon and the range
note states the limit. The backend holds the setting and is the thing that refuses a request.
`MAX_RANGE_DAYS = 732` is mirrored the same way and checked before the round trip.

Recorded as **OQ-145**: a frontend copy of a configurable business value can drift, and there is no
endpoint exposing it.

## 6. UX

A compact extranet grid — room types as rows, dates as columns — with a room-type filter, period
navigation, a *Hôm nay* control, and a bulk editor. Editing a cell opens a **drawer**, not a modal per
cell, showing the derived figures read-only (available, direct committed, OTA committed, buffer) above
the three editable columns.

Verified states: loading, no room types, no inventory configured, populated, zero, 422 with named
dates, 404, unreachable backend, invalid range, and the horizon boundary. Empty states are
`EmptyState`, never `role="alert"`.

## 7. Responsive — measured

| Width | Page overflow | Sidebar | Targets < 44px |
| --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | drawer | **none** |
| **768** | **none** (753/753) | drawer | n/a |
| **1024** | **none** (1009/1009) | **static column** | n/a |
| **1440** | **none** (1425/1425) | static | n/a |

The grid is its own `overflow-x: auto` region with a sticky room-type column, so a wide range scrolls
inside the box and the shell stays put — doc 82's rule that the scroll container is the component.

**Honest limitation:** the grid could only be measured *empty*, because every seed property has zero
room types and fabricating one to populate the calendar is exactly what the brief forbids. The
horizontal-scroll behaviour is therefore verified structurally (the container, the sticky column, the
`width: max-content` table) and by component tests that render 2 rooms × 3 dates, not by measuring a
populated grid in a browser.

## 8. Accessibility

Every cell is a real `<button>` inside a real `<td>`, reachable by Tab and Enter. Its accessible name
spells out room, date and state — *"Deluxe — 2026-08-19 — 0 phòng — hết phòng"* — because a
screen-reader user moving through a grid has neither header in view. Each state also prints its own
word in the cell, so the grid reads correctly in greyscale; tint only corroborates. Real `th scope`
headers and a caption; `aria-label` on the scroll region; the drawer brings Escape, a focus trap and
focus return.

## 9. Security

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `console.*` · `fetch` outside
`lib/api` · hardcoded UUIDs: **zero** in product code. Live: `document.cookie` is only `XSRF-TOKEN`;
both storages empty. No `partnerId` is ever sent — the client sends `propertyId` and `roomTypeId`
only, and the backend decides. Cross-partner is **404**, verified live on the calendar endpoint. No
CORS, `SameSite` or CSRF change.

## 10. Tests

**Frontend 255** (+25). Domain: absent-is-not-zero, the three accessible labels, the frozen horizon
and range limit, inclusive ranges, and the range guard. Component: empty room types, rows × dates,
unconfigured/zero/positive rendering, **no price anywhere**, filtering without refetching, period
navigation and the today floor, the horizon note, the editor seeded from the day, only operator
columns sent, blank fields omitted, a 422 rendering its named dates with no success toast, 404 with no
permission wording, unreachable backend without leaking the host, empty storage, and bulk: apply
disabled before preview, a clean preview then apply, conflicts blocking apply and naming days, and an
invalid range refused locally.

One existing test updated, not weakened: the property tab assertion now expects five enabled tabs.

**No backend test added, because no backend file changed** — verified by mtime and by the suite
staying at 390.

## 11. Database / Flyway

**No migration.** Flyway **v23, 25 migrations validated**. After the full run: 8 properties,
**0 room types, 0 inventory days, 0 rate rules**. No fabricated inventory, no fabricated room types,
no test pollution.

## 12. Deliberately not implemented

Rate calendar, bulk pricing UI, vouchers, tax, booking, customer account, CMS, media upload, storage
provider, partner services. Also: no room-type creation shortcut from this screen — the empty state
explains that inventory is declared per room type and points back, rather than growing a second
authoring path.

## 13. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-145** | `INVENTORY_HORIZON_MONTHS` and `MAX_RANGE_DAYS` are mirrored in the frontend for navigation; no endpoint exposes them | **new** |
| OQ-143 · OQ-144 | policy `summary` unreadable · no policy-type catalogue endpoint | open |
| OQ-139 · OQ-138 | version location · resolved | open / resolved |
| OQ-106 · OQ-141 · OQ-142 | media storage and its two admin gaps | open (doc 105) |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-133 · OQ-135 · OQ-136 | open |

## 14. Recommendation for the next step

> **Rate calendar (read) followed by bulk pricing** — the owner-mandated Booking/Agoda-style pricing
> surface.

The backend is complete and tested: `RateResolver` with the frozen doc 56 §3.1 precedence, rate
authoring, and bulk preview/apply at the doc 58 §8 routes. The inventory calendar just established the
grid, the cell editor, the range navigation and the bulk preview-then-apply pattern — the rate calendar
is the same shape over a different quantity, and *Giá* is the last disabled tab that is not blocked on
storage.

Read-only first, for the same reason Steps 5 and 7 preceded 6 and 8: pricing has a precedence rule
where ties are a configuration error rather than a coin flip, and showing which rule won should be
built before anything can author one.
