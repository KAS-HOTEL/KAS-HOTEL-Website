# STEP 16A — DIRECT RESERVATION REQUEST
## CONTRACT AMENDMENT

**Date:** 2026-08-25
**Phase:** 7.5F — Step 16A, Phase D
**Amends:** doc [58](58-phase-4-api-contract.md) §3.3 · §11 · doc [56](56-phase-4-pricing.md) §5 ·
doc [14](14-booking-state-machine.md) §4.1 · doc [54](54-phase-4-state-machines.md) §4 ·
doc [15](15-inventory-rules.md) §6 · doc [57](57-phase-4-reservation-sales.md) §9

---

## 1. Status

🟢 **AMENDED AND FROZEN — implementable, with one named exception.**

Six owner decisions were supplied and are frozen below. This document is the canonical contract for
`POST /api/v1/public/reservations/requests`.

**No source code, migration, seed or test was changed by this amendment.** Phase D is documentation
only.

Of the three questions this amendment originally left undecided, **OQ-170 and OQ-167 were closed by
owner decision on 2026-08-27 — see §24**. **OQ-171** (the snapshot’s typed shape) remains open and
blocks only the four fields §14.3 lists. See §21 as amended by §24.

---

## 2. Owner decisions

| # | Decision | Value | Closes |
|---|---|---|---|
| 1 | **A6** `SALES_FIRST_CONTACT_SLA` | **`PT24H`** from `requested_at` | OQ-051 |
| 2 | **B2** `DIRECT_REQUEST_HOLD_DURATION` | **`PT24H`**, **system-level only** in V1 | OQ-018 |
| 3 | **Duplicate semantics** | `Idempotency-Key` is the **only** duplicate mechanism for direct requests; a retry returns the original result, never 409 | OQ-160 |
| 4 | **Guest identity (OQ-016)** | **Anonymous guest + contact details.** No account, no login, no registration. `customer_id` stays nullable | OQ-016 |
| 5 | **Idempotency persistence** | A migration is **approved** for Phase E. Server-side and durable only | — |
| 6 | **Hold uniqueness (OQ-169)** | The guarantee must be real. A forward-fix migration is **approved** for Phase E | — |

Cutoff hours, weekend and holiday calendars, and escalation thresholds are **deferred** (OQ-161).

---

## 3. Canonical endpoint

```
POST /api/v1/public/reservations/requests
```

Unauthenticated (`@PublicEndpoint`). No alias, no rename, no second endpoint. Doc 58 §3.3 already
freezes the route and marks its Idempotency column **"Required"**.

CSRF applies, as it does to every mutating method in `SecurityConfig` — there is no per-path
exemption, and `POST /public/availability/quote` already proves the pattern.

---

## 4. Request contract

**Unchanged from doc 58 §3.3.** Reproduced for reference; no field is added, removed or renamed:

```jsonc
{
  "propertySlug": "…",
  "checkIn": "2026-09-12", "checkOut": "2026-09-14",
  "adults": 3, "children": 1, "childAges": [6],
  "lines": [ { "roomTypeSlug": "…", "quantity": 2 } ],
  "guest": { "fullName": "…", "email": "…", "phone": "+84…", "country": "VN",
             "preferredChannel": "ZALO", "bestTimeToContact": "EVENING" },
  "specialRequests": "…",
  "discoveryChannel": "TIKTOK",
  "offerCode": null,
  "acceptedTermsVersion": "booking-terms-v3",
  "marketingConsent": false,
  "locale": "en"
}
```

| Field group | Status |
|---|---|
| `propertySlug`, `checkIn`, `checkOut`, `lines[]` | **frozen**, existing |
| `adults`, `children`, `childAges[]` | **frozen**; V1 refusals in §13 apply unchanged |
| `guest.*` | **frozen**; see §6 for which are mandatory |
| `specialRequests`, `discoveryChannel`, `marketingConsent`, `locale` | **frozen**, existing |
| `offerCode` | **frozen** — supplying it is refused (§13) |
| `acceptedTermsVersion` | **frozen as a field**; its *validation* is **OQ-167**, see §15 |

**`leadSource` is not a request field and never will be.** Doc 58:157-159 — *"A client **cannot**
supply `leadSource`"*. The server sets `leadSource = WEBSITE`. `discoveryChannel` is self-reported
marketing attribution and is stored separately, in its own column.

---

## 5. Idempotency contract

### 5.1 Required header

```
Idempotency-Key: <client-supplied opaque key>
```

Mandatory. Doc 58 §2 applies the header to all state-changing POSTs; §3.3 marks it **"Required"** for
this route specifically.

### 5.2 First use of a key

Execute S1 exactly once: create one reservation, its lines, its holds, its snapshot, its history row;
persist the key; return the frozen 201 of §12.

