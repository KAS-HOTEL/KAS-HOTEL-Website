# PHASE 7.5F — STEP 18A — AVAILABILITY SEARCH / GUEST DISCOVERY — DISCOVERY

**Date:** 2026-08-25
**Status:** 🔴 **BLOCKED — CONTRACT AMENDMENT REQUIRED.** `GET /public/availability/search` cannot be
implemented from the frozen corpus. **OQ-122 remains OPEN**, and this step did not attempt it.

**Discovery only. Zero source changes. No migration, no seed, no test modified.**

**Gates:** frontend typecheck · lint (0 warnings) · **419 tests** · build (**20 routes**) · **0** npm
vulnerabilities · backend **427 tests** (146 unit + 281 integration), `BUILD SUCCESS` · Flyway
**25 migrations, latest V23, 0 failed** · `git diff --check` clean.

---

## 1. What OQ-122 actually is

Its originating and only table entry is doc [97](97-phase-7-5e-inventory-rates-availability.md):492:

> `| OQ-122 | GET /public/availability/search — facets and response envelope undefined. | no |`

**OQ-122 has no canonical register entry.** It is not in doc [16](16-open-questions.md), not in doc
28 §5, not in doc 50 §12. It exists only inside a phase-log table whose Blocking column reads `no` —
which is true of the *phase that raised it*, not of a step that would implement it. See **OQ-166**.

37 references across 19 files were traced. Every one defines it as the **guest** endpoint. It is not
the Partner portfolio (settled in doc [113](113-phase-7-5f-step-16b-portfolio-search.md) §1) and it is
not the hotel list (settled in doc [114](114-phase-7-5f-step-17-guest-hotel-list.md) §5).

---

## 2. Contract matrix

### A — Frozen contract

| Item | Source |
|---|---|
| Route and method: `GET /public/availability/search` | 58 §3.2:93 |
| Its nine parameter names: `checkIn, checkOut, adults, children, childAges[], rooms, district?, amenity[]?, sort?` | 58 §3.2:93 |
| Pagination **mechanism**: `?cursor=&limit=` (max 100) → `{ items[], nextCursor, total? }` | 58 §2 |
| Sort **mechanism**: `?sort=field:asc\|desc`, "from a documented allowlist" | 58 §2 |
| Filtering rule: "Explicit named parameters only. No arbitrary query passthrough" | 58 §2 |
| Money shape, error codes, `?locale=vi\|en` | 58 §2, §2.1 |
| Availability arithmetic: `available_direct()`, check-out exclusive, whole-stay | V10, doc 55 §3.1 |
| V1 occupancy refusals: `children > 0`, `childAges[]` non-empty, capacity exceeded, `offerCode` → **422** | 58 §11.2.3 **CONFIRMED owner decision** |

### B — Implemented backend capability

| Route | Parameters | Step |
|---|---|---|
| `GET /public/properties` | `locale` only | 17 |
| `GET /public/availability/properties/{slug}` | `slug, checkIn, checkOut, locale` | 14 |
| `POST /public/availability/quote` | body + `locale` | 15 |

`AvailabilityService` exposes exactly three public methods: `forProperty(...)`, `quote(...)`,
`static nights(...)`.

**There is no multi-property availability query anywhere.** The backend holds exactly one availability
statement — `PublishedAvailabilityRepository.AVAILABILITY_SQL` — and even the quote's multi-room-type
lookup calls `forProperty` for a single slug and filters in Java.

Two properties of that SQL matter for any future search:

```java
private static final String BOOKABLE = "p.lifecycle_state = 'OPEN'";
...
jdbc.sql(AVAILABILITY_SQL.formatted(BOOKABLE, "p.slug = :slug"))
```

The statement is **already parameterised on its property predicate**, so a portfolio variant would not
require restructuring it. And `BOOKABLE` is `OPEN` **only** — strictly narrower than the list's
publication predicate. The publication ladder differs per surface deliberately, and a search must
inherit the availability surface's narrower rung, not the list's.

### C — Existing frontend capability

Guest routes: `/[locale]`, `/[locale]/hotels`, `/[locale]/hotels/[slug]`. Components:
`HotelList`, `StaySearchForm` (a plain `<form method="get">`), `AvailabilityResults`, `QuoteSelector`.

**No facet, filter, sort, pagination or multi-property availability exists in the guest tree**, and a
Step 17 test asserts the list renders no `input`, `select` or `button`.

### D — Documented but undefined

