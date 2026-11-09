-- Direct booking requests wait for a manual hotel decision. No room is held
-- until the hotel checks availability; a booking is confirmed only after
-- payment is recorded by hotel staff.
ALTER TYPE sales_status ADD VALUE 'PAYMENT_PENDING';

ALTER TYPE reservation_email_action ADD VALUE 'HOTEL_APPROVE_AND_SEND_QR';
ALTER TYPE reservation_email_action ADD VALUE 'HOTEL_PROPOSE_ALTERNATIVE';
ALTER TYPE reservation_email_action ADD VALUE 'GUEST_ACCEPT_ALTERNATIVE';
ALTER TYPE reservation_email_action ADD VALUE 'GUEST_REJECT_ALTERNATIVE';
ALTER TYPE reservation_email_action ADD VALUE 'GUEST_MARK_PAID';
ALTER TYPE reservation_email_action ADD VALUE 'HOTEL_CONFIRM_PAYMENT';

ALTER TABLE property
    ADD COLUMN payment_qr_url text,
    ADD COLUMN payment_instructions text;

ALTER TABLE reservation
    ADD COLUMN payment_qr_url_snapshot text,
    ADD COLUMN payment_instructions_snapshot text,
    ADD COLUMN payment_requested_at timestamptz,
    ADD COLUMN payment_verified_at timestamptz;

ALTER TABLE reservation_alternative_offer
    ADD COLUMN property_id uuid REFERENCES property (id) ON DELETE RESTRICT,
    ADD COLUMN check_in date,
    ADD COLUMN check_out date,
    ADD COLUMN hotel_message text,
    ADD CONSTRAINT alternative_offer_dates_ordered CHECK (
        (check_in IS NULL AND check_out IS NULL) OR
        (check_in IS NOT NULL AND check_out > check_in)
    ),
    ADD CONSTRAINT alternative_offer_message_length CHECK (
        hotel_message IS NULL OR length(hotel_message) <= 2000
    );

ALTER TABLE property
    ADD CONSTRAINT property_payment_qr_url_length CHECK (
        payment_qr_url IS NULL OR length(payment_qr_url) <= 2048
    ),
    ADD CONSTRAINT property_payment_instructions_length CHECK (
        payment_instructions IS NULL OR length(payment_instructions) <= 2000
    );

COMMENT ON COLUMN property.payment_qr_url IS
    'Hotel-managed public URL for its payment QR image. No payment gateway is used.';
COMMENT ON COLUMN reservation.payment_qr_url_snapshot IS
    'QR URL copied from the hotel profile when it sends payment instructions.';
COMMENT ON COLUMN reservation.payment_verified_at IS
    'Hotel staff confirmed payment receipt; only then may the stay be confirmed.';
