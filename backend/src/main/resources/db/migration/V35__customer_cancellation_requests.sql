-- Cancellation requests that need a hotel-provided fee quote.
-- On-time requests cancel immediately without a fee; late requests remain active
-- until the customer accepts the quoted fee.

ALTER TABLE reservation_loyalty_snapshot
    ADD COLUMN member_eligible_at_booking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reservation_loyalty_snapshot.member_eligible_at_booking IS
    'Immutable booking-time membership eligibility for cancellation cutoffs; independent of later membership status or deletion.';

CREATE TYPE cancellation_request_status AS ENUM (
    'PENDING_HOTEL_FEE', 'QUOTED', 'COMPLETED', 'DECLINED'
);

CREATE TABLE reservation_cancellation_request (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id        uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT,
    customer_id           uuid NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
    status                cancellation_request_status NOT NULL DEFAULT 'PENDING_HOTEL_FEE',
    fee_amount_minor      bigint,
    fee_currency          char(3),
    fee_note              text,
    quoted_by             uuid REFERENCES app_user(id) ON DELETE SET NULL,
    quoted_at             timestamptz,
    customer_decided_at   timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cancellation_request_fee_nonneg
        CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
    CONSTRAINT cancellation_request_quote_complete
        CHECK ((fee_amount_minor IS NULL AND fee_currency IS NULL AND quoted_at IS NULL)
            OR (fee_amount_minor IS NOT NULL AND fee_currency IS NOT NULL AND quoted_at IS NOT NULL)),
    CONSTRAINT cancellation_request_currency_fmt
        CHECK (fee_currency IS NULL OR fee_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX cancellation_request_one_open_per_reservation_idx
    ON reservation_cancellation_request(reservation_id)
    WHERE status IN ('PENDING_HOTEL_FEE', 'QUOTED');

CREATE INDEX cancellation_request_customer_idx
    ON reservation_cancellation_request(customer_id, created_at DESC);

CREATE INDEX cancellation_request_status_idx
    ON reservation_cancellation_request(status, created_at)
    WHERE status = 'PENDING_HOTEL_FEE';
