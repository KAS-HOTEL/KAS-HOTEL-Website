# 97 — Phase 7.5E: Inventory, Rates & Availability Foundation

**Status:** 🟡 **CORE COMPLETE — three sub-areas BLOCKED on frozen-material ambiguity**
**Date:** 2026-08-18
**Tests:** 309 pass · 0 failures · 0 skipped *(was 259 after 7.5D)*
**Migration:** **none** — the Phase 7.2 schema was sufficient
**Seed data:** none. No quantity, rate, tax, buffer or horizon value was invented

> ⚠️ **SUPERSEDED IN PART — this is the checkpoint record of 7.5E as it stood before the owner
> decisions of 2026-08-18.** All three blockers below were closed that day: OQ-115 (buffer
> precedence) and OQ-117 (quantity and horizon) were answered, and **OQ-116 was closed by ruling tax
> out of KAS V1 scope entirely**. Rate authoring and bulk pricing were also delivered afterwards.
> The document is left as written — it is the record of what was known then. For current status see
> [99](99-phase-7-5e-owner-decisions-applied.md).

---

## 1. Verdict first

| Area | Status |
| --- | --- |
| Inventory day model, ownership, operator maintenance | ✅ implemented and proven |
| **No-oversell invariant preserved, unchanged** | ✅ **proven under 12-way contention** |
| Direct / OTA separation | ✅ preserved and proven |
| Availability engine, fail-closed in every branch | ✅ implemented and proven |
| Public availability contract (doc 58 §3.2) | ✅ implemented at its frozen path |
| Rate rules — resolution, precedence, ties | ✅ implemented and proven |
| Rate rules — admin authoring API | ⚠️ **not delivered this phase** (§14) |
| OTA safety buffer — consumed by availability | ✅ |
| **OTA safety buffer — rule resolution / materialisation** | 🔴 **BLOCKED — stop condition 5** (§10) |
| **Tax rules — any calculation** | 🔴 **BLOCKED — stop condition 4** (§11) |
| **Rolling-horizon inventory generation** | 🔴 **BLOCKED — stop condition 2, partial** (§5) |
| Holds — availability semantics incl. defensive expiry | ✅ implemented and proven |
| Holds — creation / release / sweep service | ⚠️ not delivered this phase (§12) |

The brief's §39 gate is not fully proven, so by its own rule the phase status is
**BLOCKED**. The blockage is precisely located: three sub-areas cannot be built without
inventing a business rule the frozen corpus does not contain. Everything that *is*
determinable was built and tested rather than held hostage to them.

---

## 2. Schema findings — what is actually there

The brief's §2 warned "Do NOT assume the names mean what they usually mean." That was
warranted. Five findings changed the shape of the work:

1. **The table is `room_type_inventory_day`, not `inventory_day`.** There is no
   `inventory_day` relation in schema `kas`.
2. **`available_direct(room_type_inventory_day)` already exists as an IMMUTABLE SQL
   function**, character-for-character identical to the `inv_no_oversell` CHECK. Doc 88 §7
   gives the reason: availability is a function "so availability can never be typed in by
   an operator."
3. **Two views exist and are load-bearing** — `v_room_type_availability` and
   `v_active_hold_demand`. The second filters `expires_at > now()`, which is the frozen
   half of the defensive-expiry rule (§8).
4. **There is no `ota_allotment` column anywhere in the schema.** Doc 88 test 19 records
   the withdrawn `ota_reserved <= ota_allotment` constraint as "verifiably ABSENT"; the
   column it referred to does not exist either. Nothing was added.
5. **`room_type` has no room-count column.** `property.total_rooms` exists at whole-hotel
   level and no document relates the two. This is §5.

```
room_type_inventory_day
  PK (room_type_id, date)
  total, maintenance, other_blocks, direct_committed, ota_committed, buffer_target
      all integer NOT NULL DEFAULT 0
  CHECK inv_no_oversell:
      total - maintenance - other_blocks - direct_committed - ota_committed
            - GREATEST(buffer_target - ota_committed, 0) >= 0
  FK room_type_id -> room_type ON DELETE RESTRICT
  No status column. No occupied column. No triggers.
```

