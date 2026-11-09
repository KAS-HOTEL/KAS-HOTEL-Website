# PHASE 7.5F — STEP 16A.4 — OQ-171 CONTRACT AMENDMENT

**Date:** 2026-08-27
**Type:** Contract governance. **Documentation only** — no source, test, migration, seed, SQL or
database write. Append-only: no historical document was rewritten.

**Supersedes nothing.** It **completes** doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §14.3,
which deliberately left four items unfrozen, and answers the three decisions doc
[124](124-phase-7-5f-step-16a-4-oq171-decision-sheet.md) §7 put to the owner.

---

## 1. Status

🟢 **OQ-171 is `CLOSED` by owner ruling.** The V1 price snapshot now has a typed, frozen contract.

**No implementation occurred in this turn.** Not one line of Java, TypeScript or SQL was written, no
migration was created, no test was added or changed, and the database was not modified. The rulings
below are **contract**; the work they imply is a **next-phase obligation** recorded in §12.

**No migration is required by any of these decisions** (§13). Every field lands in existing `jsonb`
content or an existing nullable column.

**One editorial reconciliation is flagged for the owner in §8.3** — the ruling's phrase *"ascending
numeric `ruleId`"* cannot apply literally, because `rate_rule.id` is a **`uuid`**. The ruling's stated
requirement — *stable deterministic ordering* — is frozen, in the only form a UUID admits. If the owner
meant something else, one line corrects it.

---

## 2. OQ-171 before this amendment

Doc 117 §14.3 recorded four items that *"cannot be frozen"* — `version`, property identity,
`appliedRuleIds` ↔ `nights[].ruleId`, and the varying-nightly fallback — and forbade guessing any of
them. Doc 124 verified that the corpus decided **three of the four**, narrowed them, and put three
decisions to the owner. This document records the answers.

Doc 124 also established the fourth was **already resolved**: per-night `date` and `rateMinor` are
frozen by doc 117 §14.1 and written today, so a varying-rate stay's exact offered price **is** already
preserved.

---

## 3. Verification performed before freezing

Every ruling was checked against the repository. Read-only throughout.

| Ruling | Checked against | Result |
|---|---|---|
| `snapshot.version` = revision number | doc 56 §5.1, doc 57 §6 CONFIRMED, doc 58 §8:250 | ✅ Three sources support the revision reading, one an owner decision |
| Independent of `reservation.version` | `V12`:90; all reservation-module source | ✅ `reservation.version int NOT NULL DEFAULT 0` is the optimistic-locking column and the reservation module **never writes it** |
| Prior version in `reservation_change.before_state` | `V14`:78 | ✅ Table exists with `before_state jsonb`; **no code writes it today** |
| `propertyId` + `propertyName` | `V3`:77, `PropertyCompletenessChecker`, DB | ✅ See §7.2 — resolvable, with an established precedent |
| `appliedRuleIds` = distinct union | `RateResolver`, `ResolvedRate` | ✅ One winner per night or none — the union is well-defined |
| Ordering *"ascending numeric"* | `V9`:11 | ⚠️ **`rate_rule.id` is `uuid`** — see §8.3 |
| `appliedRuleIds` internal only | doc 58 §9, `PublicResponseDenylistTest`, `QuoteIT` | ✅ Already enforced |
| `nightly_price_minor` uniform-only | `V12`:188, :197 | ✅ Column is nullable and its CHECK admits NULL |

**No contradiction requiring a further business decision was found.**

---

## 4. FROZEN — `snapshot.version` semantics

**`price_snapshot.version` is the reservation snapshot's REVISION NUMBER.**

It counts how many times this reservation has been priced. It is **not** a JSON schema version, and
doc 56 §5.3.4's separate mention of *"the snapshot JSON schema evolv[ing]"* does **not** describe this
field. **No schema-version field exists in V1.**

## 5. FROZEN — initial version

**The snapshot written at S1 carries `"version": 1`.**

