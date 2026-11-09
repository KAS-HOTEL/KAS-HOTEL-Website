# STEP 16A.2 — OWNER RULING + OQ-051/OQ-083 RECONCILIATION

**Date:** 2026-08-27
**Type:** Contract governance. **Documentation only** — no source, test, migration, seed or database
write. Append-only: no historical document was rewritten.

**Outcome:** both questions were **already answered** by decisions recorded in this repository. This
document does not decide them; it locates the decisions, states their exact reach, and records what
each one deliberately left out.

| | Ruling | Authority |
|---|---|---|
| **OQ-051** | 🟢 **CLOSED** | doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §2, owner decision 1 |
| **OQ-083** | 🟢 **RESOLVED** *(Phase 3, long before OQ-173 existed)* | doc [50](50-phase-3-amendments.md) §13.3, Decision 3 |

**One new question is raised** (OQ-174) and **one contradiction is recorded, not resolved** (OQ-066).

---

## 1. Verification basis

Branch `main` @ `c63c498`. Working tree carried five pre-existing documentation modifications and 51
untracked entries; **no tracked file outside `docs/` was modified at any point in this step.**

Searched **all 102** documents in `docs/kas/` for: `OQ-051`, `OQ-083`, `A6`, `B1`, `B2`, `B19`,
`SALES_FIRST_CONTACT_SLA`, `DIRECT_REQUEST_HOLD_DURATION`, `DIRECT_ALTERNATIVE_HOLD_DURATION`,
`ALTERNATIVE_OFFER`, `ALTERNATIVE_OFFERED`, `direct_committed`, `REQUEST` hold, `S1`, `S7`,
`responsePromise`, *"within the day"*, `otherProperties`, `OQ-156`, `OQ-173`, `OQ-066`. Backend source
was read **read-only** to establish what is actually returned.

**Database: read-only `SELECT` statements only.** Zero `INSERT`, `UPDATE`, `DELETE` or DDL. No
migration was created or edited.

---

## 2. OQ-051 — historical meaning

Defined at doc [28](28-phase-2-decisions.md) §5:233:

> **OQ-051 · Sales / SLA — `BLOCKING`**
> **Issue:** Precise definition of "within the day".
> **Impact:** SLA timer, queue breach highlighting, escalation rules, and the guest-facing promise
> text on screen and in email.

Doc [27](27-request-status-architecture.md):380 states the same question as its four components:
*"cutoff, weekends, holidays, escalation"*. Doc [51](51-phase-4-configuration.md):41 registers it as
**config A6**, *"Cutoff hour, weekends, public holidays, escalation threshold. One value drives
on-screen text, email, timer and escalation"*.

**OQ-051 has no independent meaning beyond A6.** Every one of its 26 occurrences is either the
definition, a carried-forward blocking list, or a pointer to A6. It is the owner decision for A6 and
nothing else.

---

## 3. The existing owner decision for A6

Doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §2, in the owner-decision table, with an
explicit **"Closes"** column:

| # | Decision | Value | Closes |
|---|---|---|---|
| 1 | **A6** `SALES_FIRST_CONTACT_SLA` | **`PT24H`** from `requested_at` | **OQ-051** |

and, immediately beneath the same table:

> Cutoff hours, weekend and holiday calendars, and escalation thresholds are **deferred** (OQ-161).

The owner therefore did two things in one act: **closed OQ-051 with a single duration**, and **carved
its three remaining components into OQ-161**. Both halves are stated by the same document, so neither
is an inference.

Doc 117 §9 governs the consequences and forbids the obvious shortcuts:

- `responsePromise` and `reservation.sla_due_at` **must not be calculated by different logic** — both
  derive from A6 and from nothing else.
- **"V1 computes a plain 24-hour offset."**
- **"No additional SLA setting key may be created."**
- Unset A6 → `MissingConfigurationException` → **422 `CONFIG_MISSING`** naming the key.

Live value, read-only: `SALES_FIRST_CONTACT_SLA = PT24H`.

---

## 4. OQ-051 — final status

### 🟢 **CLOSED.** Closed by owner decision 1, doc 117 §2. No new setting created; A6 unmodified; no migration.

**What the closure covers:** the A6 value, `reservation.sla_due_at`, and the derivation of
`responsePromise`. S1 needs nothing further — it already reads A6 and fails loudly if it is unset.

