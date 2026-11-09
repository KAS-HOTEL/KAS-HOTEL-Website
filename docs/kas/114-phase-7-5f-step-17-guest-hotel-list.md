# PHASE 7.5F — STEP 17 — GUEST HOTEL LIST

**Date:** 2026-08-25
**Status:** ✅ **COMPLETE.** `/[locale]/hotels` is built on `GET /public/properties` and on nothing
else. One real layout defect was found by measurement and fixed. **OQ-122 remains OPEN.**

**Gates:** frontend typecheck · lint (0 warnings) · **419 tests** (was 399) · build (**20 routes**,
unchanged) · **0** npm vulnerabilities · backend **427 tests** unchanged (146 unit + 281 integration),
`BUILD SUCCESS` · Flyway **25 migrations, latest v23, 0 failed** · `git diff --check` clean · **zero
backend changes, zero migrations**.

---

## 1. Discovery

Phase A was run before a line was written. Four questions had to be answered from code, not from
what a hotel list is "supposed" to have.

**Does the endpoint exist, and is it public?**
`PublishedPropertyController` declares `GET /api/v1/public/properties` and carries
`@PublicEndpoint`. Verified live against the running backend: an unauthenticated request with no
cookie returns `200`.

**What does it return?**

```
PublishedProperty(slug, name, city, district, isFlagship, lifecycleState)
```

No `id`. No `partnerId`. **No media field.** Nothing commercial.

**What does it accept?** `locale`, and nothing else. No `page`, `size`, `sort`, `district`,
`character`, `amenity`, `collection`, `checkIn`, `checkOut`, `adults` or `children`. Doc
[58](58-phase-4-api-contract.md) §3.1 mentions `district`/`character`/`amenity`/`collection` as
filters in prose, but the implemented controller binds none of them. **Prose in the contract
document is not a parameter.**

**What decides which properties are listed?** The repository, inside its SQL:

```java
private static final String PUBLICLY_VISIBLE =
    "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";
```

`DRAFT` and `CLOSED` are excluded in the query, not in a service branch that could be forgotten.
Order is `ORDER BY p.sort_order, p.slug` — decided by the backend, and the frontend does not re-sort.

**No stop condition fired.** The endpoint exists, is public, and is sufficient for a list.

---

## 2. Existing contract

| | |
|---|---|
| Route | `GET /api/v1/public/properties?locale=` |
| Auth | `@PublicEndpoint` — unauthenticated, no cookie sent |
| Response | `PublishedProperty[]` |
| Empty array | **a success**, not an error |
| Ordering | `sort_order, slug` |
| Pagination | **none** |
| Filtering | **none** |
| Search | **none** |
| Media | **none** |

`spring.jackson.default-property-inclusion: non_null` still applies, so `city`, `district` and `name`
are **absent keys** rather than `null` when unset. The TypeScript type is optional *and* nullable and
is read through `?? null` accessors — the same discipline that fixed the Step 11 defect.

---

## 3. Route

`/[locale]/hotels` — a Server Component. It already existed as a placeholder, so the built route
count is **20, unchanged**; the route simply became dynamic (`ƒ`) now that it fetches.

Server-rendered rather than client-fetched, so the list is indexable, works without JavaScript, and
paints once instead of flashing empty. `isSupportedLocale(locale)` guards first: an unsupported
locale is `notFound()` **before** any request is made, which is verified by a test asserting the
backend was never called.

---

## 4. Permission

None, by design. The endpoint is public and takes no session, so `features/hotel/server.ts`
**forwards no cookie**. That is not an omission — it is the guarantee that the response cannot vary
by who is signed in.

No `Authorization` header is constructed anywhere. No `partnerId` is sent or received. The whole
page has no mutating call, so CSRF does not arise.

---

## 5. Search / filter behaviour

**There is none, and none was invented.**

The Step 17 brief is explicit: if the endpoint has no search, filter or pagination contract, client-
side search must not be invented unless the product brief authorises it. It does not. So the page
ships as a plain list: no facets, no district filter, no sort control, no date picker, no occupancy
selector, no price filter, no "available now" toggle.

