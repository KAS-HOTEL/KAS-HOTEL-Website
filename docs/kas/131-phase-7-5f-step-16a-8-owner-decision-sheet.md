# PHASE 7.5F — STEP 16A.8 — REMAINING PARTNER BLOCKERS: OWNER DECISION SHEET

**Date:** 2026-08-27
**Type:** Contract governance. **Documentation only** — no source, test, frontend, migration, seed or
database write. Append-only: no historical document was rewritten.

**This document makes no decisions.** Every unresolved item is marked **OWNER DECISION REQUIRED** with
the smallest choice that unblocks it.

---

## §1 Purpose

After Step 16A.7, S11 decline is live and S10 win and S2/S4 assign are not. This sheet establishes
*exactly* what is missing for each, from the repository rather than from earlier reports — **two of
which turned out to be wrong** (§3.1).

---

## §2 Verified current state

| | |
|---|---|
| Backend | **155 unit + 382 integration = 537** — inherited from 16A.7, **not re-run this turn** |
| Frontend | **481** — inherited, not re-run |
| Migrations | 28, latest V26, no V27 |
| A6 `SALES_FIRST_CONTACT_SLA` | **`PT24H`** |
| B2 `DIRECT_REQUEST_HOLD_DURATION` | **`PT24H`** |
| B1 `DIRECT_ALTERNATIVE_HOLD_DURATION` | **NULL** |
| B19 `ALTERNATIVE_OFFER_RESPONSE_EXPIRY` | **NULL** |
| B12 `DEPOSIT_REQUIRED_TO_CONFIRM` · `DEPOSIT_PERCENTAGE` | **NULL · NULL** |
| Implemented transitions | S1 (guest), **S11 decline** |

---

## §3 Remaining blocker register

| ID | Category | Flow | Already decided | Still undefined | Owner decision? | Amendment? | Migration? | Backend? | Frontend? | Deferrable? |
|---|---|---|---|---|---|---|---|---|---|---|
| **OQ-172** | Schema vs contract | S10 | Hold becomes firm at WON | Whether "cleared" means literal NULL | **YES** | Yes | **Maybe** — depends on the answer | Yes | No | No |
| **B12** | Config | S10 | Deposit rule exists as a concept | Required? percentage? deadline? | **YES** | No | No | Yes | Yes | No |
| **S10 pre-state** | Contract | S10 | `REQUESTED → WON` **prohibited** without an availability check | Whether S3/S4 must ship first | **YES** | No | No | Yes | Yes | No |
| **Assign permission** | Contract | S2/S4 | Assignment exists | **Three documents name three different permissions** | **YES** | Yes | No | Yes | No | No |
| **Assignment history** | Schema | S2/S4 | History is required (doc 54, doc 14) | No table exists; requirement is PROPOSED | **YES** | No | **Yes** | Yes | No | No |
| **S3 check result** | Schema | S4 | S3 must record the re-check *with its result* | **No storage of any kind exists** | **YES** | No | **Probably** | Yes | No | No |
| **B24** | Config | S2/S4 | Permissions exist now; roles are "trivial to create later" | Team structure | **No** — see §6 | No | No | No | No | **Yes** |
| **B25** | Config | — | — | OTA recording process owner | **No** — unrelated | No | No | No | No | **Yes** |
| **OQ-162** | Infrastructure | all | Business effect owed, delivery not (doc 117 §8.1) | Everything about delivery | **YES** | Yes | Yes | Yes | Maybe | **Yes** |
| **OQ-163** | Security | all | Nothing — doc 58 §10 is entirely PROPOSED | Numbers, windows, codes | **YES** | Yes | No | Yes | No | **Yes** |
| **OQ-066 / B19** | Config | S7 only | Offer expiry is distinct from B1 | The value | No | No | No | No | No | **Yes** |
| **B1** | Config | S7 only | No duration ⇒ no hold | The value | No | No | No | No | No | **Yes** |

### §3.1 Two corrections to my own earlier reports

**B25 is not an assignment config.** Doc 51:81 defines it as *"OTA recording process owner — who
records, from where, at what cadence"*. Docs 128 and 130 wrote "configs B24/B25 (sales team
structure)", conflating two unrelated items. **B25 has no bearing on S2/S4 and never did.**

