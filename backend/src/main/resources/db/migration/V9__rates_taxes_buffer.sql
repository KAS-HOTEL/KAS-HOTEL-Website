-- =============================================================================
-- V9 — Central Rate Management, taxes, and OTA safety buffer configuration
-- Source: 56-phase-4-pricing.md, 53-phase-4-database-erd.md §4.3,
--         85-partner-property-model-amendment.md
-- =============================================================================
-- Central Rate Management is INDEPENDENT of the Direct Sales CRM. Rates are a
-- property-level commercial asset consumed by every channel (doc 56 §1).
-- =============================================================================

CREATE TABLE rate_rule (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    scope              rate_scope  NOT NULL,
    property_id        uuid        REFERENCES property  (id) ON DELETE CASCADE,
    room_type_id       uuid        REFERENCES room_type (id) ON DELETE CASCADE,

    name               text        NOT NULL,
    priority           int         NOT NULL DEFAULT 0,

    date_from          date,
    date_to            date,
    days_of_week       smallint[],

    price_minor        bigint,
    adjustment_percent numeric(6,3),
    currency           char(3)     NOT NULL DEFAULT 'VND',

    min_nights         smallint,
    max_nights         smallint,

    -- ---------------------------------------------------------------------
    -- THE THREE V1-NULL HOOKS (doc 56 §2).
    -- V1 writes NULL to all three. Adding channel-specific pricing, rate plans
    -- or restrictions later is DATA, not a re-architecture of the engine.
    -- No OTA-specific price is invented.
    -- ---------------------------------------------------------------------
    channel_scope      uuid        REFERENCES distribution_channel (id) ON DELETE RESTRICT,
    rate_plan_id       uuid,
    restrictions       jsonb,

    status             rule_status NOT NULL DEFAULT 'DRAFT',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid REFERENCES app_user (id) ON DELETE SET NULL,

    CONSTRAINT rate_rule_scope_target CHECK (
        (scope = 'PROPERTY'  AND property_id  IS NOT NULL AND room_type_id IS NULL)
     OR (scope = 'ROOM_TYPE' AND room_type_id IS NOT NULL)
    ),
    CONSTRAINT rate_rule_price_or_adjustment CHECK (
        (price_minor IS NOT NULL AND adjustment_percent IS NULL)
     OR (price_minor IS NULL     AND adjustment_percent IS NOT NULL)
    ),
    CONSTRAINT rate_rule_price_nonneg  CHECK (price_minor IS NULL OR price_minor >= 0),
    CONSTRAINT rate_rule_dates_ordered CHECK (date_from IS NULL OR date_to IS NULL OR date_to >= date_from),
    CONSTRAINT rate_rule_nights_valid  CHECK (
        (min_nights IS NULL OR min_nights >= 1)
    AND (max_nights IS NULL OR max_nights >= 1)
    AND (min_nights IS NULL OR max_nights IS NULL OR max_nights >= min_nights)
    ),
    -- Array containment, not a subquery: CHECK constraints cannot contain
    -- subqueries in PostgreSQL. 0 = Sunday .. 6 = Saturday.
    CONSTRAINT rate_rule_dow_valid CHECK (
        days_of_week IS NULL OR (
            array_length(days_of_week, 1) BETWEEN 1 AND 7
        AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
        )
    ),
    CONSTRAINT rate_rule_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE rate_rule IS
    'Layer 1 of the pricing model. Actual rates are BLOCKED on config B6/OQ-005 — none is seeded.';
COMMENT ON COLUMN rate_rule.channel_scope IS
    'V1-NULL HOOK. NULL = applies to all channels. Channel-specific pricing is FUTURE and governed by OTA rate-parity contracts (OQ-076).';
COMMENT ON COLUMN rate_rule.rate_plan_id IS
    'V1-NULL HOOK. RatePlan is deliberately NOT an entity in V1 (doc 52 §6). No FK until it exists.';
COMMENT ON COLUMN rate_rule.restrictions IS
    'V1-NULL HOOK. FUTURE: closed-to-arrival, closed-to-departure, stop-sell.';

CREATE INDEX rate_rule_lookup_idx
    ON rate_rule (property_id, room_type_id, date_from, date_to) WHERE status = 'ACTIVE';
CREATE INDEX rate_rule_room_type_idx ON rate_rule (room_type_id) WHERE room_type_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- tax_rule — VAT / service charge. Structure reserved; VALUES are BLOCKED on
-- config A7 (doc 56 §4). No rate is invented; the estimate line renders as
-- "estimated" with no fabricated number until the business supplies it.
-- ---------------------------------------------------------------------------
CREATE TABLE tax_rule (
    id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid            REFERENCES property (id) ON DELETE CASCADE,
    tax_type     tax_type        NOT NULL,
    calculation  tax_calculation NOT NULL,
    value        numeric(10,4)   NOT NULL,
    applies_to   tax_applies_to  NOT NULL DEFAULT 'ROOM_SUBTOTAL',
    is_inclusive boolean         NOT NULL DEFAULT false,
    sort_order   int             NOT NULL DEFAULT 0,
    date_from    date,
    date_to      date,
    status       rule_status     NOT NULL DEFAULT 'DRAFT',
    created_at   timestamptz     NOT NULL DEFAULT now(),
    updated_at   timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT tax_rule_value_nonneg  CHECK (value >= 0),
    CONSTRAINT tax_rule_dates_ordered CHECK (date_from IS NULL OR date_to IS NULL OR date_to >= date_from)
);

COMMENT ON TABLE tax_rule IS
    'property_id NULL = global. VAT rate and service charge are BLOCKED on config A7 — no value is seeded.';
COMMENT ON COLUMN tax_rule.applies_to IS
    'Ordering matters: service charge is commonly applied before VAT. Made explicit rather than assumed.';

-- ---------------------------------------------------------------------------
-- ota_safety_buffer_rule — configurable by PROPERTY + ROOM TYPE + DATE RANGE
-- (doc 85 / config B3 / OQ-074).
--
-- NO universal percentage or room count is hard-coded. NO default rule ships.
-- With no rule configured, buffer_target = 0 (doc 55 §6.1).
-- Buffer VALUES are a business configuration required before production launch.
-- ---------------------------------------------------------------------------
CREATE TABLE ota_safety_buffer_rule (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id             uuid        NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    room_type_id            uuid        REFERENCES room_type (id) ON DELETE CASCADE,
    distribution_channel_id uuid        REFERENCES distribution_channel (id) ON DELETE RESTRICT,
    date_from               date,
    date_to                 date,
    days_of_week            smallint[],
    buffer_type             buffer_type NOT NULL,
    buffer_value            numeric(10,3) NOT NULL,
    priority                int         NOT NULL DEFAULT 0,
    reason                  text,
    status                  rule_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT ota_buffer_value_nonneg  CHECK (buffer_value >= 0),
    CONSTRAINT ota_buffer_pct_range     CHECK (buffer_type <> 'PERCENTAGE' OR buffer_value <= 100),
    CONSTRAINT ota_buffer_dates_ordered CHECK (date_from IS NULL OR date_to IS NULL OR date_to >= date_from),
    CONSTRAINT ota_buffer_dow_valid CHECK (
        days_of_week IS NULL OR (
            array_length(days_of_week, 1) BETWEEN 1 AND 7
        AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
        )
    )
);

COMMENT ON TABLE ota_safety_buffer_rule IS
    'TRANSITIONAL — not permanent architecture. Retires as OTA recording reliability is demonstrated, and reaches zero when a channel manager arrives. Values BLOCKED on config B3/OQ-074.';

CREATE INDEX ota_buffer_lookup_idx
    ON ota_safety_buffer_rule (property_id, room_type_id, date_from, date_to) WHERE status = 'ACTIVE';
