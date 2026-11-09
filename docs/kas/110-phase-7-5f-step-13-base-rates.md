# Phase 7.5F — Step 13: Base Rates, OQ-148 and OQ-128

**Date:** 2026-08-20
**Status:** ✅ COMPLETE. **No migration. No V24.** Backend changed — deliberately, and inside a
frozen capability.

**Gates:** frontend typecheck · lint (0 warnings) · **334 tests** · build (19 routes) · 0 npm
vulnerabilities · backend **404 tests** (146 unit + 258 integration) `BUILD SUCCESS` ·
Flyway **25 migrations, latest v23, 0 failed** · `git diff --check` clean.

---

## 1. OQ-147 — resolved

> **Nothing could set `base_price_minor`.** Doc 56 §7 lists "Set base rate" as CONFIRMED, but no
> route implemented it, so every date outside a rule's range was permanently unpriceable from the
> Partner console.

Discovery answered every question the brief asked, and none of the answers required a decision:

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1–2 | Where does the base rate belong? | **Room-type level** | Doc 56 §9 config B6: *"Base rates per room type per property"*; doc 56 §7: *"Set base rate · `rate.manage` · **Per room type**"*; doc 52 §3.2 lists `basePriceMinor` among `RoomType`'s key attributes |
| 3 | Does the schema already hold it? | **Yes, since V5** | `room_type.base_price_minor bigint` + `currency char(3) NOT NULL DEFAULT 'VND'`, `CHECK (base_price_minor IS NULL OR base_price_minor >= 0)`. The column comment reads *"Layer 0 of the pricing model (doc 56 §3)"* |
| 4 | Which API owns the write? | **The rate API** | Doc 56 §7 assigns `rate.manage`, not `roomtype.manage`. `pricing` already declares `property` as an allowed dependency and already reads the base price |
| 5 | Does doc 58 define a route? | **No** — the same gap as OQ-128 | Doc 58 §8's Rates row named only grid, `POST /rate-rules`, bulk-preview, bulk-apply |
| 6 | Which permission? | `rate.view` to read, `rate.manage` to write | Doc 56 §7 splits them; doc 59 §4.4 scopes both to PROPERTY |
| 7 | Does it participate in resolution? | **Yes, as the terminal fallback** | `RateResolver.rank`: *"if candidates empty: return roomType.base_price_minor"*, and it is also the multiplicand for a percentage rule |
| 8 | Does a change affect all future dates? | **Yes, immediately**, on every date no rule covers | There is no date dimension on the column |
| 9 | Is there an effective-date concept? | **No** — nowhere in the corpus | |
| 10 | Optimistic locking? | **Yes — `room_type.version`** | The column exists since V5 and `RoomTypeRepository.update` already compare-and-sets on it |
| 11 | Migration needed? | **No** | Every column already exists |

**No stop condition fired.** The capability is frozen, the storage is authoritative, the permission
exists, and the concurrency model is the one the row already had. What was missing was only a path —
so a path was added inside the existing namespace, exactly as OQ-128's two routes were.

**Config B6 stays OPEN.** This supplies the *mechanism*; not one number originates in the code, the
tests, the seed data or the UI. The development database still holds **0 priced room types**.

## 2. Base-rate authority

**Doc 56 §7, CONFIRMED** — *"Set base rate · `rate.manage` · Per room type"* — corroborated by doc 56
§9's config B6 at the same granularity, doc 56 §3's Layer 0, doc 52 §3.2's attribute list and doc 53
§3.2's column pair. Nothing was inferred and no new pricing concept was introduced.

**A base rate is not a rate rule.** A rule is a *conditional override* carrying dates, days of week, a
priority and a specificity; it wins only where it applies. A base rate is the *fallback* — doc 56
§3.1 ends its specificity ladder at "base", below every rule. The two are separate layers, and the UI
keeps them in separate panels with separate language so a Partner cannot mistake one for the other.

## 3. Storage

`room_type.base_price_minor` (nullable `bigint`) and `room_type.currency` (`char(3)`, defaults
`'VND'`), both since **V5**. Nothing new was created: no base-price table, no date-rate table, no room
pricing table, **no migration, no V24**.

`currency` is deliberately **not settable**. VND is the only transactional currency in V1 (doc 56 §6)
and the column already defaults to it; accepting a currency would imply a second one exists.