This is **not** `GET /public/availability/search`. That endpoint is **OQ-122** and its facets and
response envelope are still undefined. Nothing on this page depends on it and nothing here
approximates it. A test asserts the rendered list contains **no `input`, no `select` and no
`button`**, so a future contributor cannot quietly add a fake search box without a test failing.

---

## 6. UX

Each card is a `<li>` containing an `<h2>` whose entire content is a `<Link>` to
`/{locale}/hotels/{slug}`. The link's accessible name is the hotel's name — which is what a screen
reader user is actually choosing between — rather than "view" or "read more". A test asserts the
absence of such generic link text.

Below the name, the location, assembled only from fields the response carried. Both `city` and
`district` absent renders **nothing**, not "Vietnam" and not an empty comma.

**What a listed hotel that cannot be booked says.** Doc [03](03-property-map.md) §8 lists
`COMING_SOON` with a teaser and `TEMPORARILY_CLOSED` as listed-but-unavailable. The card says which,
in a sentence. Words, not a colour tint.

**What the cards do not have.** No image, no price, no "from" price, no rating, no review count, no
availability, no discount, no amenity, no tax. Not as a design preference — none of it is on the
response, and a list of eight real hotels that invented any of it would be lying about them.

**No imagery, and not for want of a design.** `PublishedProperty` carries no media field. The list
contract offers no bulk gallery — `GET /public/properties/{slug}/gallery` is per property, which on
a list would be an N+1 against a contract that does not offer it. It would also return nothing:
media storage is unresolved (**OQ-106**) and the database holds **zero** assets. So the cards are
typographic. No placeholder image, no stock photograph, no storage key.

**What the page renders today.** `published = 0` — all eight seed properties are `DRAFT` — so the
live page renders its empty state, verified in the browser:

> Chưa có khách sạn nào được công bố
> Danh sách sẽ xuất hiện tại đây ngay khi khách sạn đầu tiên được duyệt và công bố.

That is a **success**, not an error, and it does not carry `role="alert"` — confirmed both by test
and on the live page. An empty portfolio and a broken backend must not look alike.

---

## 7. Security / isolation

| Check | Result |
|---|:--:|
| `localStorage` / `sessionStorage` / `indexedDB` | 0 — asserted in test *and* observed on the live page |
| `Authorization` / `Bearer` constructed manually | 0 |
| `partnerId` sent or rendered | 0 |
| `storage_key` / bucket / checksum in markup | 0 |
| `fetch(` outside `lib/api` | 0 |
| Hardcoded UUIDs | 0 |
| `console.*` | 0 |
| Mutating call (`post`/`put`/`patch`/`delete`) | 0 |

A backend failure is shown through the guest `ErrorState`, whose mapping is deliberately narrower
than the console's: only `400` and `422` show the backend's own words. A test feeds the loader a
`500` whose message contains `org.postgresql.util.PSQLException at 10.0.0.4:5432` and asserts none
of `PSQL`, `org.`, the host, the port, `localhost` or `SELECT` reaches the DOM.

An unreachable backend (a `TypeError`, not an `ApiError`) is normalised to status `0` and shown the
same way, rather than throwing into the framework error boundary.

---

## 8. Responsive evidence

**How this was measured.** No property is published, so the live page has no cards to measure. The
list markup was produced by rendering `HotelList` itself and rewriting the test-runner's CSS-module
stub names to the production generated names; **every resulting class was then verified to exist in
the built CSS chunk** before use. That markup was injected into the **real running page** at
`http://localhost:3000/vi/hotels`, so the origin, the fonts, the reset and the full cascade are the
real ones — not a hand-built harness. The data is the eight real seed rows; only `lifecycle_state`
was substituted, because all eight are `DRAFT` and a `DRAFT` card is a layout nobody can ever see.

This distinction matters: in Step 16B a hand-built harness produced a **phantom** 41px defect that
did not exist in the real page. Injecting into the real document removes that failure mode.

| Viewport | Pointer | Columns | Card width | Link min height | Doc overflow |
|---|---|:--:|---:|---:|---:|
| 375 × 812 | coarse | 1 | 343.0 px | 44.0 px | **0** |
| 768 × 1024 | fine | 2 | 344.0 px | 44.0 px | **0** |
| 1024 × 800 | fine | 3 | 304.3 px | 44.0 px | **0** |
| 1440 × 900 | fine | 3 | 368.0 px | 44.0 px | **0** |

