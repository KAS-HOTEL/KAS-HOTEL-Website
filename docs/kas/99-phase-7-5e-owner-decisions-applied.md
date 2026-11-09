# 99 — Phase 7.5E: Owner Decisions Applied

**Date:** 2026-08-18
**Status:** ✅ **COMPLETE** — every item in the owner's 7.5E tree is closed (see §13)
**Tests:** 345 pass · 0 failures · 0 skipped *(was 309)* — see §10 for the rate-authoring addition
**Migration:** **none** — no V24 · V1–V23 byte-identical · Flyway v23
**Decisions applied:** OQ-115 · OQ-115b · OQ-117b · OQ-117c · availability configuration
**Decision recorded:** OQ-116 — **tax is out of scope for KAS V1** (§12). Supersedes §4 and §11.

---

## 1. What the owner decided, and what was built

| Decision | Owner ruling | Built |
| --- | --- | --- |
| **OQ-115** buffer precedence | Same semantics as the frozen rate resolver: `priority DESC` → `specificity DESC` → tie = configuration error | ✅ `BufferResolver`, 14 tests |
| **OQ-115b** channel-specific buffer | Deferred to V2. V1 rules carry `distribution_channel_id = NULL` | ✅ refused at the API, filtered in SQL |
| **OQ-116** tax vs voucher | ✅ **Tax is out of scope for V1** (§12, decided 2026-08-18). Superseded the earlier L4 deferral | 🔒 no tax code; scope boundary enforced by `TaxIsOutOfScopeForV1Test` |
| **OQ-117b** room quantity | Authoritative per `(room_type, date)`. No default column. Never derived from `property.total_rooms` | ✅ already shipped in 7.5E; now guarded |
| **OQ-117c** generation | Operator applies quantity across the range they need. No scheduler. Missing rows stay unavailable. Horizon 24 months | ✅ already shipped; horizon now live |
| **Availability config** | `INVENTORY_HORIZON_MONTHS = 24` · `MAX_ROOMS_PER_REQUEST = 5` (owner value, closes OQ-015) | ✅ applied |

---

## 2. OQ-115 — buffer precedence, implemented

The approved rule is **doc 56 §3.1's**, applied to buffers rather than a second model invented for
them:

```
winner = candidates ORDER BY priority DESC, specificity DESC LIMIT 1
tie on (priority, specificity) ⇒ configuration error, refused
```

The specificity ladder mirrors the rate ladder one-to-one, with the room type playing the role it
plays for rates. A buffer rule always names a property (`property_id NOT NULL`), so five levels map
exactly:

| Rank | Shape |
| --- | --- |
| 5 | property + room type + dates + days-of-week |
| 4 | property + room type + dates |
| 3 | property + room type |
| 2 | property + dates |
| 1 | property |

Doc 13 §3.4c ¶1's single worked comparison — "property + room type + date range beats property-wide"
— is rank 4 beating rank 1, which this reproduces.

**Everything already frozen is applied unchanged, and each is a test:**

| Rule | Source | Test |
| --- | --- | --- |
| No matching rule ⇒ buffer 0 | doc 13 §3.4c | `noRuleMeansZero` |
| `PERCENTAGE` of `total`, **rounds up** | doc 13 §3.4c ¶3 | `percentageRoundsUp` — 15% of 7 → 2 |
| Clamped so it can never drive availability negative | doc 13 §3.4c ¶4, doc 55 §6.2 | `bufferIsClamped` |
| Buffer withholds only its unused portion | doc 55 §3.2 | `bufferWithholdsOnlyUnusedPortion` |
| Paused/archived rules stop applying | rule status | `inactiveRuleDoesNotApply` |

**Two guards on the tie**, matching how rates are handled: `tiesWithExisting` refuses the save (where
doc 56 §3.1 puts the guard), and `BufferResolver` refuses to resolve if a tie exists anyway — rows can
predate the guard, and a paused rule can be re-activated into a tie.

