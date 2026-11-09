# PHASE 7.5F — STEP 16A — E4 — RESERVATION REQUEST IMPLEMENTATION

**Date:** 2026-08-27
**Status:** ✅ **COMPLETE.** `POST /api/v1/public/reservations/requests` is implemented behind the
frozen contract of doc [117](117-phase-7-5f-step-16a-contract-amendment.md). **No migration was
added.** E5 and E6 have not started.

**Gates:** backend **491 tests** (155 unit + 336 integration), `BUILD SUCCESS` · frontend **419
tests**, typecheck clean, lint 0 warnings, build ✓ **20 routes**, **0** npm vulnerabilities · Flyway
**28 migrations, latest V26, 0 failed** · `git diff --check` clean · database **unpolluted**.

---

## 1. Discovery carry-forward

Nothing was re-discovered. E1 established the four constraints that shaped this build, and all four
held:

| E1 finding | How it landed |
|---|---|
| `ForbiddenConceptsRule` forbids a `status` field on a type named `*reservation*` | The response DTO is **`RequestReceiptView`**, so the rule stays at full strength and the frozen wire field `status` is unchanged |
| `ModuleStructureTest` asserts the module list exactly | `reservation` added, with the comment recording that it arrived **with behaviour** — the condition the test always attached to it |
| A missing required header would 500 | `MissingRequestHeaderException` now maps to **400 `VALIDATION_FAILED`** naming the header |
| A unique violation surfaces as 500 | Handled where it matters: the idempotency race is resolved by reading the winner's row, not by letting the constraint escape |

---

## 2. Contract implemented

Doc 58 §3.3 and doc 117 §4, §12, §13, §24.1 — unchanged, unextended.

**Request:** the frozen body exactly. No convenience field. `leadSource` is **not** a request field;
the server sets `WEBSITE`. `discoveryChannel` is stored separately, in its own column.

**201:** `reference`, `status: "REQUEST_RECEIVED"`, `responsePromise`, `trackingUrlIssued`,
`estimatedTotal` (a `Money`), `estimateDisclaimer`.

`trackingUrlIssued` is **`false`**. Issuing a tracking link belongs to the acknowledgement, and
delivery is OQ-162 — out of Step 16A by doc 117 §8.1. Reporting `true` would claim something the
system did not do.

---

## 3. Architecture

A new Spring Modulith module, `com.kas.platform.reservation`, declaring:

```java
allowedDependencies = {"shared", "inventory", "pricing", "property", "settings",
                       "identity", "audit", "security", "web"}
```

`MODULES.verify()` passes. `inventory` and `pricing` do not see `reservation`, which keeps doc 55 §1
(inventory is the single availability engine) and doc 56 §1 (rates independent of Direct Sales)
intact.

**One addition to `inventory`:** `PublicAllocationRepository`, the allocation primitive. That
module's own `package-info` anticipated it — *"this module supplies the availability and allocation
primitives they need"* — and doc 55 §1 makes allocation something a caller must not reimplement.

It takes **no `AuthorizationScope`**: every scope requires a non-null `actorId`, a guest has no
actor, and fabricating one to satisfy a signature would invent an identity. It follows
`PublishedAvailabilityRepository`'s established public-path pattern instead — its own SQL carrying
the publication predicate. It deliberately does **not** claim the `PublicReadRepository` marker,
because that marker names a read posture and this class writes.

---

## 4. Endpoint

`PublicReservationRequestController` — one route, `@PublicEndpoint`, `Idempotency-Key` declared
`required = true`. CSRF applies as it does to every mutating method.

---

## 5. Idempotency

Three outcomes, exactly as doc 117 §24.1 froze them:

| Case | Result |
|---|---|
| New key | S1 runs; key, fingerprint and response are persisted |
| Same key, same fingerprint | The **original** result, byte for byte. Never 409 |
| Same key, different fingerprint | **409 `IDEMPOTENCY_KEY_REUSED`**. Nothing created, nothing mutated |

`DUPLICATE_REFERENCE` is never returned here.

### 5.1 The race, and a bug this step found in itself

The idempotency row is claimed **last**, because `reservation_id` and `response_snapshot` are
`NOT NULL` and neither exists until the work is done. The PRIMARY KEY is therefore the serialisation
point — no lock, no sleep, no retry loop.