Card heights range 126.8–184.4 px (a card with a not-bookable sentence is taller). Zero overlapping
card pairs and zero clipped text at every width. The live, uninjected empty-state page was also
measured at 375 coarse: **0 px overflow**.

### 8.1 A real defect, found by measuring

The first measurement at 375 coarse showed the page scrolling sideways by **31 px**. The grid track
resolved to **388.8 px inside a 343 px list**, and because a grid track is shared, *every* card
overflowed, not just the offending one.

**Cause, confirmed rather than assumed.** `Badge` is `white-space: nowrap`. `notBookableReason`
returns a *sentence* — "Khách sạn này sắp khai trương và chưa mở đặt phòng." — whose min-content
width in a pill measured **338.8 px**. Plus 48 px padding and 2 px border: 388.8 px exactly.

Both candidate fixes were tested in the live page before any file was edited:

| Change | Track | Doc overflow |
|---|---:|---:|
| *(before)* | 388.8 px | 31 px |
| Let the long sentence wrap | 343.0 px | **0** |
| `min-width: 0` on the card only | 343.0 px | 5 px |
| Both | 343.0 px | **0** |

**Fix.** The sentence is now rendered as a paragraph, which is exactly what the property detail page
already does with the identical string (`.notice`). Wrapping a sentence in a nowrap pill was the
inconsistency. `min-width: 0` was kept as well, with an accurate comment: grid items default to
`min-width: auto`, so one unbreakable string can still set the width of a whole track.

The short flagship pill remains a `Badge` — 133 px, and it wraps fine.

A regression test locks the fix: the reason must be a `<p>`, must not be inside the badge row, and
the badge row must hold exactly one pill.

---

## 9. Accessibility

- A real `<ul>` / `<li>` list, so a screen reader announces the count.
- One `<h1>` for the page, one `<h2>` per card — no level skipped.
- The link's accessible name is the hotel name; no generic "view" links.
- Tap target measured at **44 px minimum height at every viewport**, including 375 coarse.
- Body text 16 px; the not-bookable sentence wraps to 2 lines rather than truncating.
- The empty state is **not** `role="alert"` — it is not an error.
- Nothing is conveyed by colour alone: the not-bookable state is a sentence.

---

## 10. Tests

**+20 frontend tests** (399 → **419**), in `features/hotel/hotelList.test.tsx`. No existing test was
weakened, skipped or deleted.

| Area | Covered |
|---|---|
| Domain / API | locale sent and nothing else; no `page`/`sort`/facet/occupancy in the call; no `partnerId`/`Authorization`/`Bearer`/cookie |
| Parsing | empty array is a success; absent `city`/`district` render nothing; absent `name` falls back to the slug |
| Ordering | backend order preserved, nothing re-sorted |
| List | one `<li>` per property; semantic list; localised name |
| Routing | card links to `/{locale}/hotels/{slug}` — asserted for both `vi` and `en` |
| No fabrication | no `img`; no `storage_key`/bucket/checksum/URL; no currency, rating, availability, discount, tax or amenity string |
| Not a search | no `input`, no `select`, no `button`, no date/occupancy/facet label |
| Lifecycle | `COMING_SOON` and `TEMPORARILY_CLOSED` each say why; `OPEN` says nothing |
| Regression | the reason is a `<p>` outside the nowrap badge row (the 31 px overflow) |
| Errors | `500` renders `ErrorState`, not an empty list; no host/port/class/SQL leaks |
| Errors | unreachable backend normalised to status `0` |
| Page | unsupported locale → `notFound()` **and no backend call** |
| Page | empty portfolio → empty state, no `role="alert"`, no list |
| Security | no `localStorage`/`sessionStorage` writes |

Backend: **427 tests, unchanged**, `BUILD SUCCESS`. `PublicResponseDenylistTest` follows
`@PublicEndpoint` into any package, so the public DTO was already covered without a new test.

---

## 11. Database / Flyway

**No migration was created.** Nothing about a read-only list required one.

