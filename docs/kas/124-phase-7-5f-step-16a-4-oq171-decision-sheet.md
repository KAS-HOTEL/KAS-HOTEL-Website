# PHASE 7.5F — STEP 16A.4 — OQ-171 DECISION SHEET

**Date:** 2026-08-27
**Type:** Contract governance. **Documentation only** — no source, test, migration, seed, SQL or
database write. Append-only: no historical document was rewritten.

---

## 1. Status

🔴 **OQ-171 REMAINS OPEN. This is a narrow stop, not a closure.**

This document is deliberately **not** named `-contract-amendment`. No owner ruling was supplied for
this step, and exhaustive verification found that **the corpus does not decide three of the four
dimensions**. Recording a ruling anyway would be inventing one, which doc 117 §14.3 explicitly
forbids: *"No value is invented for any of these."*

**What this step did achieve**, and what makes the remaining decisions cheap:

| | |
|---|---|
| ✅ **One dimension is already resolved** — by the *existing* frozen contract, not by a new decision | §6④a |
| ✅ **A second is materially narrowed** to a single question, because implemented behaviour settles its sub-questions | §6③ |
| ✅ **A candidate home for "prior version retained" was found** that doc 117 §14.3 said did not exist | §4 |
| ⛔ **Three decisions remain**, each stated as the smallest possible choice | §7 |

**A factual correction to doc 117 §14.3 is recorded in §4.** It is the only substantive change to the
project's understanding, and it makes decision ① easier rather than harder.

---

## 2. OQ-171 before this step

Raised by doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §14.3 as four items that *"cannot
be frozen"*, restated identically in docs 118 §12, 119, 120, 121, 122 and the register. Nothing later
resolved any of them.

Doc [56](56-phase-4-pricing.md) §5.2 — the origin — is an **illustrative `jsonc` example with elided
values** inside a block marked **PROPOSED**. No key is required or optional, no type is declared, and
**no JSON Schema, CHECK constraint, Java record or TypeScript type exists anywhere in the repository.**

---

## 3. Evidence examined and classified

Searched all **102** documents in `docs/kas/`, all backend source, all 28 migrations and all frontend
source for `price_snapshot`, `appliedRuleIds`, `ruleId`, `terms_version`, snapshot `version`, nightly
price, room-type snapshot and reservation snapshot.

| Source | Classification | What it actually establishes |
|---|---|---|
| doc 56 §5.1 | **FROZEN** *(§5 headed CONFIRMED)* | Snapshot written at S1; **re-versioned** on modification with *"the prior version retained"*; sealed at `WON`; unaffected by later rate edits |
| doc 56 §5.2 | **DRAFT / PROPOSED** | The illustrative shape. `"version": 1` is an **example value with no declared semantic** |
| doc 56 §5.3.4 | **FROZEN** *(enforcement list)* | Speaks of *"the snapshot JSON **schema** evolv[ing]"* — the second, incompatible reading of "version" |
| doc 57 §6 steps 1–7 | **DRAFT / PROPOSED** | The modification flow, incl. *"Change written to `reservation_change` with before/after and reason"* |
| doc 57 §6 closing ¶ | **OWNER DECISION** *(CONFIRMED)* | *"After `WON` the snapshot is sealed. A post-`WON` modification creates a **new snapshot version** with an explicit acceptance record; it never mutates the sealed one."* |
| doc 58 §8:250 | **FROZEN CONTRACT** | `POST /sales/requests/{reference}/modify` — *"Re-checks, re-prices, **re-versions snapshot**"*. **Not implemented** |
| doc 58 §9 | **FROZEN CONTRACT** | `appliedRuleIds` and `ruleId` are on the **INTERNAL denylist** — they may never reach a guest **response**. Says nothing about the persisted snapshot's shape |
| doc 117 §14.1 | **FROZEN CONTRACT** | The implementable subset, incl. **per-night `date`, `rateMinor`, `ruleId`, `ruleName`** |
| doc 117 §14.2 | **OWNER DECISION** | No `taxes[]`, no `serviceChargeMinor` (OQ-168 closed) |
| doc 117 §14.3 | **FROZEN CONTRACT** | The four dimensions are **explicitly unresolved**, and guessing is forbidden |
| `V12__reservation.sql` | **IMPLEMENTED** | `price_snapshot jsonb` (single scalar, nullable); `reservation.version int NOT NULL DEFAULT 0`; `reservation_line.nightly_price_minor bigint` **nullable**; `room_type_name_snapshot text NOT NULL` |
| `V14__reservation_history.sql` | **IMPLEMENTED** | **`reservation_change`** with `before_state jsonb` / `after_state jsonb` / `reason` / `guest_notified` — see §4 |
| `S1Transaction.priceSnapshot()` | **IMPLEMENTED** | Writes `computedAt`, `currency`, `basis`, `lines[]` with `roomTypeId`/`roomTypeName`/`quantity`/**`nights[]`**/`lineTotalMinor`, `subtotalMinor`, `discount`, `totalMinor`, `termsVersion`. All four OQ-171 fields **omitted** |
| `RateResolver` | **IMPLEMENTED** | `ORDER BY priority DESC, specificity DESC LIMIT 1` + `requireNoTie` → **exactly one winning rule per night, or none** |
| `ResolvedRate.fromBase` | **IMPLEMENTED** | Base-rate nights carry `ruleId = null` — the honest record that no rule applied |
| frontend | **NONE** | No `priceSnapshot` type, no `appliedRuleIds` interpretation. The only mentions are denylist assertions |
| doc 53 §282 | **HISTORICAL** | ERD describes `reservation_change` as *"Modification history"* |

