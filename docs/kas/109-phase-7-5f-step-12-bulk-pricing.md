# Phase 7.5F — Step 12: Partner Rate Authoring + Bulk Pricing

**Date:** 2026-08-20
**Status:** ✅ COMPLETE. **No migration. No backend change.**

**Gates:** frontend typecheck · lint (0 warnings) · **316 tests** · build (19 routes) · 0 npm
vulnerabilities · backend **390 tests** (146 unit + 244 integration) `BUILD SUCCESS` ·
Flyway **v23, 25 validated** · `git diff --check` clean.

---

## 1. OQ-119 — discovered, and it does not block

The question was whether `RateResolver.ADJUSTMENT_ROUNDING = HALF_UP`, still marked **PROPOSED**,
becomes load-bearing once bulk pricing exists. It does not, and the reason is decisive.

**1. What the frozen bulk contract supports.** `pricing.api.BulkRateRequest` is, in full:

```java
BulkRateRequest(UUID propertyId, List<UUID> roomTypeIds, LocalDate dateFrom, LocalDate dateTo,
                @NotNull @Min(0) Long amountMinor, int priority, String name)
```

There is **no operation field, no percentage field and no delta field**. `bulk-preview` and
`bulk-apply` accept one absolute price and nothing else. Of the five operations the brief listed,
exactly one — **absolute price replacement** — exists; percentage increase, percentage decrease,
absolute increase and absolute decrease are not operations the endpoint declines, they are requests
it cannot express.

**2. Does the backend implement rounding?** Yes, in exactly one place:
`RateResolver.adjustedBase`, reached only when the *winning rule* carries `adjustment_percent`.

**3. Is HALF_UP part of the contract or the test suite?** **No.** `RateAuthoringService.applyOne`
writes `price_minor = amountMinor` with `adjustment_percent = null` on every bulk edit, so no bulk
path can ever reach the rounding. No test pins the mode either: the only rounding assertion in the
backend is `BufferPrecedenceIT` — *"a percentage is of total and rounds up"* — which is the inventory
safety buffer under doc 13 §3.4c, not a rate. `RateResolutionIT` exercises `adjustmentPercent` twice,
but only through a raw-SQL fixture and with figures (25 % of 1,000,000 → 1,250,000) that are exact
under every rounding mode.

**4. Is a rounding rule frozen elsewhere?** Yes — and instructively. The OTA safety buffer uses
`RoundingMode.CEILING`, and doc 13 §3.4c and doc 55 §6.1 both **state the direction in prose**. So
this corpus does write rounding rules down when they are frozen. Rate adjustment rounding is not
written down anywhere, which corroborates that it is genuinely open rather than merely undocumented.

**5. Can bulk pricing ship without percentage adjustment?** **Necessarily.** Offering "tăng theo %"
would mean inventing a request shape, which is stop condition 3.

> **Conclusion: absolute replacement is frozen and sufficient, so Step 12 proceeds on it and
> percentage adjustment is recorded as deferred.** PROPOSED was not converted into FROZEN, and
> nothing in this step depends on the rounding mode.

The deferral is enforced, not merely stated. `adjustmentPercent` is never written by this console:
`lib/api/endpoints/rates.ts` exports no rule-creation function, and the rule editor **refuses to
reprice a percentage rule at all** — sending `priceMinor` would convert it to a fixed price and
thereby endorse the PROPOSED rounding. A test pins that refusal.

## 2. Backend bulk contract — as read from the Java and the ITs

| | |
| --- | --- |
| **Preview** | `POST /api/v1/admin/rates/bulk-preview` · `rate.manage` · writes nothing |
| **Apply** | `POST /api/v1/admin/rates/bulk-apply` · `rate.manage` · one transaction |
| **Rules** | `GET /api/v1/admin/rate-rules?propertyId=` · `rate.view` |
| **Reprice** | `PATCH /api/v1/admin/rate-rules/{id}` · `rate.manage` · **OQ-128** |
| **Lifecycle** | `PATCH /api/v1/admin/rate-rules/{id}/status?status=` · `rate.manage` · **OQ-128** |

Doc 58 §8 lists the rate surface on a single line — `GET /admin/rates/grid`,
`POST /admin/rate-rules`, `POST /admin/rates/bulk-preview`, `/bulk-apply` — under `rate.manage`, with
**no request or response body stated for any of them**. The per-capability permission split
(`rate.view` for reading the grid) is doc 56 §7's, and the backend implements that finer split. The
two `PATCH` routes are **additions** carried as **OQ-128** and still need a doc 58 amendment; this
step consumes them and does not widen them.

