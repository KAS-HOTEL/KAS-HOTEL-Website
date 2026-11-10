-- V66 — Payment deadline, SePay checkout sessions, unmatched-payment follow-up (owner 2026-11-10).
--
-- Layer 1. A booking waiting for payment now has a deadline: 24 hours after the hotel approves,
--          2 hours when the stay starts that day, and never later than the hotel's check-in time.
--          Past it the booking expires (unless the guest already reported a transfer, which the
--          hotel must check first), its voucher use and KAS points are given back, and the
--          payment link stops offering SePay.
-- Layer 2. Every SePay checkout KAS starts is recorded, so the ones still open when a booking
--          ends can be cancelled at SePay (bank-transfer orders only, SePay's own limit).
-- Layer 3. Money SePay reports for a booking that cannot take it (expired, cancelled, wrong
--          amount, already paid, unknown) is alerted and listed for SUPER_ADMIN to settle.
--
-- Holds (voucher_hold, cashback_hold) now live with the booking instead of ending at 12:00 on
-- the check-in day: they are released when the booking ends; 12:00 on the check-out day is only
-- the backstop for a booking nobody closed.

ALTER TABLE reservation ADD COLUMN payment_due_at timestamptz;

COMMENT ON COLUMN reservation.payment_due_at IS
    'Payment deadline set when the hotel approves (V66). NULL for bookings approved before V66: they never auto-expire.';

CREATE INDEX reservation_payment_due_idx ON reservation (payment_due_at)
    WHERE sales_status = 'PAYMENT_PENDING' AND payment_due_at IS NOT NULL;

-- Layer 2 ---------------------------------------------------------------------------------

CREATE TABLE sepay_checkout (
    invoice_number  text        PRIMARY KEY,
    reservation_id  uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    amount_minor    bigint      NOT NULL CHECK (amount_minor > 0),
    status          text        NOT NULL DEFAULT 'OPEN'
                                CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'CANCEL_FAILED')),
    cancel_attempts int         NOT NULL DEFAULT 0,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,
    CONSTRAINT sepay_checkout_closed CHECK ((status = 'OPEN') = (closed_at IS NULL))
);

CREATE INDEX sepay_checkout_open_idx ON sepay_checkout (reservation_id) WHERE status = 'OPEN';

COMMENT ON TABLE sepay_checkout IS
    'A SePay checkout KAS started for a booking (V66); OPEN ones are cancelled at SePay once the booking ends.';

-- Layer 3 ---------------------------------------------------------------------------------

ALTER TABLE sepay_ipn_event
    ADD COLUMN alert_sent_at   timestamptz,
    ADD COLUMN resolved_at     timestamptz,
    ADD COLUMN resolved_by     uuid REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN resolution      text CHECK (resolution IN ('REFUNDED', 'HANDLED')),
    ADD COLUMN resolution_note text,
    ADD CONSTRAINT sepay_ipn_event_resolved CHECK ((resolved_at IS NULL) = (resolution IS NULL));

-- ALREADY_PAID is a second, different transaction for a paid booking (a repeat of the same
-- transaction is deduplicated before matching), so it is money to give back too.
DROP INDEX sepay_ipn_event_unsettled_idx;
CREATE INDEX sepay_ipn_event_unsettled_idx ON sepay_ipn_event (received_at DESC)
    WHERE match_status IN ('NO_BOOKING', 'NOT_PENDING', 'AMOUNT_MISMATCH', 'ALREADY_PAID')
      AND resolved_at IS NULL;

-- Holds live with the booking --------------------------------------------------------------

UPDATE voucher_hold h
   SET expires_at = (r.check_out + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  FROM reservation r
 WHERE r.id = h.reservation_id AND h.status = 'ACTIVE';

UPDATE cashback_hold h
   SET expires_at = (r.check_out + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', updated_at = now()
  FROM reservation r
 WHERE r.id = h.reservation_id AND h.status = 'ACTIVE';
