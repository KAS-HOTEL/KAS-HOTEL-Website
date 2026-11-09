-- V51 — One KAS payment account for every hotel.
--
-- Guests pay KAS, not the individual hotel: the owner chose to collect every booking's
-- transfer into one account (2026-11-05). The QR, instructions and bank details move
-- from each property (V40, V50) to this single row, managed by SUPER_ADMIN — the role
-- that confirms payments. The payment email of every hotel reads it.
--
-- The per-property columns are kept (not dropped) and are no longer read or written.
-- Checked before writing: no property in kas_web_dev has a payment QR or bank details,
-- so there is nothing to carry over.

CREATE TABLE payment_account (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton      boolean     NOT NULL DEFAULT true UNIQUE CHECK (singleton),
    qr_url         text        CHECK (qr_url IS NULL OR char_length(qr_url) <= 2048),
    instructions   text        CHECK (instructions IS NULL OR char_length(instructions) <= 2000),
    bank_name      text        CHECK (bank_name IS NULL OR char_length(bank_name) BETWEEN 1 AND 120),
    account_holder text        CHECK (account_holder IS NULL OR char_length(account_holder) BETWEEN 1 AND 120),
    account_number text        CHECK (account_number IS NULL OR account_number ~ '^[0-9A-Za-z .-]{4,40}$'),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     uuid        REFERENCES app_user (id) ON DELETE SET NULL
);

INSERT INTO payment_account DEFAULT VALUES;

COMMENT ON TABLE payment_account IS
    'The single KAS account every booking is paid into (one row). Read by the payment email.';
COMMENT ON COLUMN property.payment_qr_url IS
    'Unused since V51: payments go to the shared payment_account.';
COMMENT ON COLUMN property.payment_bank_name IS
    'Unused since V51: payments go to the shared payment_account.';
