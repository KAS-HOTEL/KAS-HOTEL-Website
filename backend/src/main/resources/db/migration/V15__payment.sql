-- =============================================================================
-- V15 — Payment  (V1 RECORDS payments made elsewhere; no gateway)
-- Source: 53-phase-4-database-erd.md §5.5, 57-phase-4-reservation-sales.md §5
-- =============================================================================
-- *** THIS TABLE HAS NO CARD, CREDENTIAL OR TOKEN COLUMNS. ***
-- V1 has no payment gateway (CONFIRMED). Recording a fact, not processing a
-- payment. Keeps KAS entirely out of PCI-DSS scope, and that must remain true.
--
-- Multiple payments per reservation are permitted (deposits). Whether a deposit
-- is REQUIRED to reach WON is config B12 — outstanding, not invented here.
-- =============================================================================

CREATE TABLE payment (
    id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id     uuid           NOT NULL REFERENCES reservation (id) ON DELETE RESTRICT,

    method             payment_method NOT NULL,
    amount_minor       bigint         NOT NULL,
    currency           char(3)        NOT NULL DEFAULT 'VND',

    -- The bank/wallet reference supplied by the guest or the finance team.
    -- NOT a card number, NOT a token.
    external_reference text,

    received_at        timestamptz,
    recorded_by        uuid           REFERENCES app_user (id) ON DELETE SET NULL,
    evidence_media_id  uuid           REFERENCES media_asset (id) ON DELETE SET NULL,
    status             payment_status NOT NULL DEFAULT 'RECORDED',
    notes              text,

    created_at         timestamptz    NOT NULL DEFAULT now(),
    updated_at         timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT payment_amount_pos   CHECK (amount_minor > 0),
    CONSTRAINT payment_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_verified_has_received CHECK (
        status <> 'VERIFIED' OR received_at IS NOT NULL
    )
);

COMMENT ON TABLE payment IS
    'Records a payment made OUTSIDE the platform. No gateway in V1. No card or credential columns exist.';
COMMENT ON COLUMN payment.evidence_media_id IS
    'Transfer receipt. media_asset.visibility must be INTERNAL for these.';

CREATE INDEX payment_reservation_idx ON payment (reservation_id, received_at DESC);
CREATE INDEX payment_status_idx      ON payment (status);
