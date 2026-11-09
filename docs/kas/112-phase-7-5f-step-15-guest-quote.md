# Phase 7.5F — Step 15: The Guest Quote

**Date:** 2026-08-20
**Status:** ✅ COMPLETE. **No migration. No V24.** Contract frozen first (15B), then implemented (15C).

**Gates:** frontend typecheck · lint (0 warnings) · **379 tests** · build (20 routes) · 0 npm
vulnerabilities · backend **427 tests** (146 unit + 281 integration) `BUILD SUCCESS` ·
Flyway **25 migrations, latest v23, 0 failed** · `git diff --check` clean.

---

## 1. The decision lock came first

Step 15A reported **BLOCKED**: doc 58 §3.2 froze the quote's request body and stated no response, and
three inputs that body accepts had no frozen pricing rule. The owner then approved four decisions,
and **those were written into the corpus before any code was compiled**:

| Decision | Where it is now frozen |
| --- | --- |
| The public quote response | doc 58 **§11.2.1** — the exact JSON, with the money shape and the estimate flag |
| The quote creates nothing | doc 58 **§11.2.2** |
| Children, capacity and offer codes are refused | doc 58 **§11.2.3**, doc 26 **§7.4**, doc 16 OQ-007 / OQ-008 / OQ-022 |
| The estimate label survives A7's retirement | doc 58 **§11.2.4**, doc 56 §9 amendment |

Two stale sections were also corrected rather than left to mislead: doc 56 §4 (which still called tax
"BLOCKED", four days out of date) and doc 26 §7.3 (which reserved a tax line on the very panel a quote
feeds).

## 2. The sequencing error, corrected

Docs 110 §21 and 111 §21 said the quote is where the price snapshot is written. **That was wrong**,
and both now carry a correction:

- Doc 56 §5.1: *"`salesStatus = REQUESTED` (S1) | **Snapshot written.**"*
- Doc 14 §4.1, transition S1: *"Reference issued; **price snapshot frozen**; request hold created…"*
- Doc 57 §10: *"`priceSnapshot` | required at `REQUESTED`"*

All three belong to `POST /public/reservations/requests`. Doc 58 §3.2 already said the quote *"creates
nothing"*; §11.2.2 now freezes it as a guarantee, and an integration test proves it.

A second correction in doc 111: `RateResolver.resolveStay` takes an `AuthorizationScope` and reads the
**operator** repository, so a public path cannot call it. The guest path ranks candidates from
`PublishedRateRepository` through the same **static `RateResolver.rank`** — one implementation of the
precedence rule, two ways of fetching its candidates, exactly as `AvailabilityService` already did for
availability. The precedence algorithm is not duplicated.

## 3. Request contract — unchanged

Doc 58 §3.2 verbatim, transcribed into `inventory.api.QuoteRequest`:

```jsonc
{ "propertySlug": "…", "checkIn": "2026-09-12", "checkOut": "2026-09-14",
  "adults": 3, "children": 0, "childAges": [],
  "lines": [ { "roomTypeSlug": "deluxe-room", "quantity": 2 } ],
  "offerCode": null }
```

`locale` is **not** in the body and was not added to it: it is a query parameter with an `en` default,
exactly as on every other public route.

Validation is `@Min(1)` on `adults` and on each `quantity`, `@NotEmpty` on `lines`. A stay with no
guests or a line of zero rooms is a malformed request, not an empty selection.

## 4. Response contract — doc 58 §11.2.1

```jsonc
{ "propertySlug": "…", "checkIn": "…", "checkOut": "…", "nights": 2,
  "lines": [ { "roomTypeSlug": "deluxe-room", "roomTypeName": "Deluxe Room", "quantity": 2,
               "nightlyFrom": { "amountMinor": 1850000, "currency": "VND", "exponent": 0 },
               "subtotal":    { "amountMinor": 7400000, "currency": "VND", "exponent": 0 } } ],
  "roomsSubtotal": { … }, "total": { … }, "currency": "VND", "estimate": true }
```

