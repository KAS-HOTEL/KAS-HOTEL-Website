# Phase 7.5F — Step 14: Guest Availability

**Date:** 2026-08-20
**Status:** ✅ COMPLETE. **No migration. No backend change** — the endpoint was already implemented
and tested; Step 14 is the guest surface in front of it.

**Gates:** frontend typecheck · lint (0 warnings) · **368 tests** · build (**20 routes**) · 0 npm
vulnerabilities · backend **404 tests** unchanged, `BUILD SUCCESS` · Flyway **25 migrations, latest
v23, 0 failed** · `git diff --check` clean.

---

## 1. Public availability contract — verified, not assumed

**The frozen path is not the one the brief suggested.** Doc 58 §3.2 and the controller both say:

```
GET /api/v1/public/availability/properties/{slug}?checkIn=&checkOut=&locale=
```

not `/public/properties/{slug}/availability`. The implementation is used as frozen.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Endpoint | `GET /api/v1/public/availability/properties/{slug}` — doc 58 §3.2 |
| 2 | Query parameters | `checkIn`, `checkOut`, `locale` (defaults `en`). **Nothing else** |
| 3 | Response | `RoomTypeAvailabilityView[]` — six fields, §3 below |
| 4 | Access | `@PublicEndpoint`, unauthenticated, no permission. Doc 58 §3: *"Unauthenticated. Cacheable except availability."* |
| 5 | Date rules | `checkOut > checkIn`, `checkIn >= today`, `checkOut <= today + INVENTORY_HORIZON_MONTHS` when configured |
| 6 | Occupancy rules | **None on this route.** Doc 58 §3.2 names `adults`/`children`/`childAges[]`/`rooms` for `/availability/search` only, and the per-property row names no parameter at all |
| 7 | Inventory | `min(available_direct())` across every night; a night with no row makes the whole stay `0` |
| 8 | Pricing | `RateResolver.rank` — the same ranking the operator grid uses |
| 9 | `nightlyFrom` | the **lowest** nightly rate across the stay. Defined by the implementation, **not by doc 58** — see OQ-153 |
| 10 | Property lifecycle | `OPEN` **only** for availability; `OPEN`/`COMING_SOON`/`TEMPORARILY_CLOSED` for identity |
| 11 | Room lifecycle | `rt.status = 'PUBLISHED'` |
| 12 | Unpriced rooms | **omitted entirely**, never returned at zero |
| 13 | Unavailable rooms | **returned**, with `availableQuantity: 0` and `availableForWholeStay: false` |
| 14 | Zero inventory | returned as `0` — indistinguishable from missing inventory, by design |
| 15 | Currency | `Money { amountMinor, currency, exponent }`. VND is zero-decimal and sends `exponent: 0` |
| 16 | Estimate label | doc 56 §9 only — see §8 and OQ-152 |
| 17 | Maximum range | none frozen. The horizon is a setting; `MAX_STAY_NIGHTS` is unset |
| 18 | Cross-property | a non-`OPEN` property returns **`200 []`**, identical to an `OPEN` one with nothing to sell |
| 19 | Published media | **no public media route is wired**; OQ-106 still blocks storage, so the page carries no imagery |
| 20 | Denylisted fields | none present — §3 below |

**No stop condition fired.** Every semantic above is frozen in doc 58 §3.2, doc 03 §8, doc 55 §3.1,
doc 15 §12 or the implementation that transcribes them, and both settings the endpoint depends on are
supplied in the database: `MAX_ROOMS_PER_REQUEST = 5`, `INVENTORY_HORIZON_MONTHS = 24`.

## 2. Verified against the running stack

Not inferred from code — called:

```
GET /api/v1/public/properties/kas-passion-boutique-hotel          → 404
GET /api/v1/public/availability/properties/…?checkIn=…&checkOut=… → 200 []
```

