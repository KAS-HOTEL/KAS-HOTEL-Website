-- V61 — SePay payment gateway notifications (IPN).
--
-- Every IPN SePay sends is kept, matched or not, so an unmatched payment (wrong amount,
-- booking no longer waiting for payment, unknown invoice) is never lost: SUPER_ADMIN
-- settles those by hand. SePay may repeat a notification; dedupe_key makes the repeat
-- a no-op. Confirming the booking itself still goes through payment (V15/V50), whose
-- unique indexes refuse a second VERIFIED payment or one transaction used twice.

CREATE TABLE sepay_ipn_event (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key           text        NOT NULL UNIQUE,
    notification_type    text        NOT NULL,
    order_invoice_number text,
    order_status         text,
    transaction_id       text,
    transaction_status   text,
    payment_method       text,
    amount_minor         bigint,
    currency             char(3),
    reservation_id       uuid        REFERENCES reservation (id) ON DELETE SET NULL,
    match_status         text        NOT NULL,
    raw                  jsonb       NOT NULL,
    received_at          timestamptz NOT NULL DEFAULT now(),
    processed_at         timestamptz,

    CONSTRAINT sepay_ipn_event_match_status_chk CHECK (match_status IN (
        'RECEIVED', 'CONFIRMED', 'IGNORED', 'NO_BOOKING', 'NOT_PENDING',
        'AMOUNT_MISMATCH', 'ALREADY_PAID'))
);

CREATE INDEX sepay_ipn_event_reservation_idx ON sepay_ipn_event (reservation_id);
CREATE INDEX sepay_ipn_event_unsettled_idx ON sepay_ipn_event (received_at DESC)
    WHERE match_status IN ('NO_BOOKING', 'NOT_PENDING', 'AMOUNT_MISMATCH');

COMMENT ON TABLE sepay_ipn_event IS
    'SePay payment gateway IPN log; unmatched rows need SUPER_ADMIN follow-up.';