**No buffer value appears anywhere as a KAS figure.** Buffer values are config **B3**, status
`BLOCKED` (doc 51 §3). Every number in the code and tests is a synthetic fixture chosen to make an
ordering visible.

---

## 3. OQ-115b — the channel dimension, deferred

`distribution_channel_id` is refused at the API and filtered out in SQL. Both, deliberately:

- **Refused on create** — accepting a value the resolver would ignore is worse than refusing it. An
  operator would believe an Agoda-specific buffer was in force while nothing withheld a room.
- **Filtered on read** (`distribution_channel_id IS NULL`) — so a channel-scoped row reaching the
  table another way (a future V2 rule, a manual fix) still cannot affect V1 resolution.
  `storedChannelRuleDoesNotResolve` proves it.

The reason the deferral is safe rather than lazy: `buffer_target` is **one integer per (room type,
date)**. Two channel-scoped rules — Agoda 3, Booking.com 2 — have no stated way to become one number,
and inventing one would be inventing OTA allocation policy. Deferring removes the question instead of
answering it wrongly. Exactly what doc 56 §2 does for `rate_rule.channel_scope`.

---

## 4. 🔒 OQ-116 — tax, blocked and *enforced*  ⚠️ *SUPERSEDED BY §12 — tax is now out of V1 scope*

No tax calculation was written. More importantly, **the absence is now enforced** by
`TaxCalculationIsBlockedTest`: adding a `TaxResolver`, `TaxCalculator`, `TaxService`, `TaxEngine` or
`TaxComputation` fails the build, and whoever adds one must delete that test deliberately — at which
point they read why it existed.

A second assertion pins the doc 58 §3.2 availability response to its exact six fields, because that
is the first place a guessed tax figure could reach a guest.

**Why an absent feature was not considered blocked enough:** nothing otherwise stops a future change
from adding a plausible-looking tax rule. A wrong one charges guests the wrong amount and puts the
wrong figure on a VAT invoice.

**What is settled and can be relied on when the decision arrives:** taxes **stack** (doc 56 §5.2's
snapshot carries `"taxes": [ … ]`, one entry per rule), and `property_id IS NULL` means global
(doc 56 §4).

**What is not:** the ordering. Doc 56 §4 says "**Ordering matters** and must be confirmed", and the
corpus contradicts itself on discount-versus-tax — doc 56 §3 / doc 13 §551 put voucher at layer 3 and
tax at layer 4, while doc 53 §238, doc 57 §120 and doc 05 §192 order the money columns
`subtotal / tax / service_charge / discount / total`. The gap is always **tax × discount**, and it
changes the declared tax on the invoice.

**Availability is unaffected.** Doc 58 §3.2's response has no tax field, so the block costs nothing
today.

---

## 5. OQ-117b / OQ-117c — quantity and generation

Both were already implemented in Phase 7.5E and are unchanged; the decision confirms them.

- Quantity is authoritative per `(room_type, date)`, written by `ADMIN` under `inventory.adjust`
  (doc 52 §3.3, doc 59 §4.2, doc 58 §6). **No `room_type.default_total` column was added.**
- No scheduler exists and none was created. `materialise` touches only days that already have
  inventory — a day with no row has no `total` to take a percentage of, and conjuring one would be
  inventing a quantity. `materialisationNeverCreatesInventory` proves it.
- Missing rows remain unavailable (doc 15 §12).
- `property.total_rooms` is never read by any inventory code path.

The horizon is now live: `approvedHorizonIsTwentyFourMonths` reads the configured value rather than
hard-coding 24, so the boundary is proven to come from configuration and cannot quietly become a
second source of truth.

**No room quantity was seeded.** Production inventory rows remain **zero**. The actual counts are
still config **A2** / **OQ-010** and nothing is sellable until Operations supplies them.

---