A `DRAFT` property is a **404 on identity** and an **empty array on availability**. The guest page
composes exactly that: 404 → `notFound()`. Rendered live at `/vi/hotels/kas-passion-boutique-hotel`,
the browser shows *"Page not found"*, the title stays the generic `KAS`, and the DOM contains no
lifecycle state, no partner identity, no internal id and no permission wording.

## 3. Public DTO

**No operator DTO is reused.** `lib/domain/availability.ts` is a new module that mirrors the
backend's dedicated public types and imports nothing from `lib/domain/rate.ts` or
`lib/domain/inventory.ts`.

```ts
RoomTypeAvailability { roomTypeSlug, name, availableQuantity, maxQuantitySelectable,
                       nightlyFrom: Money, availableForWholeStay }
PublishedProperty    { slug, name?, city?, district?, isFlagship, lifecycleState }
PublishedRoomType    { slug, name, maxAdults, maxChildren, maxOccupancy, areaSqm?, viewType? }
```

Absent because the backend does not send them: `roomTypeId` · `partnerId` · `ruleId` ·
`appliedRuleIds` · `total` · `occupied` · `reserved` · `maintenance` · `otherBlocks` ·
`otaAllotment` · `bufferTarget` · `directCommitted` · `otaCommitted` · `inventoryDayId` · rate
`priority` and `specificity`. **`availableQuantity` is the only inventory figure on the public
surface**, exactly as doc 58 §3.2 states.

**The blocking denylist test already exists.** `PublicResponseDenylistTest` is a plain unit test —
not an `*IT` — so it runs under surefire and blocks the build. It walks
`RoomTypeAvailabilityView` by reflection at any nesting depth against the doc 58 §9 list, with one
documented exception (`total` is permitted only when its declared type is `Money`, which an
inventory count can never be). A frontend test asserts the same names never appear in the rendered
HTML, so a leak would have to survive both.

A base-priced and a rule-priced room are **indistinguishable** here, deliberately: the guest response
carries no rule identity at all, and the page shows none.

## 4. Publication ladder

Two predicates, both inside SQL, both stricter than the UI could be:

| Surface | Predicate |
| --- | --- |
| Property identity, room descriptions, policies | `lifecycle_state IN ('OPEN','COMING_SOON','TEMPORARILY_CLOSED')` |
| **Availability** | `p.lifecycle_state = 'OPEN'` **and** `rt.status = 'PUBLISHED'` |

Doc 03 §8 freezes the difference: `COMING_SOON` is "listed with a teaser", `TEMPORARILY_CLOSED` is
"listed, marked unavailable", and **neither is bookable**. So a listed-but-unbookable hotel gets a
page with a plain sentence saying which of the two it is, and **no search form at all** — running a
search that could only ever return empty would be worse than saying why.

`DRAFT` and `CLOSED` never reach either surface. The page's existence gate is the identity 404, so a
draft property, another partner's property and a slug that was never used are one answer.

## 5. Date rules

Mirrored from `AvailabilityService.requireUsableStay` and nothing else: a check-in no earlier than
today, and a check-out at least one night after it — doc 55 §2, *"a stay `checkIn → checkOut`
occupies nights `checkIn … checkOut − 1`"*. **The check-out night is neither occupied nor charged**,
and the form says so.

**No 30, 90 or 365-day cap is invented, and the horizon is not mirrored.**
`INVENTORY_HORIZON_MONTHS` is a backend setting no endpoint exposes (OQ-145), so a date beyond it is
left to the backend's own **422 `HORIZON_EXCEEDED`** and its message is rendered verbatim.
`MAX_STAY_NIGHTS` is unset, so no maximum stay is enforced or implied.

## 6. Occupancy rules

**No occupancy control is rendered, because the endpoint accepts none.** Doc 58 §3.2 names
`adults`, `children`, `childAges[]` and `rooms` on the **portfolio search** row; the per-property row
names no parameter, and the implemented controller takes `checkIn`, `checkOut` and `locale`.
Collecting a party size would gather input the backend cannot use and imply a filter that does not
exist. Recorded as **OQ-151**; a test asserts no such field is rendered and none is sent.