**Null and zero are different states**, and the schema already says so: the CHECK is
`base_price_minor IS NULL OR base_price_minor >= 0`. Null means *nobody has priced this room* —
`RateResolver` treats it as **not sellable**, never free. Zero means *this room costs nothing*, which
is a price a Partner may deliberately set. Both operations are offered and a test pins the difference.

## 4. API contract

Two routes, inside the existing `/admin/rates` namespace:

```
GET /api/v1/admin/rates/base?propertyId=          rate.view
PUT /api/v1/admin/rates/base/{roomTypeId}         rate.manage
```

`BaseRateView { roomTypeId, roomTypeSlug, amountMinor?, currency, version }` — `amountMinor` is
**absent when no base rate is set**, which is every room type today.

`BaseRateRequest { amountMinor?: number|null, version: number }` — a **full replacement**, hence
`PUT`: an absent or null amount **clears** the rate. `version` is `@NotNull`.

| Situation | Status |
| --- | --- |
| valid set, including `0` | **200** |
| clear (`amountMinor` absent/null) | **200**, `amountMinor` absent in the response |
| negative amount | **400** (`@Min(0)`) |
| missing `version` | **400** (`@NotNull`) |
| stale `version` | **409 `VERSION_CONFLICT`** |
| room type or property outside scope | **404**, never 403 |
| missing `rate.manage` | **403** · unauthenticated **401** |

## 5. Partner UX

A compact **Giá cơ bản** card on the existing `/partner/properties/{propertyId}/rates` screen, below
the calendar and beside the rules panel. No settings page, no new route — 19 routes, unchanged.

Each room type is one row: its name, a badge reading either the current price or *"chưa cấu hình giá
cơ bản"*, a labelled amount input, **Lưu**, and **Xoá giá**.

**One room type per request.** The brief's sketch showed a single *Lưu thay đổi* button over all
rooms; the contract has no bulk base-rate operation, and §13E forbids simulating one by looping
individual writes. So each row saves on its own and carries its own `room_type.version` — two
operators pricing two different rooms never collide, and two pricing the same room get a conflict
rather than a lost update. Bulk base-rate editing is recorded as **OQ-150**.

**Clearing is confirmed.** Emptying a base rate silently un-prices every date no rule covers, so it
goes through a destructive `ConfirmDialog` that says so and states explicitly that it is *not* the
same as setting zero.

**Nothing is suggested.** No default, no placeholder amount, no derived value. Doc 56 §9 keeps B6
OPEN and a frontend that proposed a number would be inventing one.

## 6. Calendar integration

Step 11's calendar and Step 12's bulk editor are untouched in behaviour. The three cell states remain
exactly three, and remain the backend's:

| State | Cell | Secondary |
| --- | --- | --- |
| unpriced | `—` | *chưa cấu hình giá* |
| base price | `1.200.000 ₫` | *giá cơ bản* |
| rule price | `1.500.000 ₫` | the rule's own name |

After a base-rate write the grid is **invalidated and refetched** — `revalidateRates` then
`router.refresh()` — never patched locally. A base rate existing does not mean a cell resolves to it:
a rule may still be winning that date, and only `RateResolver` knows. A test renders rule, base and
unpriced cells side by side and asserts all three survive a base rate being set.

## 7. OQ-148 — resolved

> **`bulk-preview` ranked the rules that existed, not the rule about to be written.**

Confirmed precisely by discovery. `RateRuleRepository.tiesWithExisting` compares `date_from` and
`date_to` with `IS NOT DISTINCT FROM` — **null-safe equality, never overlap** — so it catches a rule
of *identical* shape and nothing else. But doc 56 §3.1 does not tie on shape; it ties on
`(priority, specificity)` among the candidates applicable to **one date**. Two room-type rules at the
same priority whose ranges merely overlap are both rank 4, both apply across the overlap, and
`RateResolver.requireNoTie` refuses every one of those dates.

Worse, `RateAuthoringService.applyOne` writes through `RateRuleRepository.create` and `setStatus`
**directly**, bypassing the service-level guards entirely — so the bulk path was not merely blind to
the tie, it was the shortest way to create one. The operator was then locked out of their own bulk
editor, because the next preview ranks the now-tied rules and throws 422 before any conflict list is
built.

