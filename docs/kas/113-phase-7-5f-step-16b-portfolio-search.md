# PHASE 7.5F — STEP 16B — PORTFOLIO SEARCH

**Date:** 2026-08-25
**Status:** 🟡 **PARTIAL.** The Partner portfolio surface is complete. **OQ-122 is not resolved** — it
is a different endpoint, and it remains blocked for the reason it was raised.

**Gates:** frontend typecheck · lint (0 warnings) · **399 tests** · build (20 routes) · 0 npm
vulnerabilities · backend **427 tests** unchanged, `BUILD SUCCESS` · Flyway **25 migrations, latest
v23, 0 failed** · `git diff --check` clean.

---

## 1. Discovery

Discovery produced one finding that changes the shape of the step, so it is stated first.

**OQ-122 is not the Partner portfolio.** Every citation in the corpus defines it as the *guest*
portfolio-wide availability search:

- doc 97:492 — `| OQ-122 | GET /public/availability/search — facets and response envelope undefined. | no |`
- doc 100:322 — *"`GET /public/availability/search` (**OQ-122**) … deliberately not implemented"*
- doc 99:440 — *"OQ-122/123 (availability search and quote response shapes absent from doc 58)"*
- doc 112:299 — `| OQ-122 | portfolio availability search — still unimplemented | open |`

The **Partner** portfolio, meanwhile, has existed since Step 5 at `/partner/properties`, backed by
`GET /api/v1/admin/properties`. So the brief's two subjects are two different things, and this
document is explicit about which one it delivered.

**What the backend actually offers.** `PartnerPropertyController.list()` takes **zero parameters** —
verified by counting `@RequestParam` on the file: none. It returns `List<PropertyAdminView>` for the
caller's whole scope. Doc 58 §8's Properties row names no parameter either:

> `| Properties | GET/POST/PATCH /admin/properties[/{id}], /publish, /preview | property.manage |`

No pagination convention exists anywhere in the repository.

## 2. Existing contract

| Capability | Existing endpoint? | Permission | Request | Response | Frozen doc | Usable? |
|---|---|---|---|---|---|---|
| List the partner's properties | ✅ `GET /admin/properties` | `property.manage` | **none** | `PropertyAdminView[]` | doc 58 §8 | ✅ |
| Search by name | ❌ | — | — | — | — | ❌ **not on the contract** |
| Search by slug | ❌ | — | — | — | — | ❌ |
| Filter by status | ❌ | — | — | — | — | ❌ |
| Filter by approval/submission | ❌ | — | — | — | — | ❌ |
| Pagination · sorting | ❌ | — | — | — | — | ❌ **no convention exists** |
| Property completeness | ✅ but **per property** — `GET /{id}/completeness` | `property.manage` | path id | `CompletenessResult` | doc 58 §8 | ⚠️ N+1 on a list |
| Submission history | ✅ per property — `GET /{id}/submissions` | `property.manage` | path id | `SubmissionView[]` | doc 58 §8 | ⚠️ same |
| Room-type count · media · rate readiness · updated-at | ❌ **not on `PropertyAdminView`** | — | — | — | — | ❌ |

`PropertyAdminView` returns exactly: `id, slug, names, lifecycleState, isFlagship, district, ward,
city, phone, sortOrder, version`. **Nothing else was displayed or filtered on**, because nothing else
is on the wire.

## 3. Route

`/partner/properties` — **unchanged**. No route was invented; the existing portfolio route was
upgraded, which is what the brief asks for when one already exists. Route count stays at **20**.

Filter state travels in the URL as `?q=&state=`, matching the console's existing convention (the
inventory and rate calendars both keep their range there).

## 4. Permission

`property.manage`, unchanged. **No permission was invented**, and no permission wording appears in
any UI state — a failure renders the existing `ErrorState`, and a scope miss remains the
indistinguishable 404 that doc 85 §6.3 requires.

## 5. Search / filter behaviour

**The filter runs over the response, not over a query parameter — and that is a contract decision,
not a convenience.** Adding `?q=` to the backend would be inventing a parameter doc 58 §8 does not
name.

It is safe here for one specific reason, which is worth stating precisely because it does not
generalise: the endpoint returns the **complete** set the caller's scope reaches and defines **no
pagination**, so there is no unseen remainder a client-side filter could hide, and narrowing a list
that is already scope-filtered in SQL cannot widen it. The day the portfolio outgrows one response
this belongs on the server — **OQ-158**.