Occupancy is still *shown* — "Tối đa 3 khách" — from `GET /public/properties/{slug}/room-types`,
which is real public backend data, matched to the availability row by slug.

## 7. Inventory semantics

Every number is the frozen SQL's. `availableQuantity` is the **minimum of `available_direct()`
across every night** — doc 55 §3.1, *"never the first night, never an average"* — and
`available_direct()` is character-for-character the `inv_no_oversell` CHECK, so what a guest is shown
and what the database will enforce cannot drift.

**Missing is not zero, and the frontend never has to know that.** Doc 15 §12's fail-closed rule is
enforced *inside* the statement by comparing `count(i.date)` against the nights requested, so a
partially covered stay reports `0` rather than a partial number. Missing inventory and a configured
zero therefore arrive as the same `0` on the public contract, and the page renders one honest state
— *"Hết phòng cho khoảng ngày này"* — rather than inventing a distinction the contract does not draw.

Nothing subtracts, adds or predicts. There is no `available = total − occupied` anywhere: `total` and
`occupied` are not on the public response at all.

## 8. Pricing semantics

`nightlyFrom` is `RateResolver`'s, ranked by the frozen doc 56 §3.1 precedence — the same function
the operator grid uses, so a guest and an operator cannot be shown different winners. Nothing in
TypeScript resolves, ranks or breaks a tie.

**There is no unpriced state to render.** `AvailabilityService` drops a room type it cannot price or
cannot name in the requested locale, so no card can show a missing price — and none invents `0`,
"miễn phí" or a placeholder. A constant, `AVAILABILITY_OMITS_UNPRICED`, records why, and a test pins
it.

Money is formatted with **the exponent the response carried**, not an assumed one: VND is
zero-decimal (doc 56 §6) and a generic divide-by-100 renders every Vietnamese price 100× wrong. A
test asserts VND and a two-decimal currency both format correctly from the same function.

**The price is labelled an estimate.** Doc 56 §9: *"Until B6 and A7 are supplied, every displayed
price is an estimate and is labelled as one."* B6 is still `OPEN` there and A7 was **retired rather
than supplied** when tax left V1 scope, so the condition is unmet by either route and the label
stays. That the condition may now be permanently unsatisfiable is **OQ-152**. The wording states what
the number *is* — the lowest nightly rate for the chosen dates, per room — rather than implying a
stay total, because `nightlyFrom` is a "from" price and doc 58 §3.2 never defines it (**OQ-153**).

**No tax and no voucher.** Neither is on the response and neither appears; a test asserts the
rendered page matches none of `thuế|VAT|phí dịch vụ` or `voucher|mã giảm giá`.

## 9. Customer route

```
/[locale]/hotels/{slug}?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
```

Inside the existing locale architecture — `vi` and `en`, doc 25's two frozen locales, doc 22 §3's
prefix. An unsupported locale is `notFound()`. 20 routes; the customer tree gains exactly one.

## 10. Customer UX

**Every part of this page is a Server Component. There is no `'use client'` in the customer tree.**
The search is a plain `<form method="get">`, so submitting writes the dates into the URL and the
server renders the result: the journey works with **JavaScript disabled**, every result is linkable
and bookmarkable, and the back button behaves. On a public page that matters more than a client-side
transition.

The page reads: hotel name and location → a lifecycle note when it is not bookable → the date form →
results. A room card carries the name, occupancy and area, an availability badge in **words**, and
the price set apart and large.

**No booking CTA**, because nothing is behind one: the quote endpoint is unimplemented (OQ-123) and
Step 15 has not been built. A button that led nowhere would be worse than the note the page renders
instead, and a test asserts the results contain **no button and no link at all**.

## 11. Empty state

Four honest states, no fabricated data:

- **No dates yet** — "Chọn ngày để xem phòng trống". Availability is never fetched speculatively.
- **Nothing sellable** — "Không còn phòng cho khoảng ngày này". This is also what a non-`OPEN`
  property returns, and the page does not pretend to tell them apart.