**Request** (both bulk routes, identical):

```jsonc
{ "propertyId": "…", "roomTypeIds": ["…"], "dateFrom": "2026-08-20", "dateTo": "2026-08-31",
  "amountMinor": 1500000, "priority": 0, "name": "Khuyến mãi tháng 8" }
```

`amountMinor` is minor units of VND, which is zero-decimal (doc 56 §6): 1,500,000 ₫ is `1500000`.
`priority` is a primitive `int`, so omitting it means 0 — the column's own default. `name` is
optional; the backend substitutes `Bulk <from> to <to>`.

**Response** (`BulkRateEffect`, returned by *both* preview and apply):

```jsonc
{ "dateFrom": "…", "dateTo": "…", "nights": 12, "amountMinor": 1500000, "currency": "VND",
  "cellsAffected": 24,
  "roomTypes": [ { "roomTypeId": "…", "roomTypeSlug": "deluxe", "datesAffected": 12,
                   "currentLowest": 1200000, "currentHighest": 1300000,
                   "newAmountMinor": 1500000, "action": "CREATE" } ],
  "conflicts": [] }
```

**Refusals, transcribed from the annotations and the ITs:**

| Situation | Status | Evidence |
| --- | --- | --- |
| `roomTypeIds` empty | **400** | `@NotEmpty`; `emptyRoomTypeSelectionIsRejected` |
| `amountMinor` negative or absent | **400** | `@NotNull @Min(0)` |
| `dateTo` before `dateFrom` | **422** | `invalidDateRangeIsRejected` |
| range over 732 days | **422** | `requireRangeFits` |
| property or room type outside scope | **404** | `bulkApplyIsAllOrNothingAcrossPartners` |
| room type of another property, same partner | **422** `BULK_RATE_CONFLICT` | `roomTypeOfAnotherPropertyIsRefused` |
| missing `rate.manage` | **403** | `rateRoutesAreNotOpen` |
| not signed in | **401** | `rateRoutesAreNotOpen` |
| activating a rule into a tie | **422** `RATE_RULE_TIE` | `tieIsRefusedAtSave` |
| illegal status transition | **409** `ILLEGAL_TRANSITION` | `ruleIsArchivedNeverDeleted` |

**Two shapes the response does not have**, and which the UI therefore does not show:

- **No per-cell preview rows.** The effect is reported **per room type** with `currentLowest` /
  `currentHighest` across the range. The brief's example table has a row per room *per date*; that
  would require inventing the intermediate values, so the current column shows the range the backend
  actually returned. A room type with no price there renders **"chưa cấu hình giá"**, never `0`.
- **No `unchangedCells` count.** Nothing reports how many cells already hold the target price, so
  nothing claims to.

`conflicts` is a `List<String>` of backend-authored prose and is rendered verbatim.

## 3. Authoring workflow

```
chọn loại phòng + khoảng ngày + giá
        ↓  Xem trước thay đổi         POST /rates/bulk-preview   (writes nothing)
bảng xem trước theo loại phòng
        ↓  Áp dụng
hộp thoại xác nhận, trích số liệu của backend
        ↓  Xác nhận áp dụng           POST /rates/bulk-apply     (một lần, một giao dịch)
kết quả announced · revalidate · router.refresh()
```

Reached from a **Chỉnh giá hàng loạt** button in the rate-calendar toolbar, which opens a `Drawer`.
The calendar itself is unchanged from Step 11 apart from that button and the rules panel below it —
cells stay **data cells, not controls**, because a click-to-edit cell would be an unpreviewed write.

**Scope is stated, not implied.** The drawer names the property, lists every room type as a checkbox
(all selected initially), shows the date range, and states the operation in words:

> **Cách thay đổi:** Đặt giá cố định
> *Hợp đồng bulk hiện chỉ nhận một mức giá tuyệt đối. Tăng/giảm theo phần trăm hoặc theo số tiền
> chưa có trong hợp đồng và được hoãn lại (OQ-119).*

One operation is rendered because one exists. `priority` is exposed with its consequence spelled out,
because doc 56 §3.1 resolves on it and an operator laying a promotion over a season has to be able to
say which wins. `name` is exposed because it is what the grid shows in the cell the rule wins.

## 4. Preview contract

**Mandatory, and structurally so.** Apply is disabled until a preview exists, came back with no
conflicts, **and still describes the request the form currently holds**.