The first implementation caught only `DuplicateKeyException`, and a concurrency test refuted it. With
one room and two identical same-key requests, the loser never reaches the insert: it blocks on the
row lock, re-checks under it, finds nothing available and returns **422 NO_AVAILABILITY** — for a
request that had just succeeded under its own key.

**Fixed by widening the catch**: if S1 fails for any reason, the key is re-read; when it is now
present *with a matching fingerprint*, the original result is returned. That is not swallowing —
a stored key with a **different** fingerprint still raises 409, and if no key was recorded the
original failure is rethrown untouched.

---

## 6. Fingerprint

SHA-256 over a canonical string, prefixed `sha256:`.

Every field of the frozen body participates, in a **fixed declared order** — not Jackson's field
order — written as `name=<length>:<value>;` with a distinct null sentinel, so no combination of
values can be confused for another. Doc 117 §24.1 forbids a field-specific subset, so
`specialRequests`, `discoveryChannel`, `marketingConsent` and `locale` all count; a test proves a
changed special request is a different request.

**Arrays keep the order the client sent.** The contract does not declare `lines[]` or `childAges[]`
order-insensitive, and sorting them would be a normalisation rule the corpus never states. A genuine
retry resends the same body, so its order is identical by construction.

The value is **server-generated**. No hash is accepted from a client.

---

## 7. Transaction boundaries

One `@Transactional` bean, `S1Transaction`, separate from the service so a failed S1 can roll back
completely and still be followed by a fresh read.

Reservation, lines, holds, the `direct_committed` increments, the history row and the idempotency
record commit **together**. Any refusal rolls back all of it — proven by tests asserting zero
reservations, zero holds, zero idempotency rows and an untouched `direct_committed` after each
refusal.

---

## 8. Concurrency

Real threads on real connections, in `ReservationConcurrencyIT`, which manages its own transactions
and cleans up — the pattern `InventoryConcurrencyIT` established, because threads sharing one
transaction are not competing.

- **Same key, simultaneous:** exactly one reservation, one idempotency record, one hold per night,
  `direct_committed` moved once; **both callers get 201**.
- **Different keys, one room:** exactly one winner. The loser is refused by the under-lock re-check
  or by `inv_no_oversell` — never accommodated.
- **The loser leaves nothing:** one reservation, two holds, one line, no orphans.

---

## 9. Availability

Reused, not reimplemented. `AvailabilityService.priceRequest` performs the same validation and
pricing the quote performs; `quote()` now delegates to it and narrows the result, so there is one
loop, not two. `RateResolver` remains the only rate authority.

Preserved: missing inventory ≠ zero (a night without a row refuses the stay), missing rate ≠ free,
any unpriced night refuses the whole stay, publication enforced in SQL, `OPEN` only.

**Confirmed under lock.** Doc 54 §4's *"availability confirmed … under lock"* is literal: every night
of every line is locked in `(room_type_id, date)` order — the same order `InventoryDayRepository`
uses, so the two paths cannot deadlock — then `available_direct` is re-read under that lock. The
quote above it read without one and may be stale.

---

## 10. Hold

One `REQUEST` hold per room type per night, `expires_at = requested_at + PT24H` from B2.

**The hold moves `direct_committed`.** Doc 53 §4.2 defines that column as the cache of *"direct
reservations and active direct holds"*, so a hold that skipped it would be invisible to
`available_direct` and would not reduce availability at all. `inv_no_oversell` is the final refusal,
and it is never caught and reported as success.

B1 is untouched; no alternative-offer flow exists.

---

## 11. SLA

`sla_due_at = requested_at + PT24H`, from **one** server clock read once. `responsePromise` renders
the same A6 duration for the guest. Neither is computed independently — doc 117 §9.

Deliberately mechanical: doc 51 §2's cutoff hour, weekends, holidays and escalation are deferred
(OQ-161), so the promise states the duration and nothing else. No calendar arithmetic was added and
no additional setting key was created.

**A defect caught before the audit returned.** The first implementation authored both
`responsePromise` and `estimateDisclaimer` as hardcoded **Vietnamese**, returned regardless of the
`locale` parameter the endpoint accepts. Two things make that wrong: the backend has **no i18n
mechanism at all** — no `MessageSource`, no message bundle — and the established precedent is
`QuoteView.estimate`, a **boolean**, with the guest tree rendering the sentence. Both fields are now
English: `estimateDisclaimer` is doc 58 §3.3's own string verbatim, and `responsePromise` renders the
A6 hours in the language the contract writes them in. Authoring Vietnamese copy here would invent
guest-facing wording, which config B27 (**OQ-061**) reserves for native copywriter review.