- **Listed but not bookable** — the doc 03 §8 reason, with the form withheld.
- **Not published at all** — `notFound()`.

Today every seed property is `DRAFT`, so the fourth is what a visitor actually gets, and that is
correct rather than a defect. **No hotel, room type, price, availability, rating, review or discount
is invented anywhere.**

## 12. Responsive — measured

Measured against the **built** stylesheet at four widths, reloading after each resize.

| Width | Page overflow | Search | Room card | Submit | Date field | Targets < 44px |
| --- | --- | --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | 1 column | stacked | 44px | 44px | **none** |
| **768** | **none** (768/768) | 3 columns | side by side | 44px | — | n/a |
| **1024** | **none** (1009/1009) | 3 columns | side by side | — | — | n/a |
| **1440** | **none** (1440/1440) | 3 columns | side by side, page capped at 1152px | — | — | n/a |

Customer density, not operational: the tree carries no `data-density="operational"`, so it inherits
the editorial defaults `tokens.css` sets on `:root` — 44px controls everywhere, including on a mouse.
On a phone the card stacks with the price directly under the room and never scrolls sideways; at
1440 the content is capped at 72rem so line lengths stay readable instead of a dashboard stretched
to fill. A deliberately long room name wraps rather than overflowing.

**Same limitation as Steps 12 and 13.** No property is published, so the live page is a 404 and the
result layout cannot be measured on it — and publishing a seed property to make a screenshot is what
§13S and this brief both forbid. Measurement used a throwaway harness inlining the built CSS with the
real generated class names; it was deleted and the build re-run, and the final build contains no
trace of it. What *was* verified live is everything that exists today: the 404 path, the absence of
storage, the absence of any leak.

## 13. Accessibility

- **Both dates are labelled**, typed `date` so a phone opens its native picker, and floored with
  `min` — the check-out floor moves with the chosen check-in.
- **The refusal is associated with both fields** through `aria-describedby`, carries `role="alert"`,
  and is text — never colour alone.
- **Semantic structure**: `h1` for the hotel, `h2` for the search and the results, `h3` per room, a
  real `<ul>`/`<li>` list, and a `<form>` labelled by its own heading.
- **The result is announced** in a `role="status"` region naming the dates, the nights and how many
  room types are available.
- **The price is bound to its room**: each card's `aria-label` names the room, the state and the
  amount in one string, so a screen-reader user never pairs them by proximity.
- **A control that submits is a `<button type="submit">`**; there is no link styled as a button and
  no decorative container made interactive. The card itself is not a control, because there is
  nowhere for it to lead yet.
- **44×44 on every control**, verified by measurement rather than asserted.

## 14. SEO

The locale route is preserved and `alternates.canonical` is set to `/{locale}/hotels/{slug}`. The
title uses the hotel's name **only when the published endpoint returned one** — an unpublished
property is a 404 here, so its name can never reach a `<title>`, a crawler or a share preview, and a
test pins that the metadata falls back to the generic `KAS`.

**Nothing is noindexed.** Only `/admin/login` and `/partner/login` carry `robots: { index: false }`,
and both are untouched. No structured data is emitted, because doc 58 provides no field for it and
inventing one is out of scope.

## 15. Security

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `Bearer` · `partnerId` ·
`ruleId` · `appliedRuleIds` · `occupied` · `bufferTarget` · `console.*` · `fetch` outside `lib/api`:
**zero** in the customer surface. Every remaining textual match is prose in a doc comment explaining
what is absent.

**Public means public.** No authentication is introduced and none is required. The public loaders
**forward no cookie header at all** — deliberately, so the response cannot vary by who happens to be
signed in and a Partner browsing the customer site sees exactly what a guest sees. Live check on the
running app: `document.cookie` holds only `XSRF-TOKEN`, both web storages are empty.