Two controls, both backed by real fields:

- **Free text** over every locale of the name, the slug, and the three address parts. Case- and
  **diacritic-insensitive**: `NFD` normalisation plus mark stripping, so "khach san" finds "Khách
  sạn" and "quan 1" finds "Quận 1". That is text handling, not a business rule.
- **Lifecycle state** — the five frozen values of doc 03 §8, whose labels were already frozen in
  `lib/domain/property.ts` and already rendered in the table's status column. No enum was turned into
  a new user-facing category.

There is **no pagination control, no sort control**, and no filter for room count, completeness,
submission state or last-updated — none of which the list returns.

An unrecognised `state` in a hand-edited URL falls back to `all` rather than showing an empty screen.

## 6. UX

A plain `<form method="get">`, so submitting is a normal navigation: the result is linkable, the back
button behaves, and the screen works with JavaScript disabled. No client component was added.

States covered:

| State | Rendering |
|---|---|
| Populated | the existing `PropertyTable`, unchanged |
| Empty portfolio | the table's own empty state; **the filter is withheld**, since there is nothing to filter |
| Filter matches nothing | a distinct `EmptyState` with a "Xoá bộ lọc" link |
| Backend failure | the existing `ErrorState`; the filter is withheld |
| Loading | the existing server-rendered path — the page does not paint an empty table first |

**Neither empty state uses `role="alert"`.** A succeeded request that returns nothing is not an
error, and a filter matching nothing is not a failure.

The count line reports `showing/total` from the response — never a total the frontend believes the
portfolio ought to have. Step 5's rule that the frontend must not encode the number eight still holds.

## 7. Security / isolation

Scan over the new and modified feature files — `localStorage` · `sessionStorage` · `indexedDB` ·
`Authorization` · `Bearer` · `partnerId` · `console.*` · `storage_key` · `storageKey` · `tax` ·
`voucher` · `fetch` outside `lib/api` · hardcoded UUIDs: **zero, all of them, with no prose
exceptions to classify**.

The loader is called with **no arguments at all**, which a test asserts: there is no parameter for a
partner id to hide in. Scope stays where it was — inside the SQL — and the filter narrows a list that
was already scope-filtered, so it cannot widen visibility. No new API wrapper was added, because the
existing `propertiesApi.list` already covers it.

## 8. Responsive evidence

Measured in a real browser against the **built** stylesheet, reloading after each resize.

| Width | Page overflow | Filter layout | Table | Search / submit | Targets < 44px |
|---|---|---|---|---|---|
| **375** (coarse) | **none** (375/375) | 1 column | **scrolls inside its own region** | 44px / 44px | **none** |
| **768** | **none** (768/768) | 3 columns | fits | 34px (operational density) | n/a |
| **1024** | **none** (1009→1024/1024) | 3 columns | fits | — | n/a |
| **1440** | **none** (1440/1440) | 3 columns | fits | — | n/a |

At 375 the table is wider than the viewport and the page still does not scroll sideways — the
overflow is contained by the table's own wrapper, which is the intended behaviour.
A deliberately long property name wraps to 288px rather than forcing the page wide.

**A correction worth recording.** The first 375px measurement reported a row link at 43×41 and a
touch-target fix was applied. Re-measuring showed the real link is **63px** — the 41px reading came
from the harness rendering the `<a>` without its `identity` class, so it was measuring unstyled
markup. **The fix was reverted**: leaving a `min-height` rule and a comment describing a defect that
does not exist would put a false record in the codebase. The harness was corrected to reproduce the
real markup and the measurement redone.

**Honest limitation:** `/partner/properties` requires a session, so the measurement used a throwaway
harness inlining the built CSS with the real generated class names, as in Steps 12–15. It was deleted
and the build re-run.

## 9. Accessibility

Both controls use the existing `Input` and `Select` primitives, so each carries a real `<label>`, and
the search field carries a description. The form is labelled by its own `<h2>`. The submit control is
a real `<button type="submit">`. The count line is a `role="status"`, so a filtered result is
announced. The table keeps its `scope="col"` headers and caption. Status remains a `Badge` whose text
carries the meaning, not its tint. No dialog was added — the existing `Dialog` primitive is untouched.

## 10. Tests

**399** (+20), all passing. A new file, `portfolio.test.tsx`, rather than restructuring the existing
property suite, which has no API mocking and did not need any.

