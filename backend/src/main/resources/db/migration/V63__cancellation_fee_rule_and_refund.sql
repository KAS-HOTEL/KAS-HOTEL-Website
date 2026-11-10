-- V63 — Cancellation fee configuration and the manual refund workflow (owner request 2026-11-10).
--
-- Free cancellation is unchanged: a KAS member at booking cancels free until 12:00 on the
-- check-in day, any other guest until 24 hours before the hotel's check-in time
-- (CustomerCancellationService). After that window a fee applies:
--   * cancellation_fee_rule: SUPER_ADMIN sets the fee per hotel, or once for every hotel
--     (property_id NULL). A hotel's own rule replaces the all-hotels rule. Nothing is seeded:
--     with no active rule a late request goes to SUPER_ADMIN for manual review and no fee is
--     guessed.
--   * reservation_cancellation_request gains the frozen terms of the request (policy, free-until
--     instant, fee rule and calculation, amount paid, refund due), the guest's confirmation,
--     and the manual refund SUPER_ADMIN records. KAS never refunds through SePay.
--
-- Enum values are added here and first used by V64: a value added by ALTER TYPE cannot be
-- used in the same transaction (the V36/V37 pattern).

ALTER TYPE cancellation_request_status ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE cancellation_request_status ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE cancellation_request_status ADD VALUE IF NOT EXISTS 'REFUND_REJECTED';

-- One-time links for a guest who booked without an account: ask to cancel, and confirm a fee.
ALTER TYPE reservation_email_action ADD VALUE IF NOT EXISTS 'GUEST_CANCEL';

CREATE TABLE cancellation_fee_rule (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id   uuid         REFERENCES property (id) ON DELETE CASCADE,
    fee_type      text         NOT NULL CHECK (fee_type IN ('FIXED_AMOUNT', 'PERCENT_OF_TOTAL')),
    amount_minor  bigint       CHECK (amount_minor IS NULL OR amount_minor >= 0),
    percent       numeric(5,2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
    currency      char(3)      NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),
    note          text         CHECK (note IS NULL OR char_length(note) <= 1000),
    status        text         NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version       integer      NOT NULL DEFAULT 0,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    created_by    uuid         REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by    uuid         REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT cancellation_fee_rule_value CHECK (
        (fee_type = 'FIXED_AMOUNT' AND amount_minor IS NOT NULL AND percent IS NULL)
     OR (fee_type = 'PERCENT_OF_TOTAL' AND percent IS NOT NULL AND amount_minor IS NULL))
);

-- At most one active rule for every hotel, and one per hotel.
CREATE UNIQUE INDEX cancellation_fee_rule_one_active_global
    ON cancellation_fee_rule ((true)) WHERE property_id IS NULL AND status = 'ACTIVE';
CREATE UNIQUE INDEX cancellation_fee_rule_one_active_property
    ON cancellation_fee_rule (property_id) WHERE property_id IS NOT NULL AND status = 'ACTIVE';

COMMENT ON TABLE cancellation_fee_rule IS
    'Late-cancellation fee set by SUPER_ADMIN. property_id NULL = every hotel; a hotel rule replaces it. No seed.';
COMMENT ON COLUMN cancellation_fee_rule.percent IS
    'PERCENT_OF_TOTAL: percent of the booking total the guest pays (reservation.total_minor, VAT included).';

ALTER TABLE reservation_cancellation_request
    -- A guest who booked without an account has no customer row.
    ALTER COLUMN customer_id DROP NOT NULL,
    ADD COLUMN requested_via          text CHECK (requested_via IS NULL OR requested_via IN ('ACCOUNT', 'EMAIL_LINK')),
    ADD COLUMN free_policy            text CHECK (free_policy IS NULL OR free_policy IN ('MEMBER_NOON_CHECK_IN_DAY', 'GUEST_24H_BEFORE_CHECK_IN')),
    ADD COLUMN free_until             timestamptz,
    ADD COLUMN fee_source             text CHECK (fee_source IS NULL OR fee_source IN ('RULE', 'STAFF', 'FREE_WINDOW')),
    ADD COLUMN fee_rule_id            uuid REFERENCES cancellation_fee_rule (id) ON DELETE SET NULL,
    ADD COLUMN fee_type               text CHECK (fee_type IS NULL OR fee_type IN ('FIXED_AMOUNT', 'PERCENT_OF_TOTAL', 'NONE')),
    ADD COLUMN fee_percent            numeric(5,2),
    ADD COLUMN fee_base_minor         bigint CHECK (fee_base_minor IS NULL OR fee_base_minor >= 0),
    ADD COLUMN paid_amount_minor      bigint CHECK (paid_amount_minor IS NULL OR paid_amount_minor >= 0),
    ADD COLUMN refund_due_minor       bigint CHECK (refund_due_minor IS NULL OR refund_due_minor >= 0),
    ADD COLUMN confirmed_by           uuid REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN confirmed_via          text CHECK (confirmed_via IS NULL OR confirmed_via IN ('ACCOUNT', 'EMAIL_LINK')),
    ADD COLUMN refund_amount_minor    bigint CHECK (refund_amount_minor IS NULL OR refund_amount_minor >= 0),
    ADD COLUMN refund_reference       text CHECK (refund_reference IS NULL OR char_length(refund_reference) <= 200),
    ADD COLUMN refund_note            text CHECK (refund_note IS NULL OR char_length(refund_note) <= 2000),
    ADD COLUMN refunded_at            timestamptz,
    ADD COLUMN refund_decided_by      uuid REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN refund_decided_at      timestamptz;

COMMENT ON COLUMN reservation_cancellation_request.free_until IS
    'End of the free-cancellation window that applied to this booking, frozen when the request was made.';
COMMENT ON COLUMN reservation_cancellation_request.refund_due_minor IS
    'paid_amount_minor − fee, never below 0; what SUPER_ADMIN is asked to refund by hand.';
COMMENT ON COLUMN reservation_cancellation_request.refund_amount_minor IS
    'What SUPER_ADMIN recorded as actually refunded. Recording is the only proof; KAS does not refund.';