**Not derived from the snapshot.** Doc 56 §5.2's `price_snapshot` carries `ruleId` and
`appliedRuleIds`, both on the doc 58 §9 INTERNAL denylist, so a quote response *could not* be that
shape even if someone wanted it to be.

`nightlyFrom` is the lowest nightly rate for that room type across the stay — a **display** price.
`subtotal` is doc 56 §3.2's frozen arithmetic, `Σ over nights (resolved rate) × quantity`. When a rule
varies the rate across nights the two do not multiply out, and a test pins exactly that.

## 5. Pricing algorithm

`RateResolver.rank` over `PublishedRateRepository.candidatesFor`, per night, per room type — the same
ranking the operator grid and the availability response use. Nothing in the quote path resolves,
ranks, defaults or breaks a tie.

- **Any unpriced night refuses the whole quote** — 422 `NO_AVAILABILITY` with `NOT_PRICED`. Never a
  zero, never a partial line set.
- **A tie propagates unresolved** — 422 with `RATE_RULE_TIE`, straight from `requireNoTie`.
- **Currencies must agree across the lines**, or the quote is refused: totalling two currencies would
  need an FX rate, and config B22 is unsupplied.

## 6. Inventory algorithm

`PublishedAvailabilityRepository.forRoomTypes` — a method that had existed unused since Phase 7.5E,
labelled *"for the quote path"*. It is the same SQL the availability endpoint uses, so the
whole-stay minimum, the stale-hold correction and doc 15 §12's fail-closed rule all apply unchanged.

**No `total − occupied` anywhere.** A line is refused when `quantity > availableQuantity`, and
`availableQuantity` is already the minimum of `available_direct()` across every night — a night with
no inventory row drops it to zero inside the statement.

## 7. Occupancy behaviour

Capacity is `Σ over the requested lines of maxOccupancy × quantity`, compared against
`adults + children`. Over capacity is **422 `OCCUPANCY_EXCEEDED`**; the request is never clamped,
downgraded or split.

**Aggregate, not per-room — and that is a judgement, recorded as OQ-154.** The frozen decision says
"reject an occupancy request that exceeds the room type's max occupancy", which is unambiguous for one
line. With `lines[]` and `quantity` the only formulation that does not invent a guest-to-room
allocation is the aggregate one, and it satisfies every test the decision named: at capacity accepted,
one above refused.

## 8. Child behaviour

**Refused, first, before anything else.** `children > 0` or a non-empty `childAges[]` →
**422 `CONFIG_MISSING`** with `CHILD_PRICING_UNSUPPORTED`.

Checked before capacity and before pricing, deliberately: an unanswerable child question is not
improved by also reaching an unanswerable extra-bed question. A test sends a party that is *both* over
capacity and has children, and asserts the child refusal is the one returned.

No age band, bedding rule, table, column or configuration was created. **B10 / OQ-007 remains OPEN**,
and doc 16 now records the V1 behaviour beside it.

The UI has **no child control at all** — doc 26 §7.4. A field whose only possible outcome is a refusal
is worse than no field; the panel says plainly that a stay with children cannot be quoted online yet.

## 9. Extra-bed behaviour

**Nothing was implemented.** No extra bed, no extra adult, no bedding dependency, no automatic room
splitting. **B11 / OQ-008 remains OPEN.** The only V1 behaviour is the refusal in §7.

## 10. Tax / estimate behaviour

**No tax is calculated, exposed, zeroed or configured.** `total` equals `roomsSubtotal` — the
room-rate total. `TaxIsOutOfScopeForV1Test` is untouched and still blocking, and the response type
carries no field that could hold a tax figure. A test asserts the rendered guest panel matches none of
`thuế|VAT|phí dịch vụ`.