**What the closure does *not* cover, and must not be read into it:** cutoff hour, weekend calendar,
public-holiday calendar, escalation threshold. These are **OQ-161**, and OQ-161 is `DEFERRED`, not
closed.

**Impact on B1/B2:** none. A6 is the sales-response SLA; B1 and B2 are inventory-hold durations. They
share a duration type and nothing else.

### Stale records — recorded, not rewritten

Six documents still describe OQ-051 as unanswered. They are **historical** and this step does not
edit them; the register now carries the correction instead.

| Document | Still says |
|---|---|
| [14](14-booking-state-machine.md):564 | `BLOCKING` |
| [18](18-information-architecture-v2.md):569 | *"NEEDS CONFIRMATION — OQ-051"* |
| [27](27-request-status-architecture.md):380 | listed as open |
| [28](28-phase-2-decisions.md):233, :334, :424 | `BLOCKING`, and item 1 of the owner's to-do list |
| [50](50-phase-3-amendments.md):778 | listed as an unanswered blocking item |
| [51](51-phase-4-configuration.md):41 | A6 status `OPEN` |

---

## 5. OQ-083 — historical meaning

> **OQ-083** · Inventory · *Are alternative offers held in inventory, and for how long?*

Its subject is the **sales-mediated `ALTERNATIVE_OFFER` hold**: a human agent, mid-conversation,
proposing a different room or a different date and choosing to hold that inventory while the guest
decides. Transition **S7** (`CUSTOMER_CONTACTED` → `ALTERNATIVE_OFFERED`), doc
[14](14-booking-state-machine.md):173 and doc [54](54-phase-4-state-machines.md):71.

---

## 6. S7 / B1 — what is settled and what is not

**S7 is not implemented and this step does not implement it.** Doc 117:517 defers *"B1
`DIRECT_ALTERNATIVE_HOLD_DURATION` and the S7 alternative-offer flow"* to a later step, and doc
118:358 confirms Step 16A shipped *"no S7 alternative offer"*.

**B1 is not an open question — it is a required configuration value.** Doc
[50](50-phase-3-amendments.md) §12.5 heads its table *"Not open questions — configuration values the
system cannot invent"*, and doc [28](28-phase-2-decisions.md):347 says it directly:

> *Phase 3 final decision lock closed OQ-079, OQ-082 and **OQ-083**. Residual values —
> `DIRECT_ALTERNATIVE_HOLD_DURATION`, OTA safety buffer values, OTA recording lag threshold — are
> tracked as **business configuration required before production launch** … **not as open questions**.*

Doc 51:57 registers B1 with status **`CONFIG REQUIRED`** — not `OPEN`. Doc 50 §13.3 already specifies
the behaviour when it is absent, and that behaviour is the one the platform already implements
elsewhere:

> **`DIRECT_ALTERNATIVE_HOLD_DURATION` is a business configuration required before production
> launch.** No default is invented. With none configured, placing an alternative hold fails with an
> error naming the missing setting rather than the system choosing a duration.

Live value, read-only: `DIRECT_ALTERNATIVE_HOLD_DURATION = NULL` — correct, and **this step does not
supply it**.

**B19 is a different setting and a different question.** Doc 51:75 — *"Alternative offer response
expiry: how long the **offer** stands, distinct from the inventory hold (B1)"* — status `OPEN`,
tracked as **OQ-066**. Live value: `ALTERNATIVE_OFFER_RESPONSE_EXPIRY = NULL`.

---

## 7. OQ-083 — final status

### 🟢 **RESOLVED** by doc [50](50-phase-3-amendments.md) §13.3 Decision 3 — in **Phase 3**, before OQ-173 existed.

Three independent records agree:

| Source | Wording |
|---|---|
| [50](50-phase-3-amendments.md):680 | ✅ **RESOLVED (Decision 3)** — yes, via `ALTERNATIVE_OFFER` holds with mandatory expiry |
| [28](28-phase-2-decisions.md):378 | ✅ **RESOLVED (D-45/D-46)** — yes, with mandatory expiry; duration is business configuration |
| [16](16-open-questions.md):26-28 | Phase 3 final decision lock — OQ-083 *"alternative offer holds with mandatory expiry"* is **RESOLVED** |