## 6. The two configuration values — the project's first deliberate data change

```
INVENTORY_HORIZON_MONTHS = 24    -- FROZEN: doc 55 §2 CONFIRMED, doc 52 §3.3
MAX_ROOMS_PER_REQUEST    = 5     -- OWNER DECISION, closes OQ-015. NOT a frozen document value:
                                 -- doc 15 §11 and doc 04 §5.4 both label 5 as PROPOSED
```

Applied by `UPDATE`, guarded by `value IS NULL` so neither could overwrite an existing value.
**Deliberately not put in a migration**: a migration would push one owner's business decision into
every environment from source control, and doc 58 §8 already assigns settings to `/admin/settings`
under `settings.manage`. Reversible with two statements.

`MAX_ROOMS_PER_REQUEST` alone is what clears the `CONFIG_MISSING` that public availability returned;
the horizon is not required for that and only enables `HORIZON_EXCEEDED`.

### The Phase 7.3 guard was narrowed, not weakened

`DatabaseConnectivityIT.noConfigurationValueWasInvented` asserted all 18 keys were NULL. It now names
the two owner-answered keys explicitly and still asserts that **every other key is NULL**, plus that
exactly 16 remain outstanding. Relaxing it to "some values may be set" would have thrown the
guarantee away; naming the exception keeps it and makes any addition a visible act.

`AvailabilityIT` was also made **hermetic** — the tests that prove fail-closed behaviour now clear
the settings inside their own transaction, so "unset" means unset regardless of what the database
holds. That is stronger than the previous version, which depended on the global rows happening to be
NULL.

---

## 7. Verification

| Check | Result |
| --- | --- |
| `mvnw -B verify` | **BUILD SUCCESS** |
| Unit tests | 146 · 0 failures · 0 skipped |
| Integration tests | 181 · 0 failures · 0 skipped |
| **Total** | **327** (was 309) |
| New this turn | `BufferPrecedenceIT` 14 · `TaxCalculationIsBlockedTest` 2 · 2 availability tests |
| 12-way oversell race | committed 1 · rejected 11 · deadlocks 0 — still green |
| Direct/OTA races · buffer boundary | green |
| Cross-partner isolation (buffers) | 404 on every route |
| Public denylist | green — `@PublicEndpoint` return-type scan |
| Architecture suite | green; **nothing weakened** |
| **New migration** | **none** — no V24 |
| V1–V23 | byte-identical · Flyway v23 |
| Production inventory / rates / taxes / buffers / holds / reservations / room types | **0 of each** |
| Properties | 8, all `DRAFT` |
| Settings holding a value | **2** — both owner-approved · 16 still outstanding |
| Test pollution | **zero** |
| `git diff --check` · secret scan | clean |

### One test assertion was wrong, and the code was right

`bufferIsClamped` expected availability 0; the correct answer is 2. With the buffer clamped to the
headroom of 2 and OTA already committing 2, the unused portion is `max(0, 2−2) = 0`, so the clamped
buffer withholds no further room. Unclamped, `max(0, 9−2) = 7` would have driven availability to −5
and `inv_no_oversell` would have refused the write — which is exactly what the clamp exists to
prevent. The assertion was corrected; the implementation was not.

---

## 8. Status

**Technical core: COMPLETE.** Inventory, availability, the oversell guarantee, direct/OTA separation,
rate resolution and buffer resolution are implemented and proven.

**Superseded by §13.** This paragraph was written while OQ-116 was open; the owner has since ruled
tax out of V1 scope, and every item in the 7.5E tree is now closed.

### Remaining blockers

| | Blocked on | Owner? |
| --- | --- | --- |
| ~~Tax calculation~~ | ✅ resolved — out of V1 scope, §12 | — |
| Anything sellable | **A2 / OQ-010** — real room counts per room type | Operations |
| Real prices | **B6** — base rates per room type | Revenue |
| Real buffer values | **B3** (`BLOCKED`) — sizing needs OQ-033 | Revenue/Operations |
| Actual tax rates | **A7** / legal **L4** | Finance + Legal |

