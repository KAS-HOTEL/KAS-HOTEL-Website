# 56 — Central Rate Management

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative pricing contract
**Last updated:** 2026-08-14

---

## 1. Principles

**CONFIRMED**

1. **Price is per room, per night, in VND.** VND is the base and only transactional currency.
2. **Central Rate Management is independent of the Direct Sales CRM.** Rates are a property-level
   commercial asset consumed by every channel. Sales applies vouchers and approved overrides; sales
   does not set rates.
3. **V1 is base pricing only.** The domain is *capable* of rate plans, channel-specific rates and
   restrictions; the V1 engine does not implement them.
4. **A confirmed reservation must never change price when future rates are edited.**

---

## 2. The V1 / Future boundary

```
┌─ V1 BASE RATE MODEL ─────────────────────────────────────────────┐
│  Base rate per room type (per room, per night, VND)              │
│  Date-range rules · Day-of-week rules · Seasonal periods         │
│  Minimum / maximum stay                                          │
│  Taxes and service charge                                        │
│                        channel_scope = NULL   rate_plan_id = NULL │
└──────────────────────────────────────────────────────────────────┘
                     ↓ same tables, two nullable dimensions
┌─ FUTURE DISTRIBUTION-SPECIFIC RATES ─────────────────────────────┐
│  channel_scope = DIRECT | BOOKING_COM | AGODA | CTRIP | TRAVELOKA│
│  rate_plan_id  = breakfast-included | non-refundable | advance   │
│  restrictions  = CTA | CTD | stop-sell                           │
│  Promotional rates · Channel net vs sell rates                   │
└──────────────────────────────────────────────────────────────────┘
```

**PROPOSED** — Adding channel-specific pricing later is **data**, not a re-architecture. That is the
entire purpose of the two nullable columns.

---

## 3. Rate resolution

**PROPOSED** — Layered, most specific wins.

```
Layer 0   room_type.base_price_minor                      always present
Layer 1   rate_rule                                       date range · day-of-week · season
Layer 2   occupancy_rule                                  extra adult, child bands   (config B10, B11)
Layer 3   voucher                                         discount
Layer 4   tax_and_service_charge                          config A7
          ↓
          computed price → FROZEN into reservation.price_snapshot
```

### 3.1 Resolution algorithm

```
resolveNightlyRate(roomType, date, channelScope = DIRECT):
    candidates = rate_rule
        WHERE status = ACTIVE
          AND (room_type_id = rt OR (room_type_id IS NULL AND property_id = rt.property))
          AND date BETWEEN date_from AND date_to        (NULL = always)
          AND (days_of_week IS NULL OR dow(date) = ANY(days_of_week))
          AND (channel_scope IS NULL OR channel_scope = channelScope)   ← V1: always NULL
          AND (rate_plan_id IS NULL)                                     ← V1: always NULL
    if candidates empty: return roomType.base_price_minor
    winner = candidates ORDER BY priority DESC, specificity DESC LIMIT 1
    return winner.price_minor
        OR roomType.base_price_minor * (1 + winner.adjustment_percent/100)
```

**Specificity order:** room-type + date-range + day-of-week ▸ room-type + date-range ▸ room-type ▸
property + date-range ▸ property ▸ base.

**PROPOSED** — Ties on `(priority, specificity)` are a **configuration error**, not a coin flip. The
admin rate editor blocks saving a rule that ties with an existing one on the same scope and dates.

### 3.2 Stay total

```
stayTotal(lines, checkIn, checkOut) =
    Σ over lines:
        Σ over nights checkIn … checkOut-1:
            resolveNightlyRate(line.roomType, night) × line.quantity
```

**CONFIRMED** — Per room, per night. Not per person. Every displayed line states the basis explicitly,
because per-person pricing is common in the region and ambiguity here causes disputes.

Implemented by `POST /public/availability/quote` — [58](58-phase-4-api-contract.md) §11.2. A quote
line's `subtotal` is this formula for one line; `roomsSubtotal` and `total` are the sum over lines.
**V1 refuses rather than guesses** where a layer above 1 would be needed: `children > 0` (B10), a
party over capacity (B11) and an `offerCode` (B23) are each a **422**, because those configs are
`OPEN` and no rule exists to price them.