---

## 4. ⚠️ Correction — a history table **does** exist

Doc 117 §14.3 states, of *"prior version retained"*:

> `price_snapshot` is a single scalar `jsonb` and **no history table exists** among the 53 tables

**That is factually incorrect.** `V14__reservation_history.sql`:78 creates:

```sql
CREATE TABLE reservation_change (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id  uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    actor_id        uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    before_state    jsonb,
    after_state     jsonb,
    reason          text        NOT NULL,
    guest_notified  boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

**What this changes:** a prior snapshot version has a **structurally adequate home already in the
schema** — `before_state jsonb`. **No migration would be required** to retain it.

**What this does not change:** nothing states that the prior *price snapshot* is what goes there. The
table carries no `COMMENT`, doc 53 calls it only *"Modification history"*, and doc 57's mention of it
sits inside a **PROPOSED** block. Whether `before_state` holds the whole reservation state, the
snapshot alone, or a diff is **undecided**.

Doc 117 is **not edited** — this correction is recorded here, per the append-only convention.

---

## 5. What is already frozen — the narrowing

Before asking for decisions, this is what needs no decision at all:

1. **Per-night prices are already persisted, exactly.** Doc 117 §14.1 freezes *"Per-night `date`,
   `rateMinor`, `ruleId`, `ruleName`"*, and `S1Transaction.priceSnapshot()` writes them. A stay whose
   rate differs every night is recorded night by night in `price_snapshot.lines[].nights[]`.
2. **A night has exactly one rule, or none.** `RateResolver` takes a single winner (`LIMIT 1`) and
   `requireNoTie` makes a tie a **configuration error** (frozen at Step 13: *"TIE = CONFIGURATION
   ERROR"*). `ResolvedRate.fromBase` records `ruleId = null` for a base-rate night. **A night can never
   carry multiple rules**, and fallback-pricing-without-a-rule is real and already represented.
3. **`appliedRuleIds` may never reach a guest.** Doc 58 §9 INTERNAL denylist, enforced by
   `PublicResponseDenylistTest` and `QuoteIT`.
4. **No tax, no service charge, no USD** in the snapshot — doc 117 §14.2, doc 56 §6.
5. **`reservation.version` is not the snapshot's version.** It is the optimistic-locking column
   (`int NOT NULL DEFAULT 0`, V12:90), and the reservation module never writes it.

---

## 6. The four dimensions

### ① `version` semantics — ⛔ **UNRESOLVED — OWNER DECISION REQUIRED**

Two incompatible readings, both in the same frozen document:

| Reading | Source |
|---|---|
| **A revision counter** — increments each time sales re-prices | doc 56 §5.1 *"recomputed and **re-versioned**"*; doc 57 §6 CONFIRMED *"creates a new snapshot version"*; doc 58 §8:250 *"re-versions snapshot"* |
| **A schema version** — identifies the JSON shape | doc 56 §5.3.4 *"even if the snapshot JSON **schema** evolves"* |

**The revision reading has more support** — three sources, one of them an owner decision — but it is
**not stated**, and no source gives a start value, an increment rule, or says whether both concepts are
needed as two fields. Doc 56 §5.2's `"version": 1` is an example inside a PROPOSED block.

**Sub-question — where does the prior version live?** §4 shows `reservation_change.before_state jsonb`
is structurally adequate and needs no migration. **Nothing frozen says it is the home.**

### ② Property identity — ⛔ **UNRESOLVED — OWNER DECISION REQUIRED**

Property identity is **absent from doc 56 §5.2 at every nesting level**. It exists only as
`reservation.property_id`, a foreign key.

Two facts bear on it, and neither decides it:

- **Room type is snapshotted doubly** — `roomTypeId` *and* `roomTypeName`, with the frozen reason
  *"survives later renames"* (doc 56 §5.2, `reservation_line.room_type_name_snapshot NOT NULL`). The
  same argument would apply to a property that is renamed or rebranded — **but no document makes it.**
- The doc 58 §9 denylist bars `partnerId`/`partnerName` from **guest responses**. The snapshot is
  internal and persisted, so the denylist does not govern it — **but nor does anything else.**

**The question is exactly:** what property identity, if any, must the immutable commercial snapshot
carry — id, name snapshot, both, or nothing because the FK suffices?

### ③ `appliedRuleIds` ↔ `nights[].ruleId` — ⛔ **UNRESOLVED, but materially narrowed**

**Settled by implemented, frozen behaviour** (§5.2): a night has **0 or 1** rule, never several. So the
options collapse to three:

| Option | Consequence |
|---|---|
| **A** — distinct union of all non-null `nights[].ruleId` | Derived; adds no information, only convenience. Ordering still needs stating |
| **B** — an independently selected set | ⚠️ Nothing anywhere describes a second selection mechanism, and none exists in code |
| **C** — removed from the V1 snapshot | `nights[].ruleId` already answers doc 56 §5.2's stated purpose: *"Without `ruleId`, a pricing dispute six months later is unanswerable"* |

**Option B has no support in the corpus or the code.** Between A and C the corpus is silent, so
**neither is chosen here.**

### ④ Varying nightly price — **④a RESOLVED · ④b ⛔ UNRESOLVED**

The brief's key question — *"Can a reservation preserve the exact commercial price that was actually
offered if different nights have different prices?"* — has an answer, and it is **yes**.

**④a — per-night price in the snapshot: already frozen and already implemented.** Doc 117 §14.1 freezes
per-night `date` + `rateMinor`, and `S1Transaction` writes them. **No decision is required, and none is
recorded here** — this dimension was resolved by the existing contract before this step began.

**④b — the denormalised scalar: unresolved.** `reservation_line.nightly_price_minor` is one nullable
`bigint` per line. Doc 56 §5.3.4 gives its purpose — a **rendering fallback** *"so a line renders
correctly even if the snapshot JSON schema evolves"* — and E4 left it **NULL**, because a stay whose
rate varies has no single nightly price and choosing one (lowest? first? average?) is the guess doc 117
§14.3 forbids.

**Is the schema lossy? No — the snapshot is complete.** What is lossy is only this convenience copy,
and only for a varying-rate stay. The open question is what it should hold, or whether V1 should stop
relying on it.

---

## 7. The minimum owner decisions required

Three decisions. Each is a single choice; none requires new architecture.

> **DECISION 1 — What does `snapshot.version` mean?**
> (a) A **revision counter** — starts at 1 at S1, increments on each sales re-price. *(Most corpus
> support: doc 56 §5.1, doc 57 §6 CONFIRMED, doc 58 §8:250.)*
> (b) A **JSON schema version** — identifies the shape, unrelated to re-pricing. *(doc 56 §5.3.4.)*
> (c) **Both**, as two distinct fields.
> (d) **Omit it from V1** — V1 has no modification flow, so nothing re-versions anything yet.
>
> **DECISION 1b — Where is the prior version retained?**
> (a) `reservation_change.before_state` — exists today, **no migration needed** (§4).
> (b) A dedicated snapshot-history table — **would need a migration**.
> (c) Not in V1, since V1 implements no modification flow.

> **DECISION 2 — What property identity does the snapshot carry?**
> (a) **Nothing** — `reservation.property_id` suffices.
> (b) `propertyId` only.
> (c) `propertyId` **and** `propertyNameSnapshot`, mirroring the room-type precedent so the record
> survives a rename or rebrand.

> **DECISION 3 — `appliedRuleIds`.**
> (a) **Distinct union** of all non-null `nights[].ruleId` — and state the ordering.
> (b) **Remove** it from the V1 snapshot; `nights[].ruleId` already carries the audit trail.
> (c) Something else, which the owner must define — no independent selection mechanism exists.
>
> **DECISION 3b — `reservation_line.nightly_price_minor` when nights differ.**
> (a) Leave **NULL** — current behaviour; the snapshot is authoritative.
> (b) A stated rule (lowest / first / average) — a **commercial display** choice, with the
> consequence that a rendered figure may not equal any night actually charged.
> (c) Populate it only when every night is identical, NULL otherwise.

**None of these is chosen here.** Technical convenience is not an owner decision.

---

## 8. Reconciliation with the closed questions

| OQ | Status | Interaction with OQ-171 |
|---|---|---|
| **OQ-167** | 🟢 CLOSED | `acceptedTermsVersion` is stored **opaquely** and unvalidated. The snapshot's `termsVersion` copies that same string. **Not reopened, not affected** — none of the three decisions touches it |
| **OQ-168** | 🟢 CLOSED | No `taxes[]`, no `serviceChargeMinor`. The decisions above add no field that would reintroduce either |
| **OQ-170** | 🟢 CLOSED | 409 `IDEMPOTENCY_KEY_REUSED` on a fingerprint mismatch. The fingerprint covers the **request body**, never the snapshot, so a snapshot shape change cannot alter idempotency semantics |
| **OQ-173** | 🟢 CLOSED | `alternatives` out of V1 scope. Unrelated surface — a 422 body, not the persisted snapshot |
| **OQ-174** | 🟢 CLOSED | *"Within 24 hours"* from A6. `responsePromise` and `sla_due_at` are outside the snapshot entirely |
| **OQ-172** | 🔴 **OPEN** | `expiresAt` at S10. **Not resolved here**, and not touched |

---

## 9. Later obligations — conditional, none incurred yet

**No implementation change is required today**, because no ruling was made. If the owner answers §7:

| Decision | Implementation | Migration |
|---|---|---|
| 1 (a/b/c) | Add the field in `S1Transaction.priceSnapshot()` | **None** — `price_snapshot` is `jsonb` |
| 1 (d) | None | None |
| 1b (a) | Write `before_state` when a modification flow is built — **not in Step 16A** | **None** — table exists (§4) |
| 1b (b) | A later step | **Yes** — a new table |
| 2 (b/c) | Add the key(s) in `priceSnapshot()` | **None** |
| 3 (a) | Compute the union in `priceSnapshot()` | **None** |
| 3 (b) | Nothing — already absent | **None** |
| 3b (b/c) | Pass a value to `insertLine(...)` | **None** — column exists, nullable |

**At most one of the eleven outcomes needs a migration**, and only the one that adds a dedicated
history table. Everything else is `jsonb` content or an existing nullable column.

---

## 10. Out of scope

Nothing below was decided, touched or described beyond its already-recorded status: **OQ-172**
(`expiresAt` at S10) · **OQ-162** (notification delivery) · **OQ-163** (rate limiting) · **OQ-161**
(A6 calendars — DEFERRED) · **OQ-066 / B19** · **B1** · S7 · S10 · the sales modification flow · the
`/sales/requests/{reference}/modify` route · `reservation.version` optimistic locking · voucher and
discount semantics · USD display.

---

## 11. Verification

**No build, no test run, no application start, no database write.** Backend, frontend and migrations
were read **read-only**.

| Check | Result |
|---|---|
| Tracked changes outside `docs/` | **none** |
| `backend/src/main/java` · `backend/src/test/java` · `frontend/src` · `db/migration` | **unmodified** |
| Migrations | **28**, latest **V26**, **no V27** |
| `git diff --check` | **clean** |
| Baseline | **inherited, not re-run** — backend **506** (155 + 351), frontend **419** |
| OQ statuses changed | **none** — OQ-171 stays `OPEN` |

---

## 12. Files changed

| File | Change |
|---|---|
| **this document** | New |
| [16-open-questions.md](16-open-questions.md) | OQ-171's **note** extended to point here and record the narrowing. **Status unchanged — `OPEN`** |
| [00-README.md](00-README.md) | Current phase; index row 124 |

No source, test, migration or seed file. No historical document rewritten.

---

## 13. Stop

**STOP. OQ-171 is not closed.** No implementation; no E6/E7; no migration; no snapshot field chosen; no
other OQ altered.

**Unblocking requires three owner answers — §7 Decisions 1, 2 and 3** (with sub-parts 1b and 3b).
Dimension ④a needed no decision and is already frozen and implemented.