| Token | What is missing |
|---|---|
| `sort?` | The mechanism is frozen; **the allowlist is never documented** for this or any public route |
| `rooms` | Appears **once** in the whole corpus — inside the §3.2 Purpose cell. Never defined → **OQ-164** |
| `district?` | No vocabulary, no catalogue endpoint. Column exists; **0 of 8 properties populated** |
| `amenity[]?` | Taxonomy exists (56 rows, 9 frozen categories) and `GET /public/amenities` is contracted — but **`property_amenity` holds 0 links** |
| `character` | Named in §3.1 for a *different* route. **No column, no table, no enum, nowhere in the schema** → **OQ-165** |
| `collection` | §3.1 route. Column exists; **0 of 8 populated** |

`character` and `collection` are **not** search parameters. They belong to §3.1's
`GET /public/properties` row. Step 17 already established that §3.1's filters are prose, not bound
parameters.

### E — Missing contract

**The search result item shape does not exist.** §3.2 contains one JSON block, and it is this:

```jsonc
{ "roomTypeSlug", "name", "availableQuantity", "maxQuantitySelectable",
  "nightlyFrom", "availableForWholeStay" }
```

That is `RoomTypeAvailabilityView` — the **per-property** response, implemented in Step 14. It carries
**no property identity of any kind**, so it cannot name which of the eight hotels a result belongs to.
A portfolio search whose results cannot be attributed to a property is not a search.

Undefined, in full:

1. Whether a result is a **property** or a **room type**.
2. What identifies it, and what a result carries.
3. Whether a price appears per result and, if so, what it means across room types.
4. The sort allowlist.
5. `rooms` semantics.
6. Whether a property with no availability is **omitted** or **returned with zero**.

### F — Unsafe assumptions, explicitly refused

| Tempting shortcut | Why it is refused |
|---|---|
| Call `/availability/properties/{slug}` eight times and merge | Invents the envelope, and is an N+1 against a contract that offers no batch |
| Reuse the §3.2 room-type block as the search item | It has no property identity; that absence **is** OQ-122 |
| Show a "from ₫X" per property | `nightlyFrom` is per room type and is undefined as a contract (**OQ-153**); a per-property "from" is a new price semantic |
| Accept `children`/`childAges[]` because §3.2 names them | §11.2.3 **refuses** them in V1 → folded into **OQ-122** (doc 113:201) |
| Ship `amenity[]?` filtering now | 0 property links: every amenity filter would return an empty set for all 8 hotels |
| Default the sort | "from a documented allowlist" — there is no allowlist to default within |

---

## 3. Can the three existing endpoints be composed safely?

**No.**

`GET /public/properties` (locale only) + `GET /public/availability/properties/{slug}` (one slug) +
`POST /public/availability/quote` (one property, explicit lines) compose to **list → detail →
availability → quote**, which is exactly the journey already built in Steps 14, 15 and 17.

They do **not** compose into a search. Doing so would require fanning out one availability request per
property and inventing a wrapper to hold the results — inventing the response envelope, the ordering
and the per-property price, which are the three things OQ-122 says are undefined.

---

## 4. Invariants — all verified intact

| Invariant | Where enforced |
|---|---|
| missing availability ≠ zero | `CASE WHEN count(i.date) = :nights … ELSE 0`, with `covered_nights` returned so the caller can distinguish |
| missing rate ≠ free | `AvailabilityService`:85 — "A room type with no resolvable rate is **omitted entirely**" |
| no carry-forward pricing | any unpriced night refuses the whole stay (`AvailabilityService`:277) |
| backend owns rate precedence | `RateResolver`; no pricing arithmetic in TypeScript |
| publication ladder backend-enforced | `BOOKABLE = 'OPEN'` in SQL; list predicate is separate and wider |
| no tax in V1 | `TaxIsOutOfScopeForV1Test` |
| no voucher invention | `offerCode` supplied → 422 (§11.2.3) |
| foreign resources → 404 | doc 58 §10; publication predicate lives inside the SQL |

---

## 5. Data readiness — a second, independent blocker

Even with a frozen envelope, two of the named filters would filter over nothing:

| | Rows |
|---|---|
| properties | 8 |
| **publicly visible** | **0** — all `DRAFT` |
| `property.district` non-null | **0 of 8** |
| `property.collection` non-null | **0 of 8** |
| `property_amenity` links | **0** |
| `amenity` taxonomy | 56, across the 9 frozen doc 03 §6 categories |
| room types · inventory days · rate rules | **0 · 0 · 0** |