---

## 3. The invariant — untouched, and re-proven

The CHECK was not modified, relaxed, wrapped or moved. No `occupied` column was added.
No application counter replaced it. Doc 15 §2.2 is the reason, and it is quoted in the
module comment:

> Application logic can have bugs. A `CHECK` constraint cannot be bypassed by a bug in a
> service, a missing validation, a race condition, or a direct admin action.

Every Java path in `inventory` is explicitly an optimisation for user experience layered
over that guarantee. `InventoryDay.availableDirect()` mirrors the formula for previews,
and its javadoc says plainly that it is *not* the guarantee.

### 3.1 Concurrency — Phase 7.2's proof, now in the build

Doc 88 §8.2 recorded the result from a shell script. `InventoryConcurrencyIT` reproduces
it with real threads on real connections, and extends it:

| Test | Result |
| --- | --- |
| 12 transactions claim the last room | committed 1 · rejected 11 · deadlocks 0 · `available_direct` 0 |
| 12 racers, 12 rooms | committed 12 — proves the guard is not merely a mutex |
| Direct **vs** OTA for the same last room | exactly 1 wins, either channel · deadlocks 0 |
| Buffer boundary | direct blocked at 0 while buffer withholds; 5 OTA claims succeed; availability never negative |
| Mixed quantities and channels | `available_direct >= 0` always |

The losers fail on SQLSTATE `23514` — the constraint — not on a Java guard. That is the
claim being made.

`InventoryConcurrencyIT` is the one integration test that is **not** `@Transactional`:
contention between threads sharing one transaction is not contention. It cleans up its own
fixtures, and §15 verifies the database is empty afterwards.

---

## 4. Ownership and isolation

`room_type_inventory_day → room_type → property → partner`, enforced by the shared
`ScopeFilter` **inside every statement**, writes included. `InventoryDayRepository`
implements `ScopedRepository`, so `ScopeEnforcementStructureTest` requires an
`AuthorizationScope` parameter on every public method.

Cross-partner access returns **404, never 403** (doc 85 §6.3). `InventoryIT` exercises the
calendar, the single-cell PATCH and the bulk apply with the wrong session, then asserts the
target partner's inventory is byte-for-byte untouched.

---

## 5. 🔴 Room quantity and horizon generation — the located gap

### What is determinable, and was built

The per-room-type room count is **operator-entered per date**, through the frozen doc 58 §6
routes. That is fully specified and is implemented:

- `PATCH /ops/inventory/{roomTypeId}/{date}` — `total`, `maintenance`, `otherBlocks`
- `POST /ops/inventory/bulk` and `/bulk/preview` — range edits, preview mandatory

Corroborated by doc 52 §3.3 ("System writes commitments; `ADMIN` edits `total`,
`maintenance`, `otherBlocks`"), doc 59 §4.2 (`inventory.adjust` names the same three
columns) and doc 04 §4.3 (the calendar with "inline editing of `maintenance` and `total`").

The **value** is business input **A2**, status `OPEN`, owner Operations (doc 51 §2). None
was invented: production inventory rows remain **zero**.

### What is not determinable

Doc 13 §3.3 and doc 15 §4.4 both specify horizon generation the same way:

> Inventory rows exist for a rolling **24-month** horizon, generated by a scheduled job
> **that seeds each new date from the room type's default `total`**.

**There is no such column.** `room_type` carries no count, and no document says where the
"default total" lives, who sets it, or what the job does when it is absent. Doc 55 §2 —
the authoritative Phase 4 inventory document — restates the horizon and silently drops the
seeding clause.

So the generation job was **not** implemented. Copying the last known day's total forward
would be inventing the rule; defaulting to zero would generate a horizon of unsellable
days that looks like configured inventory. **OQ-117.**

This is safe in the meantime because a missing row already means unavailable (§7), not
unlimited.

---

## 6. Direct versus OTA

The two counters are never interchangeable and are never merged. `direct_committed` and
`ota_committed` are moved by separate repository methods, and the doc 55 §3.1 asymmetry is
preserved exactly: the buffer withholds only `GREATEST(buffer_target - ota_committed, 0)`,
so OTA commitments are counted **once**, as OTA.

