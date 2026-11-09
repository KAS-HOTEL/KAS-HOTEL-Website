# 98 — Phase 7.5E Decision Analysis: Buffer, Tax & Horizon Rule Freeze

**Phase:** 7.5E-DECISION — analysis only
**Date:** 2026-08-18
**Code written:** none · **Schema changed:** none · **Data seeded:** none · **Flyway:** v23 unchanged
**Purpose:** reduce OQ-115, OQ-116 and OQ-117 to the smallest set of owner decisions

---

## 1. Method and two corrections to doc 97

Every conclusion below cites document, section and the exact semantic that section supports.
Where the corpus is silent it is marked **OPEN** and no winner is proposed.

Re-reading the source rather than working from the Phase 7.5E summary produced **two material
corrections to doc 97**. Both narrow the blockage:

> **Correction 1 — doc 13 §3.4c is richer than doc 55 §6.1.** Doc 97 §10 assessed the buffer against
> doc 55 §6.1's single sentence. Doc 13 §3.4c states four further things: the NULL semantics of every
> column, "most specific wins" as the `priority` column comment, manual per-day override, and the
> `ota_allotment = 0` fallback. Three of doc 97 §10's five sub-ambiguities are answered there.

> **Correction 2 — taxes demonstrably stack.** Doc 97 §11 listed "stack or most-specific-wins" as
> unresolved. Doc 56 §5.2's price snapshot carries `"taxes": [ … ]` — an **array**, one entry per
> `tax_rule` — and VAT and service charge are separate `tax_type` values that plainly coexist. Rates
> pick one winner; taxes accumulate. That is settled by the frozen shape.

---

## 2. OQ-115 — OTA safety buffer precedence

### 2.1 What the frozen material actually states

| # | Semantic | Source | Status |
|---|---|---|---|
| 1 | Buffer is configurable by **property + room type + date range / season** — three dimensions named in prose everywhere | doc 15 §7.1a table · doc 55 §6 · doc 13 §3.4c | **CONFIRMED** |
| 2 | `room_type_id NULL` = all room types at this property | doc 13 §3.4c schema comment | **STATED** |
| 3 | `distribution_channel_id NULL` = all OTA channels combined | doc 13 §3.4c schema comment | **STATED** |
| 4 | `date_from/date_to NULL` = always in effect; `days_of_week NULL` = every day | doc 13 §3.4c | **STATED** |
| 5 | "Rules resolve by `priority`, most specific first: property + room type + date range beats property-wide" | doc 13 §3.4c ¶1 · doc 15 §7.1a · doc 50 §513 · doc 55 §6.1 | **STATED** (one worked comparison only) |
| 6 | `priority int — most specific wins` | doc 13 §3.4c schema comment | **STATED** |
| 7 | `PERCENTAGE` is of `total`, and **rounds up** — "under-buffering is the costlier error" | doc 13 §3.4c ¶3 · doc 55 §6.1 | **STATED** |
| 8 | **No matching rule ⇒ buffer = 0** | doc 13 §3.4c ⚠ box · doc 55 §6.1 | **STATED** |
| 9 | Effective buffer is **clamped** so it can never drive availability negative | doc 13 §3.4c ¶4 · doc 55 §6.2 | **STATED** |
| 10 | Resolved value **materialises** onto the daily row "on a rolling horizon" | doc 13 §3.4c ¶2 | **STATED** |
| 11 | Materialised value "remains **manually overridable per day** in the inventory calendar" | doc 13 §3.4c ¶2 | **STATED** |
| 12 | Recording fails open: OTA overflow auto-expands the buffer and alerts | doc 55 §6.3 · doc 50 §5.2 | **CONFIRMED** |
| 13 | The buffer is **transitional**, shrinking to zero when a channel manager arrives | doc 13 §3.4c · doc 55 §6.4 | **CONFIRMED** |
| 14 | Buffer **values** are business config **B3**, status `BLOCKED`, sizing needs OQ-033 | doc 51 §3 · doc 15 §7.1a | **OPEN — not this decision** |

### 2.2 Decision matrix