**What was decided:** alternatives *may* be held; every such hold carries a **mandatory `expires_at`**;
the duration comes from B1; and the safety mechanisms are named — the database CHECK refuses negative
availability, deterministic lock ordering plus a unique constraint prevent double allocation, a
5-minute sweep plus reconciliation clears expired holds, `LOST` releases immediately, and the
availability query defensively excludes holds past `expires_at`.

**What remains, and is *not* OQ-083:**

1. **The B1 value** — business configuration (doc 50 §12.5). Not an OQ.
2. **The offer-response expiry (B19)** — a different setting, tracked as **OQ-066**, which is
   contradicted across documents (§10).
3. **Doc 50 §13.3's closing paragraph is marked `PROPOSED`, not decided** — *"Holding an alternative
   is an explicit agent action, not automatic"*, together with the *"release the original"* action
   that stops one guest consuming two sets of rooms. **A `PROPOSED` paragraph is not an owner
   decision**, and this step does not promote it.

---

## 8. OQ-173 vs OQ-083 — the boundary

**They must not be conflated, and OQ-173's closure has no bearing on OQ-083.**

| | **OQ-083** | **OQ-173** |
|---|---|---|
| Actor | A **human sales agent**, deliberately | The **server**, automatically |
| Surface | Transition **S7**, admin/sales side | The guest-facing **`422 NO_AVAILABILITY`** body of **S1** |
| Artefact | An `ALTERNATIVE_OFFER` **inventory hold** — real rows, real `direct_committed` impact | An **`alternatives` object** in an error response — a computed suggestion holding nothing |
| Decided | Phase 3 (doc 50 §13.3) — **may exist**, with mandatory expiry | 2026-08-27 (doc [120](120-phase-7-5f-step-16a-oq173-contract-amendment.md) §2) — **out of V1 scope** |
| Effect on inventory | Yes — a hold is created | **None** — no search, no hold, no recommendation |

Doc 120 §1 already examined and rejected the link, ruling doc 50 §13.3 / OQ-083 a *"near miss"* for
exactly this reason: it is *"a human agent proposing an alternative and choosing to hold it — not an
array computed into an error response."*

**Consequence, stated plainly:** OQ-173 being `CLOSED` means the S1 endpoint offers nothing. It does
**not** mean the sales-mediated alternative flow was cancelled, deferred or decided. S7 remains a
future step whose structural question (OQ-083) is already answered and whose configuration (B1) and
offer-expiry question (OQ-066) are not.

---

## 9. Reconciliation matrix

| OQ | Original meaning | Current governing source | Current decision | Status | Impact on S1 | Impact on S7/B1 |
|---|---|---|---|---|---|---|
| **OQ-051** | Precise definition of "within the day" — cutoff, weekends, holidays, escalation (= config A6) | doc 117 §2 d.1, §9 | `SALES_FIRST_CONTACT_SLA` = **`PT24H`** from `requested_at`, GLOBAL | 🟢 **CLOSED** | Drives `sla_due_at` and `responsePromise`; already live | None |
| **OQ-083** | Are alternative offers held in inventory, and for how long? | doc 50 §13.3, doc 28 §5 | **Yes** — `ALTERNATIVE_OFFER` holds with mandatory `expires_at`; duration from B1 | 🟢 **RESOLVED** *(Phase 3)* | **None** — S1 creates only `REQUEST` holds | **Structural answer exists.** S7 may proceed once B1 is supplied |
| **OQ-173** | Is the `422` `alternatives` object defined? | doc 120 §2 | **Out of V1 scope.** No nearest-date search, no property search, no recommendation | 🟢 **CLOSED** | The property is **absent** from the 422, not an empty array | **None** — different actor and surface |
| **OQ-161** | A6's declared type cannot hold A6's four-part definition | doc 117 §2, §20 | Three components **deferred**; V1 computes a plain 24-hour offset | 🟡 **DEFERRED** | None — V1 needs no calendar | None |
| **OQ-018** | Should a request hold inventory, for how long, on expiry what? | doc 117 §2 d.2 | B2 `DIRECT_REQUEST_HOLD_DURATION` = **`PT24H`**, **system-level only** | 🟢 **CLOSED** | S1 `REQUEST` hold expiry | Distinct setting from B1 |
| **OQ-167** | What does one `terms_version` pin? | doc 117 §24.2 | Stored **opaquely**, unvalidated in V1 | 🟢 **CLOSED** | `reservation.terms_version` | None |
| **OQ-170** | Same key, materially different body | doc 117 §24.1 | **409 `IDEMPOTENCY_KEY_REUSED`** | 🟢 **CLOSED** | The 409 branch | None |
| **OQ-171** | The price snapshot's typed shape | doc 117 §14.3 | — | 🔴 **OPEN** | Four fields deliberately absent from the snapshot | None |
| **OQ-172** | `expiresAt` cleared at S10 vs `NOT NULL` | doc 118 §18 | — | 🔴 **OPEN** | None — S10 is not in Step 16A | Touches hold lifecycle, incl. `ALTERNATIVE_OFFER` holds |
| **OQ-066** *(materially connected)* | Is `ALTERNATIVE_OFFERED` a distinct state with its own expiry and reminder? (= config B19) | ⚠️ **contradicted** — see §10 | State: implied resolved by doc 29:260. Expiry: **no value** | 🔴 **OPEN** | None | **Blocks S7's offer-expiry half** |
| **B1** *(not an OQ)* | `DIRECT_ALTERNATIVE_HOLD_DURATION` | doc 50 §12.5, doc 51:57 | **`CONFIG REQUIRED`** — no default may be invented | ⚙️ **CONFIG REQUIRED**, value `NULL` | None | **Blocks S7 implementation** |

