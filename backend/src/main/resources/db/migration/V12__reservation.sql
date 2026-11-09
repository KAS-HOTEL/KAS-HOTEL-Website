-- =============================================================================
-- V12 — RESERVATION  ***ONE ENTITY, TWO LIFECYCLES***
-- Source: 53-phase-4-database-erd.md §5.2-5.3, 54-phase-4-state-machines.md,
--         57-phase-4-reservation-sales.md, 85-partner-property-model-amendment.md
-- =============================================================================
-- There is ONE reservation entity. There is NO DirectReservation and NO
-- OTAReservation. There is NO generic `status` column and NO generic `source`
-- column. Direct and OTA differ by distribution_channel, lead_source,
-- sales_owner, the ENTRY POINT, and channel metadata.
--
--   sales_status : DIRECT only, NULL for OTA. Terminal success is WON.
--   stay_status  : ALL channels, NULL until confirmed. CONFIRMED lives here.
--
-- OTA reservations enter at sales_status = NULL, stay_status = CONFIRMED.
--
-- Operational queries use stay_status. Sales analytics use sales_status.
-- The two indexes below mirror that rule, so a query on the wrong field is
-- VISIBLY unindexed (doc 53 §5.2).
-- =============================================================================

CREATE TABLE reservation (
    id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- KAS-YYMMDD-XXXX, non-sequential suffix. An IDENTIFIER, never a
    -- credential — every access checks ownership (doc 22 §7).
    reference               text         NOT NULL,

    property_id             uuid         NOT NULL REFERENCES property (id) ON DELETE RESTRICT,
    customer_id             uuid         REFERENCES customer (id) ON DELETE RESTRICT,

    -- ---------------------------------------------------------------------
    -- THREE SEPARATE CONCEPTS — never one generic "source" field
    -- ---------------------------------------------------------------------
    distribution_channel_id uuid         NOT NULL REFERENCES distribution_channel (id) ON DELETE RESTRICT,
    channel_type            channel_type NOT NULL,   -- denormalised so CHECKs need no join
    lead_source             lead_source,             -- DIRECT only
    lead_source_detail      text,
    sales_owner_id          uuid         REFERENCES app_user (id) ON DELETE SET NULL,  -- DIRECT only

    -- ---------------------------------------------------------------------
    -- TWO INDEPENDENT LIFECYCLES
    -- ---------------------------------------------------------------------
    sales_status            sales_status,   -- DIRECT only; NULL for OTA
    stay_status             stay_status,    -- all channels; NULL until confirmed

    check_in                date         NOT NULL,
    check_out               date         NOT NULL,
    adults                  smallint     NOT NULL,
    children                smallint     NOT NULL DEFAULT 0,
    children_ages           smallint[],

    guest_name              text,
    guest_email             citext,
    guest_phone             text,
    guest_country           char(2),
    preferred_channel       contact_channel,
    arrival_time_est        time,
    special_requests        text,

    -- Self-reported marketing attribution. Stored SEPARATELY from lead_source,
    -- which the server sets and a client can never supply (doc 29 §10).
    discovery_channel       text,

    ota_reference           text,        -- OTA only
    ota_received_at         timestamptz, -- for recording-lag measurement
    inquiry_id              uuid         REFERENCES sales_inquiry (id) ON DELETE SET NULL,

    -- Immutable after WON. Records WHICH RULES applied, not merely the number —
    -- without rule ids a pricing dispute months later is unanswerable
    -- (doc 56 §5.2).
    price_snapshot          jsonb,
    currency                char(3)      NOT NULL DEFAULT 'VND',
    subtotal_minor          bigint,
    tax_minor               bigint,
    service_charge_minor    bigint,
    discount_minor          bigint       NOT NULL DEFAULT 0,
    total_minor             bigint,

    voucher_id              uuid,        -- FK added in V17
    terms_version           text,        -- pins the policy in force at booking

    sla_due_at              timestamptz,
    requested_at            timestamptz,
    won_at                  timestamptz,
    confirmed_at            timestamptz,
    cancelled_at            timestamptz,
    cancellation_reason     text,

    created_by              uuid         REFERENCES app_user (id) ON DELETE SET NULL,
    version                 int          NOT NULL DEFAULT 0,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT reservation_reference_key UNIQUE (reference),

    -- =====================================================================
    -- THE SIX STRUCTURAL CONSTRAINTS (doc 53 §5.2 / doc 85 §3)
    -- =====================================================================

    -- 1. DIRECT requires a lead source; OTA forbids lead source AND sales owner
    CONSTRAINT reservation_channel_invariant CHECK (
        (channel_type = 'DIRECT' AND lead_source IS NOT NULL)
     OR (channel_type = 'OTA'    AND lead_source IS NULL AND sales_owner_id IS NULL)
    ),

    -- 2. OTA never has a sales status — it never entered a sales process
    CONSTRAINT reservation_ota_no_sales_status CHECK (
        channel_type <> 'OTA' OR sales_status IS NULL
    ),

    -- 3. OTA requires its external reference
    CONSTRAINT reservation_ota_has_reference CHECK (
        channel_type <> 'OTA' OR ota_reference IS NOT NULL
    ),

    -- 4. DIRECT must never carry an OTA reference
    CONSTRAINT reservation_direct_no_ota_ref CHECK (
        channel_type <> 'DIRECT' OR ota_reference IS NULL
    ),

    -- 5. Check-out night is not occupied; the stay must be at least one night
    CONSTRAINT reservation_dates_ordered CHECK (check_out > check_in),

    -- 6. At least one adult
    CONSTRAINT reservation_adults_pos CHECK (adults >= 1),

    CONSTRAINT reservation_children_nonneg CHECK (children >= 0),
    CONSTRAINT reservation_children_ages_match CHECK (
        children = 0 OR (children_ages IS NOT NULL AND array_length(children_ages, 1) = children)
    ),
    CONSTRAINT reservation_money_nonneg CHECK (
        (subtotal_minor       IS NULL OR subtotal_minor       >= 0)
    AND (tax_minor            IS NULL OR tax_minor            >= 0)
    AND (service_charge_minor IS NULL OR service_charge_minor >= 0)
    AND (total_minor          IS NULL OR total_minor          >= 0)
    AND discount_minor >= 0
    ),
    CONSTRAINT reservation_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT reservation_country_fmt  CHECK (guest_country IS NULL OR guest_country ~ '^[A-Z]{2}$'),
    CONSTRAINT reservation_direct_has_status CHECK (
        channel_type <> 'DIRECT' OR sales_status IS NOT NULL
    )
);