## 8. Tie prevention

Solved **without a schema change and without touching the frozen semantics**. A tie remains a
configuration error; nothing picks a winner, bumps a priority, alters a specificity or deletes a rule.

`RateAuthoringService.computeEffect` now includes the **proposed** rule in the analysis. For each
selected room type it looks for a non-archived, V1-shaped rule that

1. targets the same room type,
2. carries the **same priority**,
3. has the **same specificity** — reusing `RateRule.specificity()`, not a copy, and
4. **shares at least one date on which both would apply** — walked with `RateRule.appliesOn`, the same
   predicate the resolver uses,

excluding the rule this edit will reprice rather than duplicate. A match becomes a `conflicts[]`
entry, which the preview shows and which makes `bulk-apply` refuse the whole request with
**422 `BULK_RATE_CONFLICT`**. The Partner never sees an Apply button that would break their calendar.

**Dates are walked rather than compared as ranges**, because overlapping ranges alone are not a tie:
two day-of-week rules can share a window and never share a date, which `RateResolutionIT` depends on.
The window is clamped to `MAX_RANGE_DAYS` — doc 55 §2's 24-month horizon — which costs nothing,
because a date beyond the horizon cannot be sold.

**The same guard was completed at the other two write sites.** `create` and `setStatus` already
called `tiesWithExisting`; that guard was simply incomplete in the same way. Both now also run the
overlap check, so a Partner cannot activate a paused rule into a tie from the rules panel either. This
is finishing an existing guard rather than adding a new capability — and it is called out here so the
owner can veto it. The full suite stayed green, which is the evidence that nothing legitimate was
refused.

Six integration tests pin the behaviour: overlapping tie refused at preview, refused at apply with
nothing written, **different priority is not a tie**, **non-overlapping range is not a tie**,
**repeating the identical edit is still a reprice**, and a tie refused at create.

## 9. OQ-128 — resolved by documentation

Both routes are implemented, permissioned with the pre-existing `rate.manage`, and covered by
integration tests: `PATCH /admin/rate-rules/{id}` (200 reprice, one audit row, **404** cross-partner)
and `PATCH /admin/rate-rules/{id}/status` (200 activate, 200 archive, **409 `ILLEGAL_TRANSITION`** on
`ARCHIVED → ACTIVE`, **404** cross-partner). No new API was created to solve documentation drift.

Discovery found **two further undocumented items** OQ-128 did not name: `GET /admin/rate-rules`, and
the fact that doc 58 §8 assigned `rate.manage` to the whole rate surface while doc 56 §7 and the
implementation split reading onto `rate.view`.

Doc 58 is therefore amended in two places — the §8 Rates row, and a new **§11.1** that tabulates every
rate route with its permission, its frozen source in doc 56, and whether §8 had named it. The
amendment adds no capability and opens no namespace. **OQ-128 is closed**; the base-rate routes are
documented in the same table rather than becoming a new open question.

## 10. Concurrency

**Two models, each following its own row, neither invented.**

- **Base rate → `room_type.version`.** The column exists since V5 and the room-type PATCH already
  compare-and-sets on it. A stale token is **409 `VERSION_CONFLICT`**; the write is
  `UPDATE … WHERE id = ? AND version = ? AND <scope>`, so a lost update is impossible rather than
  merely unlikely.
- **Rate rules → pessimistic locks.** `rate_rule` has **no version column** and none was added.
  `lockPropertyRules` takes row locks in deterministic id order and `bulkApply` re-derives its effect
  under them, exactly as before. §13I is satisfied: no version field was invented for `rate_rule`, and
  the asymmetry is real rather than cosmetic.

## 11. Security / isolation

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `Bearer` · `document.cookie` ·
`console.*` · **`partnerId`** · `eval` · `dangerouslySetInnerHTML` · `fetch` outside `lib/api`:
**zero** in product code.

The base-rate request body is asserted by test to be exactly `{ amountMinor, version }` and matched
against `/partnerId|Authorization|Bearer/`. Scope stays in SQL: `updateBasePrice` carries the scope
predicate inside the `UPDATE`, so a foreign room type matches no row; `findBaseRates` joins `property`
and applies the same filter. Cross-partner is **404** for both routes, asserted from both directions.
CSRF unchanged — every mutation goes through `lib/api`, which pairs the `XSRF-TOKEN` cookie with the
`X-XSRF-TOKEN` header. No CORS, `SameSite` or `HttpOnly` change.