### Exact next action once the accountant answers

1. Record the ruling — tax before or after voucher discount, and what `is_inclusive` means
   arithmetically — in this document.
2. Delete `TaxCalculationIsBlockedTest` **as part of** the change that implements the resolver, so
   the block and its removal are one reviewable commit.
3. Build the tax resolver in `pricing`: stack all matching rules (doc 56 §5.2), `ROOM_SUBTOTAL` rules
   before `ROOM_SUBTOTAL_PLUS_SERVICE`, `property_id IS NULL` = global.
4. No migration is expected — `tax_rule` already carries every column the model needs.
5. Availability needs no change: doc 58 §3.2 has no tax field. Tax enters at the booking phase.

**Phase 7.5F was not started.**

---

## 10. Rate authoring and bulk pricing — added 2026-08-18

**Tests: 345 pass · 0 failures · 0 skipped** *(was 327)* · **no migration** · Flyway v23.

### 10.1 The contract was already frozen

Before writing anything, doc 58 §8 was checked. **Every route the owner's bulk workflow needs already
exists in the frozen contract:**

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/rates/grid` | `rate.view` | the rate calendar (Part F) |
| POST | `/admin/rate-rules` | `rate.manage` | create |
| POST | `/admin/rates/bulk-preview` | `rate.manage` | preview (Part D) |
| POST | `/admin/rates/bulk-apply` | `rate.manage` | bulk update (Part D) |

Doc 56 §7 supplies the capabilities and makes the preview **mandatory**: "Applying a rate across 90
days without seeing the result is how revenue accidents happen."

**No permission was invented.** `rate.view` and `rate.manage` are doc 59 §4.4, in the catalogue since
Phase 7.3, and the V1 `ADMIN` — which holds `PARTNER` scope (doc 85 §5.2) — carries both. The Partner
can author rates for its own properties and only those.

**Two routes are additions — OQ-128.** Doc 58 §8 names creation but no route for *edit* or *archive*,
while doc 56 §7 lists both as capabilities. The capability is frozen; the path is not.
`PATCH /admin/rate-rules/{id}` and `.../status` sit inside the existing namespace rather than opening
a new one. **This needs a doc 58 amendment.**

### 10.2 Schema sufficiency — no migration

`rate_rule` already carries every dimension Part C names: scope, property/room type, name, priority,
date range, days-of-week, price or adjustment, currency, min/max nights, channel scope, rate plan,
restrictions, status, created_by.

**`rate_rule` has no `version` column**, so Part C's "optimistic concurrency *if required by the
existing schema*" is not met — and adding one would be a migration for a capability the frozen schema
deliberately does not have. Concurrency is instead pessimistic: `lockPropertyRules` takes row locks in
`id` order, the same deterministic-ordering defence doc 55 §7 uses for inventory.

### 10.3 How a bulk edit is expressed

There is no per-date rate table, so a bulk edit is expressed the way the frozen model expresses
everything: **one `rate_rule` per room type, carrying the date range**. Three room types over twelve
dates is three rules and `cellsAffected = 36` — the figure on the operator's confirmation screen.

**A repeat of the same edit updates that rule rather than adding a second one.** Without this, doc 56
§3.1's tie rule would refuse every correction after the first and leave the range unpriceable.
`repeatedBulkEditUpdatesRatherThanDuplicating` proves two edits leave two rules, not four.

### 10.4 All or nothing — Part E

Every room type is resolved through the **scoped** repository before anything is written, so one
belonging to another partner fails the whole request. `bulkApplyIsAllOrNothingAcrossPartners` mixes
another partner's room type into a valid selection and asserts that **nothing** was written — not the
valid ones applied and the invalid one skipped. `roomTypeOfAnotherPropertyIsRefused` does the same for
a room type of the same partner's *other* property, which returns `BULK_RATE_CONFLICT` rather than
being silently dropped.

`bulkApply` re-derives the effect **under lock** rather than trusting the previewed figures — the
operator's screen is a snapshot, exactly as doc 55 §7.1 treats availability.

### 10.5 The grid — Part F

`GET /admin/rates/grid` returns room types × dates with the winning rule per cell, which is doc 56
§7's requirement verbatim: "showing which rule won each cell". One query for the rules, then ranking
per cell through **`RateResolver.rank`** — the same function that prices a guest's stay, so the grid
an operator checks and the price a guest is quoted cannot disagree.

An unpriced cell renders as **null, never zero** (`unpricedCellIsAGapNotZero`). Config B6 is OPEN;
rendering a missing price as free would be the worst possible reading of missing data.

Ranking now happens in Java for the grid and in SQL for guest resolution, so
`javaAndSqlAgreeOnApplicability` walks a week of dates against a weekend rule and asserts both agree.

### 10.6 Two defects found by running the tests

- **The tie check counted a rule against itself.** Activating any rule returned 422, because
  `tiesWithExisting` found the rule being activated. Fixed with an exclusion
  (`r.id IS DISTINCT FROM ?`), not by removing the guard.
- **A Phase 7.4 test used `/admin/rates/grid` as its example of an *undeclared* route.** It is now
  declared. Repointed at `/admin/tax-rules`, which is doc 58 §8-defined and deliberately absent while
  OQ-116 is open — so that assertion now also guards the tax block, alongside
  `TaxCalculationIsBlockedTest`. The assertion itself ("undeclared ⇒ 404") is unchanged.

### 10.7 Part G — tax still blocked

`TaxCalculationIsBlockedTest` is intact and green. No `TaxResolver`, `TaxCalculator`, `TaxService`,
`TaxEngine` or `TaxComputation` exists. No discount/tax ordering was chosen. `tax_rule` holds 0 rows.

### 10.8 Gates

| Check | Result |
| --- | --- |
| Complete suite | **345 pass** · 0 failures · 0 skipped (146 unit + 199 integration) |
| New this turn | `RateAuthoringIT` 18 |
| 12-way oversell race · buffer precedence · availability | unchanged, green |
| Architecture + denylist | green; **nothing weakened** |
| **Migration** | **none — no V24** · V1–V23 byte-identical · Flyway v23 |
| rate/tax/buffer/inventory/hold/reservation/room-type rows | **0 of each** |
| Properties | 8, all `DRAFT` |
| Settings holding a value | 2, both owner-approved · 16 outstanding |
| `git diff --check` | clean |

---

## 11. Remaining blocker

**OQ-116 — tax versus voucher ordering.** Deferred by the owner to the accountant under legal **L4**.

Everything else in the 7.5E tree is now implemented and proven:

```
Inventory ✅ · Availability ✅ · Oversell ✅ · Rate resolution ✅
Buffer resolution ✅ · Horizon ✅ · Rate authoring ✅ · Bulk pricing ✅
Tax decision 🔴 ← the only remaining item
```

Phase 7.5E is **not** declared FINAL. **Phase 7.5F was not started.**

---

## 12. OWNER DECISION — OQ-116: tax is out of scope for KAS V1

**Date:** 2026-08-18 · **Status:** ✅ **DECIDED — DEFERRED / OUT OF SCOPE.** Not a pending financial
question. This supersedes §4 and §11 of this document.

### 12.1 The decision

Tax is **not part of KAS V1**. The V1 commercial calculation is, in full:

```
Room rate
    ↓