That last clause is `bulkRequestSignature` — a canonical serialisation of the six request fields, with
`roomTypeIds` sorted so selection order is not part of the identity. The preview is stored with the
signature it was computed from; apply requires them to match. Changing rooms, either date, the
amount, the priority or the name therefore invalidates it, and the drawer says which state it is in:

- *"Bắt buộc xem trước rồi mới áp dụng được. Bản xem trước không ghi gì."*
- *"Biểu mẫu đã thay đổi sau lần xem trước. Hãy xem trước lại trước khi áp dụng."*

Comparing signatures rather than clearing state field-by-field is deliberate: a field added later
cannot silently forget to invalidate.

The preview panel shows the backend's `cellsAffected`, `nights` and room-type count as one sentence,
then a table of **Loại phòng · Số ngày · Giá hiện tại · Giá mới · Thao tác**. Every figure is the
response's.

## 5. Apply contract

One call to `ratesApi.bulkApply`. The **response**, not the preview, is what is displayed afterwards
— `bulkApply` re-derives its effect under lock, so the preview is a snapshot and the response is what
happened. After a successful apply the preview is discarded, so a second write needs a fresh preview;
pressing the button twice cannot repeat a bulk edit.

Errors are mapped through the shared doc 58 §2.1 handling: **422** and **400** show the backend's own
message plus every `details[].message`, because "stray-room does not belong to that property" is the
actionable part; **404** says *không tìm thấy* and never *không có quyền*, preserving doc 85 §6.3's
non-disclosure; **409** asks for a reload; anything else is a connection failure. No status is ever
re-described as a different one.

## 6. All-or-nothing

Stated to the operator on the preview panel and again in the confirmation:

> **Thay đổi sẽ được áp dụng toàn bộ hoặc không áp dụng.**

Guaranteed by construction on both sides. The backend validates every room type, date and value
before writing anything, inside one `@Transactional` method, and resolves each room type through the
scoped repository — so a foreign one fails the whole request rather than being skipped
(`bulkApplyIsAllOrNothingAcrossPartners` asserts the other room types keep their base price).

The frontend contributes the absence of the alternatives: there is no loop over dates, no per-room
retry, no per-cell PATCH, and no code path that reports success after a failure. Tests assert
`bulkApply` is called **exactly once** and that `updateRule` / `setRuleStatus` are never called during
an apply, and that a 422 produces neither a toast nor a revalidation. **"49 applied, 1 skipped" is not
a state this UI can reach**, because the endpoint that would produce it does not exist.

## 7. Concurrency

**There is no optimistic lock on rates, and the frontend does not invent one.** `rate_rule` has no
`version` column; `RateRuleRepository.lockPropertyRules` takes pessimistic row locks in deterministic
`id` order, the same defence doc 55 §7 uses for inventory. No `version` or `If-Match` is sent, because
there is nothing to send.

The consequence is honest: a preview is advisory. `bulkApply` re-derives the effect under the lock, so
if the situation changed between the two calls the apply refuses (422) or writes the newly-correct
effect and returns it. On a refusal the frontend **does not retry, does not regenerate the preview,
and does not reopen the confirmation** — the operator is returned to the form with the backend's
reason and must preview again.

**Honest limitation.** `concurrentBulkAppliesAreDeterministic` is the only concurrency-named backend
test and it runs two applies **sequentially** — MockMvc shares the test transaction, so what it
actually pins is the update-in-place semantics, not the lock under contention. The lock ordering
itself is unexercised by any test. That was true before this step and is unchanged by it.

## 8. Repeated edits

`findByExactScope(roomTypeId, dateFrom, dateTo, daysOfWeek = null, priority)` decides whether a bulk
edit updates or creates, and the preview reports the answer as `action`. The UI renders it in words —
**"Cập nhật quy tắc hiện có"** / **"Tạo quy tắc mới"** — so a correction reads as a correction. Doc 56
§3.1 requires this: a second equally applicable rule would make every date in the overlap
unpriceable, so a repeat must reprice rather than duplicate.

Nothing about duplicate-rule internals is presented as a success path, and the frontend never issues
more than one request per apply, so it cannot create a duplicate by retrying.

## 9. Rate precedence

**No precedence logic exists in the frontend.** `RateResolver` applies the frozen
`priority DESC, specificity DESC` and treats a tie as a configuration error rather than a coin flip.
Nothing here ranks, defaults, interpolates or predicts a winner, and there is no priority calculator.

