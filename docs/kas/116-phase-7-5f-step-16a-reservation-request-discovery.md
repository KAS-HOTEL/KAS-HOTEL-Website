# PHASE 7.5F — STEP 16A — RESERVATION REQUEST — DISCOVERY

**Date:** 2026-08-25
**Status:** 🟡 **BLOCKED — OWNER DECISION REQUIRED.** Verified against the live repository and
database. **No implementation code was written.**

**Gates:** frontend typecheck · lint (0 warnings) · **419 tests** · build (**20 routes**) · **0** npm
vulnerabilities · backend **427 tests** (146 unit + **281** integration, both captured in one
`mvnw verify` run), `BUILD SUCCESS` · Flyway **25 migrations, latest V23, 0 failed** ·
`git diff --check` clean · database **unseeded**.

This is the second, deeper pass over Step 16A. It **lands the open questions** the first pass raised
but never wrote to the corpus — the reservation doc [115](115-phase-7-5f-step-18a-availability-search-discovery.md) §6 flagged — and records four findings the first pass got wrong or missed.

---

## 1. State re-verified

| Check | Result |
|---|---|
| `POST /public/reservations/requests` implemented | **No** — zero hits in `backend/src/main/java` beyond one javadoc reference |
| Reservation / hold / booking Java classes | **0 files** |
| `SALES_FIRST_CONTACT_SLA` · `DIRECT_REQUEST_HOLD_DURATION` · `DIRECT_ALTERNATIVE_HOLD_DURATION` | **NULL · NULL · NULL** |
| Flyway | 25 migrations, latest V23, 0 failed |
| `reservation` · `inventory_hold` · `customer` · `property_policy` · `room_type` rows | **0 · 0 · 0 · 0 · 0** |

Nothing has changed since the first pass. The schema is ready; the business decisions are not.

---

## 2. Findings

### 2.1 The snapshot shape is **illustrated**, not typed — correcting the first pass

Doc 56 §5 (lines 139–192) is the only description of the snapshot anywhere. §5.1 freezes **when**:
written at `salesStatus = REQUESTED` (S1), re-versioned only through an explicit modification flow,
**sealed at `WON`**, unaffected by any later rate-rule edit. §5.3 freezes enforcement, including that
rate rules are never deleted, only `ARCHIVED` — verified: `rule_status` is
`('DRAFT','ACTIVE','PAUSED','ARCHIVED')` — "so a snapshot's `ruleId` always resolves".

§5.2 names **23 fields across four nesting levels**. But it is a fenced `jsonc` **example with elided
values** (`"…"`), not a typed contract:

- **no key is marked required or optional**, no type is declared, no nullability rule is stated;
- **no JSON Schema, CHECK constraint, Java record or TypeScript type** for it exists anywhere;
- `price_snapshot` is untyped `jsonb`, so the column accepts any JSON — a column-level cross-check
  proves nothing.

The first pass called this shape "fully frozen". That was too strong, and the distinction matters:
deriving a typed contract from an illustrative block is the same move this project refused for
OQ-122's envelope. Five specific gaps:

| Gap | Detail |
|---|---|
| `version` is undefined | §5.1/§5.3.1 use "re-versioned" (a revision counter); §5.3.4 separately speaks of "the snapshot JSON schema evolv[ing]". No field distinguishes the two. `reservation.version` is the **optimistic-locking** column, not this |
| "prior version retained" has **no home** | `reservation.price_snapshot` is a single scalar `jsonb`. There is no snapshot-history table among the 53 tables |
| `appliedRuleIds` vs `nights[].ruleId` | The relationship is never stated — union? distinct? ordered? |
| `taxes` shape mismatch | `taxes` is an **array** in §5.2; `reservation.tax_minor` is a scalar `bigint`. An array cannot round-trip into it |
| §5.3.4's fallback is **lossy** | `reservation_line.nightly_price_minor` is one `bigint` per line, but §5.2's `nights[]` models a rate that **varies per night** — which doc 58 §11.2.1 confirms is real |