### 5.3 Retry with the same key, same request

**Return the original reservation result** — the same 201 body the first call returned.

Explicitly forbidden: a second reservation, a second hold, a second S1 execution, and **409**.

This is unanimous in the corpus and now frozen: doc 58 §11:406, doc 15:438, doc 26:430,
doc 57:219, doc 68:347.

### 5.4 `DUPLICATE_REFERENCE(409)` stays OTA-only

`ApiErrorCode.DUPLICATE_REFERENCE(409)` exists with zero callers. It belongs to doc 58 §11's *Record
OTA reservation* row, keyed `(channel, otaReference)`. It **must not** be returned by this endpoint.

### 5.5 Same key, materially different body — ✅ **DECIDED, see §24.1**

> **Superseded 2026-08-27.** The owner closed OQ-170: a same-key request whose canonical
> fingerprint differs is rejected with **`409 IDEMPOTENCY_KEY_REUSED`**. The paragraphs below
> record why the question was open and are kept for that reasoning only — **§24.1 governs**.

**The corpus does not specify this anywhere.** Every statement in §5.3's list covers only the
retry-of-the-same-request case. Searched: doc 58 §2/§11, 57 §9, 15, 26, 68, 12, 10, 55, 62.

**No status code, no comparison strategy and no tolerance is chosen here.** Recorded as **OQ-170**,
which blocks *this edge case only* — not the endpoint.

---

## 6. Guest identity contract

**Frozen: anonymous guest with contact details.** OQ-016 is **CLOSED**.

- No authentication, no account creation, no registration, no OAuth, no password flow.
- `reservation.customer_id` remains **nullable** — verified in the live schema.
- The request is identified by the contact details the frozen body already carries.

**Mandatory contact fields** are those doc 26 §8 marks required: **full name, email, phone**. Country,
preferred channel and best-time-to-contact are recommended or optional there and remain so.

**Not frozen here:** exact per-field validation rules (phone format, email deliverability). Doc 26 §8
says *"Vietnamese and international phone formats both accepted"* and doc 16 OQ-025 leaves email
verification not required to submit. Beyond that, no format rule exists in the corpus. Implementation
must use ordinary structural validation and **must not** invent a business rule such as requiring a
Vietnamese number or a verified mailbox.

Note the schema places three of these on `customer`, not `reservation`:
`guest.bestTimeToContact` → `customer.best_time_to_contact`, `locale` → `customer.locale`,
`marketingConsent` → `customer_consent (customer_id, purpose)`. Whether an anonymous request creates a
`customer` row is an implementation decision constrained by doc 05's *"never auto-merge on a weak
signal"*; `customer.email` is UNIQUE.

---

## 7. S1 guard contract

Two frozen documents state the guard. They agree, and **doc 54 is the more specific**:

- doc [14](14-booking-state-machine.md):167 — *"Availability confirmed for all lines on all nights;
  occupancy valid; contact details present; **not a duplicate**"*
- doc [54](54-phase-4-state-machines.md):65 — *"Availability confirmed for all lines on all nights
  **under lock**; occupancy valid; contact present; **idempotency key unused**"*

**Frozen resolution.** Doc 14's *"not a duplicate"* **means** doc 54's *"idempotency key unused"*.
The owner decision and doc 54 say the same thing; doc 14's looser wording is read through doc 54.
There is exactly **one** duplicate mechanism. **OQ-160 CLOSED.**

Doc 54 also adds **"under lock"**, which is binding: availability must be confirmed under row lock,
not read optimistically.

### 7.1 Superseded: doc 57 §9's second duplicate mechanism

Doc [57](57-phase-4-reservation-sales.md):219 carries the row:

> `| Duplicate guest requests | Detected on (email, property, dates); surfaced to sales, not auto-merged |`

**Superseded for V1 as an S1 mechanism.** By owner decision, `(email, property, dates)` detection is
**not** part of the S1 guard, is **not** implemented in Step 16A, and must not refuse a request. Note
the row itself describes a *sales-visibility signal* — "surfaced to sales, **not auto-merged**" — not a
refusal, so the supersession narrows scope rather than contradicting intent. The sales-side signal is
**deferred**, not cancelled.

---

## 8. S1 effects

From doc 54:65, the most specific frozen statement, reconciled with doc 14:167:

| # | Effect | Source |
|---|---|---|
| 1 | Reference issued — `KAS-YYMMDD-XXXX`, non-sequential suffix | 54, V12 |
| 2 | **Price snapshot frozen** | 54, 56 §5.1 |
| 3 | **`REQUEST` holds created**, `expiresAt = now + DIRECT_REQUEST_HOLD_DURATION` | 54 |
| 4 | **SLA timer started** — `sla_due_at` set | 54 |
| 5 | Guest acknowledgement + in-app; sales queue notified | 54 |
| 6 | Status history written | 14, V14 |
| 7 | Audit event `reservation.requested` | 54 |
| 8 | `salesStatus = REQUESTED`, `stayStatus = NULL` | 54, V12 CHECK |
| 9 | `leadSource = WEBSITE`, server-set | 58:157 |