---

## 10. Contradiction recorded, not resolved — OQ-066

Doc [29](29-direct-sales-crm-architecture.md):260 states *"Also resolves OQ-053, OQ-054, **OQ-066**,
OQ-073."* Four other documents still record OQ-066 as open:

| Document | Records |
|---|---|
| [14](14-booking-state-machine.md):565 | `OPEN` — *"Alternative offer **response** expiry (distinct from the inventory hold duration)"* |
| [28](28-phase-2-decisions.md):309 | `### OQ-066 · Booking workflow — OPEN` |
| [51](51-phase-4-configuration.md):75 | B19 status `OPEN` |
| [88](88-phase-7-2-database-foundation.md):311 | `ALTERNATIVE_OFFER_RESPONSE_EXPIRY` → B19 / OQ-066 |

A reading that fits every source is available — doc 29 settles the **state** half (`ALTERNATIVE_OFFERED`
*is* a distinct `salesStatus`, and its state machine shows it), while the **expiry** half that
OQ-066's own text asks about is untouched, and B19 has no value. **That reading is not adopted here.**
Choosing it would convert a partial answer into a closure, so **OQ-066 stays `OPEN`** and the
contradiction is recorded for the owner.

---

## 11. New open question — OQ-174

Closing OQ-051 with `PT24H` produced a guest-facing divergence that no document reconciles.

> ### OQ-174 · Sales / content — the public promise wording no longer matches the SLA
> **Issue:** Six-plus guest-facing surfaces promise *"within the day"* — docs 26:188, 26:313, 26:352,
> 27:54, 27:156, 66:107, 68:109, 68:177, 68:207, 79:200, 79:253, 81:85, 81:156. The API now returns
> **`"Within 24 hours"`**, rendered from A6 by `S1Transaction.responsePromise()`, because doc 117 §9
> requires the promise to derive from A6 *"and from nothing else"* and V1 *"computes a plain 24-hour
> offset."* Doc 58 §3.3's example value `"responsePromise": "within the day"` is illustrative and is
> superseded by doc 117 §9 for the derivation, but **the static copy on the other surfaces was never
> revisited.**
> **Why it matters:** *"within the day"* and *"within 24 hours"* are **different commercial promises.**
> A request at 23:00 satisfies PT24H by replying at 22:00 the next day — which is not within the day.
> One of the two must change, and the platform currently shows both.
> **Impact:** Every request-confirmation surface, the acknowledgement email (OQ-162), the admin queue
> timer, and the Vietnamese copy that config B27 / OQ-061 reserves for a native copywriter.
> **This document does not choose.** The options — restate the surfaces as "within 24 hours", or give
> A6 the calendar semantics of "within the day" (which is **OQ-161**, deferred) — are commercial, not
> technical.
> **Status:** `OPEN`

**No other new question was raised, and OQ-174 is not a decision.**

---

## 12. Explicit no-invention table