Doc 55 §3.2's worked example is a test:

| | 10 rooms, buffer 5, OTA 3, direct 2, maintenance 1 |
| --- | --- |
| Withdrawn formula | `10 − 5 − 2 − 3 − 1 = −1` ✘ would break the CHECK |
| Frozen formula | `10 − 1 − 2 − 3 − max(0, 5−3) = 2` ✔ |

No `booking.source`, no `reservation.source`, no generic `status` was introduced.
`ForbiddenConceptsTest` still passes.

---

## 7. Availability — and every way it fails closed

Doc 55 §3.1 is the authority; doc 15 §4.1 supplies the whole-stay rule ("the **minimum**,
not the average and not the first night"). `PublishedAvailabilityRepository` computes it in
one statement, calling the **frozen SQL function** rather than reimplementing it — so the
number a guest sees and the number the CHECK will enforce cannot drift.

Doc 15 §12's governing principle, tested branch by branch:

| Condition | Result | Evidence |
| --- | --- | --- |
| Inventory row missing for any night | whole stay reports 0 | doc 15 §12 |
| Property `COMING_SOON` | not offered | doc 03 §8 — Bookable: **No** |
| Property `TEMPORARILY_CLOSED` | not offered | doc 03 §8 |
| Room type not `PUBLISHED` | not offered | doc 52 |
| **No resolvable rate** | **room type omitted entirely** | brief §28 |
| No name in the requested locale | omitted | presentable ⇒ sellable |
| `MAX_ROOMS_PER_REQUEST` unset | **422 `CONFIG_MISSING`** | doc 58 §2, §3.2 |
| Beyond a configured horizon | 422 `HORIZON_EXCEEDED` | doc 58 §2.1 |
| Unknown slug | `200 []`, disclosing nothing | — |

**Bookability is `OPEN` only.** This is the one read model whose filter is strictly
narrower than the visibility filter used by property, room-type, media and policy reads,
which admit `COMING_SOON` and `TEMPORARILY_CLOSED`. Doc 03 §8 freezes it in a table and doc
67 repeats "Not bookable". A property approved into `COMING_SOON` by Phase 7.5A is listed
and unsellable, exactly as doc 93 §5 intended.

### 7.1 Availability is refused entirely today

`maxQuantitySelectable` is defined by doc 58 §3.2 as `min(available, config B15)`, and
**B15 is unset**. It is a booking constraint, not decoration — emitting it as null would
leave a guest able to select past the group-enquiry threshold. So public availability
returns `422 CONFIG_MISSING` naming `MAX_ROOMS_PER_REQUEST` until KAS supplies it.

That is the designed behaviour, not a defect, and it is what brief §28 requires.

---

## 8. Holds

Holds are **not** a separate subtraction. Doc 55 §3.1 puts them inside `DirectCommitted`,
and §3.4 makes the column the cache of that expression — so creating a hold increments
`direct_committed`.

### The defensive-expiry arithmetic, derived

Doc 55 §3.5 promises the availability query excludes expired holds "even if the sweep has
not yet run", but states no arithmetic. It is forced by §3.1 + §3.4 together: the authority
counts only holds "not past `expires_at`", the cache counts all ACTIVE holds, so the cache
is too high by exactly the expired-unswept quantity. Therefore:

```sql
effective = available_direct(i.*)
          + Σ quantity of ACTIVE holds where expires_at <= now()
```

This is the same predicate `v_active_hold_demand` applies from the other side. Tested both
ways: an active hold consumes availability; an expired-but-unswept hold is given back while
`direct_committed` still carries it.

**Not delivered:** hold creation, release and the 5-minute sweep of doc 55 §5.1. Creation
is gated on `DIRECT_REQUEST_HOLD_DURATION` / `DIRECT_ALTERNATIVE_HOLD_DURATION`, both
unset, and doc 55 §5 rule 2 is explicit — "No configured duration ⇒ no hold". The sweep
needs scheduler infrastructure this build does not have (doc 89 has none). **OQ-118.**

---

## 9. Rates — resolution proven, authoring not delivered

Doc 56 §3.1 gives a complete, deterministic algorithm, and it is transcribed rather than
interpreted:

```
candidates = ACTIVE rules matching room type / property, date range,
             day-of-week, channel_scope IS NULL, rate_plan_id IS NULL
if empty  -> room_type.base_price_minor
winner    = ORDER BY priority DESC, specificity DESC LIMIT 1
```

The specificity ladder is doc 56 §3.1's, verbatim: room-type + dates + day-of-week ▸
room-type + dates ▸ room-type ▸ property + dates ▸ property ▸ base.

**Ties are refused, not resolved.** Doc 56 §3.1: "Ties on `(priority, specificity)` are a
**configuration error**, not a coin flip." A resolver that silently took the first row
would make the price depend on PostgreSQL's row order. Two guards: a write-time check
(`tiesWithExisting`, which is where doc 56 puts it) and a resolve-time refusal (because
rows can predate the guard, and a paused rule can be re-activated into a tie).

**No rate means not sellable.** Doc 56 §3 calls Layer 0 "always present"; the column is
nullable and config B6 is `OPEN`. An unpriced room type is omitted — never quoted at zero,
never at a guess, and an adjustment percentage with no base to adjust yields nothing rather
than a free room.

`RateResolutionIT` proves all fourteen cases through the price a guest is actually quoted.

**Not delivered:** the doc 58 §8 authoring routes (`GET /admin/rates/grid`,
`POST /admin/rate-rules`, `/bulk-preview`, `/bulk-apply`). The contract exists, so this is
scope not delivered rather than a blocker — rules can currently only be created by direct
SQL. Recorded honestly rather than half-built. **OQ-124.**

One arithmetic detail is unstated anywhere: the **rounding mode** for
`base * (1 + adjustment_percent/100)` against zero-decimal VND. `HALF_UP` is used, marked
PROPOSED. **OQ-119.**

---

## 10. 🔴 OTA safety buffer — BLOCKED (stop condition 5)

`buffer_target` is honoured everywhere: it is in the CHECK, in `available_direct()`, in the
availability query, and in the concurrency tests. What cannot be built is the
**resolution** of `ota_safety_buffer_rule` rows into that column.

Doc 55 §6.1 is one sentence: "Rules resolve by `priority`, most specific first."
`PERCENTAGE` is of `total` and rounds up; with no matching rule `bufferTarget = 0`. That
last clause is why the current state is safe — with zero buffer rules configured, zero is
the *specified* answer, not a default I chose.

Five things it does not say, each of which changes the number:

1. **Priority direction.** Higher or lower wins? Unstated. Rates say `priority DESC`
   explicitly (doc 56 §3.1); buffers say only "by priority".
2. **Priority versus specificity as the outer sort.** "by `priority`, most specific first"
   parses both ways.
3. **The specificity ladder.** Doc 56 enumerates six levels for rates. For buffers exactly
   one comparison is stated (property + room type + dates beats property-wide). Where
   `days_of_week` and `distribution_channel_id` sit is unstated.
4. **Ties.** No rule, no editor guard, and — unlike rates — no stated principle that a tie
   is a configuration error. The table has no unique constraint.
5. **Channel-scoped rules against a scalar column.** `ota_safety_buffer_rule` carries
   `distribution_channel_id`, but `buffer_target` is *one integer per (room type, date)*.
   If an Agoda rule says 3 and a Booking.com rule says 2, nothing states whether the
   materialised target is 5, 3, or something else. This is structural, not a wording gap.

The contrast with rates is decisive: the frozen corpus specified rate precedence
completely and deliberately, and did not do the same for buffers. Guessing here changes how
many rooms are withheld from direct sale on every date — a commercial decision.
**OQ-115.** Buffer values themselves are config **B3**, status `BLOCKED` (doc 51 §3).

---

## 11. 🔴 Tax rules — BLOCKED (stop condition 4)

Doc 56 §4 blocks itself, in its own heading:

> **BLOCKED — config A7 / legal L4.** VAT rate, service charge, and inclusive-vs-exclusive
> display are undefined.

and, on ordering:

> **Ordering matters and must be confirmed**: service charge is commonly applied before
> VAT, so `applies_to` exists to make the sequence explicit rather than assumed.

"Must be confirmed" is not a specification. Beyond the missing percentages — which the
brief correctly says should not stop the *mechanism* — the resolution rules themselves are
absent: whether matching rules stack or a single most-specific one wins; whether a
property-scoped rule replaces or adds to a global one; what `is_inclusive` does
arithmetically; whether `ROOM_SUBTOTAL` is pre- or post-discount; and how `tax_type` maps
onto `reservation.tax_minor` versus `service_charge_minor`.

No tax code was written. Doc 56 §4 already states the correct interim behaviour — "the tax
line renders as `estimated` … and **no fabricated number**" — and doc 58 §3.2's availability
response has no tax field at all, so this blocks nothing that was delivered. **OQ-116.**

---

## 12. Configuration

The Phase 7.3 mechanism was already correct and is reused unchanged: `SystemSettingService`
exposes only `require…` accessors, with no `getOrDefault` and no fallback overload, because
"an API that *offers* a default is an API that will eventually be given one". A missing
value raises `MissingConfigurationException` → `422 CONFIG_MISSING` naming the key.

Two settings are treated differently on purpose, and the difference is reasoned rather than
convenient:

- **`MAX_ROOMS_PER_REQUEST`** — hard requirement (§7.1). Availability refuses without it.
- **`INVENTORY_HORIZON_MONTHS`** — refines the *message*, never the safety. A date past
  the horizon has no row and is already unavailable; the horizon only distinguishes "not
  yet open for booking" from "unavailable" (doc 55 §9). Unset, that distinction is not
  drawn. Enforcing an invented 24 months would be no safer and *would* be a fabricated
  value — doc 55 §2 states 24 as design intent, but the runtime authority is the setting,
  and it is NULL. **OQ-125** asks whether 24 should simply be supplied.

All 18 settings remain NULL after the suite.

---

## 13. Time

`Clock` is now a bean, fixed to `Asia/Ho_Chi_Minh`. This is transcribed, not chosen — doc
55 §2 is CONFIRMED: "All inventory dates are **property-local calendar dates** in
`Asia/Ho_Chi_Minh`", and doc 15 §12 adds "dates computed in the property timezone".
Instants are unaffected; a `Clock`'s zone changes which calendar date it reports, never
which moment.

(Contrast doc 96 §7's OQ-112, where the policy `effective_from` timezone genuinely *is*
unspecified. Here it is specified, so it is followed.)

---

## 14. API

**Public — implemented at the frozen path:**

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/v1/public/availability/properties/{slug}` | doc 58 §3.2 |

Response is doc 58 §3.2's shape exactly: `roomTypeSlug`, `name`, `availableQuantity`,
`maxQuantitySelectable`, `nightlyFrom`, `availableForWholeStay`. No room type id, no
counters, no holds.

**Public — deliberately not implemented:**

- `GET /public/availability/search` — needs facets and a response envelope doc 58 does not
  define. **OQ-122.**
- `POST /public/availability/quote` — doc 58 gives the request body and **no response
  shape**. A quote is the guest-facing price commitment; inventing its shape is exactly
  what this phase must not do. **OQ-123.**

**Operations — implemented at the frozen paths, doc 58 §6:**

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/ops/inventory` | `inventory.view` |
| PATCH | `/ops/inventory/{roomTypeId}/{date}` | `inventory.adjust` |
| POST | `/ops/inventory/bulk`, `/bulk/preview` | `inventory.adjust` |

**No permission was invented.** `inventory.view` and `inventory.adjust` are doc 59 §4.2,
already in the catalogue since Phase 7.3 — doc 59 §4.2 even names the same three columns.
`rate.view`, `rate.manage`, `rate.tax.manage` and `distribution.buffer.manage` also already
exist, unused so far, for the surfaces above that were not built.

The `/bulk/preview` path is an addition: doc 58 states the preview requirement without
giving it a route, so a UI can satisfy "preview before commit" without a write. **OQ-126.**

---

## 15. Verification — what actually ran

| Check | Result |
| --- | --- |
| `mvnw -B verify` | **BUILD SUCCESS** |
| Unit tests | 144 run · 0 failures · 0 skipped |
| Integration tests | 165 run · 0 failures · 0 skipped |
| **Total** | **309 pass** (was 259) |
| New this phase | `InventoryIT` 14 · `InventoryConcurrencyIT` 5 · `AvailabilityIT` 17 · `RateResolutionIT` 14 |
| **12-way last-room race** | **committed 1 · rejected 11 · deadlocks 0** |
| Flyway version | `23` — unchanged |
| **New migration** | **none** |
| Committed migrations vs HEAD | no diff — V1–V21 byte-identical, V22/V23 untouched |
| Production inventory / rates / taxes / buffers / holds / reservations | **0 of each** |
| Room types in the database | **0** |
| Settings holding a value | **0 of 18** |
| Properties | 8, all `DRAFT` |
| Test pollution | **zero**, including from the non-transactional concurrency suite |
| `git diff --check` | clean |
| Secret scan | no literal-secret matches |
| Architecture tests | all green; none weakened |

### 15.1 Two defects found by running the code

- **Text-block concatenation.** `"… AND """ + predicate` produced `ANDp` — Java text blocks
  strip trailing spaces. Three occurrences, all caught by integration tests hitting real
  SQL rather than by compilation.
- **Wrong exception type.** Date validation threw `BusinessRuleException` with a 400 code;
  that class asserts 422-only and refused. The guard was right, the caller was wrong, and
  the caller was fixed.

One test assertion was also wrong: writing `availableDirect` returns **400**, not a silent
ignore, because `fail-on-unknown-properties` is enabled. The stronger behaviour was kept
and the test corrected.

---

## 16. Architecture

Two new modules, `inventory` and `pricing`. Two and not one because doc 56 §1 makes the
separation a business rule: "Central Rate Management is **independent of the Direct Sales
CRM**." `inventory` may see `pricing` (to answer "from what nightly rate"); the reverse is
forbidden and enforced.

`ModuleStructureTest` caught a real gap immediately — the dependency was documented in a
comment but not declared. Declared, not exempted.

**The denylist guard was strengthened, not widened.** Phase 7.5D added a check that every
`..api` package appeared in `RESPONSE_PACKAGES`. Phase 7.5E broke its premise:
`inventory.api` holds both a guest view and an operator view, and the operator view carries
`total`, `directCommitted` and `bufferTarget` *by design* (doc 04 §4.3). Scanning that
package wholesale would be a false positive; an exemption list would be an invitation. So
the guard now follows the `@PublicEndpoint` annotation and scans **what an unauthenticated
handler actually returns** — the property doc 58 §9 is really about, which no naming
convention can drift away from.

One acknowledged duplication: `shared.RuleStatus` and `property.PolicyStatus` both map the
PostgreSQL `rule_status` enum. Recorded rather than hidden — **OQ-121**.

---

## 17. Open questions

| ID | Question | Blocking |
| --- | --- | --- |
| **OQ-115** | **OTA buffer precedence** — priority direction, the specificity ladder, tie-breaking, and how channel-scoped rules materialise into one scalar `buffer_target`. | 🔴 yes |
| ~~**OQ-116**~~ | ✅ **CLOSED 2026-08-18 — tax is out of KAS V1 scope** (doc 99 §12). V1 pricing is room rate → voucher → customer payable. The discount-vs-tax contradiction is retired, not answered. | no |
| **OQ-117** | **Horizon generation seed** — docs 13 §3.3 / 15 §4.4 seed each date from "the room type's default `total`"; no such column exists. Add one, or make generation operator-driven? | 🔴 yes |
| OQ-118 | Hold creation and the 5-minute sweep need B1/B2 values *and* scheduler infrastructure. Which scheduler? | no |
| OQ-119 | Rounding mode for `adjustment_percent` against zero-decimal VND. Currently HALF_UP, PROPOSED. | no |
| OQ-120 | `rate_rule.min_nights` / `max_nights` appear in no doc 56 §3.1 predicate. Stay-level restrictions for the booking path? | no |
| OQ-121 | `shared.RuleStatus` duplicates `property.PolicyStatus` over one database enum. Consolidate? | no |
| OQ-122 | `GET /public/availability/search` — facets and response envelope undefined. | no |
| OQ-123 | `POST /public/availability/quote` — doc 58 gives a request body and no response shape. | no |
| OQ-124 | Doc 58 §8 rate authoring routes not delivered this phase. | no |
| OQ-125 | Should `INVENTORY_HORIZON_MONTHS` simply be set to the 24 that doc 55 §2 states? | no |
| OQ-126 | `/ops/inventory/bulk/preview` is an added route; doc 58 requires the preview without naming a path. | no |
| **OQ-101** | *(carried)* What moves a property to `OPEN`? Availability now depends on it — nothing is bookable until it happens, and no actor or endpoint performs the transition. | 🟡 |
| **OQ-098** | *(carried)* No draft/published split. See §18. | 🟡 |

---

## 18. OQ-098 — its shape in inventory, rates and availability

The exposure is now sharper than in previous phases, because these edits are commercial:

| Change | Customer-visible |
| --- | --- |
| Operator lowers `total` or raises `maintenance` | **immediately** — the next availability query |
| Rate rule activated or archived | **immediately** — the next quoted `nightlyFrom` |
| Buffer materialised (when built) | immediately |
| Room type unpublished | immediately — disappears from availability |

There is no staging step and no preview-as-a-guest. Two mitigations exist and are real,
though neither is a draft/published split: rate rules carry `date_from`/`date_to` so a
change can be dated forward, and `POST /ops/inventory/bulk/preview` shows an operator the
effect of a range edit before committing it.

No `is_published` flag was invented, in this phase or any previous one.

---

## 19. Risks

1. **Availability is refused today.** Until B15 is supplied, `/public/availability/...`
   returns 422. Correct, and a launch blocker if unnoticed.
2. **Nothing is bookable until a property reaches `OPEN`** and OQ-101 is unresolved — no
   actor or endpoint performs that transition.
3. **Zero inventory and zero rates exist.** A2 and B6 are `OPEN`. The mechanism is proven
   against synthetic fixtures only; no KAS data has ever passed through it.
4. **The horizon job is absent**, so inventory exists only where an operator explicitly
   creates it. Safe, but it will look like missing availability rather than missing setup.
5. **Cache-versus-authority drift is unmonitored.** Doc 55 §3.4 requires a reconciliation
   job comparing `direct_committed` against derived truth. Not built; no reservations exist
   yet to drift.
6. **The buffer is inert.** `buffer_target` stays 0 until OQ-115 is answered — which is the
   *less* protective direction for direct availability, though it is doc 55 §6.1's own
   stated default when no rule matches.

---

## 20. What this phase did not do

- No booking, reservation creation, checkout, payment, deposit, refund or cancellation.
- No `PhysicalRoom`, `roomNumber`, `room_instance`, generic `source` or generic `status`.
- No `occupied` counter, no `ota_allotment`.
- No change to the oversell CHECK, the `available_direct` function, or either view.
- No migration; V1–V23 untouched.
- No invented quantity, rate, tax percentage, buffer value, horizon or hold duration.
- No frontend.
- Nothing committed or pushed.

---

## 21. Recommendation for Phase 7.5F

**Superseded:** OQ-115, OQ-116 and OQ-117 were all answered on 2026-08-18 — see doc 99. The
original recommendation read: *do not start 7.5F until OQ-115, OQ-116 and OQ-117 are answered* — three
business decisions, not engineering tasks, and each one silently changes money or
availability if guessed.

The highest-value work that needs no new decision:

1. Doc 58 §8 rate authoring routes (OQ-124) — the resolver is proven and untested authoring
   is the only thing between it and use.
2. Hold creation gated on B1/B2, which fails closed correctly today and would prove the
   doc 55 §5 rule end to end.
3. Setting `INVENTORY_HORIZON_MONTHS` to 24 (OQ-125) — one row, and it makes
   `HORIZON_EXCEEDED` reachable.

**Phase 7.5F was not started.**