### 8.1 Business effect vs infrastructure delivery — frozen distinction

Effect 5 is a **business effect**. There is no mail sender, no notification service and no queue
consumer in the repository; V18 created `email_log` and friends and nothing writes to them.

**Frozen:** Step 16A owes the *business effect* — the reservation reaching a state in which the
acknowledgement and the sales-queue entry are due, and the durable record that makes them derivable.
It does **not** owe delivery. **No email provider, SMS gateway, Zalo integration or notification
infrastructure may be created in Phase E.** Delivery remains **OQ-162**.

A request that cannot send an email must still succeed. Delivery failure must never roll back S1.

---

## 9. SLA contract

**`SALES_FIRST_CONTACT_SLA = PT24H`.**

```
reservation.sla_due_at = requested_at + PT24H
```

**One source of truth.** `responsePromise` in the 201 and `reservation.sla_due_at` **MUST NOT be
calculated using different logic.** Both derive from the single A6 value and from nothing else — the
rule doc 26 §10 already states: *"Drawn from the single settings value, so on-screen text, email, and
the queue timer can never disagree."*

**Representation.** They are two renderings of one deadline, not two values:

- `sla_due_at` — the machine deadline, `timestamptz`.
- `responsePromise` — the **guest-facing wording**, as doc 58 §3.3 froze it (a string) and doc 27:54
  words it. It is derived from A6; it is never independently authored. If A6 ever changes, the wording
  changes with it.

`requested_at` is set from **one authoritative server-side clock**. A client-supplied time is never
trusted.

**Deferred (OQ-161):** cutoff hour, weekend calendar, public-holiday calendar, escalation threshold.
V1 computes a plain 24-hour offset. **No additional SLA setting key may be created.**

**Unset A6** → `MissingConfigurationException` → **422 `CONFIG_MISSING`** naming the key. That path
already exists in `SystemSettingService.requireDuration` and must not be bypassed.

---

## 10. Hold contract

**`DIRECT_REQUEST_HOLD_DURATION = PT24H`, system-level only.**

```
inventory_hold.expires_at = requested_at + PT24H
hold_type = 'REQUEST'
one row per room type per night          -- V13: "date date NOT NULL, -- one row per night"
```

### 10.1 B2 is not B1

| Setting | Governs | Transition |
|---|---|---|
| **`DIRECT_REQUEST_HOLD_DURATION`** (B2) | the **request** hold | **S1** |
| `DIRECT_ALTERNATIVE_HOLD_DURATION` (B1) | the **alternative-offer** hold | S7 |

Both are `DURATION`, both are currently NULL, and they are **different concepts**. B1 is untouched by
this amendment and remains unset.

### 10.2 No per-property override in V1

`system_setting` supports `scope = 'PROPERTY'`, and doc 15 §6 and doc 51 §3 both describe B2 as
"configurable per property". **Superseded for V1**: B2 is read at global scope only. No property
override API, no property-scoped row, no admin surface for it in this step.

### 10.3 Superseded: doc 15 §6

Doc 15 §6 is labelled **PROPOSED, pending OQ-018**, and states *"Duration: 24h default, configurable
per property"*. The owner decision supplies the same duration and **removes** the per-property clause
for V1. **OQ-018 CLOSED.** The rest of §6 — expiry sweep, release triggers, admin visibility, never
exposed to guests — is unaffected and remains binding.

### 10.4 Holds must reach availability

Doc [53](53-phase-4-database-erd.md):155 freezes `direct_committed` as a
*"Materialised cache — direct reservations **and active direct holds**"*, and doc 55:190 shows
`direct_committed -= quantity` on release.

**Frozen:** creating a `REQUEST` hold must increment `room_type_inventory_day.direct_committed` for
every night held, inside the same transaction. Otherwise the hold is invisible to
`available_direct()` and the request would not reduce availability at all.

`inv_no_oversell` is the final word:

```sql
CHECK (total - maintenance - other_blocks - direct_committed - ota_committed
             - GREATEST(buffer_target - ota_committed, 0) >= 0)
```

A concurrent request that would oversell **fails this CHECK and rolls the whole transaction back**.
This is the real oversell guard. It must not be caught and reported as success.

### 10.5 Unset B2

→ **422 `CONFIG_MISSING`** naming the key. V13's own header freezes this: *"With no duration
configured, placing a hold FAILS with a config error rather than inventing a value."*