---

## 4. Taxes and service charge

> ⛔ **SUPERSEDED — tax is out of scope for KAS V1** (owner decision 2026-08-18,
> [99](99-phase-7-5e-owner-decisions-applied.md) §12). This section was last revised on 2026-08-14,
> four days earlier, and its "BLOCKED" label describes a decision that was pending and is now taken.
> **Nothing in V1 reads any of it.** `TaxIsOutOfScopeForV1Test` enforces the absence, the
> `tax_rule` table stays in the frozen schema unread, and no V1 response carries a tax field, a
> service-charge field or a zero-tax line. The structure below is retained as the design for the day
> tax becomes a business capability of its own — doc 99 §12 lists what that work must include.

**BLOCKED — config A7 / legal L4.** VAT rate, service charge, and inclusive-vs-exclusive display are
undefined.

**PROPOSED** — The model reserves the structure:

```
tax_rule
  id, property_id NULL (NULL = global)
  type            enum  VAT | SERVICE_CHARGE | CITY_TAX | OTHER
  calculation     enum  PERCENTAGE | FIXED_PER_NIGHT | FIXED_PER_STAY
  value           numeric
  applies_to      enum  ROOM_SUBTOTAL | ROOM_SUBTOTAL_PLUS_SERVICE
  is_inclusive    boolean          -- displayed price already contains it
  date_from, date_to, status
```

**PROPOSED recommendation:** display **all-inclusive** prices once the rule is known. Inclusive display
consistently outperforms exclusive on trust and reduces late-stage abandonment. Until A7 is supplied,
the tax line renders as `estimated` with an explanatory tooltip and **no fabricated number**.

**Ordering matters** and must be confirmed: service charge is commonly applied before VAT, so
`applies_to` exists to make the sequence explicit rather than assumed.

---

## 5. Price snapshot — the historical-integrity contract

**CONFIRMED** — Editing future rates must never rewrite a historical reservation's price.

### 5.1 What is frozen, and when

| Moment | Action |
|---|---|
| `salesStatus = REQUESTED` (S1) | **Snapshot written.** Full computed breakdown into `reservation.price_snapshot` |
| Sales modification | Snapshot **recomputed and re-versioned**, with the prior version retained and an explicit guest acceptance step |
| `salesStatus = WON` (S10) | **Snapshot sealed.** Immutable thereafter |
| Any later rate rule edit | **No effect on any existing reservation** |

### 5.2 Snapshot contents

```jsonc
{
  "version": 1,
  "computedAt": "2026-08-14T07:03:11Z",
  "currency": "VND",
  "basis": "PER_ROOM_PER_NIGHT",
  "lines": [{
    "roomTypeId": "…",
    "roomTypeName": "Deluxe Room",        // name snapshot — survives later renames
    "quantity": 2,
    "nights": [
      { "date": "2026-09-12", "rateMinor": 1850000, "ruleId": "…", "ruleName": "Weekend" },
      { "date": "2026-09-13", "rateMinor": 1850000, "ruleId": "…", "ruleName": "Weekend" }
    ],
    "lineTotalMinor": 7400000
  }],
  "subtotalMinor": 12450000,
  "taxes": [ /* per tax_rule; empty until config A7 */ ],
  "serviceChargeMinor": null,
  "discount": { "voucherId": null, "amountMinor": 0 },
  "totalMinor": 12450000,
  "appliedRuleIds": ["…"],
  "termsVersion": "booking-terms-v3"
}
```

**PROPOSED — the snapshot records *which rules applied*, not merely the resulting number.** Without
`ruleId`, a pricing dispute six months later is unanswerable. With it, the exact rate path is
reconstructible even after every rule has changed.

### 5.3 Enforcement

1. `price_snapshot` is written once at S1 and re-versioned only through an explicit modification flow.
2. Application-level immutability after `WON`; any write attempt is a domain error and an audit event.
3. **Rate rules are never deleted**, only `status = ARCHIVED`, so a snapshot's `ruleId` always resolves.
4. `reservation_line.nightly_price_minor` and `room_type_name_snapshot` are denormalised copies, so a
   line renders correctly even if the snapshot JSON schema evolves.