## 6. FROZEN — increment and re-version semantics

- Each newly created or re-versioned snapshot takes **the next integer** revision.
- A later snapshot **never mutates** an earlier one.
- After `WON` the snapshot is sealed (doc 56 §5.1, doc 57 §6 CONFIRMED); a post-`WON` modification
  creates a **new** revision alongside the sealed one.
- **V1 implements no modification flow**, so in practice every V1 snapshot is version `1`. The rule is
  frozen now so the first modification cannot invent it later.

## 7. FROZEN — separation from the optimistic-lock version

`reservation.version` (`int NOT NULL DEFAULT 0`, `V12`:90) is the **optimistic-locking** column serving
doc 58 §2's `If-Match`/`version` concurrency contract. It is a **different field with a different
purpose**, it starts at `0` where the snapshot starts at `1`, and the two must never be read from or
written to each other. The reservation module writes neither today.

### 7.1 FROZEN — prior-version retention

**The prior reservation state, including its price snapshot, is retained in the existing
`reservation_change.before_state` `jsonb` column** (`V14`:78).

- **No dedicated snapshot-history table is created**, now or later.
- **No migration is required.**
- ⚠️ **`reservation_change` is written by no code today.** S1 writes `reservation_status_history`, not
  this table. Nothing in V1 populates `before_state`, and this amendment does not claim otherwise —
  the obligation begins with the modification flow (§12).
- Implementation note, not a decision: `reservation_change.reason` is `NOT NULL`, so any write must
  supply one.

### 7.2 FROZEN — property identity in the snapshot

**The snapshot persists both `propertyId` and `propertyName`.**

Both are **snapshot values**, frozen at the moment the snapshot is created and independent of the
mutable property record thereafter — the same guarantee `roomTypeName` already carries. A later rename
or rebrand does not alter an existing snapshot.

**No further property field is added.** No `propertySlug`, no `propertyCode`, no address, no partner
identity — `partnerId`, `partnerCode` and `partnerName` remain on doc 58 §9's denylist and have no
business in a commercial snapshot.

**Which name.** `property` has **no `name` column**; the name lives in
`property_translation (property_id, locale, name)`, one row per locale. `propertyName` is therefore the
name **in the locale of the request that created the snapshot** — exactly the rule already implemented
and frozen for `room_type_name_snapshot`, whose query joins `t.locale = :locale`. **This is the
established precedent, not a new decision.**

Availability is guaranteed, not assumed: `PropertyCompletenessChecker` requires *"name (both locales)"*
before a property may be submitted, and all 8 properties in the database carry both `vi` and `en`.

---

## 8. FROZEN — `appliedRuleIds`

### 8.1 Definition

**`appliedRuleIds` is the DISTINCT UNION of the rule ids appearing in `nights[].ruleId`,** across every
line of the snapshot. It is derived — never independently selected. No second selection mechanism
exists in the corpus or the code, and none may be introduced.

### 8.2 Base-rate and empty behaviour

- `RateResolver` yields **at most one rule per night** (`ORDER BY priority DESC, specificity DESC
  LIMIT 1`, plus `requireNoTie` making a tie a configuration error). The union is therefore over
  zero-or-one rule per night.
- A **base-rate night contributes no id** — `ResolvedRate.fromBase` leaves `ruleId` null, the honest
  record that no rule applied.
- **If no night has a rule, `appliedRuleIds` is `[]`** — an empty array, present and explicit, not
  omitted and not null.

### 8.3 Ordering — ⚠️ reconciled, and flagged

**FROZEN: `appliedRuleIds` is stably and deterministically ordered, identically for every snapshot.**

The ruling specified *"ascending numeric `ruleId`"*. **`rate_rule.id` is a `uuid`** (`V9`:11), and
`ResolvedRate.ruleId` is a `UUID`; **there is no numeric rule id anywhere in the schema or the code**,
so the literal wording cannot be applied.