---

## 11. Hold uniqueness semantics

**Business requirement, frozen:** for one logical S1 request hold, **the same logical hold cannot
exist twice.**

Conceptual identity of a `REQUEST` hold:

> the **owning reservation**, the **room type**, and the **night**

`hold_type` distinguishes it from an `ALTERNATIVE_OFFER` hold, whose owner may instead be an inquiry
(V13's XOR: exactly one of `reservation_id` / `inquiry_id`). **These are different ownership shapes and
must not be collapsed into one universal uniqueness rule.**

### 11.1 The current constraint cannot enforce this

```sql
CONSTRAINT hold_exactly_one_owner CHECK ((reservation_id IS NOT NULL) <> (inquiry_id IS NOT NULL)),
CONSTRAINT hold_unique UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
```

The XOR forces a NULL into every candidate key, and PostgreSQL's default `NULLS DISTINCT` means the
constraint never matches. **Verified empirically** — two byte-identical rows coexisted in a rolled-back
transaction. Same defect class V21 already fixed for `property_policy`.

**Database enforcement will be corrected in the implementation migration.** No SQL, index definition
or migration is written here — the exact shape is Phase E's, under the approval in §2 row 6.

---

## 12. 201 response contract

**Unchanged from doc 58 §3.3:**

```jsonc
{
  "reference": "KAS-260912-4F7A",
  "status": "REQUEST_RECEIVED",
  "responsePromise": "…",
  "trackingUrlIssued": true,
  "estimatedTotal": { "amountMinor": 12450000, "currency": "VND", "exponent": 0 },
  "estimateDisclaimer": "…"
}
```

| Field | Frozen semantics |
|---|---|
| `reference` | `reservation.reference`, UNIQUE |
| `status` | **guest vocabulary** — the literal `REQUEST_RECEIVED`, **never** `salesStatus` |
| `responsePromise` | derived from A6 alone (§9) |
| `trackingUrlIssued` | whether a tracking link was issued for `/public/track/{signedToken}` |
| `estimatedTotal` | from the frozen snapshot, `Money` shape |
| `estimateDisclaimer` | doc 58 §11.2.4 — a quote precedes the snapshot |

**Denylist compliance is structural, not incidental.** `PublicResponseDenylist` forbids `salesStatus`,
`slaDueAt`, `holdId`, `expiresAt`, `holdType`, `partnerId`, `leadSource`, `inquiryId` and `total`
unless typed `Money`. This response uses `status` (not `salesStatus`) and `estimatedTotal` (not
`total`) precisely because of that. `PublicResponseDenylistTest` follows `@PublicEndpoint` into any
package, so the new DTO is covered automatically.

---

## 13. 422 refusal contract

Unchanged. Doc 58 §2.1's codes, and §11.2.3's **CONFIRMED owner decision** on V1 refusals:

| Condition | Code | Source |
|---|---|---|
| No availability for a line/night | **422 `NO_AVAILABILITY`** + `details[]` + `alternatives` | 58 §3.3 |
| `children > 0` | **422** refused | 58 §11.2.3 (B10/OQ-007 open) |
| `childAges[]` non-empty | **422** refused | 58 §11.2.3 |
| Party exceeds capacity | **422 `OCCUPANCY_EXCEEDED`** | 58 §11.2.3 (B11/OQ-008 open) |
| `offerCode` supplied | **422** refused | 58 §11.2.3 (B23/OQ-029 open) |
| Dates beyond horizon | **422 `HORIZON_EXCEEDED`** | 58 §2.1 |
| A6 or B2 unset | **422 `CONFIG_MISSING`** naming the key | 51 §6, V13, V20 |
| Field-level invalid | **400 `VALIDATION_FAILED`** with `details[]` | 58 §2.1 |
| Unpublished / foreign property | **404**, never 403 | 85 §6.3 |

`children = 0` with `childAges: []` is the fully supported V1 path.

**Capacity** is `Σ (maxOccupancy × quantity)` over requested lines, compared against
`adults + children` — aggregate, not per room (58 §11.2.3, OQ-154).

No SQL text, class name, host, port or configuration value may reach the response.

---

## 14. Price snapshot contract

Doc 56 §5.2 is an **illustrative `jsonc` example with elided values**, not a typed contract — no key is
marked required or optional, no type is declared, and no JSON Schema, CHECK, Java record or TypeScript
type exists anywhere. **This amendment does not pretend otherwise.**

### 14.1 Frozen and implementable now

| Item | Source |
|---|---|
| Written at S1 (`salesStatus = REQUESTED`) | 56 §5.1, 14:167, 54:65 |
| **Sealed at `WON`**, not at S1; re-versionable in between via the modification flow | 56 §5.1 |
| Unaffected by any later rate-rule edit | 56 §5.1 |
| Room-type identity **and** name snapshot (survives renames) | 56 §5.2, `reservation_line.room_type_name_snapshot` |
| Per-night `date`, `rateMinor`, `ruleId`, `ruleName` | 56 §5.2, argued in §5.3 |
| Rules archived not deleted, so `ruleId` always resolves | 56 §5.3.3, `rule_status` includes `ARCHIVED` |
| `currency`; **USD may never appear in the snapshot** | 56 §5.2, §6 |
| Reservation totals | `subtotal_minor`, `total_minor` columns |
| `discount` = `{ voucherId: null, amountMinor: 0 }` | consequence of §13's `offerCode` refusal; `discount_minor NOT NULL DEFAULT 0` |

### 14.2 Tax — removed from the V1 snapshot

**Frozen: the V1 price snapshot carries neither `taxes[]` nor `serviceChargeMinor`.**

§5.2 showed `"taxes": [ /* per tax_rule; empty until config A7 */ ]` and `"serviceChargeMinor"`. **A7
was retired rather than supplied** when tax left V1 scope (doc 99 §12), so that condition can never be
met. Doc 58 §11.2.4 is CONFIRMED: *"There is no tax field, no service-charge field and no zero-tax
line."* This amendment extends the same rule to the persisted snapshot, on the owner's instruction that
V1 must not pretend taxes exist.

`reservation.tax_minor` and `service_charge_minor` columns remain in the schema, **unwritten and
NULL**. No migration drops them. **OQ-168 CLOSED.**

### 14.3 Still ambiguous — ⛔ **OQ-171**, not resolved here

| Item | Why it cannot be frozen |
|---|---|
| **`version`** | §5.1/§5.3.1 use "re-versioned" (a revision counter); §5.3.4 speaks of "the snapshot JSON schema evolv[ing]". No field distinguishes them. `reservation.version` is the optimistic-locking column, not this |
| **"prior version retained"** | §5.1 requires it; `price_snapshot` is a single scalar `jsonb` and **no history table exists** among the 53 tables |
| **Property identity** | Absent from §5.2 at every nesting level; exists only as `reservation.property_id` |
| **`appliedRuleIds` ↔ `nights[].ruleId`** | Relationship never stated — union? distinct? ordered? |
| **Varying-nightly fallback** | §5.3.4 relies on `reservation_line.nightly_price_minor`, one `bigint` per line, while §5.2's `nights[]` models a rate that varies per night — which doc 58 §11.2.1 confirms is real. The fallback is **lossy exactly when it matters** |

**No value is invented for any of these.** Phase E may write the snapshot using only §14.1's frozen
fields; it must not silently choose a `version` semantic, add a property key, or define the
`appliedRuleIds` relationship.

---

## 15. Terms / policy snapshot semantics

**`terms_version` is a pointer, never a snapshot.** There is no policy snapshot anywhere and none is
required: durability comes from never deleting the policy row (docs 23 §7, 96, 106; `PolicyStatus`).

**Frozen:** V1 stores no policy text on the reservation.

**✅ Decided 2026-08-27 — see §24.2.** V1 stores the client string opaquely in
`reservation.terms_version` and does **not** validate it. The list below records why validation is
impossible today and is kept for that reasoning only:

- the frozen body sends `"acceptedTermsVersion": "booking-terms-v3"` — a **string**;
- the only version that exists is `property_policy.version`, an **`int`**, unique per
  `(property_id, policy_type, version)`, plus V21's partial unique index for globals;
- a property carries **eleven** independently versioned policy types, and one `text` column cannot pin
  eleven integers;
- doc 58 §3.1's `GET /public/policies/{type}` — named as the source of the value — **is not
  implemented**; the implemented route is property-scoped and plural (itself OQ-111);
- **there is no rule anywhere for what the server does when the submitted version is not current**;
- there are **0 policy rows** in the database.

**No datatype, derivation or validation rule is invented here.** Phase E must not guess one. This
blocks *validation of that one field*, not the endpoint — see §21 for the two admissible outcomes,
both of which are the owner's to choose.

---

## 16. Tax — V1 exclusion

Out of scope by owner decision (doc 99 §12). V1 pricing is **room rate → voucher → customer payable**.

`TaxIsOutOfScopeForV1Test` forbids classes named `TaxResolver`, `TaxCalculator`, `TaxService`,
`TaxEngine`, `TaxComputation`, and pins the availability response's six fields. It **must not be
weakened, bypassed or narrowed**. Per §14.2 the snapshot now carries no tax fields either.

---

## 17. Database persistence requirements

Phase D changes no schema. Phase E must satisfy:

| # | Requirement | Existing support |
|---|---|---|
| 1 | Reservation row | ✅ V12 — `reservation` |
| 2 | One line per room type, quantity N | ✅ V12 — `reservation_line`, UNIQUE `(reservation_id, room_type_id)` |
| 3 | Holds, one per room type per night | ✅ V13 — `inventory_hold` |
| 4 | `direct_committed` incremented per night | ✅ V10 — with `inv_no_oversell` |
| 5 | Status history | ✅ V14 — `actor_type` includes `CUSTOMER` |
| 6 | Snapshot | ✅ V12 — `price_snapshot jsonb` |
| 7 | SLA deadline | ✅ V12 — `sla_due_at` |
| 8 | Settings read | ✅ V20 + `SystemSettingService` |
| 9 | **Durable idempotency-key persistence** | ❌ **none** — migration approved (§2 row 5) |
| 10 | **Real hold uniqueness** | ❌ **defective** — migration approved (§2 row 6) |

Rows 9 and 10 are the **only** schema gaps. Forbidden storage for the key: `localStorage`,
`sessionStorage`, cookies, `email_log.idempotency_key`, process memory, any in-memory cache, any
frontend-generated workaround.

---

## 18. Explicitly deferred

| Item | Deferred to |
|---|---|
| SLA cutoff hour, weekends, holidays, escalation (OQ-161) | post-V1 |
| Per-property B2 override | post-V1 |
| `(email, property, dates)` sales-side duplicate signal (doc 57 §9) | post-V1 |
| Notification **delivery** infrastructure (OQ-162) | a later step |
| Rate limiting (OQ-163) — doc 58 §10 names "per IP and per email", PROPOSED, no thresholds | a later step |
| B1 `DIRECT_ALTERNATIVE_HOLD_DURATION` and the S7 alternative-offer flow | a later step |
| Payment, vouchers, discounts, fees, tax | out of V1 |

---

## 19. The no-invention table

Future implementation agents must not infer anything in the middle column.

| Topic | Frozen | Deferred / Open | Why |
|---|---|---|---|
| **SLA** | `PT24H` from `requested_at`; one source for `responsePromise` and `sla_due_at` | calendars, escalation (OQ-161) | owner supplied the value only |
| **Hold duration** | `PT24H`, global scope | per-property override | owner scoped V1 to system level |
| **Guest identity** | anonymous + contact details; `customer_id` nullable | per-field format rules; customer-row creation/matching | OQ-016 closed; formats never specified |
| **Idempotency** | header mandatory; retry returns the original, never 409; **same key + different canonical fingerprint → 409 `IDEMPOTENCY_KEY_REUSED`** (§24.1) | — | OQ-170 closed 2026-08-27 |
| **Duplicate detection** | idempotency key is the **only** mechanism | `(email, property, dates)` sales signal | owner decision; doc 54 corroborates |
| **Snapshot** | timing, sealing, room-type identity, per-night rate + rule, currency, totals, discount=0 | `version`, property identity, `appliedRuleIds`, varying-nightly fallback (**OQ-171**) | §5.2 is illustrative, not typed |
| **Tax** | **absent** from V1 snapshot and responses | — | A7 retired; 58 §11.2.4 CONFIRMED |
| **Terms** | pointer only; no policy text stored; **stored opaquely and not validated in V1** (§24.2) | future validation, by separate amendment | OQ-167 closed 2026-08-27 |
| **Notifications** | the **business effect** is owed | **delivery** (OQ-162) | no infrastructure exists; none may be built |
| **Property override** | none in V1 | post-V1 | owner scoped it out |
| **Hold uniqueness** | the business guarantee | the SQL shape | migration approved, Phase E authors it |

---

## 20. OQ closures

| OQ | Was | Now | Basis |
|---|---|---|---|
| **OQ-016** guest submission | OPEN | 🟢 **CLOSED** | owner decision 4 |
| **OQ-018 / B2** hold duration | OPEN | 🟢 **CLOSED** | owner decision 2 |
| **OQ-051 / A6** SLA definition | OPEN (BLOCKING) | 🟢 **CLOSED** | owner decision 1 |
| **OQ-160** duplicate guard scope | new | 🟢 **CLOSED** | owner decision 3, corroborated by doc 54:65 |
| **OQ-161** A6 composite type | new | 🟡 **DEFERRED** | owner deferred three components |
| **OQ-168** tax in the snapshot | new | 🟢 **CLOSED** | §14.2 |
| **OQ-169** `hold_unique` defect | new | 🔵 **APPROVED FOR FORWARD FIX** | owner decision 6; migration in Phase E |
| **OQ-167** `termsVersion` | OPEN | 🟢 **CLOSED** | **§24.2** — stored opaquely, unvalidated in V1 |
| **OQ-162** notification delivery | new | 🔴 **OPEN** | §8.1 — effect frozen, delivery deferred |
| **OQ-163** rate limiting | new | 🔴 **OPEN** | §18 |
| **OQ-170** same key, different body | OPEN | 🟢 **CLOSED** | **§24.1** — 409 IDEMPOTENCY_KEY_REUSED |
| **OQ-171** snapshot typed shape | — | 🔴 **NEW, OPEN** | §14.3 |

Nothing technically ambiguous is marked closed.

---

## 21. Remaining open questions

*Two of these were answered on 2026-08-27 and are marked below; **OQ-171**, **OQ-162** and
**OQ-163** remain genuinely open.*

**OQ-170 — ✅ ANSWERED 2026-08-27, see §24.1.** Detection is the **whole canonical request body**,
fingerprinted server-side; the response to a mismatch is **`409 IDEMPOTENCY_KEY_REUSED`**. The
question asked the owner for both the detection strategy and the response, and both halves are now
answered.

**OQ-171 — the price snapshot needs a typed contract.** Four parts, all in §14.3. Phase E can write a
correct snapshot from §14.1's frozen fields; it cannot resolve these four.

**OQ-167 — ✅ ANSWERED 2026-08-27, see §24.2.** The owner chose option (a): store the client string
opaquely in `reservation.terms_version`, with **no validation in V1**, accepting that the pin is not
yet verifiable. Option (b) — deriving and validating against the policy catalogue — may be
introduced only by a separate owner-approved amendment.

**OQ-162 · OQ-163** — notification delivery and rate limiting, deferred per §18.

---

## 22. Implementation boundary — Phase E / F / G

**Phase E (backend)** may create: the controller, request/response DTOs, a reservation service and
repositories, the S1 transaction, and **two migrations only** — durable idempotency-key persistence,
and the `hold_unique` forward fix. It may not create: notification infrastructure, payment, vouchers,
tax, a property-override API, a second endpoint, or any additional setting key.

**Phase F (frontend)** may add the minimum UI to submit the frozen request and render the frozen 201.
It may not: redesign the guest tree, compute price, fabricate availability, use web storage, send
`partnerId`, construct `Authorization`, or fetch outside `lib/api`.

**Phase G** measures the real rendered application at 375×812 coarse, 768×1024, 1024×800, 1440×900.
No hand-written harness.

**A6 and B2 are applied by `UPDATE … WHERE value IS NULL`**, following the precedent doc 99 §6 set for
the first two settings — deliberately **not** a migration, because a migration would push one owner's
business decision into every environment. `DatabaseConnectivityIT.noConfigurationValueWasInvented` is
parameterised on `OWNER_ANSWERED_KEYS`; those two keys join that list. That **narrows** the guard, as
doc 99 already did once, and does not weaken it.

---

## 23. Acceptance criteria

### API
- Route exactly `POST /api/v1/public/reservations/requests`; `@PublicEndpoint`; no alias.
- `Idempotency-Key` required; absent → rejected.
- Request body exactly doc 58 §3.3; no field added or renamed.
- 201 exactly §12; `status` is the literal `REQUEST_RECEIVED`; `estimatedTotal`, never `total`.
- 422 `NO_AVAILABILITY` carries `details[]` and `alternatives`.
- **No 409 from this endpoint.**
- `PublicResponseDenylistTest` and `UndeclaredEndpointGuardTest` pass unchanged.

### Idempotency
- First request creates exactly one reservation, one set of lines, one set of holds, one snapshot, one history row.
- Retry with the same key returns the original 201 body.
- No second S1 execution, no second hold, no second reservation.
- The key is persisted **server-side and durably**.

### SLA
- `sla_due_at = requested_at + PT24H`, from one server clock.
- `responsePromise` and `sla_due_at` derive from A6 and from nothing else.
- A6 unset → 422 `CONFIG_MISSING` naming the key.

### Hold
- `hold_type = 'REQUEST'`, one row per room type per night.
- `expires_at = requested_at + PT24H`.
- `direct_committed` incremented per night in the same transaction.
- The uniqueness guarantee is **actually enforced** by the database.
- B2 unset → 422 `CONFIG_MISSING` naming the key.

### Guest
- Anonymous; no account, login or registration.
- Full name, email, phone required; no invented format rule.
- `customer_id` may be NULL.

### Pricing
- Snapshot written at S1 from the server's own resolution — **never** from a client-supplied price and
  never by trusting a quote response as the source of truth.
- Missing rate ≠ free; any unpriced night refuses the whole stay.
- Missing inventory ≠ zero; availability confirmed for every line on every night, **under lock**.
- No tax, no service charge, no fee, no voucher, no discount other than a structural zero.
- An old reservation is displayed from its snapshot, never re-priced from current rules.

### Atomicity
- One transaction. No partial reservation, no partial holds.
- A concurrency failure (`inv_no_oversell`, unique violation) rolls back and surfaces honestly — never
  caught and reported as success.
- Notification delivery failure never rolls back S1.

### Security
- No `localStorage` / `sessionStorage` / `indexedDB` in the guest tree.
- No `Authorization` / `Bearer` constructed by the frontend; no `partnerId` sent.
- No client-side secret; API access through `lib/api` only.
- Foreign or unpublished property → **404**, never 403.
- No SQL text, class name, host or configuration value in any response.

---

## 24. Amendment — OQ-170 and OQ-167 closed (2026-08-27)

**CONFIRMED — owner decision.** This section **supersedes** §5.5, §15's unresolved paragraph, §19's
Idempotency and Terms rows, and §20's and §21's entries for these two questions. Those sections are
left as written, so the reasoning that produced the questions stays readable; wherever they say
"open" or "not chosen", this section governs.

### 24.1 OQ-170 — reuse of an `Idempotency-Key` with a different body

**The idempotency identity is the whole canonical request body.**

| Case | Behaviour |
|---|---|
| **New key** | Compute the server-side canonical fingerprint of the request body, persist key + fingerprint, process the request normally |
| **Same key, same fingerprint** | **Return the original reservation result.** No second reservation. **Never 409** |
| **Same key, different fingerprint** | **Reject: `409 IDEMPOTENCY_KEY_REUSED`.** No reservation created, none mutated |

**The fingerprint is server-generated.** A client neither supplies nor influences it.

Canonicalisation must be **deterministic** and must cover the **complete** frozen request body of
§4. Explicitly forbidden: a field-specific comparison subset, ignoring any body difference, or
treating a different body as a retry of the original.

**This does not weaken the duplicate rule.** §5.3 stands unchanged and unqualified for its own case
— *same key, same request returns the original, never 409*. OQ-170 was always the **other** case: a
misuse conflict, not a retry.

**Relationship to `DUPLICATE_REFERENCE`.** Unrelated, and the two must not be conflated.
`DUPLICATE_REFERENCE(409)` belongs to doc 58 §11's *Record OTA reservation* row, keyed
`(channel, otaReference)`. §5.4 stands: this endpoint never returns it.

**⚠ This amends the frozen error contract.** Doc [58](58-phase-4-api-contract.md) §2.1 freezes the
409 row as exactly `VERSION_CONFLICT · DUPLICATE_REFERENCE · ILLEGAL_TRANSITION`.
`IDEMPOTENCY_KEY_REUSED` is a **fourth** 409 code and does **not** exist in `ApiErrorCode` today.
Adding the enum constant and extending doc 58 §2.1's row are **E4 tasks**; neither was done here.

**Persistence implication — already satisfied.** V24 shipped `reservation_request_idempotency` with
`idempotency_key` as PRIMARY KEY and `request_fingerprint text NOT NULL`. That is exactly the shape
this decision needs, so **no further migration is required for OQ-170**.

Two comments written while the question was open are now stale and, because V24 is an applied
migration, are **not** edited: its header and its `COMMENT ON COLUMN … request_fingerprint` both say
the response policy is unchosen. A later migration may refresh the database comment; the file itself
never changes — migration README rule 1.

### 24.2 OQ-167 — `acceptedTermsVersion`

**V1 stores the client-supplied string opaquely in `reservation.terms_version`, and does not
validate it.**

- No policy lookup. No policy row required. **No new policy endpoint.**
- No derivation from `property_policy.version`, and no decision about which of the eleven policy
  types the value pins.

**Rationale, as the owner recorded it:** the policy model carries multiple versioned types;
`property_policy.version` is an `integer` while the reservation contract carries a string; no frozen
route or lookup semantics exist; the database holds zero policy rows; and nothing in the corpus says
which policy type the value is meant to pin. V1 must not invent validation or derivation on top of
that.

§15 stands in every other respect: `terms_version` remains a **pointer, never a snapshot**, and V1
stores no policy text on the reservation.

**Future validation may be introduced only by a separate owner-approved amendment.**

### 24.3 Consistency check

| Against | Result |
|---|---|
| §5.3 duplicate rule | intact — same key + same body still returns the original, never 409 |
| §6 anonymous guest identity | unaffected; neither decision touches identity or authentication |
| V24 persistence (E2) | already sufficient; **no migration needed** |
| V25 / V26 hold uniqueness (E2) | untouched |
| E3 configuration — A6, B2 = `PT24H` | untouched |
| Doc 58 §2.1 error contract | **amended** — a fourth 409 code, to be added in E4 |
| `TaxIsOutOfScopeForV1Test`, §13 refusals, §14 snapshot | untouched |