---

## 12. Price snapshot

Written at S1 into `reservation.price_snapshot`, using **only** the fields doc 117 §14.1 freezes:
`computedAt`, `currency`, `basis`, `lines[]` with `roomTypeId`/`roomTypeName`/`quantity`/
`nights[]`/`lineTotalMinor`, `subtotalMinor`, `discount`, `totalMinor`, `termsVersion`.

Each night carries `date`, `rateMinor`, and `ruleId`/`ruleName` **when a rule applied**. A base-rate
night omits them, because `ResolvedRate.fromBase` leaves them null and a null there is the honest
record that no rule applied.

**Absent, deliberately:**

| Field | Why |
|---|---|
| `version` | OQ-171 — revision counter or schema version is undefined |
| property identity | OQ-171 — absent from doc 56 §5.2 at every level |
| `appliedRuleIds` | OQ-171 — its relationship to `nights[].ruleId` is never stated |
| `reservation_line.nightly_price_minor` | left **NULL** — OQ-171's varying-nightly question; picking lowest, first or average would be the guess it forbids. The authoritative detail is in `nights[]` |
| `taxes`, `serviceChargeMinor` | doc 117 §14.2 — removed from the V1 snapshot; `tax_minor` and `service_charge_minor` stay NULL |

`acceptedTermsVersion` is stored **opaquely** in `terms_version` and never validated — OQ-167, closed
by doc 117 §24.2. A test submits a value no policy catalogue could match and asserts it is stored
verbatim.

---

## 13. Error mapping

| Condition | Response |
|---|---|
| Missing `Idempotency-Key` | **400 `VALIDATION_FAILED`**, `details[0].field = "Idempotency-Key"` |
| Malformed body | **400 `VALIDATION_FAILED`** |
| Same key, different body | **409 `IDEMPOTENCY_KEY_REUSED`** |
| No availability, missing inventory row, unpriced night | **422 `NO_AVAILABILITY`** |
| Children, offer code, over-capacity | **422** per doc 117 §13 |
| A6 or B2 unset | **422 `CONFIG_MISSING`** naming the key |
| Unpublished, unknown or foreign property | **404**, never 403 |

`ApiErrorCode.IDEMPOTENCY_KEY_REUSED(409)` was added, and doc 58 **§11.3** records the amendment to
§2.1's 409 row. `DUPLICATE_REFERENCE` is untouched and stays OTA-only.

---

## 14. Tests

**+39** (452 → **491**).

`ReservationRequestIT` — **24 tests**: the frozen 201 · server-set `leadSource`/`channel_type`/
`sales_status` with `stay_status` and `customer_id` NULL · A6 = PT24H · `responsePromise` from the
same source · B2 = PT24H with one hold per night · `direct_committed` moved and the check-out night
untouched · opaque `terms_version` · the snapshot's contents and its five deliberate absences · rule
provenance · base-rate fallback · missing key → 400 · invalid body → 400 · retry returns the original
and creates nothing · reuse → 409 · every field in the fingerprint · never `DUPLICATE_REFERENCE` ·
no availability, missing inventory, unpriced night, offer code, children, over-capacity · unpublished
and unknown property → 404.

`ReservationConcurrencyIT` — **4 tests**: same-key race, oversell race, loser leaves no partial
state, and a cleanliness assertion.

**No existing test was weakened.** `ModuleStructureTest` gained a module name and a comment;
everything else is additive. The 23 `QuoteIT` tests passed unchanged through the `priceRequest`
refactor, which is what made that refactor safe to do.

---

## 14.1 Self-audit — two more defects, found and fixed

The adversarial audit launched against this step **never ran**: all four agents died on a session
limit — 0 completed, 0 findings. Rather than let that caveat stand, its two highest-risk questions
were worked through by hand, and both found something.

**① The fingerprint had a collision by construction.** Absence was written as the literal `~null~`
with a normal length prefix, so a client sending the *string* `"~null~"` produced a byte-identical
canonical form to sending nothing. Two different requests shared a fingerprint, and a same-key retry
differing only there would have **replayed instead of returning 409** — a direct violation of doc 117
§24.1. Absence is now encoded by its own shape, `name=~;`, which no value can produce because a
present value is always `<digits>:`. `RequestFingerprintTest` (**8 unit tests**) pins it, including
four impostor strings, forged delimiters and line-boundary smuggling.