The requirement the ruling states — *stable deterministic ordering* — is what is frozen, in the only
form a UUID admits without inventing a new key:

> **Ascending by the rule id's canonical lowercase string form**, i.e. the natural ordering of the
> 36-character `uuid` text.

This is deterministic, stable across runs and machines, and requires no additional column. **It is an
editorial reconciliation of an inapplicable literal, not a business decision** — the ordering of an
internal, never-guest-visible array has no commercial consequence. **If the owner intended a different
ordering, one line in a follow-up amendment replaces this paragraph.**

### 8.4 Internal only

**`appliedRuleIds` and `ruleId` are INTERNAL persisted snapshot fields and must never reach a
guest-facing response.** Doc 58 §9's INTERNAL denylist governs, already enforced by
`PublicResponseDenylistTest` and `QuoteIT`. Persisting them changes nothing about exposure: the
snapshot is server-side and is not returned by any public endpoint.

---

## 9. FROZEN — `reservation_line.nightly_price_minor`

**Populate it only when every night in that line has the same `rateMinor`. Otherwise leave it `NULL`.**

**Explicitly forbidden:** first-night, lowest-night, highest-night, average, median, or any other
representative price. A rendered figure that equals no night actually charged is worse than an absent
one.

The column is nullable and its CHECK admits NULL (`V12`:188, :197), so the rule needs no schema change.

## 10. FROZEN — `price_snapshot.nights[]` is authoritative

**The authoritative commercial price is `price_snapshot.lines[].nights[].rateMinor`, per night.**

`nightly_price_minor` is a denormalised rendering convenience (doc 56 §5.3.4) and is never the source
of truth. Where the two could ever disagree, the snapshot wins. This is why a varying-rate stay loses
nothing by leaving the scalar NULL: every night is already recorded individually.

---

## 11. The frozen V1 snapshot shape

Combining doc 117 §14.1–§14.2 with the rulings above:

```jsonc
{
  "version": 1,                          // §4–§6 — revision number
  "computedAt": "2026-08-27T07:03:11Z",
  "currency": "VND",                     // never USD — doc 56 §6
  "basis": "PER_ROOM_PER_NIGHT",
  "propertyId": "…",                     // §7.2
  "propertyName": "…",                   // §7.2 — request-locale name snapshot
  "lines": [{
    "roomTypeId": "…",
    "roomTypeName": "…",                 // survives renames
    "quantity": 2,
    "nights": [                          // §10 — authoritative
      { "date": "2026-09-12", "rateMinor": 1850000, "ruleId": "…", "ruleName": "Weekend" },
      { "date": "2026-09-13", "rateMinor": 1650000 }   // base rate: no ruleId, no ruleName
    ],
    "lineTotalMinor": 7000000
  }],
  "subtotalMinor": 7000000,
  "discount": { "voucherId": null, "amountMinor": 0 },
  "totalMinor": 7000000,
  "appliedRuleIds": ["…"],               // §8 — distinct union, ordered, [] when none
  "termsVersion": "booking-terms-v3"     // OQ-167 — opaque, unvalidated
}
```

**Absent by decision, not omission:** `taxes[]` and `serviceChargeMinor` (doc 117 §14.2, OQ-168), and
any JSON-schema-version field (§4).

---

## 12. Later implementation obligations — none discharged here

**No implementation occurred.** When a later phase acts on this amendment it must:

| # | Obligation | Where |
|---|---|---|
| 1 | Write `"version": 1` in the S1 snapshot | `S1Transaction.priceSnapshot()` |
| 2 | Write `propertyId` and the request-locale `propertyName` | `S1Transaction.priceSnapshot()`; the name must be fetched — it is not on `PricedRequest` today |
| 3 | Write `appliedRuleIds` as the ordered distinct union, `[]` when empty | `S1Transaction.priceSnapshot()` |
| 4 | Pass `nightly_price_minor` only when the line's nights are uniform | `ReservationRepository.insertLine(...)` — signature change |
| 5 | Populate `reservation_change.before_state` (and its `NOT NULL` `reason`) | **Only** when the modification flow is built — **not Step 16A** |
| 6 | Keep `appliedRuleIds`/`ruleId` out of every response | already enforced; keep the guards green |