COMMENT ON TABLE reservation IS
    'ONE entity for every channel. No DirectReservation, no OTAReservation, no generic status, no generic source.';
COMMENT ON COLUMN reservation.sales_status IS
    'DIRECT only. NULL for OTA. Terminal success is WON — CONFIRMED belongs to stay_status alone. FROZEN once terminal.';
COMMENT ON COLUMN reservation.stay_status IS
    'ALL channels. THE OPERATIONAL FIELD. Arrivals, occupancy, check-in/out and review eligibility query this, never sales_status.';
COMMENT ON COLUMN reservation.price_snapshot IS
    'Immutable after WON. Records which rate rules applied, so a dispute is reconstructible after rules change.';

-- Operational index — arrivals, departures, occupancy
CREATE INDEX reservation_stay_idx          ON reservation (stay_status, check_in);
CREATE INDEX reservation_property_stay_idx ON reservation (property_id, stay_status, check_in);

-- Direct sales queue — partial index, DIRECT only
CREATE INDEX reservation_sales_queue_idx
    ON reservation (sales_status, requested_at) WHERE channel_type = 'DIRECT';

CREATE INDEX reservation_customer_idx    ON reservation (customer_id, created_at DESC);
CREATE INDEX reservation_sales_owner_idx ON reservation (sales_owner_id, sales_status)
    WHERE sales_owner_id IS NOT NULL;

-- OTA duplicate detection
CREATE UNIQUE INDEX reservation_ota_ref_idx
    ON reservation (distribution_channel_id, ota_reference) WHERE ota_reference IS NOT NULL;

-- Complete the inquiry -> reservation handoff FK
ALTER TABLE sales_inquiry
    ADD CONSTRAINT inquiry_qualified_reservation_fk
    FOREIGN KEY (qualified_reservation_id) REFERENCES reservation (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- reservation_line — one room type x quantity.
-- Same room type, several rooms = ONE line with quantity N, not N lines.
-- ---------------------------------------------------------------------------
CREATE TABLE reservation_line (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id          uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    room_type_id            uuid        NOT NULL REFERENCES room_type (id) ON DELETE RESTRICT,
    quantity                int         NOT NULL,

    -- Snapshots: a booking made in September must always show the September
    -- name and price, even after a rename or rate change.
    room_type_name_snapshot text        NOT NULL,
    nightly_price_minor     bigint,
    line_total_minor        bigint,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reservation_line_unique   UNIQUE (reservation_id, room_type_id),
    CONSTRAINT reservation_line_qty_pos  CHECK (quantity >= 1),
    CONSTRAINT reservation_line_money_nonneg CHECK (
        (nightly_price_minor IS NULL OR nightly_price_minor >= 0)
    AND (line_total_minor    IS NULL OR line_total_minor    >= 0)
    )
);

CREATE INDEX reservation_line_room_type_idx ON reservation_line (room_type_id);