**No tax, no voucher, no customer endpoint.** A test asserts the rendered panel matches none of
`thuế|VAT|phí dịch vụ` or `voucher|mã giảm giá`, and no `/search`, `/availability`, `/quote` or
`/booking` route was added.

## 12. Accessibility

- **Every input is labelled with its room type** — *"Giá cơ bản — Deluxe Room"* — so a screen-reader
  user moving between rows always knows which room they are pricing.
- **The currency is on the field description**, not only in a badge: *"Mỗi đêm, tính bằng đồng (VND)"*.
  Minor units are never exposed as a concept; the operator types whole dong because VND is
  zero-decimal, and the description says so in words rather than "minor units".
- **Errors are associated** through `FormControl`'s `aria-describedby` / `aria-invalid`, with
  `role="alert"` and an icon as well as colour. Request-level failures render in a `role="alert"`
  region.
- **Success is announced** in a named `role="status"` region — *"Đã lưu giá cơ bản cho Deluxe Room."*
  Both live regions on the screen now carry an accessible name, so the base-rate announcement and the
  bulk-apply result cannot be confused with each other.
- **Clearing is confirmed** in a dialog that states the consequence — the room stops being sellable on
  unruled dates — and explicitly distinguishes it from setting zero. Focus returns to the row on
  close, via `Dialog`'s existing restore.
- **No colour-only state**: the current price is a badge whose *text* is either the amount or "chưa
  cấu hình giá cơ bản".

## 13. Responsive — measured

Measured against the **built** stylesheet at four widths, reloading after each resize so media-query
results are never stale.

| Width | Page overflow | Row layout | Amount input | Save button | Targets < 44px |
| --- | --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | 1 column | 44px | 44px | **none** |
| **768** | **none** (768/768) | 1 column | 44px | — | n/a |
| **1024** | **none** (1024/1024) | 3 columns | — | — | n/a |
| **1440** | **none** (1440/1440) | 3 columns | — | — | n/a |

Mobile is not a shrunken desktop: the row's three columns collapse to one below 900px, so the price
field keeps a usable width for a seven-digit amount.

**Same limitation as Step 12, and the same honest workaround.** The panel cannot be exercised on the
live authenticated screen because every seed property has zero room types, so it correctly renders
"chưa có loại phòng nào" and there is no row to measure — and fabricating a room type is what §13S
forbids. The measurement therefore used a throwaway harness inlining the built CSS with the real
generated class names; it was deleted and the build re-run, and the final build contains no trace of
it. Live React behaviour at those widths is covered by component tests, not by this measurement, and
is not claimed here.

## 14. Tests

**Frontend 334** (+18) · **backend 404** (+14: 146 unit, 258 integration). All green.

**Backend — `BaseRateIT`, 14 tests.** An unset base rate is listed with no amount and never zero · the
view carries `room_type`'s version and the version moves on write · setting one prices every unruled
date with no winning rule · **a rule still beats the base on the dates it covers, and the base
returns outside them** · **clearing is not zeroing**, with the grid falling back to unpriced ·
negative refused, missing version refused, stale version **409** with the old value intact ·
cross-partner **404** on both routes with the other Partner's rate untouched · unauthenticated
**401**, wrong permission **403** · and the six OQ-148 cases in §8.

**Frontend.** Domain: absent-vs-null-vs-zero, the validation mirror, blank-means-clear, no upper
bound. Loader: all-unpriced is a success, malformed id short-circuits, 404 is an error not an empty
list. Panel: base and rule distinguished in words · unset shows a gap and disables *Xoá giá* · **the
exact request body with the room type's version** · no `partnerId`/`Authorization`, empty web storage
· negative and fractional refused before the round trip · **a deliberate zero is accepted** ·
**clearing is confirmed and sends `null`, never `0`** · 409 as a conflict with nothing further
written · 404 as not-found never as forbidden · success announced · **one request per room type, no
loop** · the calendar still shows all three states · no tax, no voucher.

**Step 12 regression: intact.** Every bulk-pricing assertion still runs unchanged — preview mandatory,
apply disabled before preview, preview invalidated by any input change, the exact request body, one
apply call, all-or-nothing, 409/422/404 handling, no partial retry, no `partnerId`.