`estimate` is **always `true`**. Doc 56 §9's original condition — *"until B6 and A7 are supplied"* —
can no longer be met by supplying A7, because A7 was **retired rather than supplied** when tax left V1
scope. Doc 58 §11.2.4 rebases the label on something permanent and simpler: **a quote precedes the
snapshot**, and only the snapshot is a price KAS can be held to. That also resolves **OQ-152**.

Voucher is out too: `offerCode` is **refused** with `VOUCHER_UNSUPPORTED` rather than silently
ignored, because B23 is `OPEN`. The UI offers no offer-code field for the same reason it offers no
child control.

## 11. Persistence guarantee

**The quote creates nothing**, and it is proved rather than asserted. `AvailabilityService.quote` is
not transactional and issues no write. `QuoteIT."a quote writes no reservation, no request, no
snapshot and no hold"` counts `reservation`, `inventory_hold` and `reservation_line` before and after
a successful quote and asserts all three are unchanged.

## 12. Security / isolation

Public, unauthenticated, no permission. `@PublicEndpoint`, and a test calls it with **no session
cookie at all**.

**One honest deviation: the quote still requires the CSRF token.** It is a `POST`, and this
application applies CSRF to every mutating method — `SecurityConfig` has no per-path exemption.
Exempting a read-only public POST would have been a security-configuration change made for
convenience, so it was not made. `lib/api` already primes and sends `X-XSRF-TOKEN` in the browser, so
the guest path works; a test pins that a POST without the token is refused **403**.

The consequence is real and reportable: **pricing a selection needs JavaScript**, where the
availability search above it does not. See §23.