| Not decided here | Status left exactly as found | Where it lives |
|---|---|---|
| **B1 value** | `NULL`; `CONFIG REQUIRED` | doc 50 §12.5 |
| **B19 value** | `NULL`; `OPEN` | OQ-066 |
| **S7 implementation** | Not implemented | a later step (doc 117:517) |
| **`ALTERNATIVE_OFFER` duration** | Not chosen | B1 |
| **"Explicit agent action" / "release the original"** | **`PROPOSED`**, not promoted | doc 50 §13.3 |
| **Alternative-property selection** | Out of V1 | OQ-173 |
| **Nearest-date selection** | Out of V1 | OQ-173 |
| **Recommendation ranking** | Not defined | OQ-122 |
| **Notification delivery** | No infrastructure | OQ-162 |
| **Rate limiting** | None | OQ-163 |
| **Policy version validation** | Unvalidated by decision | OQ-167 (closed that way) |
| **Typed price snapshot fields** | Four fields absent | OQ-171 |
| **S10 `expiresAt` behaviour** | Untouched | OQ-172 |
| **A6 calendars / escalation** | Deferred | OQ-161 |
| **Public promise wording** | Divergent, unreconciled | **OQ-174** (new) |

---

## 13. Impact on S1

**None. Nothing about the frozen S1 contract changes.**

Both rulings confirm what S1 already does. `POST /api/v1/public/reservations/requests` continues to:
read A6 for `sla_due_at` and `responsePromise` from one clock read; read B2 for the 24-hour `REQUEST`
hold; create **only** `REQUEST` holds, never `ALTERNATIVE_OFFER`; and omit the property from the
`422 NO_AVAILABILITY` body rather than emit empty `alternatives` arrays.

No endpoint, DTO, error code, setting key, migration or test was added, removed or altered.

---

## 14. Impact on future S7 / B1 work

S7 now has a clean, evidenced starting position:

**Already settled — do not re-litigate:** alternatives *may* be held (OQ-083); every hold carries a
mandatory `expires_at`; the duration comes from B1 and no default may be invented; the safety
mechanisms are named in doc 50 §13.3; `hold_type` already distinguishes `ALTERNATIVE_OFFER` from
`REQUEST` (doc 117:322); and **V26's `hold_active_unique_idx` is scoped to `status = 'ACTIVE'`
precisely so S8's *"superseded holds released; new holds created"* remains possible**
([121](121-phase-7-5f-step-16a-e6-hardening.md)).

**Blockers before S7 can be built:**

| # | Blocker | Type | Who |
|---|---|---|---|
| 1 | **B1** value | Business configuration | Sales / Revenue |
| 2 | **OQ-066 / B19** — offer response expiry, and the state contradiction of §10 | Owner decision | Product owner |
| 3 | Doc 50 §13.3's **`PROPOSED`** agent-action semantics | Owner decision | Product owner |
| 4 | **OQ-172** — `expiresAt` at S10 | Owner decision | Product owner |
| 5 | Notification of the offer to the guest | Owner decision | **OQ-162** |

---

## 15. Baseline (not re-run)

**No build, no test run, no application start.** Figures below come from the reports E6 left on disk
and from **read-only** `SELECT` statements.

| | Value |
|---|---|
| Backend tests | **155 unit + 351 integration = 506**, 0 failures, 0 errors, 0 skipped |
| Frontend | **419** — *not re-run*; 0 tracked frontend files modified since Step 17 |
| Flyway | **28** applied, latest **V26**, **0** failed |
| `reservation` · `reservation_line` · `inventory_hold` · idempotency · `customer` · `room_type` | **0** each |
| `property` · `partner` | **8** · **1** |
| A6 · B2 | `PT24H` · `PT24H` |
| **B1** · **B19** | **`NULL`** · **`NULL`** — deliberately |

⚠️ **The brief's baseline of "155 + 344 = 499" is the pre-E6 figure.** E6 added 7 tests; the verified
current total is **506** ([121](121-phase-7-5f-step-16a-e6-hardening.md) §3).

---

## 16. Next-step recommendation

**Stop here.** Two owner decisions would unblock the most, in this order:

1. **OQ-174** — one sentence settles which promise KAS makes. It is guest-facing, already live in two
   contradictory forms, and cheap to fix in either direction.
2. **OQ-171** — the typed snapshot shape, which the Step 16A frontend will hit immediately.

S7 should not be attempted until **B1**, **OQ-066** and doc 50 §13.3's `PROPOSED` paragraph are all
settled — three separate decisions, none of which this step made.