What the UI does is **show the two ordering keys**, which is the operator's only way to answer "why
did that rule win?". The rules panel below the calendar lists, per rule: name · what it applies to ·
date range · days of week · **priority** · **specificity** · price · status. `specificity` is derived
**by the backend** (`RateRuleView.specificity`) and displayed, never recomputed.

A tie is surfaced, never resolved: activating a rule into one returns 422 with `RATE_RULE_TIE`, and
the panel prints the backend's message and its `details[]` verbatim — *"'A' and 'B' share priority 0
and the same specificity. Change one before selling this date."* A test pins that the frontend does
not refresh, retry or re-rank after a tie.

The panel also carries a standing note, which restates a frozen rule rather than computing anything:

> Hệ thống chọn quy tắc thắng theo độ ưu tiên rồi đến độ cụ thể. Hai quy tắc bằng nhau ở cả hai cột
> là lỗi cấu hình và hệ thống sẽ từ chối, không tự chọn một cái.

## 10. Rate calendar integration

The Step 11 calendar is intact — the same grid, the same three cell states, the same accessible
labels, the same navigation. Step 12 adds the toolbar button, the drawer and the rules panel.

After a successful apply the grid is **invalidated and refetched**: `revalidateRates(propertyId)`
followed by `router.refresh()`. Nothing is patched in place from the response, because the apply
re-derived its own effect and the backend is authoritative about what is now stored.

**A defect in Step 11's code was found and fixed here.** The backend runs
`spring.jackson.default-property-inclusion: non_null`, so a null component is **omitted from the JSON
entirely** — an unpriced cell arrives as `{ roomTypeId, date }` with no `amountMinor` key. Step 11
typed the field `number | null` and guarded on `=== null`, so an absent price fell through and read as
a **rule-priced** cell with an empty amount. Every nullable field in `lib/domain/rate.ts` is now
declared optional *and* nullable and read through an accessor that folds both to `null`, and tests
render the real wire shape (absent keys) alongside explicit nulls. This is exactly the "missing is
never zero" invariant the briefs protect, so it is recorded rather than quietly corrected.

## 11. Responsive — measured

Measured against the **built** stylesheet at four widths, reloading after each resize so media-query
results are never stale.

| Width | Page overflow | Drawer width | Drawer overflow | Preview table | Date fields | Targets < 44px |
| --- | --- | --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | 375 | **none** | scrolls in its own region | 1 column | **none** |
| **768** | **none** (768/768) | 480 | **none** | scrolls in its own region | 2 columns | n/a |
| **1024** | **none** (1024/1024) | 480 | **none** | scrolls in its own region | 2 columns | n/a |
| **1440** | **none** (1440/1440) | 480 | **none** | scrolls in its own region | 2 columns | n/a |

Mobile is not a shrunken desktop: the drawer takes the full width, the two date inputs stack, the
room-type list is a column of 44px rows, and the preview table scrolls **inside** its own labelled
region so the page never scrolls sideways.

**A second real defect was found by measuring.** The shared `Dialog` close button was a fixed 32×32,
below doc 82 §3's 44×44 on a coarse pointer — comfortable with a mouse, too small with a thumb, and
the control a phone user reaches for most. Raised to 44×44 under `@media (pointer: coarse)`, which
fixes every drawer and modal in the console, not only this one. Re-measured after the fix: **zero
targets under 44px**.

**How it was measured, and the limitation.** The authenticated `/rates` screen cannot open this
drawer today: every seed property has zero room types, so the button is correctly disabled, and
fabricating a room type to enable it is what §12Q forbids. The measurement therefore used a
throwaway harness that **inlines the built CSS chunks** and reproduces the drawer's markup with the
real generated class names, so the geometry measured is the geometry the shipped stylesheet produces.
The harness was deleted and the build re-run; the final build contains no trace of it. What this does
**not** cover is live React behaviour at those widths — that is covered by the component tests, not by
a browser measurement, and it is not claimed here.

Live, unauthenticated: `/partner/properties/{id}/rates` redirects to
`/partner/login?returnTo=…` and leaks no rate content.

## 12. Accessibility

Bulk pricing is a high-impact financial action, so it is held above ordinary CRUD.

- **Labels and descriptions.** Every control has a real `<label>`; the amount, priority and name each
  carry a description explaining consequence, not syntax — the priority field says what a collision
  does, the name field says where the name appears.
- **The room-type selector is a `<fieldset>` with a `<legend>`** and an `aria-describedby` note, so a
  screen reader hears "Loại phòng" as a group before the individual checkboxes.