**B24 does not block assignment either.** Doc 59 §3 states the position directly: *"Creating roles
before knowing who fills them produces roles nobody holds. **The permissions exist now**; the bundles
are trivial to create once B24/B25 arrive. That is the point of permission-based design."* Assigning a
request to an existing **`ADMIN`** user needs no new role. Docs 128 and 130 overstated this.

The real S2/S4 blockers are narrower and different: a **permission contradiction** (§7) and a
**missing table** (§7).

---

## §4 OQ-172 — `expiresAt` when a hold becomes firm

### The contradiction, exactly

| Source | Says |
|---|---|
| `V13__inventory_hold.sql`:29 | `expires_at timestamptz **NOT NULL**` |
| `V13`:50 | `CONSTRAINT hold_expiry_after_creation CHECK (expires_at > created_at)` |
| `V13`:11 and the column COMMENT | *"expires_at IS NOT NULL **AT CREATION**, ALWAYS"* · *"MANDATORY — no hold can permanently lock inventory"* |
| doc 55 row 5 | S10: *"Accepted hold firm (**`expires_at` cleared**); others released"* |
| doc 55 §5 rule 1 — **PROPOSED** | *"`expiresAt` is NOT NULL **at creation**, always. It is **cleared only when a hold becomes firm**. This is the structural guarantee that no hold … can lock inventory permanently."* |

The column is `NOT NULL` **unconditionally**; the rule says NOT NULL **at creation** and cleared when
firm. The schema is therefore stricter than the rule it implements, and clearing is impossible.

### What actually depends on `expires_at` — every consumer

| Consumer | Predicate |
|---|---|
| Expiry sweep index `hold_expiry_sweep_idx` | `(expires_at) **WHERE status = 'ACTIVE'**` |
| Sweep query, doc 55 §5.1 | `WHERE **status = 'ACTIVE'** AND expires_at < now()` |
| View `v_active_hold_demand` | `WHERE **status = 'ACTIVE'** AND expires_at > now()` |
| `PublishedAvailabilityRepository`:94 | `h.expires_at <= now()`, over ACTIVE holds |
| doc 55 §3.1 `DirectCommitted` | *"**ACTIVE holds** covering d, not past expires_at"* |

**Every one filters on `status = 'ACTIVE'` first.** A hold that is not ACTIVE is invisible to all of
them regardless of its `expires_at`.

### The fact that makes this a real choice

`hold_status` is `('ACTIVE', **'CONVERTED'**, 'RELEASED', 'EXPIRED')`, and doc 14 §6.3 already uses
CONVERTED for the analogous case: *"Guest accepts the alternative | Hold `status = CONVERTED`"*.

Further, at WON `stayStatus` becomes `CONFIRMED`, and doc 55 §3.1 then counts the **reservation line**
in `DirectCommitted`. If the hold also stayed ACTIVE, the same room would be counted twice — the exact
double-count doc 55 §3.2 calls *"a genuine defect in the earlier formula"*. So the hold **must** leave
ACTIVE at WON whatever else happens.

> ### ⛔ OWNER DECISION REQUIRED — OQ-172
>
> **A — Make `expires_at` nullable and clear it on WIN.**
> Matches doc 55 rule 1's literal wording. Requires a migration dropping `NOT NULL` and amending
> `hold_expiry_after_creation` to tolerate NULL. **Cost:** the schema stops guaranteeing that every
> hold row carries an expiry, which V13's own comment calls the structural protection against a hold
> locking inventory permanently — the guarantee would move from the database into application code.
>
> **B — Keep `NOT NULL`; represent firmness as `status = 'CONVERTED'`.**
> No migration. Removes the hold from every consumer above by the status filter they already apply,
> and prevents the double count. Uses an enum value that exists and that doc 14 §6.3 already assigns
> this meaning. **Cost:** doc 55 rule 1's word "cleared" is then read as *"ceases to hold"* rather than
> *"set to NULL"*, which needs a contract amendment to record.
>
> **C — Other.**
>
> **Evidence note, not a recommendation beyond it:** rule 1 is marked **PROPOSED**, not CONFIRMED; its
> stated *purpose* — no hold locks inventory permanently — is satisfied by B, because a CONVERTED hold
> contributes to nothing. The corpus supports B on purpose and A on wording. The owner decides which
> governs.