- **Domain** — diacritic- and case-insensitive matching · searches only fields the DTO returns · the
  id is *not* searchable · lifecycle filtering · text and state combined · a hand-edited URL falls
  back to `all` · a property whose optional address parts are **absent on the wire** (Jackson omits
  nulls).
- **Filter form** — a plain GET form whose field names become the query string · both controls
  labelled · exactly six options, five frozen states plus "all" · counts from the response · **no
  `page`, `size`, `sort` or `cursor` control**, and no filter for room count, completeness or revenue.
- **Page** — renders everything unfiltered · narrows by text **without a refetch** · narrows by state
  · reflects URL state back into the form · **distinguishes an empty portfolio from a filter that
  matches nothing**, neither with `role="alert"` · a backend failure is an error, not an empty
  portfolio · the loader receives no arguments · **property navigation is unchanged** · nothing is
  written to web storage.

No existing test was weakened or changed.

## 11. Database / Flyway

**No migration. No seed data. No test pollution.** Flyway **25 migrations, latest v23, 0 failed**.
Live: `property` 8 · `room_type` 0 · `rate_rule` 0 · `reservation` 0 · `inventory_hold` 0 ·
`app_user` 1 — identical to the Step 15 checkpoint.

## 12. Files changed

**Frontend new:** `features/property/PortfolioFilters.tsx` · `features/property/portfolio.test.tsx`.
**Frontend modified:** `lib/domain/property.ts` (filter domain) · `features/property/Property.module.css`
· `app/partner/(protected)/properties/page.tsx`.
**Backend: none** — verified by mtime, and the suite re-run unchanged at 427.
**Docs:** this document · `00-README.md`.

## 13. Open questions

| # | Question | Status |
|---|---|---|
| **OQ-158** | **Portfolio search is client-side because the list endpoint takes no parameters.** Correct while the response is the complete scoped set with no pagination; it stops being correct the moment a partner's portfolio outgrows one response. Needs a `q`/`status`/page contract on `GET /admin/properties`, which doc 58 §8 does not currently authorise | **new** |
| **OQ-122** | **NOT resolved.** `GET /public/availability/search` — the *guest* portfolio search — remains unimplemented: doc 58 §3.2 names its facets (`district?`, `amenity[]?`, `sort?`) but **no response envelope**, there is no district or amenity catalogue endpoint, and `sort` has no defined orderings. It also carries `adults`/`children`, which B10 makes a refusal. Implementing it would require inventing an envelope — the same class of gap that OQ-123 was, and it has not been settled the way OQ-123 was | **open** |
| carried | OQ-151 · OQ-154 · OQ-155/156/157 (Step 16A) · OQ-150 · OQ-146 · OQ-145 · OQ-143/144 · OQ-119 · OQ-106/141/142 · OQ-007/008/029 · OQ-022 (out of scope) · the long tail | open |

## 14. Known limitations

1. **Search is client-side** — OQ-158. Correct today, and the reason is documented rather than
   assumed.
2. **No readiness column.** Completeness exists only per property; putting it on a list would be an
   N+1 against a contract that does not offer it in bulk.
3. **The portfolio could not be measured signed in**, because the route requires a session. Measured
   through a CSS harness instead; the empty-portfolio and error states are covered by tests.
4. **Only two filters**, because only two are backed by returned fields.
5. **OQ-122 remains open** and this step did not attempt it.

## 15. Recommendation for next step

Two candidates, and the honest ordering depends on a decision that is not mine to make.

**If the owner can supply A6, B2 and a duplicate definition**, Step 16A — the reservation request —
is the highest-value work left and is unusually well specified: doc 58 §3.3 freezes the request body,
the `201` *and* the `422` alternatives; doc 56 §5.1–§5.3 freeze the snapshot; doc 14 §4.1 freezes the
S1 guard; and every relation it writes already exists in the schema.

**If not**, the next contract-clean piece is the **guest hotel list** — `/[locale]/hotels` is still an
empty shell and `GET /public/properties` exists and is frozen. That is *not* OQ-122: it is the plain
published-property list without availability facets, and it needs no new commercial decision. It
would also give the `otherProperties` half of OQ-156 somewhere to live.

**Not recommended:** attempting OQ-122 itself. Its envelope is undefined, its facets have no
catalogue endpoints, and its occupancy parameters are refusals under B10 — it would be inventing a
contract, which is what this phase exists to avoid.