**② A malformed country was silently discarded.** `normaliseCountry` returned NULL for anything that
was not a two-letter code, quietly throwing away what the guest typed. It is now `@Pattern` on the
DTO — a **400** naming the field — which is the schema's own `reservation_country_fmt` format, not an
invented rule. A valid lower-case code is still upper-cased and stored.

A third check found nothing wrong: all six frozen 201 fields are always present despite
`spring.jackson.default-property-inclusion: non_null`, and a test now asserts the response carries
**exactly six keys**.

---


## 15. Security

| Check | Result |
|---|---|
| Client-supplied price anywhere in the request DTO | **0** |
| `leadSource` accepted from a client | **not a field** |
| Guest tree `localStorage`/`sessionStorage`/`indexedDB` | **0** |
| `Authorization`/`Bearer`/`partnerId`/`storageKey` in the guest tree | **0** |
| Frontend reservation code | **0 files** |
| Mail/SMTP/notification infrastructure | **0** |
| Public response denylist | passes — `PublicResponseDenylistTest` follows `@PublicEndpoint` into any package |
| Endpoint authorisation declared | `UndeclaredEndpointGuardTest` passes |
| Foreign/unpublished property | 404, never 403 |

The fingerprint is server-generated; no client hash is accepted. The idempotency key reaches the
server only through its header and is persisted server-side.

---

## 16. Database and migrations

**No migration was created.** V24, V25 and V26 were sufficient, and none was edited. Flyway remains
**28 migrations, latest V26, 0 failed**.

After the full suite: `reservation`, `reservation_line`, `inventory_hold`,
`reservation_request_idempotency`, `reservation_status_history`, `room_type` and
`room_type_inventory_day` are all **0**; `property` = 8 and `partner` = 1, both pre-existing. The
committing concurrency test cleans up after itself and a test asserts it.

---

## 17. Files changed

**New — `com.kas.platform.reservation`:** `package-info`, `RequestFingerprint`,
`ReservationRepository`, `IdempotencyRepository`, `S1Transaction`, `ReservationRequestService`,
`api/ReservationRequestBody`, `api/RequestReceiptView`, `api/PublicReservationRequestController`.

**New — inventory:** `PublicAllocationRepository`.

**New — tests:** `ReservationRequestIT`, `ReservationConcurrencyIT`.

**Modified:** `ApiErrorCode` (+1 code) · `ConflictException` (+1 factory) · `GlobalExceptionHandler`
(+1 handler) · `AvailabilityService` (`quote` delegates to the new `priceRequest`; `StayPrice` carries
per-night detail) · `ModuleStructureTest` · `SecurityFixtures` (read helpers) ·
`docs/kas/58-…` (§11.3) · `docs/kas/118-…` (this file) · `docs/kas/00-README.md`.

**Untouched:** every migration, the whole frontend.

---

## 18. Deferred OQs

| OQ | Status |
|---|---|
| **OQ-171** snapshot typed shape | **OPEN** — none of the four fields was guessed; §12 lists exactly what was omitted |
| **OQ-172** `expiresAt` cleared at S10 vs `NOT NULL` | **OPEN** — S10 is not in this step |
| **OQ-162** notification delivery | **OPEN** — no infrastructure created; `trackingUrlIssued` is false |
| **OQ-163** rate limiting | **OPEN** — none added |
| OQ-161 A6 calendars | **DEFERRED** |
| OQ-167 · OQ-170 | **CLOSED** in doc 117 §24 and implemented here |

Doc 117 §11 still awaits amendment after V26 scoped hold uniqueness to ACTIVE.

---

## 19. E5 / E6 boundary

Not started. No frontend reservation flow, no guest UI, no confirmation screen, no email, no
notification, no partner reservation surface, no sales workflow beyond S1, no S7 alternative offer,
no S10 WON transition, no payment, no voucher, no tax.

---

## 20. Final verification

Backend **155 + 336 = 491**, `BUILD SUCCESS`. Frontend **419**, typecheck and lint clean, build ✓,
20 routes, 0 vulnerabilities. Flyway 28 / V26 / 0 failed. Database unpolluted. `git diff --check`
clean.