Obligations 1–4 are a small, self-contained change to two methods. **Obligation 5 belongs to a future
step and is not owed by Step 16A.**

---

## 13. FROZEN — no migration required

**None of these decisions requires a migration**, and none may be used to justify one:

| Decision | Why no migration |
|---|---|
| `version`, `propertyId`, `propertyName`, `appliedRuleIds` | `price_snapshot` is `jsonb` — these are content |
| Prior-version retention | `reservation_change.before_state` already exists (`V14`:78) |
| `nightly_price_minor` rule | Column exists, is nullable, and its CHECK admits NULL |

The migration count stays **28**, latest **V26**.

---

## 14. Reconciliation with the closed questions

| OQ | Status | Interaction |
|---|---|---|
| **OQ-167** | 🟢 CLOSED | `termsVersion` stays **opaque and unvalidated**. Copied into the snapshot as the client sent it. **Not reopened; no ruling here touches it** |
| **OQ-168** | 🟢 CLOSED | No `taxes[]`, no `serviceChargeMinor`. No field frozen here reintroduces either |
| **OQ-170** | 🟢 CLOSED | 409 `IDEMPOTENCY_KEY_REUSED`. The fingerprint covers the **request body**, never the snapshot — a snapshot field cannot alter idempotency |
| **OQ-173** | 🟢 CLOSED | `alternatives` out of V1. Different surface entirely |
| **OQ-174** | 🟢 CLOSED | *"Within 24 hours"* from A6. `responsePromise` and `sla_due_at` are outside the snapshot |

## 15. Explicitly preserved as OPEN or DEFERRED

**None of the following was resolved, narrowed or touched:**

| OQ | Status |
|---|---|
| **OQ-172** `expiresAt` at S10 | 🔴 **OPEN** |
| **OQ-162** notification delivery | 🔴 **OPEN** |
| **OQ-163** rate limiting | 🔴 **OPEN** |
| **OQ-066 / B19** offer response expiry | 🔴 **OPEN** |
| **OQ-161** A6 calendars and escalation | 🟡 **DEFERRED** |
| **B1** `DIRECT_ALTERNATIVE_HOLD_DURATION` | ⚙️ CONFIG REQUIRED, `NULL` |

Also untouched and undecided: tax, service charge, discount and voucher semantics beyond the frozen
`discount = { voucherId: null, amountMinor: 0 }`; payment; the sales modification flow; S7; S10; USD
display.

---

## 16. Verification

**No build, no test run, no application start, no database write.** Backend, frontend and migrations
read **read-only**; two read-only `SELECT`s confirmed property-translation coverage.

| Check | Result |
|---|---|
| Tracked changes outside `docs/` | **none** |
| `backend/src/main/java` · `backend/src/test/java` · `frontend/src` · `db/migration` | **unmodified** |
| Migrations | **28**, latest **V26**, no V27 |
| `git diff --check` | **clean** |
| Baseline | **inherited, not re-run** — backend **506** (155 + 351), frontend **419** |

---

## 17. Files changed

| File | Change |
|---|---|
| **this document** | New |
| [16-open-questions.md](16-open-questions.md) | **OQ-171 → `CLOSED`**; Part II tally |
| [00-README.md](00-README.md) | Current phase; index row 125; tally |

No source, test, migration or seed file. No historical document rewritten — doc 117 §14.3 is completed
by reference, not edited.

---

## 18. Stop

**STOP. OQ-171 is closed; nothing was implemented.** No E6/E7, no migration, no code, no test, no
database change. **OQ-172 and every other open question remain exactly as they were.**