---

## §5 B12 — deposit rule

**B12 is not a hold duration.** Doc 51:68: *"**Deposit rule** — whether a deposit is required to
confirm, percentage, deadline | Finance | Global, per-property override | `OPEN` | **OQ-017**"*.

It is backed by two settings keys already seeded and both NULL: `DEPOSIT_REQUIRED_TO_CONFIRM` and
`DEPOSIT_PERCENTAGE` (doc 88:317). It is **not** `DIRECT_REQUEST_HOLD_DURATION`, **not**
`SALES_FIRST_CONTACT_SLA`, and needs **no new setting key**.

Where it binds S10 — doc 54 S10's guard: *"Availability re-verified under lock; guest accepted;
permission `reservation.win`; **payment recorded or pay-at-hotel permitted**"*. Doc 57:157: *"Required
to reach `WON` | Depends on config B12 — deposit rule, or pay-at-hotel."*

OQ-017 (register, Part I) is `OPEN`: *"Does a booking require a deposit or full payment before reaching
`CONFIRMED`, or can it be confirmed on a pay-at-hotel basis?"*

> ### ⛔ OWNER DECISION REQUIRED — B12 / OQ-017
>
> **A — Pay-at-hotel is permitted in V1.** `DEPOSIT_REQUIRED_TO_CONFIRM = false`. S10's payment half
> of the guard is satisfied with no payment recorded. No payment code, no `DEPOSIT_PERCENTAGE`.
> **This is the smallest answer that unblocks S10.**
>
> **B — A deposit is required.** Then `DEPOSIT_PERCENTAGE` and a deadline are also required, and S10
> additionally depends on `POST /sales/requests/{reference}/payments` (doc 58 §5, `payment.record`),
> which does not exist. **S10 would stay blocked behind payment recording.**
>
> **C — Other.**
>
> No recommendation: the corpus records the question and takes no side. OQ-017's own recommendation is
> *"support both paths"*, which is a design note, not an owner answer.

---

## §6 B24 — sales team structure

Doc 51:80 — *"Central vs per-property, headcount, hours, channels monitored | Sales | Global |
`OPEN` | OQ-048, OQ-071"*. Doc 59:274 — it decides *"Whether `SALES` ships in V1"*.

**It does not block S2/S4.** Doc 59 §3: the permissions exist now and role bundles are *"trivial to
create once B24/B25 arrive"*. Assignment targets a **user**, and `ADMIN` users exist today.

**NO OWNER DECISION REQUIRED for the partner workflow.** B24 remains open for its own reasons.

---

## §7 B25, and the two blockers that actually stop S2/S4

**B25 is unrelated.** Doc 51:81 — OTA recording process owner. **NO DECISION REQUIRED here.**

### §7.1 The permission contradiction

Three frozen documents name **three different permissions** for the same transition:

| Source | Permission | Exists in `Permissions`? |
|---|---|---|
| doc 14:168 (Approved) | **`lead.assign`** | ❌ **No — never built** |
| doc 54:66 (Implementation contract) | `sales.inquiry.manage` | ✅ Yes |
| doc 58 §5:243 (Frozen contract) | `sales.request.assign` | ✅ Yes |

> ### ⛔ OWNER DECISION REQUIRED — which permission gates assignment
>
> **A — `sales.request.assign`** (doc 58 §5). It is the API contract's own answer for this exact
> route, it exists, and its name matches the object being assigned.
> **B — `sales.inquiry.manage`** (doc 54). Exists, but names *inquiries*, and a reservation request is
> not a `sales_inquiry`.
> **C — Other**, including reviving `lead.assign`, which would need adding to the catalogue.
>
> Whichever is chosen, the other two documents become superseded on this point and need an amendment
> recording it. **A is the only one whose name matches both the route and the object**, but the corpus
> genuinely disagrees with itself and the owner must settle it.

### §7.2 The assignment-history table does not exist