| | |
|---|---|
| Migrations applied | **25** |
| Latest version | **v23** |
| Failed | **0** |
| Properties | 8 |
| **Publicly visible** | **0** — all eight are `DRAFT` |
| Property translations | 16 (2 locales × 8) |
| Room types | 0 |
| Media assets | **0** |

**No data was seeded, altered or fabricated.** `GET /public/properties?locale=vi` returns `[]` and
`?locale=en` returns `[]`, which is why the live page shows its empty state.

---

## 12. Files changed

| File | Change |
|---|---|
| `frontend/src/lib/api/endpoints/publicHotels.ts` | `properties(locale)` wrapper |
| `frontend/src/features/hotel/load.ts` | `loadPublishedProperties` + `PublishedPropertiesResult` |
| `frontend/src/features/hotel/server.ts` | `publishedProperties` — `cache()`, no cookie |
| `frontend/src/features/hotel/HotelList.tsx` | **new** — the list |
| `frontend/src/app/[locale]/hotels/page.tsx` | rewritten — fetch, three states, metadata |
| `frontend/src/features/hotel/Hotel.module.css` | `.hotelList` / `.hotelCard` / `.hotelName` / `.hotelLink` / `.hotelLocation` / `.hotelNotice` / `.hotelBadges` |
| `frontend/src/features/hotel/hotelList.test.tsx` | **new** — 20 tests |
| `docs/kas/114-…` (this file), `docs/kas/00-README.md` | documentation |

**Zero backend files changed.** Verified by file-timestamp comparison against the Step 16B document
and by the unchanged 427-test result.

---

## 13. Open questions

| ID | Question | Status |
|---|---|---|
| **OQ-122** | **`GET /public/availability/search` — facets and response envelope undefined.** **OQ-122 remains OPEN.** Nothing in Step 17 touched it, and a list over `/public/properties` is not a substitute for it | **open** |
| **OQ-159** | **The public list's `locale` is a join, not a preference.** `JOIN property_translation t ON … AND t.locale = :locale` means a property with no translation in the requested locale is **omitted from the portfolio entirely** — a missing translation silently hides a hotel rather than falling back. Both seed locales are complete today, so the effect is invisible; it will not stay invisible. Should the query fall back to a default locale, or is omission intended? | **new** |
| OQ-106 · OQ-141 · OQ-142 | media storage unresolved — why these cards carry no imagery. `PublicMediaView` does expose `url`/`alt`, unlike the admin view | open (doc [105](105-phase-7-5f-step-9-room-media.md)) |
| OQ-153 | `nightlyFrom` undefined in doc 58 — one reason no "from" price appears on a card | open (doc [111](111-phase-7-5f-step-14-guest-availability.md)) |

---

## 14. Known limitations

1. **No search, no filter, no sort, no pagination.** The contract offers none, and Step 17 forbids
   inventing them. At eight hotels a plain list is adequate; at eighty it will not be, and that is
   OQ-122's problem to solve, not this page's.
2. **No imagery.** Blocked on OQ-106, not on design.
3. **Nothing is measurable against real content.** `published = 0`, so the responsive figures come
   from the real page with real markup injected. The *empty* state was measured live and unmodified.
4. **A missing translation hides a hotel** — OQ-159, above.
5. **`page` is `dynamic`.** It re-fetches per request. No caching policy has been specified for
   public reads; that is a question for whoever specifies one, not an assumption to make here.
6. **The 8 seed rows have no `district`,** so the two-part "District, City" label is exercised only
   by test, not by live data.

---

## 15. Recommendation for next step

The guest tree now reaches list → detail → availability → quote. The next honest gap is **not** more
guest UI — it is **Step 16A**, the reservation request, which is still **BLOCKED** on decision **A6**
(the response promise) and **B2**, and on a duplicate definition in the corpus. A guest can now be
quoted a price and still has no way to ask for the room.

Two candidates, in order:

1. **Unblock Step 16A** by supplying A6 and B2 and resolving the duplicate definition. Everything
   downstream of the quote depends on it.
2. **Resolve OQ-106** (media storage), which would let both this list and the detail page show the
   eight hotels rather than describe them.

**OQ-122 should not be resolved by widening this page.** It is a different endpoint with a different
response envelope, and approximating it in TypeScript would produce exactly the fabrication this
project has refused at every step.
