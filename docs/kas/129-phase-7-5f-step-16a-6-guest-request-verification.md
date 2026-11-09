# PHASE 7.5F — STEP 16A.6 — GUEST REQUEST FORM — VERIFICATION

**Date:** 2026-08-27
**Status:** ✅ **ALREADY COMPLETE.** The objective of this step was delivered by Step 16A
([127](127-phase-7-5f-step-16a-guest-request-form.md)). This document records the verification and the
one genuine gap it found and closed.

**No feature was rebuilt.** Re-implementing a working, tested flow would have churned code without
improving it.

---

## 1. What already exists

The brief's intended flow is live, end to end:

```
/[locale]/hotels/[slug]  →  StaySearchForm  →  AvailabilityResults  →  QuoteSelector
                                                                            ↓
                                                          ReservationRequestForm
                                                                            ↓
                                        POST /api/v1/public/reservations/requests
                                                                            ↓
                                                    RequestConfirmation (the 201)
```

| Brief's requirement | Where it lives |
|---|---|
| Real API wrapper, no parallel HTTP layer | `lib/api/endpoints/reservations.ts`, through the single `lib/api/client.ts` |
| One key per logical submission; the **same** key on retry | `ReservationRequestForm.keyFor()`, keyed by a canonical body signature |
| Submission state machine | `SubmissionState` — `IDLE · VALIDATING · SUBMITTING · SUCCESS · VALIDATION_ERROR · SERVER_ERROR · NETWORK_ERROR` |
| 400 / 404 / 409 / 422 / network handling | `ReservationRequestForm.failed()` |
| **No alternatives on 422** | Asserted by test; doc 120 §2 |
| Success renders only the six public keys | `RequestConfirmation` |
| No PII in logs, URLs or storage | Asserted by test |
| EN/VI parity on the guest surface | `features/hotel/requestMessages.ts`, with a key-by-key drift test |

**Route count is unchanged at 22.** The form lives on the hotel page, where the dates and rooms already
are — doc 127 §1 records why a separate route would have re-derived the selection from a URL.

---

## 2. Test coverage against the brief's twenty-two

Twenty of the twenty-two were already covered. **The remaining two are covered upstream**, in the
components that actually own those controls — the request form has no date or occupancy input, because
both are established before it appears and refused by the backend at the quote step:

| # | Requirement | Covered by |
|---|---|---|
| 5 | invalid dates | `hotel.test.tsx:125-133` — `stayProblem` refuses a past date, a zero-night stay, a reversed range and a malformed date |
| 6 | invalid occupancy | `hotel.test.tsx:532-535` — `quoteProblem` refuses no rooms and zero adults |

---

## 3. The one real gap, now closed

**Nothing pinned the frontend's request body against the frozen DTO.**

The backend runs `fail-on-unknown-properties: true`, so a key the frontend invented is a **400 for the
whole request**, and a key it stopped sending is a silent loss. Neither shows up in a mocked frontend
test, and neither shows up in a backend test that writes its own JSON. The two sides could drift apart
with every suite still green.

Added: **`sends only keys the frozen DTO declares, at every level`** — transcribes
`ReservationRequestBody` and its two nested records, asserts every key `buildRequest` emits is in that
list at body, guest and line level, and asserts every `@NotBlank`/`@NotNull` field is actually present.

Frontend **466 → 467**.

---

## 4. Two premises in the brief that do not match this repository

Recorded because acting on either would have made things worse, not better.

**"ARB / generated-localization workflow."** There is none. This is a Next.js/TypeScript project;
`.arb` is Flutter tooling. `features/auth/messages.ts` states the actual position: *"a real i18n layer
arrives with the customer experience, and this module is the seam it will replace."* Step 16A widened
that seam into a locale-keyed module for the new surface, with a parity test. Installing an i18n
framework here would rewrite guest pages this step has no mandate to touch.

**"Ocean Glass design system."** The string appears nowhere in the repository. The design system is
`ui/primitives` (`Input`, `Select`, `Textarea`, `FormControl`, `Button`, `Card`, `Badge`,
`EmptyState`, `ErrorState`) over `ui/tokens.css`, and the form already uses it.

---

## 5. Verification

| | |
|---|---|
| Backend | **155 unit + 369 integration = 524**, `BUILD SUCCESS` — unchanged |
| Frontend | **467 tests / 26 files** (+1), typecheck clean, lint clean, build ✓, **22 routes**, **0 vulnerabilities** |
| Migrations | **28**, latest **V26**, none added or edited; no V27 |
| Database | `reservation` · `reservation_line` · `inventory_hold` · idempotency · `customer` · `reservation_change` all **0** |
| `git diff --check` | clean |

**Partner surface untouched.** No Accept, Decline, Win, Cancel, Expire, assignment, notification,
email, payment, voucher or discount was implemented. The queue remains read-only.

**No OQ status changed and no new OQ was raised.** OQ-172 · OQ-162 · OQ-163 · OQ-122 · OQ-158 ·
OQ-066 remain `OPEN`; OQ-161 `DEFERRED`; OQ-171 · OQ-173 · OQ-174 `CLOSED`.

---

## 6. Known limitation, unchanged

**No live browser pass, and no true end-to-end test.** All 8 properties are `DRAFT` with 0 room types,
so no availability can render, and creating that data is out of scope. The backend proves
endpoint → transaction → 201 (`ReservationRequestIT`, 47 tests); the frontend proves form → API
wrapper → every response class (`reservationRequest.test.tsx`, 29). **The join between them is now
pinned by the DTO-shape test rather than merely assumed**, but it is a contract pin, not a running
request. No browser E2E framework is installed and this step did not add one.
