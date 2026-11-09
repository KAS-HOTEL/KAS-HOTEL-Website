-- =============================================================================
-- V17 — Voucher and redemption
-- Source: 53-phase-4-database-erd.md §3.8, 09-admin-scope.md §3.7
-- =============================================================================
-- In a request model a voucher is applied to the ESTIMATE and re-validated at
-- confirmation. Voucher RULES are outstanding business configuration (OQ-029);
-- the mechanism is built, no voucher is seeded.
-- =============================================================================

CREATE TABLE voucher (
    id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     citext         NOT NULL,
    name                     text           NOT NULL,
    description              text,

    voucher_type             voucher_type   NOT NULL,
    value_percent            numeric(6,3),
    value_minor              bigint,
    value_add_description    text,
    currency                 char(3)        NOT NULL DEFAULT 'VND',

    valid_from               date,
    valid_to                 date,
    stay_from                date,
    stay_to                  date,

    min_nights               smallint,
    min_total_minor          bigint,

    applicable_property_ids  uuid[],
    applicable_room_type_ids uuid[],

    usage_limit_total        int,
    usage_limit_per_customer int,
    used_count               int            NOT NULL DEFAULT 0,
    stackable                boolean        NOT NULL DEFAULT false,

    status                   voucher_status NOT NULL DEFAULT 'DRAFT',
    created_at               timestamptz    NOT NULL DEFAULT now(),
    updated_at               timestamptz    NOT NULL DEFAULT now(),
    created_by               uuid REFERENCES app_user (id) ON DELETE SET NULL,

    CONSTRAINT voucher_code_key UNIQUE (code),
    CONSTRAINT voucher_value_matches_type CHECK (
        (voucher_type = 'PERCENTAGE'   AND value_percent IS NOT NULL AND value_minor IS NULL)
     OR (voucher_type = 'FIXED_AMOUNT' AND value_minor   IS NOT NULL AND value_percent IS NULL)
     OR (voucher_type = 'VALUE_ADD'    AND value_add_description IS NOT NULL)
    ),
    CONSTRAINT voucher_percent_range  CHECK (value_percent IS NULL OR value_percent BETWEEN 0 AND 100),
    CONSTRAINT voucher_amount_nonneg  CHECK (value_minor IS NULL OR value_minor >= 0),
    CONSTRAINT voucher_valid_ordered  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT voucher_stay_ordered   CHECK (stay_from  IS NULL OR stay_to  IS NULL OR stay_to  >= stay_from),
    CONSTRAINT voucher_used_nonneg    CHECK (used_count >= 0),
    CONSTRAINT voucher_limits_pos     CHECK (
        (usage_limit_total        IS NULL OR usage_limit_total        >= 1)
    AND (usage_limit_per_customer IS NULL OR usage_limit_per_customer >= 1)
    )
);

COMMENT ON TABLE voucher IS
    'Mechanism only. Voucher rules are outstanding (OQ-029) and no voucher is seeded.';

CREATE INDEX voucher_active_idx ON voucher (status, valid_from, valid_to) WHERE status = 'ACTIVE';

CREATE TABLE voucher_redemption (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id      uuid        NOT NULL REFERENCES voucher     (id) ON DELETE RESTRICT,
    reservation_id  uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    customer_id     uuid        REFERENCES customer (id) ON DELETE SET NULL,
    discount_minor  bigint      NOT NULL,
    redeemed_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT voucher_redemption_unique UNIQUE (voucher_id, reservation_id),
    CONSTRAINT voucher_redemption_amount_nonneg CHECK (discount_minor >= 0)
);

CREATE INDEX voucher_redemption_customer_idx ON voucher_redemption (customer_id);

-- Complete the reservation -> voucher FK deferred from V12
ALTER TABLE reservation
    ADD CONSTRAINT reservation_voucher_fk
    FOREIGN KEY (voucher_id) REFERENCES voucher (id) ON DELETE SET NULL;
