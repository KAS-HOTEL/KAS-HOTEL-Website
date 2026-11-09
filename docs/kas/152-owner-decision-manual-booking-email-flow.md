# Owner decision — manual hotel review and email booking flow

**Status:** Approved by the product owner in the KAS project conversation, 20 October 2026.

This decision governs the guest reservation request and the hotel's first response. It supersedes any earlier flow that treats a website request, inventory hold, payment submission, or opening an email link as a confirmed reservation.

1. A guest submits a booking request. The system records it as a request and emails the guest an acknowledgement. This acknowledgement is explicitly not a room confirmation.
2. The hotel checks real room availability manually. The guest request does not reserve inventory.
3. If rooms are available, the hotel uses its expiring email action to approve availability. The system sends the guest the hotel's own QR image and payment instructions from that hotel's profile. Payment is outside KAS; the guest reports the transfer, and the hotel checks its bank account.
4. Only after the hotel explicitly confirms receipt of the money does KAS record a verified payment and confirm the stay. Reporting a transfer is not payment verification.
5. If the requested rooms are unavailable, the hotel may propose another published hotel/room, dates, room quantity, total price, and a message. The guest accepts or rejects by an explicit action. Acceptance creates a **new request** for the proposed hotel, which that hotel must check manually; it does not carry over availability or confirm a stay.
6. Email link GET requests are read-only. A visible page requires an explicit POST action; links are short-lived, single-use bearer tokens.
7. Each hotel configures its own QR URL and payment instructions under that property's payment profile. The current profile accepts a public HTTPS image URL; it does not upload an image file or integrate a payment gateway.

**Implementation note:** backend migration V40 introduces the payment-pending state, email action tokens, hotel payment profile fields, and alternative offer details. Partner profile UI lets a hotel manage its QR URL and instructions. V40 is applied by Flyway at backend startup; no production database has been changed by this implementation task.
