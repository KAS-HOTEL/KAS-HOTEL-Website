-- Vouchers for chosen customers, and real start / end times (owner 2026-11-14).
--
-- Audience: ALL (anyone, as before), TIERS (members whose current tier is one of
-- audience_tier_ids) or CUSTOMERS (the accounts listed in voucher_customer). A guest who is
-- not signed in can only use an ALL voucher; a targeted voucher is not even listed for others.
--
-- Times: a voucher created from now on starts the moment it is created (valid_from_at = now())
-- and ends at the chosen date and time (valid_to_at). valid_from / valid_to keep the hotel-date
-- of those instants, so every older check on the date columns still holds; the time columns are
-- checked on top. Older vouchers have no times and keep their date-only rules.
ALTER TABLE voucher
    ADD COLUMN valid_from_at timestamptz,
    ADD COLUMN valid_to_at timestamptz,
    ADD COLUMN audience text NOT NULL DEFAULT 'ALL',
    ADD COLUMN audience_tier_ids uuid[],
    ADD CONSTRAINT voucher_audience_chk CHECK (audience IN ('ALL', 'TIERS', 'CUSTOMERS')),
    ADD CONSTRAINT voucher_audience_tiers_chk
        CHECK (audience <> 'TIERS' OR coalesce(cardinality(audience_tier_ids), 0) > 0),
    ADD CONSTRAINT voucher_valid_times_chk
        CHECK (valid_from_at IS NULL OR valid_to_at IS NULL OR valid_to_at > valid_from_at);

CREATE TABLE voucher_customer (
    voucher_id  uuid        NOT NULL REFERENCES voucher (id) ON DELETE CASCADE,
    customer_id uuid        NOT NULL REFERENCES customer (id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (voucher_id, customer_id)
);
CREATE INDEX voucher_customer_customer_idx ON voucher_customer (customer_id);

COMMENT ON COLUMN voucher.audience IS 'ALL, TIERS (audience_tier_ids) or CUSTOMERS (voucher_customer).';
COMMENT ON COLUMN voucher.valid_from_at IS 'When the voucher starts: the moment it was created (2026-11-14 on). NULL for older vouchers (date rule only).';
COMMENT ON COLUMN voucher.valid_to_at IS 'When the voucher ends (date and time chosen by staff). NULL for older vouchers (date rule only).';
COMMENT ON TABLE voucher_customer IS 'The customers a CUSTOMERS-audience voucher is for.';