`cache: 'no-store'` throughout — doc 58 §3 says "Cacheable **except availability**" and doc 15 §10
caps any future availability cache at 60 seconds with eager invalidation.

## 16. Errors

| Status | Guest sees |
| --- | --- |
| **200** | results, or the honest empty state |
| **400** `VALIDATION_FAILED` | the backend's own words — *"Check-out must be after check-in."* |
| **404** on identity | `notFound()`. **Never** re-described as a permission problem |
| **422** `HORIZON_EXCEEDED` / `CONFIG_MISSING` | the backend's own words — actionable by contract |
| **5xx** and unreachable | one constant: *"Hiện chưa thể kiểm tra phòng trống. Vui lòng thử lại sau ít phút."* |

The guest mapping is **deliberately narrower than the console's**: backend text is shown only for
`400` and `422`, whose messages doc 58 §2.1 marks as carrying actionable guidance and which
`KasException` authors for the caller. Everything else collapses to one string, so no SQL fragment,
class name, host name or configuration key can reach a public page even if the backend's exception
handling changed. Tests feed a `PSQLException` string and an `ECONNREFUSED 127.0.0.1:8080` through
the mapper and assert none of it survives.

## 17. Tests

**Frontend 368** (+34), all passing. **Backend 404, untouched** — no backend file was modified,
proven by mtime.

| Area | What is pinned |
| --- | --- |
| Contract | the exact endpoint and argument list; dates and locale only; **no occupancy parameter sent**; no partner, authorization or cookie in the call |
| Dates | nights exclude the check-out night; past check-in, same-day check-out and inverted range refused; **a 900-day range is *not* refused locally**, because no horizon is mirrored |
| Money | VND formats from `exponent: 0`; a two-decimal currency divides correctly |
| Publication | only `OPEN` is bookable; `COMING_SOON`/`TEMPORARILY_CLOSED` get a reason and no form; a 404 becomes `notFound`, never "forbidden" |
| DTO | fourteen denylisted names asserted absent from the rendered HTML; no rule provenance shown |
| Availability | available · sold-out · mixed · multiple rooms · the per-request cap shown only when it binds · empty result · **no price of zero and no "free" anywhere** |
| Errors | 400, 404, 422, 500 and unreachable; a `PSQLException` and an `ECONNREFUSED` are both scrubbed |
| UX | identity renders before any availability call; availability is fetched only once both dates are valid; an unusable stay never reaches the backend |
| Accessibility | labelled dates, `min` floors, `aria-describedby` on both fields, `role="alert"`, `role="status"`, `h1`/`h2`/`h3`, submit is a real submit, **no button and no link in the results** |
| SEO | title from the published name only, canonical set, **no `robots` on a public page**, generic title on 404 |
| Isolation | no web storage written; no `'use client'` in the customer tree |

No existing test was weakened; none needed changing, because Step 14 touches no console file.

## 18. Database / Flyway

**No migration. No V24. No seed data.** 25 migrations, latest **v23**, 0 failed.

Live counts: **`property` 8, of which published 0** · `room_type` 0 · `rate_rule` 0 · priced room
types 0 · `room_type_inventory_day` 0 · `app_user` 1. Not one property was published to make the page
render.

## 19. Files changed

**New (frontend only):** `lib/domain/availability.ts` · `lib/api/endpoints/publicHotels.ts` ·
`features/hotel/{load,server,StaySearchForm,AvailabilityResults,Hotel.module.css,hotel.test}` ·
`app/[locale]/hotels/[slug]/page.tsx` · this document.
**Modified:** `lib/api/endpoints/index.ts` (one export) · `00-README.md`.
**Backend: none.**

