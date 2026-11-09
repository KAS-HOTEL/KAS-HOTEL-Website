# PHASE 7.5F — STEP 16A — E6 — HARDENING AND CLOSE

**Date:** 2026-08-27
**Status:** 🟢 **COMPLETE.** One real defect found and fixed; the rest of the implementation was
verified rather than rewritten.

**Gates:** backend **506 tests** (155 unit + 351 integration), `BUILD SUCCESS` · frontend **419**,
untouched · Flyway **28, latest V26, 0 failed** · **no migration added** · database unpolluted ·
`git diff --check` clean.

---

## 1. The defect

**A present-but-blank `Idempotency-Key` returned 500.**

`@RequestHeader(required = true)` rejects an **absent** header, but a present-but-empty one binds as
`""` and was never checked. It travelled through the fingerprint, the lookup and the whole S1
transaction, and died at the very end on V24's
`reservation_request_idempotency_key_not_blank` CHECK → `DataAccessException` → **`500
INTERNAL_ERROR`**.

Nothing was ever persisted — the transaction rolled back correctly — but the caller was told the
server had failed, for a mistake that was entirely their own. Doc 58 §2.1 puts every field-level
problem at 400, and the brief is explicit that no reachable request error may surface as a generic
500.

**Fix — the smallest one available.** The controller now refuses a null or blank key before any work
starts, with the same `400 VALIDATION_FAILED` shape and the same `Idempotency-Key` field name the
missing-header handler already produces. This **invents no rule**: blank was already invalid, declared
by V24's own CHECK. The fix moves that constraint to the edge, exactly as the E4 addendum did for
`guest.country`.

Regression: `blankIdempotencyKeyIsRefused` covers `""`, `"   "` and `"\t"`.

---

## 2. What was verified and found correct

Two probes I wrote turned out to be **my** bugs, not the implementation's, and both revealed the
system was stronger than I assumed:

| Probe | What I assumed | What is actually true |
|---|---|---|
| Undocumented body fields (`leadSource`, `totalMinor`, `currency`, `partnerId`) | quietly ignored | **`fail-on-unknown-properties: true`** — the whole request is **refused with 400**. Stronger than inertness, and the body-side of doc 58 §2's *"explicit named parameters only"* |
| Hostile guest text containing `\n` | stored with a literal backslash-n | Jackson decodes the JSON escape to a real newline and it is stored **verbatim and inert** — parameterised statements, no injection, no fingerprint smuggling |

Both are now permanent tests rather than assumptions.

---

## 3. Tests added

**+7** (499 → **506**).

`ReservationRequestIT` **33 → 39**: blank key refused · different keys with an identical body create
independent reservations · guest text is inert against SQL and delimiter injection · an undocumented
field is rejected · the server owns `leadSource`/`channel`/`currency`/total · **a key from a failed
request is free**, with no phantom idempotency row locking a guest out of their own key.

`ReservationConcurrencyIT` **6 → 7**: **reversed line order cannot deadlock**. Two concurrent
requests take the same two room types in opposite order — the classic deadlock shape. S1 sorts lines
by room type id *before* locking, so the client's line order never reaches the lock sequence; both
succeed, and a deadlock would have surfaced as a 500.

---

## 4. Audited and unchanged

**Observability.** Zero log statements in the reservation path — no guest PII, no idempotency key and
no fingerprint is ever logged. Handlers log `code` and `correlationId` only, and every error carries a
correlation id.

**Exception handling.** Four catch blocks, none swallowing: two `JsonProcessingException` and one
`NoSuchAlgorithmException` become `IllegalStateException`; the one broad `catch (RuntimeException)` is
the documented race handler, which rethrows the original failure unless the stored key proves — by
fingerprint — that the identical request already succeeded.

**Schema.** `hold_active_unique_idx` is exactly `UNIQUE … NULLS NOT DISTINCT … WHERE status =
'ACTIVE'`. All four `inventory_hold` CHECKs, five foreign keys and the primary key are present.
`inv_no_oversell` is character-for-character V10's. Every column of
`reservation_request_idempotency` is `NOT NULL`. **No migration was added and none was edited.**

**Architecture.** `ModuleStructureTest`, `ForbiddenConceptsTest`, `LayeringRulesTest`,
`DenyByDefaultTest`, `ScopeEnforcementStructureTest` and `TaxIsOutOfScopeForV1Test` all pass
**unchanged** — no guard was narrowed or weakened in E6.

---

## 5. Open questions — none resolved, none touched

| OQ | Status |
|---|---|
| OQ-167 · OQ-170 · OQ-173 | 🟢 CLOSED (docs 117 §24, 120) |
| **OQ-171** snapshot typed shape | 🔴 **OPEN** — the four fields remain absent and asserted absent |
| **OQ-172** `expiresAt` at S10 | 🔴 **OPEN** — S10 is not in Step 16A and was not touched |
| **OQ-162** notification delivery | 🔴 **OPEN** — still zero mail or notification infrastructure |
| **OQ-163** rate limiting | 🔴 **OPEN** — none added |
| OQ-161 A6 calendars and escalation | 🟡 DEFERRED |

**No new OQ was raised.** The one defect found was a coding defect against an already-frozen
constraint, not a contract ambiguity.

---

## 6. Files changed

**Production (1):** `PublicReservationRequestController` — the blank-key guard.
**Tests (2):** `ReservationRequestIT` (+6), `ReservationConcurrencyIT` (+1).
**Docs:** this file, `docs/kas/00-README.md`.

No migration, no frontend file, no other production class.

---

## 7. Two observations from the final verification

Neither is a defect in Step 16A, and neither was acted on beyond what is stated.

**The OQ-1xx series has no central register.** `16-open-questions.md` calls itself the *"Live register"*
but stops at **OQ-083** and was last touched **2026-08-14**. Every question from OQ-100 to **OQ-173** —
74 of them, including the four still open here — lives only inside the phase document that raised it.
That has been the convention since doc 100, so it is not something E6 introduced, but it does mean the
register cannot answer *"what is open right now?"*. Building that index is real work across 22
documents and would require restating 74 questions I must not paraphrase into something they do not
say, so **E6 did not attempt it**. Flagged for the owner as a candidate task.

**A stale test report was inflating the unit count.** `target/surefire-reports` still held
`TaxCalculationIsBlockedTest` (2 tests) from **2026-08-18** — a class that was renamed to
`TaxIsOutOfScopeForV1Test` and no longer exists in source. Summing the XML files therefore read
**158** unit tests where the run actually executed **155**. The orphaned report is deleted
(`target/` is gitignored build output; the class can never regenerate it). `DevPartnerAccountProvisioning`
also appears with an old timestamp, but its class does exist and is deliberately gated behind
`@EnabledIfEnvironmentVariable("KAS_DEV_PARTNER_PASSWORD")` — correctly not run.

**Counting only reports written by this run: 155 unit + 351 integration = 506, 0 failures, 0 errors,
0 skipped, exit code 0.**