Two existing assertions were made **more specific, not weaker**: a cell-level query is now scoped to
the calendar region (the base-rate panel legitimately also contains the words "giá cơ bản"), and the
bulk-apply announcement is now queried by its accessible name. Both assert strictly more than before.

## 15. Database / Flyway

**No migration. No V24. Flyway untouched.** 25 migrations, latest **v23**, 0 failed.

Live counts after all verification: **`rate_rule` 0 · `room_type` 0 · priced room types 0 ·
`room_type_inventory_day` 0 · `property_policy` 0 · `property` 8 · `app_user` 1.** Nothing was seeded;
the integration tests create their fixtures inside the test transaction and leave nothing behind.

## 16. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-150** | **No bulk base-rate operation exists.** Setting a fallback across many room types is one request each. The contract defines no bulk shape and simulating one by looping would invent a workflow — worth an owner decision now that a property may have many room types | **new** |
| ~~OQ-147~~ | ~~nothing can set a base rate~~ | ✅ **CLOSED** — §1 |
| ~~OQ-148~~ | ~~the preview cannot predict a tie the edit would create~~ | ✅ **CLOSED** — §8 |
| ~~OQ-128~~ | ~~the rate-rule edit/status routes are undocumented additions~~ | ✅ **CLOSED** — doc 58 §11.1 |
| OQ-146 | the grid names the winning rule but not the candidates it beat | open (doc 108) |
| OQ-145 | horizon and range limits mirrored in the frontend; no endpoint exposes them | open (doc 107) |
| OQ-143 · OQ-144 | policy `summary` unreadable · no policy-type catalogue endpoint | open |
| OQ-119 | adjustment rounding still PROPOSED; percentage adjustment remains deferred | open |
| OQ-106 · OQ-141 · OQ-142 | media storage and its two admin gaps | open (doc 105) |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-120 · OQ-133 · OQ-135 · OQ-136 · OQ-139 | open |

## 17. Recommendation for Step 14

> **Guest availability — `GET /public/properties/{slug}/availability` — the first surface where
> configured inventory and configured rates meet a customer.**

Everything it consumes now exists and is authored end-to-end. `available_direct()` is a frozen SQL
function, the inventory calendar writes the rows it reads, and as of this step a room type can carry
**both** layers of the V1 price model: a rule where a Partner wants a season or a promotion, and a
base rate everywhere else. `RateResolver.lowestNightly` already computes doc 58 §3.2's `nightlyFrom`
from exactly those two inputs, and `PublishedRateRepository` already reads them without a scope,
which is what a guest needs.

Three things to hold on to when it is built, all already frozen and all easy to lose at a public
boundary:

- **Doc 58 §9's denylist becomes load-bearing.** `ruleId`, `appliedRuleIds` and every inventory
  column must not appear on a public response. Doc 58 §9 §4 asks for a blocking contract test and a
  separate `…PublicView` type rather than object spread; the operator DTOs built in Steps 11–13 must
  not be reused.
- **An unpriced room type is not sellable, not free.** `RateResolver` already returns nothing rather
  than zero, and `resolveStay` returns nothing if *any* night is unpriced. A public response must omit
  the room type, exactly as `RateResolutionIT` already asserts — never show it at 0.
- **Doc 56 §9's standing caveat still applies:** *"Until B6 and A7 are supplied, every displayed price
  is an estimate and is labelled as one."* B6 now has a mechanism but the numbers remain an owner
  input, and tax (A7) is out of V1 scope entirely by owner decision.

> **CORRECTION (2026-08-20).** The sentence originally here said Step 15's quote is "where the
> price snapshot of doc 56 §5.2 is first written". **That was wrong.** Doc 56 §5.1 writes the
> snapshot at `salesStatus = REQUESTED` (S1), and doc 14 §4.1 puts it on the S1 transition —
> both belong to `POST /public/reservations/requests`, not to the quote. Doc 58 §3.2 says the
> quote **creates nothing**, and §11.2.2 now freezes that as a guarantee. The quote is a pure
> calculation.

Not started: guest availability, guest quote, booking, vouchers, tax (out of V1), media, customer
account, CMS, partner services, property submission.