| # | Situation | Rule A | Rule B | Winner | Evidence |
|---|---|---|---|---|---|
| 1 | Nothing configured | — | — | **buffer = 0** | doc 13 §3.4c ⚠, doc 55 §6.1 |
| 2 | Property-wide vs property + room type + dates | property-wide | more specific | **B** | doc 13 §3.4c ¶1, explicit |
| 3 | Percentage yields a fraction | 15% of 7 = 1.05 | — | **2 (round up)** | doc 13 §3.4c ¶3 |
| 4 | Computed buffer exceeds headroom | 5 | — | **clamped to headroom** | doc 13 §3.4c ¶4 |
| 5 | Manual per-day value vs resolved rule | rule = 3 | operator typed 1 | **operator (1)** | doc 13 §3.4c ¶2 |
| 6 | Different `priority` values | priority 0 | priority 10 | 🔴 **OPEN** | direction stated nowhere for buffers |
| 7 | Equal priority, different specificity | property | property + room type | **B** *(by #2)* | doc 13 §3.4c ¶1 |
| 8 | Equal priority **and** equal specificity | A | B | 🔴 **OPEN** | no rule; no unique constraint |
| 9 | Channel-specific vs all-channel rule | AGODA = 3 | all = 2 | 🔴 **OPEN** | see §2.3 |
| 10 | Re-materialisation after a manual override | job runs again | override exists | 🔴 **OPEN** | no column distinguishes them |
| 11 | `days_of_week` vs plain date range at equal priority | Sat/Sun rule | date-range rule | 🔴 **OPEN** | ladder position unstated |

### 2.3 The one finding that shrinks this decision most

**The prose consistently names three dimensions; the schema carries four.**

Doc 15 §7.1a's table enumerates exactly **Property · Room type · Date range / season**, each with a
justification. Doc 55 §6 and doc 13 §3.4c prose say the same three. `distribution_channel_id` exists
as a column and is described only in a schema comment — never in the configuration model.

This is the identical pattern doc 56 §2 uses for rate rules, where `channel_scope` is a
forward-compatibility hook that is "**always NULL** in V1", and doc 16 OQ-034 confirms: "Adding
channel-specific pricing later is data, not a re-architecture."

**Therefore matrix row 9 need not be answered now.** If V1 buffer rules carry
`distribution_channel_id IS NULL`, the scalar-collapse problem — how an Agoda buffer of 3 and a
Booking.com buffer of 2 become one integer on one row — never arises. Doc 97 §10 treated this as
structural; it is avoidable by deferral, exactly as rates did.

### 2.4 The one genuine gap — and the strong analogy available

Rows 6, 8 and 11 all reduce to: **what does "resolve by `priority`, most specific first" mean
precisely?**

The corpus defines that phrase exactly once, for rate rules, in doc 56 §3.1:

```
winner = candidates ORDER BY priority DESC, specificity DESC LIMIT 1
Specificity order: room-type + date-range + day-of-week ▸ room-type + date-range ▸
                   room-type ▸ property + date-range ▸ property ▸ base
Ties on (priority, specificity) are a configuration error, not a coin flip.
```

Doc 13 uses the *same sentence* for both: line 364 for buffers, line 556 for rate layers. The most
defensible reading is that one phrase carries one meaning. That is an inference across documents, so
it is **PROPOSED**, not frozen — but it is a small, evidenced step rather than an invention.

### 2.5 Options

| | **A — Mirror the rate rule** *(recommended)* | **B — A, plus protected manual override** | **C — No rule engine in V1** |
|---|---|---|---|
| Resolution | `priority DESC, specificity DESC`; ladder property+RT+dates+dow ▸ property+RT+dates ▸ property+RT ▸ property+dates ▸ property; tie = configuration error refused at save | same as A | none — operator sets `buffer_target` per room type and date range directly |
| Channel dimension | `NULL` only in V1 | `NULL` only in V1 | not used |
| Manual override | re-materialisation **overwrites** it | override survives; needs a flag column | every value is manual |
| Safety | buffer only ever withholds; clamp prevents negative availability | same | same |
| Under-selling risk | rule too generous withholds sellable rooms | same | operator error is per-cell, visible |
| Oversell risk | none at DB level; real-world risk if buffer is too low while OTA recording lags | same | same |
| Operational load | low once configured; seasonal patterns automatic | low | **high** — manual entry per season |
| Effect on availability | `buffer_target` non-zero reduces `availableDirect` | same | same |
| Effect on OTA distribution | protects OTA allocation as designed | same | same |
| **Migration required** | **none** | **yes — V24** (a column to distinguish manual from materialised) | **none** |
| Schema supports it today | ✅ fully | ❌ needs one column | ✅ fully |
| Contradicts a frozen statement? | defers doc 13 §3.4c ¶2 (manual override) | no | defers doc 13 §3.4c ¶1–2 (rule resolution) |

**Recommendation — PROPOSED: Option A.** It matches the frozen intent most closely, needs no
migration, and reuses a precedence rule already implemented and tested for rates. Option B is the
only one that honours doc 13 §3.4c ¶2 completely, and should be revisited if operators actually
need per-day overrides — that is an operations question, not an architecture one. Option C is the
lower-risk path if OTA volumes turn out small, and is defensible because the buffer is explicitly
transitional (doc 13 §3.4c, doc 55 §6.4) — building a rule engine for a mechanism designed to reach
zero may be over-investment.

**Minimum decision required:** one confirmation — *"buffer precedence means what doc 56 §3.1 spells
out for rates"* — plus agreement that channel-scoped buffer rules are deferred to V2.

---

## 3. OQ-116 — tax resolution

> ✅ **CLOSED 2026-08-18 — superseded by an owner decision.** Tax is **out of scope for KAS V1**
> (doc 99 §12). The three questions below were the right ones to ask, and the owner answered a
> different and larger one: V1 performs no tax calculation at all, so the discount-versus-tax
> contradiction of §3.3 is retired rather than resolved. The analysis is retained as the record of
> what was examined.

### 3.1 What the frozen material actually states

| # | Semantic | Source | Status |
|---|---|---|---|
| 1 | `property_id NULL` = **global** | doc 56 §4 schema | **STATED** |
| 2 | Types: `VAT · SERVICE_CHARGE · CITY_TAX · OTHER` | doc 56 §4 | **STATED** |
| 3 | Calculations: `PERCENTAGE · FIXED_PER_NIGHT · FIXED_PER_STAY` | doc 56 §4 | **STATED** |
| 4 | **Taxes stack** — the snapshot carries `"taxes": [ … ]`, one entry per rule | doc 56 §5.2 | **DERIVABLE, strong** |
| 5 | `applies_to` exists "to make the sequence explicit rather than assumed" | doc 56 §4 | **STATED** |
| 6 | Service charge is "commonly applied before VAT" — and **"must be confirmed"** | doc 56 §4 | 🔴 **OPEN by its own words** |
| 7 | Effective dating via `date_from`/`date_to` | doc 56 §4 | **STATED** |
| 8 | Tax is **layer 4**, after voucher discount at layer 3 | doc 56 §3 · doc 13 §551 | **DERIVABLE — but contradicted, see §3.3** |
| 9 | No rule matches ⇒ no tax line; "empty until config A7" | doc 56 §5.2 | **STATED** |
| 10 | Until A7 is supplied the line renders as `estimated` with **no fabricated number** | doc 56 §4 · doc 26 §7.3 | **STATED** |
| 11 | Recommendation is **all-inclusive display**, pending confirmation | doc 56 §4 · doc 26 §7.3 · doc 16 OQ-022 | **PROPOSED** |
| 12 | VAT rate, service charge and inclusive/exclusive are config **A7** / legal **L4** | doc 51 §2, §L4 · doc 56 §9 | **OPEN — not this decision** |
| 13 | `tax_rule` appears in **no** ERD and in **no** domain-model catalogue | doc 53, doc 52 — absent | **gap in documentation** |
| 14 | The live `sort_order` column appears in **no** document | doc 56 §4 lists no such field | **undocumented artefact** |

### 3.2 Decision matrix

| # | Situation | Behaviour | Evidence |
|---|---|---|---|
| 1 | No tax rule matches | no tax line, no zero, no estimate | doc 56 §5.2, doc 26 §7.3 |
| 2 | VAT 8% and service charge 5% both ACTIVE | **both apply**, cumulatively | doc 56 §5.2 array |
| 3 | A rule outside its date range | does not apply | doc 56 §4 |
| 4 | `applies_to = ROOM_SUBTOTAL` vs `ROOM_SUBTOTAL_PLUS_SERVICE` | the second is computed on a base that includes the first | doc 56 §4 |
| 5 | Global rule and property rule, **same** `tax_type` | 🔴 **OPEN** — replace or stack? | nothing states it |
| 6 | Two rules, same `tax_type`, overlapping dates | 🔴 **OPEN** — no constraint, no rule | nothing states it |
| 7 | `is_inclusive = true` | 🔴 **OPEN** — no back-out formula given | nothing states it |
| 8 | Discount vs tax ordering | 🔴 **OPEN** — the corpus contradicts itself | §3.3 |
| 9 | Rounding of a percentage against zero-decimal VND | 🔴 **OPEN** | only the buffer has a stated rounding rule |
| 10 | `SERVICE_CHARGE` → which money column? | **DERIVABLE** — `reservation.service_charge_minor` exists separately from `tax_minor` | doc 53 §238, doc 57 §120 |

### 3.3 A genuine internal contradiction

Two document families disagree on whether tax is computed **before** or **after** the voucher discount:

- **Layer order says discount first.** Doc 56 §3 and doc 13 §551 both place `voucher` at **layer 3**
  and `tax_and_service_charge` at **layer 4**. A pipeline diagram implies tax applies to the
  discounted amount.
- **Money-column order says tax first.** Doc 53 §238 lists
  `subtotal / tax / service_charge / discount / total`; doc 57 §120 repeats it; doc 05 §192 says
  "room subtotal, taxes, service charge, discounts, total".

This is not a wording quibble — on a 10% voucher and 8% VAT the two orderings produce different
totals and different VAT invoice figures. It must be decided, not inferred.

### 3.4 Options

| | **A — Stack all, global + property** *(recommended)* | **B — Property replaces global per type** | **C — Global rules only in V1** |
|---|---|---|---|
| Applicability | every ACTIVE rule whose dates cover the stay applies | a property rule of a given `tax_type` suppresses the global one of that type | `property_id` must be NULL |
| Ordering | `ROOM_SUBTOTAL` rules first, then `ROOM_SUBTOTAL_PLUS_SERVICE`; `sort_order` ascending breaks remaining ties | same | same |
| Overlap of same type | a configuration error, refused at save | refused at save | refused at save |
| Matches Vietnamese practice | ✅ VAT + service charge are genuinely separate and both apply | ✅ | ✅ but no per-property variation |
| Risk | a duplicated global+property VAT would double-charge unless overlap is refused | a forgotten property rule silently drops the global tax | none, but inflexible if properties differ |
| Complexity | low | medium — suppression is invisible in the data | lowest |
| **Migration required** | **none** | **none** | **none** |
| Schema supports it today | ✅ | ✅ | ✅ |

All three need the same three orthogonal answers, which are the real decisions:

1. **Discount ordering** — tax on the pre-discount or post-discount amount? (§3.3)
2. **`is_inclusive` arithmetic** — when true, is the tax already inside the quoted price (back it out
   for display) or added on top?
3. **Rounding** — round each tax line to whole VND, or round only the grand total?

**Recommendation — PROPOSED:** Option **A** with tax computed **after** discount (following the
layer diagram, which is the only *semantic* ordering statement; the money-column lists are field
orders, not arithmetic), `is_inclusive = true` meaning the amount is already contained in the quoted
price, and **rounding per tax line, HALF_UP, to whole VND** — consistent with VND being zero-decimal
(doc 56 §6) and with the buffer's precedent of an explicit stated rounding rule.

**This does not unblock price display.** Config **A7** (the actual VAT and service-charge rates) and
legal **L4** remain `OPEN` and `BLOCKED` respectively. Answering OQ-116 freezes the *mechanism* so
that supplying A7 later is data entry, not design.

---

## 4. OQ-117 — inventory horizon

The brief is right that this is three decisions. They are separable and have different answers.

### 4.A Horizon length — **effectively already frozen**

| Statement | Source | Status |
|---|---|---|
| "Horizon: rolling **24 months**, generated ahead" | doc 55 §2 | **CONFIRMED** |
| "rolling **24-month** horizon" | doc 15 §4.4 | PROPOSED |
| "rolling horizon (**PROPOSED**: 24 months)" | doc 13 §3.3 | PROPOSED |
| "Max advance booking — 24 months (the horizon)" | doc 15 §11 | PROPOSED |
| Beyond it: *"not yet open for booking"*, never *"unavailable"* | doc 55 §2, doc 15 §4.4, doc 55 §9 | CONFIRMED |
| `INVENTORY_HORIZON_MONTHS` row exists, value `NULL` | live `system_setting` | — |

**24 months appears in four documents and is CONFIRMED in one.** This is not an open business
question; it is an unpopulated settings row. The only decision is whether to write `24` into it.

### 4.B Quantity per room type — **genuinely OPEN, and the real blocker**

| Statement | Source | Status |
|---|---|---|
| "Room quantities (`total`) per room type — the base of every availability calculation" | doc 51 §2 **A2**, owner Operations | **OPEN** |
| Room type names, **counts**, areas, bed configs at the 8 properties | doc 16 OQ-010 | **BLOCKING** |
| `total` = "units that physically exist", changed by "Admin (rarely)" | doc 04 §4.1 | STATED |
| Admin edits `total` inline in the inventory calendar; bulk by date range and day-of-week | doc 04 §4.3 | STATED |
| `PATCH /ops/inventory/{roomTypeId}/{date}` writes `total` under `inventory.adjust` | doc 58 §6 | **CONFIRMED contract** |
| "seeded from **the room type's default `total`**" | doc 13 §3.3, doc 15 §4.4 | **names a field that does not exist** |
| `room_type` has no count column | live schema | — |
| `property.total_rooms` — property overview attribute, nullable | doc 13 §82, doc 09 §60, doc 03 §116 | **never related to room types by any document** |

**Confirmed: the frozen architecture provides no room-type-level quantity field.** `property.total_rooms`
is descriptive property metadata listed beside star rating and opening year — no document derives,
decomposes, validates or reconciles it against room types, and it is nullable.

What the architecture *does* provide is a legitimate **operator-entry surface**: the doc 58 §6 routes,
already implemented and tested in Phase 7.5E. So per-date quantity has a source. What has no home is
a **per-room-type default** from which future dates could be generated.

### 4.C Generation strategy

| Statement | Source | Status |
|---|---|---|
| "Rows are generated ahead on a rolling horizon by a **scheduled job**, seeded from the room type's default total" | doc 13 §3.3, doc 15 §4.4 | PROPOSED, unbuildable as written (4.B) |
| Missing row ⇒ **unavailable, never unlimited** | doc 15 §12 | **CONFIRMED — the current safe fallback** |
| No scheduler exists in the build | doc 89 | — |

### 4.D Options

**A — Horizon length**

| | A1 — set to 24 *(recommended)* | A2 — a different figure |
|---|---|---|
| Behaviour | `HORIZON_EXCEEDED` beyond 24 months, with "not yet open for booking" | as chosen |
| Evidence | doc 55 §2 CONFIRMED, three corroborating docs | none |
| Migration | none — one settings row | none |

**B — Quantity per room type**

| | B1 — operator enters per date range *(recommended for V1)* | B2 — add a room-type default column |
|---|---|---|
| Behaviour | quantity exists only where an operator created it | a default seeds generated days |
| Source of the number | Operations, per A2 / OQ-010 — **still required either way** | same |
| Enables horizon generation | ❌ no | ✅ yes |
| **Migration** | **none** — already built and tested | **yes — V24** adding `room_type.default_total` |
| Risk | inventory looks "missing" rather than "not set up" | a stale default silently repopulates changed quantities |

**C — Generation strategy**

| | C1 — operator-driven only *(recommended for V1)* | C2 — scheduled job from a default column | C3 — job carries forward the last known day |
|---|---|---|---|
| Requires | nothing | B2 + a scheduler | a scheduler |
| Matches docs | partially — docs describe a job | ✅ doc 13 §3.3 / doc 15 §4.4 exactly | ❌ carry-forward is invented |
| Risk | manual work each season | stale defaults | silently propagates a temporary reduction forever |
| **Migration** | none | yes (with B2) | none |

**Recommendation — PROPOSED: A1 + B1 + C1 for V1**, revisiting B2/C2 once real room counts exist and
the manual burden is measurable. This needs **no migration** and no invented value. C3 is rejected
outright: carrying the last known day forward would propagate a one-week maintenance closure across
the entire horizon.

---

## 5. Production safety review

| OQ | If guessed | Oversell? | Under-sell? | Wrong charge? | Availability wrong? | OTA distribution? | Reconciliation? | Rank |
|---|---|---|---|---|---|---|---|---|
| **OQ-115** | Buffer too low while an extranet is stale → OTA sells rooms KAS also sold direct. The database CHECK still holds, so this is a **real-world** oversell, not a negative row — doc 55 §6.3 records it anyway and raises P1 | ⚠️ **yes, real-world** | yes, if too high | no | yes | **directly** | yes — drift vs extranet | 🔴 |
| **OQ-116** | Wrong ordering, stacking or inclusivity → guests quoted and invoiced the wrong amount; VAT invoices legally wrong (L4) | no | no | ⚠️ **yes** | no | no | financial only | 🔴 |
| **OQ-117-A** horizon | Too short → dates refused that could sell. Too long → dates offered with no inventory, which fail closed to "unavailable" and read as sold out | no | ⚠️ yes | no | wording only | no | no | 🟡 |
| **OQ-117-B** quantity | Inventing a count → direct oversell if too high, lost revenue if too low. **Currently zero, so nothing sells** | ⚠️ **yes if invented** | yes | no | yes | indirectly | yes | 🔴 *(if guessed)* · 🟢 *(as-is)* |
| **OQ-117-C** generation | Carry-forward (C3) propagates a temporary block across two years | no | ⚠️ yes | no | yes | no | no | 🟠 |

**The ranking that matters:** OQ-116 is the only one that can charge a guest the wrong amount.
OQ-115 is the only one that can put two guests in one room. OQ-117 currently fails safe — nothing is
sellable — and becomes dangerous only if someone invents a number to make the demo look populated.

---

## 6. Future implementation consequences (not done now)

Recorded so the decisions can be costed. **No code was written.**

| Decision | Consequence |
|---|---|
| OQ-115 Option A | A buffer resolver + materialisation step in `inventory`; reuses the rate ladder already built. No migration. |
| OQ-115 Option B | **V24** adding a column to distinguish manual from materialised buffer values. |
| OQ-115 Option C | No engine; the existing `PATCH /ops/inventory` surface would need `bufferTarget` made writable — a deliberate exception to doc 15 §2.1. |
| OQ-116 any option | A tax resolver in `pricing`, plus snapshot fields. Consumed by the booking phase, not by availability — doc 58 §3.2's response has no tax field. |
| OQ-117-A1 | One `system_setting` row. Makes `HORIZON_EXCEEDED` reachable; already implemented. |
| OQ-117-B2 / C2 | **V24** adding `room_type.default_total`, plus a scheduler (none exists — doc 89). |
| Adjacent: B15 | One `system_setting` row unblocks public availability, which returns 422 today (doc 97 §7.1). |

---

## 7. Owner decision sheet · Phiếu quyết định

> Tick one box per question. "Other" is always available.
> Chọn một ô cho mỗi câu hỏi. Luôn có thể chọn "Khác".

### OQ-115 — OTA safety buffer precedence · Thứ tự ưu tiên bộ đệm OTA

```
[ ] A — Same rule as rates (RECOMMENDED / ĐỀ XUẤT)
        Highest priority wins; if tied, the more specific rule wins;
        if still tied, refuse to save. Channel-specific buffers deferred to V2.
        Ưu tiên cao nhất thắng; hoà thì luật cụ thể hơn thắng; vẫn hoà thì không cho lưu.
        No migration. Không cần migration.

[ ] B — Same as A, but a manually typed buffer is never overwritten by the rule engine
        Giống A, nhưng giá trị nhập tay không bị ghi đè.
        REQUIRES a new migration (V24). CẦN migration mới.

[ ] C — No rule engine in V1; operators type the buffer directly per room type and date range
        Không dùng luật; nhân viên nhập trực tiếp.
        No migration. Không cần migration.

[ ] Other / Khác: ______________________________________________
```

### OQ-116 — Tax resolution · Cách tính thuế

**Three sub-answers are needed. All three are independent of the actual VAT rate (A7).**

```
Q1  Which tax rules apply? · Áp dụng luật thuế nào?
    [ ] A — All matching rules apply together, global + property (RECOMMENDED / ĐỀ XUẤT)
    [ ] B — A property rule replaces the global rule of the same tax type
    [ ] C — Global rules only in V1
    [ ] Other / Khác: ________________________________

Q2  Is tax calculated before or after a voucher discount? · Thuế tính trước hay sau giảm giá?
    (The documents contradict each other — this must be decided.)
    [ ] AFTER the discount (RECOMMENDED / ĐỀ XUẤT — follows the pricing-layer order)
    [ ] BEFORE the discount
    [ ] Other / Khác: ________________________________

Q3  When a tax is marked "inclusive"? · Khi thuế được đánh dấu "đã bao gồm"?
    [ ] The quoted price already contains it — show it as a breakdown only (RECOMMENDED)
    [ ] It is added on top of the quoted price
    [ ] Other / Khác: ________________________________
```

*(Rounding: unless you say otherwise, each tax line will be rounded HALF_UP to whole VND.
Làm tròn: mỗi dòng thuế làm tròn đến đồng, HALF_UP.)*

### OQ-117-A — Horizon length · Độ dài tầm nhìn đặt phòng

```
[ ] 24 months, as the documents already state (RECOMMENDED / ĐỀ XUẤT — doc 55 §2)
[ ] Other / Khác: ________ months
```

### OQ-117-B — Room quantity per room type · Số phòng mỗi loại phòng

```
[ ] Source already available — NO. Confirmed: no such field exists in the architecture.
                              KHÔNG. Đã xác nhận: kiến trúc không có trường này.

[ ] Operations will supply the count, and staff enter it per date range (RECOMMENDED / ĐỀ XUẤT)
    No migration. Không cần migration.

[ ] Add a permanent "default number of rooms" field to each room type
    Thêm trường "số phòng mặc định" cho mỗi loại phòng.
    REQUIRES a new migration (V24). CẦN migration mới.

[ ] Other / Khác: ______________________________________________
```

> ⚠ **Either way, the actual room counts for the 8 properties are still required** — config **A2**,
> question **OQ-010**. Nothing is sellable until they are supplied.
> Dù chọn cách nào, vẫn cần số phòng thật của 8 khách sạn.

### OQ-117-C — Inventory generation · Cách tạo dữ liệu tồn phòng

```
[ ] Staff create inventory for the dates they need (RECOMMENDED for V1 / ĐỀ XUẤT cho V1)
    No migration. Không cần migration.

[ ] A nightly job fills the 24-month horizon automatically
    Chạy tự động hằng đêm. Requires the field in OQ-117-B and a scheduler.

[ ] Other / Khác: ______________________________________________
```

### Adjacent — one row that unblocks the public site · Một dòng cấu hình mở khoá trang công khai

> Public availability currently returns an error because the maximum-rooms-per-request
> threshold (**B15**) has no value. Docs 04 §5.4 and 15 §11 both propose **5**.
> Trang tìm phòng công khai đang báo lỗi vì chưa có ngưỡng số phòng tối đa mỗi yêu cầu.

```
[ ] 5 rooms, as the documents propose (RECOMMENDED / ĐỀ XUẤT)
[ ] Other / Khác: ________ rooms
```

---

## 8. Exit condition

| | Status | Why |
|---|---|---|
| **OQ-115** | 🔴 **OPEN** | Narrowed from five sub-ambiguities to **one** confirmation plus a channel deferral. Doc 13 §3.4c answered the NULL semantics, the fallback, rounding, clamping and the one worked specificity comparison. What remains — priority direction and tie-breaking — has a strong analogy in doc 56 §3.1 but is not stated for buffers. |
| **OQ-116** | 🔴 **OPEN** | Narrowed to **three** questions (applicability, discount ordering, inclusivity). Stacking is settled by doc 56 §5.2's array. Doc 56 §4 blocks itself in its own words — "must be confirmed" — and the corpus contradicts itself on discount ordering, so this cannot be closed by reading harder. |
| **OQ-117** | 🟡 **PARTIALLY RESOLVED** | **A (horizon) is effectively frozen at 24 months** — CONFIRMED in doc 55 §2 and corroborated three times; it needs a settings row, not a decision. **B (quantity) is confirmed OPEN** — no room-type quantity field exists and `property.total_rooms` is unrelated property metadata. **C (generation)** follows from B. |

### Can Phase 7.5E proceed to implementation completion?

**Partially — and the split is clean.**

- **Proceed now, no decision needed:** the doc 58 §8 rate authoring routes (OQ-124) and hold
  creation gated on B1/B2 (OQ-118). Both are contract-defined and blocked on nothing.
- **Proceed on one settings row:** setting `INVENTORY_HORIZON_MONTHS = 24` and
  `MAX_ROOMS_PER_REQUEST = 5` would make `HORIZON_EXCEEDED` reachable and unblock public
  availability, which returns 422 today.
- **Blocked until answered:** the buffer resolver (OQ-115) and the tax resolver (OQ-116).
- **Blocked regardless of any decision here:** anything that needs real room counts (A2 / OQ-010),
  real rates (B6), real buffer values (B3) or real tax rates (A7). These are business inputs, not
  engineering work.

**Phase 7.5F was not started. No code, schema, migration or data was changed.**

---

## 9. Final owner decision sheet (narrowed) — 2026-08-18

Supersedes §7. Six decisions. Two corrections to the framing are noted inline.

| # | Decision | Frozen basis | Status |
|---|---|---|---|
| 1 | Buffer precedence = the rate rule of doc 56 §3.1 | doc 13 §3.4c ¶1 states the phrase; doc 56 §3.1 is the only place the corpus defines it | **OPEN** — 1 confirmation |
| 2 | `distribution_channel_id` deferred from V1 | doc 15 §7.1a names 3 dimensions; doc 56 §2 sets the precedent for rates | **OPEN** — 1 confirmation |
| 3 | Voucher discount vs tax order | doc 56 §3 + doc 13 §551 **vs** doc 53 §238 + doc 57 §120 + doc 05 §192 | **OPEN** — corpus contradicts itself |
| 4 | Room quantity authority | doc 04 §4.1, doc 52 §3.3, doc 58 §6, doc 59 §4.2, doc 85 §5.2 | **RESOLVED, with a correction** |
| 5 | Inventory generation across the horizon | doc 52 §3.3 lifecycle; doc 13 §3.3 / doc 15 §4.4 name a field that does not exist | **OPEN** — 1 choice |
| 6 | Settings to clear `CONFIG_MISSING` | doc 55 §2 (CONFIRMED) vs doc 15 §11 / doc 04 §5.4 (PROPOSED, OQ-015 OPEN) | **OPEN** — 1 of 2 values not frozen |

### Correction to decision 4

The question asked whether Partner-provided quantity is authoritative **"for each room type"**.
The frozen material supports the authority but **not that granularity**:

- **FROZEN** — `ADMIN` edits `total` (doc 52 §3.3, doc 04 §4.1 "Admin (rarely)"), under
  `inventory.adjust` at PROPERTY scope (doc 59 §4.2), via `PATCH /ops/inventory/{roomTypeId}/{date}`
  (doc 58 §6). In V1 that actor is the KAS Partner's `ADMIN` holding PARTNER scope (doc 85 §5.2).
  The business owner of the number is Operations (doc 51 A2).
- **FROZEN ABSENCE** — quantity exists **per room type per date**, never as one number per room type.
  No column, no entity, no document.

So: authoritative **per (room type, date)** — not "for each room type".

### Correction to decision 6

Only **one** of the two settings is required to clear `CONFIG_MISSING`, and only one is frozen:

| Setting | Value | Status | Effect |
|---|---|---|---|
| `MAX_ROOMS_PER_REQUEST` | 5 | **PROPOSED only** — doc 15 §11, doc 04 §5.4; **OQ-015 is `OPEN`** | **This alone clears `CONFIG_MISSING`** |
| `INVENTORY_HORIZON_MONTHS` | 24 | **FROZEN** — doc 55 §2 CONFIRMED, doc 52 §3.3 | Not required; enables `HORIZON_EXCEEDED` |

Neither was written. `24` is frozen and may be set on your word; `5` is a recommendation against an
open question and needs approval.

### Decision 3 — the financial consequence

Room subtotal 10,000,000 ₫ · voucher 10% · illustrative tax 8% *(not a KAS rate — A7 is OPEN)*:

| | Guest pays | Declared tax on the invoice |
|---|---|---|
| **A — discount first** (doc 56 §3 layers: voucher = 3, tax = 4) | 9,720,000 ₫ | 720,000 ₫ |
| **B — tax first** (doc 53/57/05 money-column order) | 9,800,000 ₫ | 800,000 ₫ |

The gap is always **tax × discount**. It changes the amount declared on a VAT invoice, so this is a
**legal/finance determination under L4**, not an architecture choice. Architecturally, A is the only
reading supported by a statement about *arithmetic*; the B sources are field orders, not formulas.
