# Booking responses and cancellation fees — 2026-10-25

Implemented in the existing request-detail and cancellation queue screens; no additional URL screen or diagram page.

- Request response labels distinguish manually available rooms (send hotel QR) from unavailable rooms (offer a replacement). Replacement offers now have an explicit summary confirmation. Payment verification remains separate.
- Cancellation fee supports fixed amount or 0–100% of stored reservation total, with up to two percentage decimal places. Preview uses integer arithmetic; server uses BigDecimal HALF_UP rounding under the existing scope and transaction locks.
- Fixed amounts are entered in normal currency units in the UI and converted to minor units. Server rejects fractional minor units, negative values, overflow, missing or ambiguous quote inputs.
- Quote audit includes fee mode, percentage and base total when relevant. The stored/customer-facing final fee remains in minor units. No schema migration required; legacy feeMinor requests remain accepted.
- No reservation cancellation occurs at quote time; customer acceptance remains required.

Validation:
- Frontend: 79 test files, 1,437 tests passed (booking-frontend-all.log).
- TypeScript: passed (booking-typecheck.log).
- Scoped ESLint: passed (booking-lint.log).
- Production build: passed (booking-build.log).
- Backend: AdminOperationsIT, 14 passed, zero failures/errors/skips (booking-backend.log), dedicated kas_web_test with transaction rollback.
- Email delivery to real inboxes and authenticated browser acceptance were not exercised. Existing mail configuration is required.
