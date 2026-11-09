# Product decision — authenticated customer reservations

**Date:** 2026-10-19  
**Status:** Approved by product owner; backend implementation in progress.

## Decision

- Anonymous booking remains available.
- When a user with the `CUSTOMER` role submits a reservation while signed in, link it to that account using `customer.user_id`.
- Never link a booking by matching an unverified guest email.
- Capture the customer's active membership state on the reservation at submission time. Future membership changes must not alter that reservation's cancellation eligibility.
- Customer stay history may return only reservations linked to the authenticated customer account.
- Cancellation within the applicable free-cancellation window is immediate and has no fee.
- After the free window, create a cancellation request, let hotel operations quote the fee, and cancel only after the customer accepts that quote.
- Fee quotation stays with `SUPER_ADMIN`; `ADMIN` receives no reservation-operations permission.

This supersedes the earlier implementation constraint in OQ-016 for authenticated submissions. The anonymous booking path remains unchanged.

## Current backend work

- S1 sets `reservation.customer_id` from the authenticated customer's account.
- S1 records booking-time membership in `reservation_loyalty_snapshot`.
- `GET /api/v1/me/stays` returns owner-scoped stay history.
- Customer cancellation, hotel fee quotation, and customer acceptance endpoints are implemented in this work. Apply V35 and verify the workflow before release.