5. A test asserts: create reservation → reach `WON` → edit the rate rule → **reservation total
   unchanged**.

---

## 6. Currency

**CONFIRMED** — VND is the base and only transactional currency. USD is an **indicative display
conversion**.

| Rule | Detail |
|---|---|
| Storage | `bigint` minor units + explicit `char(3)` currency. Never floating point |
| **VND is zero-decimal** | 1 VND = 1 minor unit. A generic "divide by 100" produces prices **100× wrong**. An explicit per-currency exponent is required from the first line of code |
| Formatting | `1.850.000 ₫` (Vietnamese convention), not `1,850,000.00` |
| USD | Rendered `≈ $73`, rounded to the whole dollar, with a persistent disclaimer |
| **USD disappears at commitment** | Not on confirmation, not in email, not in the price snapshot, not in structured data ([25](25-i18n-currency-architecture.md) §6.3) |
| FX source | **Config B22 — OPEN.** Server-side, daily refresh. **If stale or unavailable, show VND only** — never a hard-coded fallback |
| Channel scope ≠ currency scope | `channel_scope` varies the *amount*, never the *currency*. Every channel rate is in VND |

---

## 7. Rate management in admin

**CONFIRMED** — Central Rate Management sits in the **Commercial** area, not Direct Sales
([60](60-phase-4-admin-operations.md)).

| Capability | Permission | Notes |
|---|---|---|
| View resolved rate grid | `rate.view` | Room types × dates, showing which rule won each cell |
| Set base rate | `rate.manage` | Per room type |
| Create / edit rate rule | `rate.manage` | Property-scoped |
| Bulk apply across a range | `rate.manage` | **Preview grid before commit is mandatory** |
| Archive a rule | `rate.manage` | Never delete — snapshots reference it |
| Override price on one reservation | `reservation.price.override` | Limit configurable; beyond it requires `SUPER_ADMIN` (OQ-023). Audited with reason |
| Manage tax rules | `rate.tax.manage` | `SUPER_ADMIN` |

**PROPOSED** — Applying a rate across 90 days without seeing the result is how revenue accidents
happen. The preview grid is a requirement, not a convenience.

---

## 8. Rate parity — a business constraint on use

**PROPOSED — flagged because it limits what the model may be used for, not what it can express.**

Narrow rate-parity clauses typically require the **publicly visible direct rate** to match OTA rates
while permitting lower rates for **closed user groups** (members, authenticated guests, targeted
offers).

The domain supports differential channel pricing. **Whether KAS may use it is governed by its OTA
contracts, not by this architecture.** Legal review is required before any channel-specific public rate
is published — **OQ-076 / legal L2**.

---

## 9. Open items

| Config | Item | Status |
|---|---|---|
| A7 / L4 | VAT, service charge, inclusive vs exclusive, invoice fields | **BLOCKED — blocks accurate price display** |
| B6 | Base rates per room type per property | `OPEN` |
| B9 | Weekend / seasonal rules and the peak calendar | `OPEN` |
| B10 | Child pricing and age bands | `OPEN` |
| B11 | Extra bed / extra adult | `OPEN` |
| B22 | FX source, refresh, rounding, disclaimer | `OPEN` |
| B23 | Voucher rules | `OPEN` |
| C2–C4 | Channel rates, rate plans, restrictions | `FUTURE` |
| L2 | OTA rate parity terms | `OPEN` |

**Until B6 and A7 are supplied, every displayed price is an estimate and is labelled as one.**

> **AMENDED 2026-08-20 — the condition above can no longer be met by supplying A7.** Tax left V1
> scope by owner decision ([99](99-phase-7-5e-owner-decisions-applied.md) §12), so A7 was
> **retired rather than supplied**; the row above is kept for the record. **The estimate label
> stands for V1**, on a narrower and permanent basis: a guest-facing price is a *calculation*
> until the price snapshot is written at `salesStatus = REQUESTED` (§5.1), and only that snapshot
> is a price KAS can be held to. `GET /public/availability/properties/{slug}` and
> `POST /public/availability/quote` therefore both label their prices as estimates —
> [58](58-phase-4-api-contract.md) §11.2.4 — and neither carries a tax line of any kind.