Two further constraints a reader of §5 alone would miss: **property identity is not in the snapshot**
(only room type, doubly — id plus name copy); and **doc 56 §6 forbids USD from ever appearing in the
price snapshot**.

Also outside Step 16A's scope but worth recording: §5.1's trigger covers **only the DIRECT path**.
Doc 57:238 requires a `priceSnapshot` "required at recording" for OTA, yet a CHECK constraint makes
`salesStatus = REQUESTED` unreachable for OTA. Doc 56 states no OTA trigger.

**Net:** snapshot semantics are close enough to implement *for the V1 direct path* once the tax
question (**OQ-168**) is answered — but the shape should be frozen as a typed contract first.

### 2.2 `hold_unique` can never fire — a verified latent defect

`inventory_hold` declares:

```sql
CONSTRAINT hold_exactly_one_owner CHECK ((reservation_id IS NOT NULL) <> (inquiry_id IS NOT NULL)),
CONSTRAINT hold_unique UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
```

The XOR guarantees **one of the two owner columns is always NULL**, and PostgreSQL's default
`NULLS DISTINCT` means a UNIQUE constraint containing a NULL never matches. **Verified empirically**
in a rolled-back transaction reproducing the exact shape: two byte-identical rows coexisted.

This is the **same defect class V21 already fixed** for `property_policy`, whose own header says:
*"In PostgreSQL, NULLs are DISTINCT in a UNIQUE constraint by default."*

It matters for Step 16A directly: S1 creates a `REQUEST` hold **per room type per night**, and
`hold_unique` is the only structural guard against inserting the same hold twice. No data is currently
affected — `inventory_hold` has 0 rows. **Not fixed here** (discovery only, and a forward fix is a
migration that has not been authorised). Recorded as **OQ-169**.

### 2.3 `terms_version` pins something the schema cannot express → **OQ-167**

`terms_version` is a **pointer, never a snapshot** — there is no policy snapshot anywhere, and zero
hits for `policy_snapshot` in docs, Java, SQL or tests. Durability comes from never deleting the
policy row. But:

| | |
|---|---|
| Frozen request field | `"acceptedTermsVersion": "booking-terms-v3"` — a **string** |
| Snapshot field (56 §5.2) | `"termsVersion"` — the same value, written in **two** places at S1 |
| Column | `reservation.terms_version text` — nullable, **no FK, no CHECK** |
| Actual policy versioning | `property_policy.version` is an **`int`**, unique per `(property_id, policy_type, version)`; V21 added a partial unique index for globals |
| Policy types | **eleven** — `BOOKING, CANCELLATION, CHILDREN, PETS, SMOKING, PAYMENT, ACCESSIBILITY, PRIVACY, TERMS, COOKIES, NO_SHOW` |
| Implemented route | `GET /api/v1/public/properties/{slug}/policies` → `PublicPolicyView(type, version, summary, body)` |
| Contract route (58 §3.1) | `GET /public/policies/{type}` — "Returns `version` for `termsVersion`" — **not implemented** |

Nothing in the repository derives the string `"booking-terms-v3"` from an integer; the string appears
in exactly two places, both illustrative JSON. There is **no rule for what the server does when the
submitted `acceptedTermsVersion` is not current**, and **no statement of which of the eleven types a
single pin covers**. There are **0 policy rows**, so the value has nothing to point at today.

### 2.4 The duplicate question is narrower than the first pass reported

The **outcome is frozen and unanimous** across five documents — *return the original*, never `409`:

- 58 §11:406 — "Submit request | `Idempotency-Key` header | **Returns the original reservation**"
- 15:438 · 26:430 · 68:347 — same outcome; 57:219 names the purpose: "Double submission (**network retry**)"

The client mechanism is **frozen as mandatory**: doc 58 §3.3's Idempotency column reads **"Required"**
for this route, and §2 applies the header to all state-changing POSTs.