This maps to configs already open in doc [51](51-phase-4-configuration.md): **A9** (amenity taxonomy
*and per-property assignment*) and **A10** (property districts and addresses). **No new OQ is needed
for it** — the register already carries both. It does mean that freezing the envelope alone would not
produce a working search.

---

## 6. Open questions

**Numbering note.** The highest OQ in the corpus is **OQ-159**. **OQ-160–OQ-163 are reserved** for the
Step 16A discovery report delivered on 2026-08-25, whose proposals are not yet written to the corpus.
Step 18A therefore allocates from **OQ-164**.

| ID | Question | Status |
|---|---|---|
| **OQ-122** | **`GET /public/availability/search` — facets and response envelope undefined.** Still open. Decomposed into the six answerable parts in §2E above. Doc [113](113-phase-7-5f-step-16b-portfolio-search.md):201 **already** folds the `children`/B10 refusal conflict into this OQ — it is not a separate question and no new number was allocated for it | **OPEN** |
| **OQ-164** | **`rooms` is named once and defined nowhere.** It appears only inside the §3.2 Purpose cell. Is it the number of rooms requested? A per-room-type quantity? A cap? Nothing else in the corpus, the schema or the code uses it | **new** |
| **OQ-165** | **`character` names a concept that does not exist.** Doc 58 §3.1 lists it as a filter for `GET /public/properties`. There is no `character` column, table, enum or reference anywhere in V1–V23 or in the Java. Either a schema concept is missing, or the word should be struck from §3.1 | **new** |
| **OQ-166** | **No canonical register covers OQ-084 and above.** Doc 16 stops at OQ-083; OQ-122 and its successors live only in phase-log tables in the format `ID · Question · Blocking`, not the register's `ID · Category · Issue · Current information · Impact · Recommendation · Status`. This is why OQ-122 reads `Blocking = no` while in fact blocking Step 18A | **new — process** |
| OQ-153 | `nightlyFrom` is undefined in doc 58 — shown only as an example value | open (doc [111](111-phase-7-5f-step-14-guest-availability.md)) |
| OQ-151 | per-property availability accepts no occupancy | open (doc 111) |
| OQ-159 | the public list's `locale` is an inner join, so a missing translation hides a hotel | open (doc 114) |

---

## 7. What the owner must supply

One decision, and it has a precedent. **OQ-123 — the quote response shape — was closed exactly this
way in Step 15**: an owner-approved amendment froze it as doc 58 §11.2.1, and implementation followed
immediately. OQ-122 is its sibling and needs the same treatment.

**Required: an amendment to doc 58 §3.2 freezing, for `GET /public/availability/search`:**

1. **The unit of a result** — a property, or a room type within a property.
2. **The result item shape** — every field, explicitly including how a result names its property.
3. **The envelope** — confirm §2's cursor pagination applies (`{ items[], nextCursor, total? }`), or
   state what replaces it.
4. **The sort allowlist** — the permitted `field` values for `?sort=field:asc|desc`, and the default
   ordering when `sort` is absent.
5. **`rooms`** — its meaning and validation (OQ-164).
6. **Empty-availability behaviour** — omitted, or returned with zero.
7. **The V1 ruling on `children` / `childAges[]`** (folded into OQ-122) — refuse at the search boundary, or drop
   the parameters from §3.2 for V1.

Separately, and not blocking the amendment: **A9** and **A10** must be supplied before `amenity[]?` or
`district?` can return anything.

---

## 8. Files changed

| File | Change |
|---|---|
| `docs/kas/115-…` (this file) | **new** — Step 18A discovery, OQ-164 · OQ-165 · OQ-166 |
| `docs/kas/00-README.md` | index row + current-phase line |

**No source file, no migration, no test, no seed data was touched.**

---

## 9. Recommendation

**STOP. Do not implement OQ-122.**

The frozen corpus gives the route, nine parameter names and a generic pagination convention. It does
not give the one thing a search must have: **a result that can say which hotel it is.** Building it
would mean inventing the envelope, the ordering and a per-property price semantic — three inventions,
on the guest-facing surface, about eight real hotels.

There is also nothing to search yet: `published = 0`, `room_type = 0`, `inventory_day = 0`,
`rate_rule = 0`. A working search would return an empty list on every query.

**Recommended next step instead — in order of value:**

1. **Unblock Step 16A** (A6, B2, duplicate semantics, OQ-016). A guest can now be quoted a price and
   still cannot ask for the room. That is the largest gap in the product.
2. **Amend doc 58 §3.2** per §7 above, which converts Step 18A from blocked into a normal
   implementation step — the same path OQ-123 took.
3. **Supply A9 and A10**, without which the two named filters have no data.