- **Errors are associated.** Field errors go through `FormControl`, which wires `aria-describedby`
  and `aria-invalid` and gives the message `role="alert"` with an icon as well as colour. The
  request-level refusal is a `role="alert"` region listing every `details[].message`.
- **Focus management.** The confirmation is rendered as a **sibling** of the drawer, not a child, so
  its controls are not inside the drawer's focus trap. `Dialog` moves focus in on open and restores
  it on close, so dismissing the confirmation returns focus to the Apply button.
- **A third defect was found and fixed.** Both dialogs listen for Escape on the document, so with the
  confirmation open **one Escape closed both** — discarding the whole form. `Dialog` now keeps a
  stack and only the topmost dialog reacts. A primitives test pins it.
- **The confirmation states the consequence**, in the brief's own words and with the backend's
  numbers: *"Bạn sắp thay đổi giá cho 3 loại phòng trong 12 ngày, tổng cộng 36 ô."* — followed by the
  new price, the range, and the all-or-nothing sentence. It never asks "are you sure?".
- **Success is announced.** The applied effect is rendered in a `role="status"` region quoting the
  apply response, and a polite toast repeats it.
- **No colour-only state.** `CREATE` and `UPDATE` are words in a badge; conflicts are a list of
  sentences; the preview-invalid state is a sentence, not a greyed button alone.
- **Both actions disable while a request is in flight**, because a double-submitted bulk apply is
  precisely the accident this flow exists to prevent.

## 13. Security / isolation

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `Bearer` · `document.cookie` ·
`console.*` · **`partnerId`** · `eval` · `dangerouslySetInnerHTML` · `fetch` outside `lib/api`:
**zero** in product code. The only textual matches anywhere are prose in doc comments explaining why
each is absent.

The request body is asserted by test to contain exactly
`{propertyId, roomTypeIds, dateFrom, dateTo, amountMinor, priority}` — **no partner identifier**, and
the serialised body is matched against `/partnerId|Authorization|Bearer/` to prove it. Scope is the
backend's: every read and write carries the scope predicate inside its own SQL statement, a foreign
property is **404**, and a foreign room type inside a selection fails the **whole** request.

Every mutation goes through `lib/api`, which pairs the `XSRF-TOKEN` cookie with the `X-XSRF-TOKEN`
header. No CORS, `SameSite` or `HttpOnly` change. Live, on the running app: `document.cookie` holds
only `XSRF-TOKEN` and both web storages are empty.

**No tax, no voucher, no media.** A test asserts the rendered calendar and rules panel match none of
`thuế|VAT|phí dịch vụ`, none of `voucher|mã giảm giá`, and contain no `<img>`.

## 14. Tests

**Frontend 316** (+40), all passing; **backend 390** (146 unit + 244 integration), untouched and
still green — no backend file changed, proven by mtime.

| Area | What is pinned |
| --- | --- |
| Discovery | the exact six-field request body; only one operation is offered; no radio group, no percentage control |
| Form | all rooms selected by default and individually removable; empty selection, missing amount, fractional amount, negative amount, non-integer priority; a blank priority is 0, not an error; no upper bound and no suggested price |
| Preview | apply unreachable before a preview; `cellsAffected` / nights / room count come from the response; current-vs-new per room type; a room type with no price reads as a gap; `UPDATE` vs `CREATE`; **changing the amount invalidates the preview**; **changing the selection invalidates the preview**; conflicts block apply |
| Apply | confirmation required and quoting backend figures; **exactly one call**; no rule call during an apply; refetch + announcement; a fresh preview required for a second apply; 422 with `details[]`; 404 as not-found never as forbidden; 409 as reload; unreachable backend; **no partial-success wording reachable** |
| Security | request carries no `partnerId`/`Authorization`; web storage empty during and after editing |
| Regression | every Step 11 calendar assertion retained; **the absent-key wire shape**; mixed range with no carry-forward; no tax, no voucher, no media |
| Accessibility | the preview region is labelled and keyboard reachable; the confirmation is a named dialog; errors are `role="alert"`; success is `role="status"`; **Escape reaches only the topmost dialog** |
| Rules panel | both ordering keys shown and no winner predicted; only backend-accepted transitions offered; `ARCHIVED` terminal and no delete control; an activation tie shows the backend's wording and triggers no refresh; reprice sends the frozen PATCH body; **a percentage rule cannot be repriced** |