`ApiErrorCode.DUPLICATE_REFERENCE(409)` and `ConflictException.duplicateReference()` exist with **zero
callers** — but that code belongs to §11's *OTA* row ("Record OTA reservation | `(channel, otaReference)`
| `409` + the existing record"), not to direct requests. No contradiction.

So exactly one thing is open: doc 14 S1's guard **"not a duplicate"** sits *alongside* availability,
occupancy and contact-details checks, which reads as a server-side business guard rather than a
restatement of the header check. Doc 07:303 — "Detected and de-duplicated" — supports that. **Its key
is defined nowhere**, and **no column anywhere can store a client idempotency key** for a reservation
(`email_log.idempotency_key` is the only such column, and it is server-derived).

**Precedent, described but not proposed.** V22's `property_submission_one_open_idx` keys on the
**owning entity id alone**, scoped to the active status by a `WHERE` predicate, letting closed rows
accumulate freely. Note also: a violation of that index currently surfaces as **HTTP 500**, because
`GlobalExceptionHandler` has no unique-violation handler — so any duplicate rule implemented this way
would need that handler too.

### 2.5 OQ-016 is unanimously PROPOSED and decided nowhere

**Eleven references**, all in `docs/kas/*.md`, **zero** in backend, frontend or SQL. The originating
statement, doc 05 §3.2, carries the strongest unresolved label — **NEEDS CONFIRMATION**. Two docs state
the recommendation outright: 57:256 and 68:364 — `**PROPOSED: yes**`. Doc 16 still reads
`Status: OPEN`, and its register summary still counts Booking & sales workflow at 8 open.

**None** of the owner-decision documents — 28, 50, 98, 99 — mentions guest submission at all. The
nearest near-resolution is doc 64 §5.3, which puts "account wall before booking" in a **CONFIRMED**
reject list — but doc 64 is headed *"Draft for approval"* and disclaims changing any frozen decision,
and its Phase 5 sibling 68:364 still lists OQ-016 as open.

Everything downstream already assumes yes: the route sits under the **public** API while `/me` is a
separate authenticated tree; the body carries a full `guest` block; `reservation.customer_id` is
**nullable** (verified live); S1's guard requires "contact details present", not a customer; doc 58 §10
rate-limits request submission **per IP and per email** — an *email*, not an account; and §4 offers
`POST /me/link-request`, "Link a guest-submitted request by verified email", which has no purpose in
an account-required world *(INFERRED)*.

This needs a one-line confirmation, not a design decision.

---

## 3. Open questions landed here

Doc 115 §6 reserved **OQ-160–163** for this report and allocated OQ-164–166 to Step 18A. Those
reservations are now filled, and three new questions are added.