Voucher eligibility
    ↓
Voucher discount
    ↓
Customer payable amount
```

No tax step. No tax percentage, rule, ordering, configuration or UI — for Admin, Partner or
Customer — and no tax configuration for the eight initial properties.

### 12.2 What this resolves

The contradiction recorded in doc 98 §3.3 is **retired, not answered**. The corpus disagreed on
whether tax applied before or after a voucher discount — doc 56 §3 and doc 13 §551 put voucher at
layer 3 and tax at layer 4, while doc 53 §238, doc 57 §120 and doc 05 §192 order the money columns
`subtotal / tax / service_charge / discount / total`. With no tax in V1, the question has no subject.

Config **A7** (VAT and service-charge rates) and legal **L4** (VAT invoicing obligations) remain
outstanding business inputs, but they no longer block anything in V1 — nothing consumes them.

### 12.3 One thing to be clear about

**The voucher steps are not implemented either.** Config **B23** is `OPEN` (doc 56 §9) and doc 56 §3
places vouchers at layer 3. V1 pricing today resolves to the **room rate alone**; voucher eligibility
and discount are a later phase. The chain above is the V1 *target*, not the current state.

### 12.4 What was changed to record this

| Change | Why |
| --- | --- |
| `TaxCalculationIsBlockedTest` → **`TaxIsOutOfScopeForV1Test`** | "Blocked" said the project was waiting for an answer. It is not. A stale name is exactly what misleads the next reader |
| Guard **kept**, message rewritten | The owner's instruction: it may be updated as part of recording the decision, but "no tax implementation should replace it". An absent feature is not an excluded one — without the guard, tax arrives by increments |
| `pricing/package-info.java` | Stated the scope decision instead of quoting doc 56 §4's "BLOCKED — config A7 / legal L4" |
| `RateAuthoringService` javadoc | Same |
| `RbacAndScopeIT` comment | `/admin/tax-rules` is now absent by scope, not by blockage |
| Docs 97, 98, README | OQ-116 status corrected everywhere it appeared |

**No tax implementation was added.** No `TaxResolver`, `TaxCalculator`, `TaxService`, `TaxEngine` or
`TaxComputation` exists. `tax_rule` holds 0 rows and no code reads it. The table stays in the frozen
schema — V1–V23 are byte-identical and an unused table costs nothing.

### 12.5 When tax is introduced — future Commercial / multi-partner phase

The owner's requirement, recorded so the next phase inherits it rather than rediscovering it. Tax must
be designed as a **separate business capability**, with:

- jurisdiction rules
- effective dates
- property-level and global configuration
- auditability
- **booking-time snapshotting** — consistent with doc 56 §5's existing rule that a confirmed
  reservation's price never changes when future rates are edited
- legally validated calculation rules

**None of these in V1.** Deleting `TaxIsOutOfScopeForV1Test` is the first step of that future work,
not a tidy-up along the way.

---

## 13. Phase 7.5E — status after this decision

```
Inventory            ✅        Rate resolution      ✅
Availability         ✅        Buffer resolution    ✅
Oversell protection  ✅        Horizon              ✅
Rate authoring       ✅        Bulk pricing         ✅
Tax decision         ✅ DEFERRED — out of V1 scope (§12)
```

Every item in the owner's 7.5E tree is now closed. Nothing in the phase is waiting on a business
decision.

**Residual open questions are recorded and non-blocking**, and none is a financial correctness risk:
OQ-118 (hold creation needs B1/B2 and a scheduler), OQ-119 (adjustment rounding, PROPOSED),
OQ-120 (`min_nights`/`max_nights` belong to the booking path), OQ-121 (`RuleStatus` duplicates
`PolicyStatus`), OQ-122/123 (availability search and quote response shapes absent from doc 58),
OQ-126/128 (doc 58 amendments for routes the frozen docs describe but do not name), OQ-098
(no draft/published split), OQ-101 (what moves a property to `OPEN`).

**Still required before anything is sellable — business inputs, not engineering:** real room counts
per room type (**A2** / OQ-010), base rates (**B6**), and OTA buffer values (**B3**) if the buffer is
to withhold anything.
