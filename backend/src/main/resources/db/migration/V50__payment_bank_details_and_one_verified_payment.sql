-- V50 — Hotel bank details for the payment email; one verified payment per booking.
--
-- 1. The payment email (BOOKING_AVAILABILITY_PAYMENT) has bank name / account holder /
--    account number fields, but the hotel payment profile only held a QR image and free
--    instructions, so the email printed "see the QR" in all three (KAS-014). Each hotel
--    now states them; all optional, the QR stays the required part.
-- 2. Confirming payment was protected only by row locks (KAS-022). The database now
--    refuses a second VERIFIED payment for one reservation, and one bank transaction
--    reference (payment.external_reference, filled when staff type it) confirming two
--    reservations — the guard a bank-feed integration (SePay) will rely on.
--
-- Checked before writing: kas_web_test, kas_web_dev and webdemo hold no payment rows,
-- so neither index can fail on existing data.

ALTER TABLE property
    ADD COLUMN payment_bank_name      text,
    ADD COLUMN payment_account_holder text,
    ADD COLUMN payment_account_number text;

ALTER TABLE property
    ADD CONSTRAINT property_payment_bank_name_len
        CHECK (payment_bank_name IS NULL OR char_length(payment_bank_name) BETWEEN 1 AND 120),
    ADD CONSTRAINT property_payment_account_holder_len
        CHECK (payment_account_holder IS NULL OR char_length(payment_account_holder) BETWEEN 1 AND 120),
    ADD CONSTRAINT property_payment_account_number_fmt
        CHECK (payment_account_number IS NULL OR payment_account_number ~ '^[0-9A-Za-z .-]{4,40}$');

CREATE UNIQUE INDEX payment_one_verified_per_reservation
    ON payment (reservation_id)
    WHERE status = 'VERIFIED';

CREATE UNIQUE INDEX payment_verified_external_reference_uniq
    ON payment (external_reference)
    WHERE status = 'VERIFIED' AND external_reference IS NOT NULL;