| ID | Question | Status |
|---|---|---|
| **OQ-160** | **Is S1's "not a duplicate" guard anything more than the `Idempotency-Key` check?** The outcome (return the original) and the client mechanism (header, "Required") are frozen. If the guard *is* only the header check, semantics are settled and only storage is missing. If it is an additional business check, its key — guest? property? dates? line set? which statuses count as active? — is defined nowhere | **new** |
| **OQ-161** | **A6's declared type cannot hold A6's definition.** `SettingKey` declares `SALES_FIRST_CONTACT_SLA` a single ISO-8601 `Duration`; doc 51 §2 defines A6 as *"Cutoff hour, weekends, public holidays, escalation threshold"*. Either three components are deferred, or more setting keys are needed — which would require a migration | **new** |
| **OQ-162** | **S1 freezes "acknowledgement email; sales notified" and no notification infrastructure exists.** V18 created `email_log` and friends, but there is no `JavaMailSender`, no mail starter, no notification service. Is Step 16A's scope the persisted request + hold + snapshot only, with delivery explicitly deferred? | **new** |
| **OQ-163** | **Request-submission rate limiting is specified but has no thresholds and no implementation.** Doc 58 §10 names the strategy — "Strict per IP **and** per email" — under a **PROPOSED** heading, with no numbers. `ApiErrorCode.RATE_LIMITED(429)` is declared and unused. This would be the first anonymous, inventory-consuming write endpoint; doc 05 risk B6 names rate limiting a required mitigation | **new** |
| **OQ-167** | **What does one `terms_version` pin, when policies are versioned `int` per `(property_id, policy_type)` across eleven types?** Plus: no rule for a stale `acceptedTermsVersion`, no derivation of the string form, the contracted `GET /public/policies/{type}` unimplemented, and 0 policy rows | **new** |
| **OQ-168** | **Does the V1 price snapshot carry `taxes[]` and `serviceChargeMinor`?** Doc 56 §5.2 includes both, written when A7 was still expected; A7 was retired when tax left V1 scope, and doc 58 §11.2.4 forbids tax and service-charge fields on the quote. `TaxIsOutOfScopeForV1Test` constrains **class names and the availability response only** — it does not constrain the snapshot either way | **new** |
| **OQ-169** | **`hold_unique` can never fire — verified.** Its XOR sibling forces a NULL into every candidate key, and PostgreSQL's `NULLS DISTINCT` makes identical holds coexist. Same defect class as V21. Should the snapshot shape (§5.2) also be frozen as a typed contract while this is being fixed forward? | **new — defect** |
| OQ-016 | Guest (unauthenticated) submission permitted? | **OPEN — NEEDS CONFIRMATION at origin; PROPOSED: yes in 11 documents; approved in none** |
| OQ-018 / B2 · OQ-051 / A6 | hold duration · SLA definition | **OPEN** |

---

## 4. What the owner must supply

Six, in dependency order. The first four block; the last two are narrow rulings.

1. **A6 — `SALES_FIRST_CONTACT_SLA`.** One ISO-8601 duration from `requested_at`, plus a ruling on
   OQ-161's three deferred components. Unlocks the frozen `responsePromise` field and `sla_due_at`.
2. **B2 — `DIRECT_REQUEST_HOLD_DURATION`.** One ISO-8601 duration, and whether the per-property
   override is in V1 scope (`system_setting` already supports `scope = 'PROPERTY'`). Unlocks the
   `REQUEST` hold, whose `expires_at` is `NOT NULL`.
3. **OQ-160 — the duplicate guard.** Is S1's guard the header check, or more?
4. **OQ-016** — one-line confirmation that an unauthenticated visitor may submit.
5. **OQ-167** — what `terms_version` pins.
6. **OQ-162** — whether notification delivery is in Step 16A's scope.

**Migration:** required **only** if OQ-160 resolves toward persisting a client `Idempotency-Key`, for
which no column exists. A separate forward fix for **OQ-169** is warranted on its own merits. Every
other structure Step 16A needs is already in V12/V13/V14/V7/V20. Neither migration's shape is proposed
here.

---

## 5. Files changed

| File | Change |
|---|---|
| `docs/kas/116-…` (this file) | **new** — OQ-160 · 161 · 162 · 163 · 167 · 168 · 169 |
| `docs/kas/00-README.md` | index row + current-phase line |

**Zero source files. Zero migrations. Zero tests. No seed data.**

---

## 6. Recommendation

**STOP.** Step 16A is closer than "blocked" suggests: the contract, the schema, the state machine, the
duplicate *outcome*, and the fail-loud settings mechanism are all frozen. What is missing is business
truth — two durations and four rulings — plus one typed-contract gap (the snapshot shape) and one
verified latent defect (`hold_unique`).

The settings mechanism already does the right thing with the gap: `requireDuration` throws
`MissingConfigurationException` → **422 `CONFIG_MISSING`** naming the key, and V20's header states that
seeding a plausible value *"would silently resolve an open business decision"*. Inventing a
"within the day" promise would be a commitment made to real guests about eight real hotels.