Frontend scan — `localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `Bearer` ·
`partnerId` · `ruleId` · `appliedRuleIds` · `priceSnapshot` · `console.*` · `fetch` outside
`lib/api`: **zero**. Every remaining textual match is prose explaining an absence.

**Denylist:** no test extension was needed. `PublicResponseDenylistTest`'s second scan follows the
`@PublicEndpoint` annotation to whatever a handler returns, in any package, so `QuoteView` was covered
the moment it was annotated. A `QuoteIT` assertion independently scans the raw JSON for eighteen
forbidden names and for any raw UUID.

## 13. Error mapping

| Situation | Status | Code |
| --- | --- | --- |
| malformed line, zero/negative quantity, empty `lines`, `adults < 1` | **400** | `VALIDATION_FAILED` |
| duplicated room type across two lines | **400** | `DUPLICATE_ROOM_TYPE` |
| inverted range · check-in in the past | **400** | `VALIDATION_FAILED` |
| beyond the configured horizon | **422** | `HORIZON_EXCEEDED` |
| children · offer code | **422** | `CONFIG_MISSING` |
| party over capacity | **422** | `OCCUPANCY_EXCEEDED` |
| unbookable line · not enough rooms · unpriced night · tie | **422** | `NO_AVAILABILITY` |

**Nothing is disclosed by the shape of a refusal.** An unknown property, a property that is not
`OPEN`, an unpublished room type and a room type of a different property all produce the *identical*
`NOT_BOOKABLE` — the quote is not an existence oracle, exactly as availability's `200 []` is not. A
test asserts all four are the same answer.

The guest mapping stays narrower than the console's: backend words only for 400 and 422, one constant
otherwise. A test pushes a `PSQLException` string through it and asserts nothing survives.

## 14. Accessibility

Every quantity control is a labelled native `<select>` naming its room — *"Số phòng — Deluxe Room"* —
so a screen-reader user always knows which room they are changing. The adult count is a labelled
number input. The result is a **named** `role="status"` region, *"Giá tạm tính"*, distinct from the
availability summary's *"Tóm tắt phòng trống"*; both live regions were given accessible names so they
cannot be confused, which also made the tests more precise. Refusals are `role="alert"` text, never
colour alone. The action is a real `<button>`, disabled until a room is chosen, and there is **no
control that pretends to reserve**.

## 15. Responsive — measured

Measured against the **built** stylesheet at four widths, reloading after each resize.

| Width | Page overflow | Fields | Quote line | Select / button | Targets < 44px |
| --- | --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | 1 column | stacked | 44px / 44px | **none** |
| **768** | **none** (768/768) | 2 columns | name + amount | 44px | n/a |
| **1024** | **none** (1024/1024) | 3 columns | name + amount | — | n/a |
| **1440** | **none** (1440/1440) | 3 columns, page capped at 1152px | name + amount | — | n/a |

A deliberately long room name wraps rather than pushing the amount out of view, and the amount stays
inside its card at every width.

**Honest limitation, unchanged from Steps 12–14.** No property is published, so the live page is a 404
and the quote panel cannot be exercised on it. Measurement used a throwaway harness inlining the built
CSS with the real generated class names; it was deleted and the build re-run.

## 16. Backend tests

**427** (146 unit + 281 integration), all green. `QuoteIT` adds **23**:

Happy path — single room · quantity multiplies and the check-out night is not charged · multiple room
types with different quantities · `nightlyFrom` is the lowest night while the subtotal sums every one.
Persistence — **creates no reservation, hold or line**. Security — needs no session · a POST without
CSRF is 403 · the response carries no rule, inventory internal or database id. V1 refusals — children ·
child ages alone · **children before capacity** · capacity boundary exactly at and one above ·
aggregate capacity across two rooms · offer code. Atomic refusals — one unpriced line refuses
everything · unpriced is not zero · not enough rooms · a missing inventory night · unpublished, foreign
and unknown room types are one answer · a rate tie. Malformed — zero, negative, empty and duplicated
lines · inverted range · past check-in · a non-`OPEN` property.

## 17. Frontend tests

**379** (+11). Domain — line building drops unselected rooms, and `quoteProblem` mirrors **only** what
the contract states, with a test asserting that a party of 99 is *not* refused locally because B10 and
B11 belong to the backend. Component — no child control and no offer field · the quantity ceiling is
the backend's `maxQuantitySelectable` · no request until a room is chosen · the exact request body
with `children: 0` and no `offerCode` · the summary renders only backend figures and is marked an
estimate · **no booking control after pricing** · changing the selection discards the price · the
backend's 422 wording is shown for children, capacity and pricing failures · a 5xx is scrubbed and
nothing is written to web storage.

One Step 14 assertion was **narrowed, not weakened**: *"no button and no link at all"* became *"no
control that pretends to reserve"*, because the quote selector is legitimately a control and pricing
is not booking.

## 18. Database / Flyway

**No migration. No V24. No seed data.** 25 migrations, latest **v23**, 0 failed.
Live: `property` 8, **published 0** · room types 0 · rate rules 0 · inventory 0 · **reservations 0** ·
**holds 0** · users 1.

## 19. Files changed

**Backend new:** `inventory/api/QuoteRequest.java` · `inventory/api/QuoteView.java` ·
`security/it/QuoteIT.java`.
**Backend modified:** `inventory/AvailabilityService.java` (the quote engine and its refusals) ·
`inventory/api/PublicAvailabilityController.java` (the route) · `security/it/SecurityFixtures.java`
(five read-only test helpers).
**Frontend new:** `lib/domain/quote.ts` · `features/hotel/QuoteSelector.tsx`.
**Frontend modified:** `lib/api/endpoints/publicHotels.ts` · `features/hotel/AvailabilityResults.tsx`
· `features/hotel/Hotel.module.css` · `features/hotel/hotel.test.tsx` · the hotel route.

## 20. Documentation changes

Doc **58** — §11.2 (four subsections) and the last-updated line. Doc **56** — §3.2 pointer, §4
superseded banner, §9 estimate amendment. Doc **26** — §7.1 children line, §7.3 tax banner, new §7.4.
Doc **16** — OQ-007, OQ-008, OQ-022 gain a frozen V1 behaviour while staying OPEN. Docs **110** and
**111** — the snapshot-sequencing corrections. This document and the README.

## 21. OQs closed

**OQ-123** — the quote response shape. Frozen in doc 58 §11.2.1, implemented, tested.
**OQ-152** — the estimate label's condition. Rebased in doc 58 §11.2.4 on the snapshot boundary rather
than on A7, which was retired rather than supplied.
**OQ-153** — `nightlyFrom`'s meaning. Now stated in doc 58 §11.2.1 for both endpoints that carry it.

## 22. OQs remaining

| # | Question | Status |
| --- | --- | --- |
| **OQ-154** | **Per-room guest allocation.** Capacity is checked in aggregate; the corpus states no rule for which guests occupy which room, which would matter for per-room extra-bed pricing | **new** |
| OQ-007 / B10 | child pricing and age bands — **still OPEN**; V1 refuses | open |
| OQ-008 / B11 | extra bed and extra adult — **still OPEN**; V1 refuses | open |
| OQ-029 / B23 | voucher rules — still OPEN; V1 refuses an offer code | open |
| OQ-022 / A7 | tax — **out of V1 scope**, retired rather than answered | open (out of scope) |
| OQ-122 | portfolio availability search — still unimplemented | open |
| OQ-151 | per-property availability accepts no occupancy | open |
| OQ-150 · OQ-146 · OQ-145 | bulk base rates · winning-rule candidates · horizon not exposed | open |
| OQ-143 · OQ-144 · OQ-119 | policy `summary` · policy-type catalogue · adjustment rounding | open |
| OQ-106 · OQ-141 · OQ-142 | media storage — why the hotel page carries no imagery | open |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-120 · OQ-133 · OQ-135 · OQ-136 · OQ-139 | open |

## 23. Known limitations

1. **Pricing needs JavaScript.** The quote is a POST and CSRF applies to every mutating method here.
   The availability search remains a plain GET form that works without it.
2. **The quote panel was never exercised on the live page**, because no property is published.
   Component tests and integration tests cover the behaviour; the responsive numbers come from a CSS
   harness. Nothing was published to make a screenshot.
3. **Capacity is aggregate** — OQ-154.
4. **A guest cannot express a party with children at all**, by design, and there is no path in V1 that
   prices one. That is a product restriction, not a defect.
5. **`total` always equals `roomsSubtotal`** in V1. Both are carried because doc 58 §11.2.1 names
   both, and they diverge the day a voucher layer arrives.

## 24. Recommendation for Step 16

> **The reservation request — `POST /public/reservations/requests` — which is where the price
> snapshot is actually written.**

It is the natural next step and, unusually, it is the **best-specified thing left**: doc 58 §3.3
freezes its request body, its `201` response *and* its `422 NO_AVAILABILITY` shape with alternatives.
Doc 56 §5.1–§5.3 freeze the snapshot, its re-versioning and its sealing. Doc 14 §4.1 freezes the S1
guard. That is more contract than the quote had.

Two things to settle before it can be honest, and they are the reason it is a recommendation rather
than a next task:

- **Config A6** (`"within the day"` SLA) is `OPEN`, and the frozen `201` response carries
  `"responsePromise": "within the day"` sourced from it. A response promise is a commitment to a
  guest; inventing one is worse than inventing a price.
- **Configs B1 and B2** (`DIRECT_ALTERNATIVE_HOLD_DURATION`, `DIRECT_REQUEST_HOLD_DURATION`) are
  marked `CONFIG REQUIRED` and are `NULL` in the database. Doc 14 §4.1's S1 transition creates a
  **request hold with an expiry**, and there is no expiry to give it.

If neither can be settled yet, **portfolio search (OQ-122)** remains the alternative that needs no new
commercial decision — `GET /public/properties` exists and `/[locale]/hotels` is still an empty shell.

Not started: reservation request, booking, payment, vouchers, tax (out of V1), media, customer
account, CMS, partner services, property submission.