Required by doc 54:66 (*"Owner recorded; assignment history"*), doc 14:168 (*"assignment history
written"*), doc 21:585 (*"reassign with reason; full assignment history"*) and doc 29:73 (*"who, when,
by whom, why"*). Doc 52 §3.13 — marked **PROPOSED** — says *"a FK to `User` **plus an assignment
history table**. There is no `SalesOwner` entity."*

`reservation.sales_owner_id` **exists** (V12:38, with a partial index). **No history table exists in
any of the 28 migrations.**

> ### ⛔ OWNER DECISION REQUIRED — where assignment history lives
>
> **A — A dedicated `reservation_assignment` table.** Matches doc 29:73's four fields exactly. **Needs
> a migration (V27).**
> **B — `reservation_status_history`, which already exists** and carries
> `from_status/to_status/actor_id/reason/note`. S2 does move `salesStatus` to `ASSIGNED`, so the
> transition is recorded there anyway — but the table records *status*, not *owner*, so a reassignment
> that does not change status would have nowhere to go. **No migration.**
> **C — Other.**
>
> No recommendation: doc 52 §3.13 is PROPOSED, and the corpus does not say whether reassignment
> without a status change is a case V1 must support. **That sub-question is the crux, and only the
> owner can answer it.**

### §7.4 A sixth blocker, found in Step 16A.9 and missing from this register

Doc 54's **S3** side effect is *"Live availability re-check **recorded with result**"*, and **S4's side
effects are "S2 + S3"** — so S4 owes the recorded result too.

**No storage for an availability-check result exists in any of the 28 migrations.** A grep for
`availability_check`, `availability_checked`, `check_result` and `checked_at` across every migration
returns only the `sales_status` **enum value** `'AVAILABILITY_CHECK'` (V1:50) — a state name, not a
record. `reservation_status_history` would capture the *transition*; it has no field for the check's
**result**.

> ### ⛔ OWNER DECISION REQUIRED — where S3's availability-check result is recorded
>
> **A — `reservation_status_history.note`**, the existing free-text field on the row S3 writes anyway.
> No migration. **Cost:** the result is unstructured text, so it cannot be queried, nor compared against
> the availability that later has to justify S10.
> **B — A dedicated `reservation_availability_check` table** — reservation, checked_at, actor, per-night
> result, outcome. Queryable, and it is what *"recorded with result"* most plainly describes.
> **Needs a migration.**
> **C — Other.**
>
> No recommendation: the corpus says the result must be recorded and never says in what form.

### §7.3 S2 versus S4

Not aliases. Doc 54: **S2** `REQUESTED → ASSIGNED`; **S4** `REQUESTED → AVAILABILITY_CHECK`, *"implicit
self-assignment"*, side effects *"S2 + S3"*. S4 therefore also needs **S3's live availability re-check**
— which does not exist either. **S2 is the smaller of the two and the only one worth unblocking first.**

---

## §8 OQ-162 — notifications

| Dimension | Status |
|---|---|
| **A Contract — is the effect owed?** | 🟢 **FROZEN.** Doc 117 §8.1: the transition owes the business effect and the durable record, **not delivery** |
| **B Trigger** | 🟢 FROZEN per transition — doc 54's Notification column names them (S1, S5, S8, S11, S12, S13) |
| **C Recipient** | 🟢 Largely frozen — "guest", "sales queue", "named agent" |
| **D Channel** | 🔴 **OPEN.** "email + in-app" is named; no provider, no Zalo/SMS decision |
| **E Delivery guarantee** | 🔴 OPEN |
| **F Retry** | 🔴 OPEN |
| **G Failure** | 🟡 Partly frozen — doc 117 §8.1: *"Delivery failure must never roll back S1"* |
| **H Idempotency** | 🔴 OPEN |
| **I Auditability** | 🟡 V18 created `email_log` and friends; **nothing writes to them** |
| **J Template/content** | 🔴 OPEN — and Vietnamese copy is B27 / OQ-061 |
| **K Timing/SLA** | 🟡 A6 governs the *response* promise, not delivery latency |

**Not a prerequisite for S10 or S2/S4.** S11 shipped without it on doc 117 §8.1's frozen basis, and
the same reasoning applies to every other transition. **DEFERRABLE.**

---

## §9 OQ-163 — rate limiting

Doc 58 §10's entire table is marked **PROPOSED**. It names classes — *"Admin | Per user"*, *"Request
submission | Strict per IP and per email"* — and **no numbers, no windows, no response code, no
retry-after, no key definition**. `ApiErrorCode.RATE_LIMITED(429)` is declared and unused. No
infrastructure exists.

**Not a prerequisite for S10 or S2/S4:** both are authenticated, partner-scoped and ownership-checked
at the data layer, so neither adds an anonymous abuse surface. **DEFERRABLE — and it must not hold up
unrelated work.**

---

## §10 OQ-066 / B19 — alternative offer response expiry

Doc 51:75 — *"How long the **offer** stands, distinct from the inventory hold (B1)"*, `OPEN`. Doc 54
lists it under **S7 only**. Value NULL.

**NON-BLOCKING.** S7 is not in scope for S10 or S2/S4.

---

## §11 B1 / B2

| | Value | Consumed by |
|---|---|---|
| **B2** `DIRECT_REQUEST_HOLD_DURATION` | **`PT24H`** | S1 `REQUEST` hold (doc 55:162). **Supplied — not a blocker** |
| **B1** `DIRECT_ALTERNATIVE_HOLD_DURATION` | **NULL** | **S7 only** — the `ALTERNATIVE_OFFER` hold (doc 54:138, doc 55:162, doc 14:274) |

Doc 55 §5 rule 2: *"No configured duration ⇒ no hold"* — with B1 unset, placing an alternative hold
fails naming the missing setting. Nothing about S10, S2 or S4 reads B1.

**NON-BLOCKING. Do not populate it to unblock this workflow — it would not.**

---

## §12 Exact decisions required before S10

1. **OQ-172** — §4, options A / B / C.
2. **B12 / OQ-017** — §5, options A / B / C.
3. **The pre-state question.** Doc 54 **prohibits** *"`REQUESTED → WON` without an availability
   check"*, and S10's source states are `AVAILABILITY_CHECK | CUSTOMER_CONTACTED |
   ALTERNATIVE_OFFERED` — none of which a request can currently reach, because S3/S4/S5 are not
   implemented.
   > ### ⛔ OWNER DECISION REQUIRED
   > **A — Implement S4 (`REQUESTED → AVAILABILITY_CHECK`) first**, so a request can legitimately
   > reach a state S10 accepts. Larger, but respects the frozen prohibition exactly.
   > **B — Amend doc 54 to admit `REQUESTED → WON`** under a re-check performed inside S10 itself.
   > Smaller to build, but **overturns an explicit prohibition** and needs a contract amendment.
   > **C — Other.**

**All three must be answered.** Any one left open leaves S10 blocked.

---

## §13 Exact decisions required before S2/S4

1. **Which permission gates assignment** — §7.1, options A / B / C.
2. **Where assignment history lives** — §7.2, options A / B / C, including whether reassignment
   without a status change must be supported.

3. **Where S3's availability-check result is recorded** — §7.4, options A / B / C.

**S4 additionally requires S3's availability re-check**, which is the same machinery §12 item 3 asks
about. **S2 alone needs only the two decisions above.**

---

## §14 Non-blocking — must not hold up implementation

**B24** · **B25** · **B1** · **B19 / OQ-066** · **OQ-162** · **OQ-163**.

Each is genuinely open, and none of them stands between the repository and S10 or S2.

---

## §15 Explicit non-decisions

Nothing in this document decides anything. Specifically **not** decided: whether `expires_at` becomes
nullable · whether a deposit is required · which permission gates assignment · whether an assignment
history table is created · any notification channel, retry or template · any rate-limit number ·
B1's or B19's value · whether S4 ships before S10.

**No OQ status changed. No new OQ was raised** — every blocker is an existing OQ, an existing
unsupplied config, or a documented contradiction between existing frozen texts.

---

## §16 Implementation boundary

Documentation only. **0 files** changed under `backend/src/main/java`, `backend/src/test/java`,
`frontend/src` or `db/migration`. No migration, no seed, no database write — only read-only `SELECT`
statements to confirm the six setting values in §2. Test baselines are **inherited from 16A.7 and were
not re-run**.

---

## §17 Proposed next implementation sequence

Ordered by decisions-per-unit-of-value, not by size:

1. **S2 assign** — two decisions (§13), one of which may need no migration. Gives the queue an owner
   and makes the SLA actionable.
2. **S10 win** — three decisions (§12), the largest being whether S4 ships first.
3. **OQ-162** — the only one that makes any of it visible to the guest.

**The owner turn is next. No implementation follows from this document alone.**