## 20. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-151** | **Per-property availability accepts no occupancy.** Doc 58 §3.2 names `adults`/`children`/`childAges[]`/`rooms` for `/availability/search` but not for the per-property route, so a guest cannot say who is travelling and results cannot be filtered by party size | **new** |
| **OQ-152** | **The estimate label's condition may now be unsatisfiable.** Doc 56 §9 labels prices estimates "until B6 and A7 are supplied"; A7 was retired rather than supplied when tax left V1 scope. Should the label be retired with it, or is B6 alone still enough to require it? | **new** |
| **OQ-153** | **`nightlyFrom` is undefined in doc 58.** §3.2 shows it only as an example value; that it means the lowest nightly rate across the stay comes from the implementation. A guest-facing "from" price deserves a frozen definition | **new** |
| OQ-122 · OQ-123 | portfolio search and quote are named by doc 58 §3.2 and **not implemented**; doc 58 gives the quote a request body but no response shape | open |
| OQ-150 | no bulk base-rate operation | open (doc 110) |
| OQ-146 · OQ-145 | winning-rule candidates · horizon not exposed by any endpoint | open |
| OQ-143 · OQ-144 · OQ-119 | policy `summary` · policy-type catalogue · adjustment rounding | open |
| OQ-106 · OQ-141 · OQ-142 | media storage — why this page carries no imagery | open (doc 105) |
| carried | OQ-102 · OQ-110 · OQ-111 · OQ-113 · OQ-114 · OQ-120 · OQ-133 · OQ-135 · OQ-136 · OQ-139 | open |

## 21. Recommendation for Step 15

> **The quote — but the response shape needs an owner decision first.**

`POST /public/availability/quote` is named by doc 58 §3.2 with its **request body frozen**
(`{ propertySlug, checkIn, checkOut, adults, children, childAges[], lines:[{roomTypeSlug, quantity}], offerCode? }`)
and **no response shape stated anywhere**. It is unimplemented, and OQ-123 exists precisely because a
quote is the guest-facing price commitment — inventing its shape is what this phase must not do.

So Step 15 splits cleanly, and the first half is the blocker:

1. **Settle the quote response.** Doc 56 §5.2 already freezes the *snapshot* shape — `lines[]`,
   per-night `rateMinor`, `lineTotalMinor`, `subtotalMinor`, `totalMinor`, `appliedRuleIds` — and
   doc 58 §3.3's submission response shows the guest vocabulary (`estimatedTotal`,
   `estimateDisclaimer`). A quote response is plausibly the snapshot minus everything on the §9
   INTERNAL denylist, but **that is a derivation, not a frozen contract**, and it needs the owner's
   word.
2. **Then implement it**, reusing the resolver — which already returns nothing if *any* night is
   unpriced, so a quote with a hole in it cannot be produced.

> **CORRECTION (2026-08-20).** §10 of this document called the quote "the guest-facing price
> commitment". It is not: doc 56 §5.1 and doc 14 §4.1 write the price snapshot at
> `salesStatus = REQUESTED`, which is `POST /public/reservations/requests`. The quote **creates
> nothing** — doc 58 §11.2.2. The commitment language was the reason for the caution, and the
> caution was right for a different reason: the response shape was unfrozen. It is frozen now.
>
> A second correction: `RateResolver.resolveStay` takes an `AuthorizationScope` and reads the
> **operator** repository, so a public path cannot use it. The guest path ranks candidates from
> `PublishedRateRepository` through the same static `RateResolver.rank`, which is what
> `AvailabilityService` already does — one implementation of the precedence rule, two ways of
> fetching its candidates.

Two things the request body forces into the open, both of which OQ-151 already touches: the quote
**does** take `adults`, `children` and `childAges[]`, and doc 56 §3's occupancy layer (configs B10
and B11, child pricing and extra beds) is still `OPEN`. A quote that accepts a child age and prices
it identically to an adult would be silently wrong, so those configs likely have to be answered
before a quote can be honest.

If the owner would rather not settle the quote yet, the natural alternative is **portfolio search**
(OQ-122) — the `/[locale]/hotels` list is already an empty shell, its endpoint
`GET /public/properties` exists, and it needs no new commercial decision.

Not started: quote, booking, payment, vouchers, tax (out of V1), media, customer account, CMS,
partner services, property submission.
