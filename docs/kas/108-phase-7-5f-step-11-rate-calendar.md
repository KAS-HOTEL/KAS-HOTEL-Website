# Phase 7.5F — Step 11: Partner Rate Calendar (read-only)

**Date:** 2026-08-19
**Status:** ✅ COMPLETE. **No migration. No backend change.**

**Gates:** frontend typecheck · lint (0 warnings) · **276 tests** · build (19 routes) · 0 npm
vulnerabilities · backend **390 tests** `BUILD SUCCESS` · Flyway **v23, 25 validated** ·
`git diff --check` clean.

---

## 1. Backend API used

```
GET /api/v1/admin/rates/grid?propertyId=&from=&to=        permission rate.view
```

Doc 58 §8, implemented in Phase 7.5E. Returns `RateGridView { propertyId, from, to, rows[] }`, each
row `{ roomTypeId, cells[] }`, each cell:

```
RateCell { roomTypeId, date, amountMinor|null, currency|null, ruleId|null, ruleName|null }
```

**`rate.view`, not `rate.manage`** — doc 56 §7 separates reading the grid from moving it, so this
step needs only the weaker permission. ADMIN holds both.

Refuses **422** for a range over 732 days (doc 55 §2's 24-month horizon) or a grid over 5000 cells,
and **404** for a property outside the caller's scope.

**Not wrapped in `lib/api` at all:** `POST /rates/bulk-preview`, `POST /rates/bulk-apply`,
`GET/POST/PATCH /rate-rules`, `PATCH /rate-rules/{id}/status`. Step 11 is read-only, and a typed
function is an invitation to call it.

## 2. Route

```
/partner/properties/{propertyId}/rates?from=YYYY-MM-DD&to=YYYY-MM-DD
```

The property tab *Giá* is now a real link. Dates live in the URL, matching the inventory calendar, so
a range is shareable and navigation is a route change.

## 3. Rate-cell semantics

| State | Cell | Secondary | Accessible name |
| --- | --- | --- | --- |
| unpriced | `—` | *chưa cấu hình giá* | *"… — chưa cấu hình giá"* |
| base price | `1.250.000 ₫` | *giá cơ bản* | *"… — 1.250.000 đồng — giá cơ bản"* |
| rule priced | `1.250.000 ₫` | the rule's own name | *"… — 1.250.000 đồng — quy tắc Cuối tuần"* |

`amountMinor === null` means nothing priced the cell — no rule matched and no base price is set. Doc
56 §9 records base rates as OPEN, so that is a configuration gap. It is **never** rendered as `0`,
never as "miễn phí", and **never carried forward from a neighbouring date** — a test renders a
priced / unpriced / priced sequence and asserts the middle cell stays a gap.

Money is formatted through `Intl` with the currency the API returned. VND's exponent is 0 so minor
units are whole dong; the exponent is not on this response, so it is not assumed for other currencies.

## 4. Precedence handling

**None is implemented.** `RateResolver` applies the frozen doc 56 §3.1 order —
`priority DESC, specificity DESC` — and treats a tie as a **configuration error** rather than picking
one. The frontend ranks nothing, defaults nothing and interpolates nothing; it formats what the
backend already decided.

A tie or any other 422 renders through `ApiError` with the backend's own message, so the operator
reads what the server said rather than a generic failure.

## 5. Winning-rule information

The API **does** expose it — doc 56 §7 requires *"showing which rule won each cell"* — so the grid
shows it, and `ruleId`/`ruleName` are on the cell.

`ruleName` is **Partner-authored free text and is rendered verbatim**. The API returns a *name*, not a
category, so mapping it onto "Weekend" or "Season" would be inventing a vocabulary. A price with
`ruleName === null` is the **base price**, which is a real distinction rather than a missing value,
and is labelled as such.

`ruleId` is on the doc 58 §9 INTERNAL denylist for guests. This is the operator surface, where it is
permitted; nothing here touches a public path.

## 6. Empty and error states

Loading · no room types · nothing priced in the range · mixed priced/unpriced · fully priced · 404 ·
422 (range, grid size, tie) · unreachable backend · invalid range answered before the round trip.

The "nothing priced" state explains the gap and says authoring arrives next. It **suggests no price**,
and no empty state uses `role="alert"`.

## 7. Security / isolation

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `console.*` · `partnerId` ·
`fetch` outside `lib/api`: **zero** in product code. Live: `document.cookie` is only `XSRF-TOKEN`,
both storages empty. The client sends `propertyId` and dates; the backend decides scope.
Cross-partner is **404**. No CORS, `SameSite`, `HttpOnly` or CSRF change — this step adds no mutation
at all.

**No tax anywhere.** The only textual match in the whole feature is the comment recording that tax is
out of scope.

## 8. Responsive — measured

| Width | Page overflow | Sidebar | Targets < 44px |
| --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | drawer | **none** |
| **768** | **none** (753/753) | drawer | n/a |
| **1024** | **none** (1009/1009) | static column | n/a |
| **1440** | **none** (1425/1425) | static | n/a |

The grid reuses the inventory calendar's scroll region and sticky room column, so a wide range scrolls
inside its own box and the shell stays put.

**Honest limitation:** the grid could only be measured **empty**. Every seed property has zero room
types, so the API correctly returns no rows, and fabricating a room type and a rate rule to populate
it is exactly what this brief forbids. Populated-cell semantics — the three states, the mixed range,
the rule name, the absence of edit controls — are covered by component tests rendering real
`RateCell` shapes, not by a populated browser measurement.

## 9. Accessibility

Cells are **data cells, not controls** — this screen is read-only, so a `<button>` would promise an
interaction that does not exist. Each `<td>` carries an `aria-label` spelling out room, date, amount
and provenance, because a screen-reader user in a grid has neither header in view. Each state also
prints its own words, so the grid reads in greyscale; tint only corroborates. Real `th scope="col"`,
`rowheader`s, a caption, and a labelled `role="region"` scroll container that is keyboard reachable.

## 10. Tests

**Frontend 276** (+21). Domain: null-is-unpriced, base vs rule vs unpriced, the three accessible
labels, VND formatting, the frozen range and grid bounds, cell indexing. Loader: the resolved grid,
malformed id short-circuit, 404 / 422 / unreachable. Component: no room types, rows × dates, unpriced
as a dash with no `0` and no "free", a rate with its winning rule, base price distinguished, **a mixed
range with no carry-forward**, the nothing-priced state suggesting no price, **no edit control of any
kind**, no tax, filtering without refetching, period navigation with the today floor, semantic grid
markup, and empty web storage.

One existing test updated, not weakened — the property tab assertion. Its invariant is unchanged (a
tab is a link only when its screen exists); it now records that exactly one tab remains disabled,
media, blocked on OQ-106.

**No backend test added, because no backend file changed** — verified by mtime and by the suite
staying at 390.

## 11. Database / Flyway

**No migration.** Flyway **v23, 25 migrations validated**. No rate rule, room type or inventory day
was created; the seed data is untouched and there is no test pollution.

## 12. Limitations

- The grid returns `roomTypeId` only, so room names come from a second call to the room-type endpoint.
  Both are `cache()`d, so it is one call each per render.
- Only the winning rule is returned — not the candidates it beat. "Why did *this* rule win?" is
  therefore unanswerable from the grid alone (**OQ-146**).
- There is no rate-specific horizon setting; `MAX_RANGE_DAYS` derives from doc 55 §2's 24-month
  inventory horizon and is mirrored for navigation only, as in Step 10 (**OQ-145**).

## 13. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-146** | the grid returns the winning rule but not the candidates it beat, so a Partner cannot see *why* it won | **new** |
| OQ-145 | horizon and range limits mirrored in the frontend; no endpoint exposes them | open (doc 107) |
| OQ-143 · OQ-144 | policy `summary` unreadable · no policy-type catalogue | open |
| OQ-106 · OQ-141 · OQ-142 | media storage and its two admin gaps | open (doc 105) |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-133 · OQ-135 · OQ-136 · OQ-139 | open |

## 14. Recommendation for Step 12

> **Rate authoring and bulk pricing** — the owner-mandated Booking/Agoda-style surface.

Everything it needs is implemented and tested behind the frozen doc 58 §8 routes: `GET/POST/PATCH
/rate-rules`, `PATCH /rate-rules/{id}/status`, and `POST /rates/bulk-preview` / `bulk-apply` with
preview mandatory (doc 56 §7). Step 10 established the preview-then-apply pattern and Step 11 the grid
it applies to, so the shape is known.

Two things to settle first, both already visible from the read side: **ties are configuration errors**
and the authoring UI must surface a refused activation as exactly that rather than letting a Partner
create one blindly; and `RateResolver.ADJUSTMENT_ROUNDING = HALF_UP` is still marked PROPOSED
(**OQ-119**), which a percentage-adjustment form makes load-bearing.