One existing test was rewritten, not weakened: *"offers no way to change a rate"* became *"keeps grid
cells as data, not as editing controls"*. Step 12 deliberately adds a bulk control, so the old
assertion could not survive verbatim; the invariant it protected — **cells are not write controls** —
is asserted more precisely than before, scoped to the grid region.

## 15. Database / Flyway

**No migration. No V24.** Flyway: **25 migrations, latest v23, 0 failed**. Live counts after all
verification: **`rate_rule` 0 · `room_type` 0 · `room_type_inventory_day` 0 · `property_policy` 0 ·
`property` 8 · `app_user` 1**. Nothing was seeded, and the backend integration suite cleans up after
itself.

## 16. Limitations

- The bulk drawer could only be measured through a CSS harness, not on the live authenticated screen
  — see §11. Live browser verification of the *authenticated* console also requires signing in, which
  is not something this session does.
- The preview is per room type, so the per-date "current → new" table the brief sketched is not
  possible without inventing values (§2).
- Standalone rule creation (`POST /admin/rate-rules`) is deliberately not wrapped — §12K's "do not
  add every CRUD operation". Bulk apply already creates the dated room-type rules the owner's
  workflow needs; a from-scratch editor would open `adjustmentPercent` (OQ-119), `minNights` /
  `maxNights` (OQ-120, stay-level and outside the resolver's predicate), `daysOfWeek` and `PROPERTY`
  scope, none of which the owner asked for in this step.
- Two other frontend domain types still declare a nullable wire field as `| null` rather than
  optional — `InventoryChangeView.before` and `SessionView.lastSeenAt`. Neither is read anywhere, so
  neither is a live defect, but they share the class of bug fixed in §10.

## 17. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-147** | **No admin route sets `room_type.base_price_minor`.** Doc 56 §7 lists *"Set base rate · `rate.manage` · Per room type"* as a CONFIRMED capability, but no endpoint implements it, and `RoomTypeView` deliberately omits the field. A Partner can therefore price the dates a rule covers and can never price the ones it does not — those cells stay "chưa cấu hình giá" with no screen able to fix them | **new** |
| **OQ-148** | **`bulk-preview` does not predict a tie the edit would create.** It resolves the range against rules that exist *now*. Two bulk applies at the same priority over overlapping ranges each succeed, and the grid then returns 422 for the overlapping dates because `RateResolver.requireNoTie` refuses them. The write-time guard `tiesWithExisting` covers rule creation and activation but is not consulted by `applyOne` | **new** |
| OQ-146 | the grid names the winning rule but not the candidates it beat | open (doc 108) |
| OQ-145 | horizon and range limits mirrored in the frontend; no endpoint exposes them | open (doc 107) |
| OQ-143 · OQ-144 | policy `summary` unreadable · no policy-type catalogue endpoint | open |
| OQ-128 | `PATCH /rate-rules/{id}` and `/status` are additions; doc 58 §8 amendment still owed. **Consumed by this step** | open |
| OQ-119 | adjustment rounding still PROPOSED. **Not load-bearing for Step 12** — §1 — and percentage adjustment is deferred | open |
| OQ-106 · OQ-141 · OQ-142 | media storage and its two admin gaps | open (doc 105) |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-120 · OQ-133 · OQ-135 · OQ-136 · OQ-139 | open |

## 18. Recommendation for Step 13

> **Base rates — close OQ-147 — then the guest-facing availability and quote surface.**

Bulk pricing can now set a price for any date range a Partner names, but **nothing can set the
fallback**. Doc 56 §3 calls Layer 0 "always present"; doc 56 §9 leaves it OPEN as config B6; and
there is no route to write it. Every cell outside a rule's range is unpriceable from the console, and
that is the last gap between "the Partner can operate rates" and "the Partner can operate rates
completely". It is small, it is inside an already-frozen capability (doc 56 §7 names it), and it
needs one owner decision — whether the base rate is a room-type field on the onboarding surface or a
`rate.manage` route of its own.

Two things worth settling alongside it, both surfaced by this step: **OQ-148**, because a Partner
using bulk pricing twice over overlapping dates can currently break their own grid and the preview
will not warn them; and **OQ-128**, since two routes this console now depends on are still awaiting
their doc 58 amendment.

After that, the natural next surface is the **guest-facing availability and quote path**, which is
the first thing that turns configured inventory and configured rates into something sellable — and
the first place the frozen `available_direct()` function and `RateResolver` meet a customer rather
than an operator.

Not started: base rates, vouchers, tax (out of V1 by owner decision), media, booking, customer
account, CMS, partner services, property submission.
