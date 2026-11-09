-- =============================================================================
-- V6 — Distribution channel
-- Source: 53-phase-4-database-erd.md §3.3, 29-direct-sales-crm-architecture.md §2.1
-- =============================================================================
-- A managed reference TABLE, not an enum, so adding an OTA is a configuration
-- change rather than a migration (doc 29 §2.1).
--
-- This answers ONE of the three separate concepts:
--   DISTRIBUTION CHANNEL — "Where was this reservation sold?"   (this table)
--   LEAD SOURCE          — "How did this DIRECT customer reach KAS?"  (enum)
--   SALES OWNER          — "Which Sales employee owns this DIRECT lead?" (FK)
-- They are NEVER merged into a generic "source" field.
-- =============================================================================

CREATE TABLE distribution_channel (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code              text         NOT NULL,
    display_name      text         NOT NULL,
    channel_type      channel_type NOT NULL,
    is_active         boolean      NOT NULL DEFAULT true,
    sort_order        int          NOT NULL DEFAULT 0,

    -- FUTURE (doc 51 C5). Unused in V1 — commission/net-rate data is not
    -- available (OQ-072) and no value is invented.
    commission_basis  jsonb,

    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT distribution_channel_code_key    UNIQUE (code),
    CONSTRAINT distribution_channel_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT distribution_channel_name_len    CHECK (length(btrim(display_name)) > 0)
);

COMMENT ON TABLE distribution_channel IS
    'Where a reservation was sold. DIRECT or one of the OTA channels. Never exposed publicly (doc 58 denylist).';
COMMENT ON COLUMN distribution_channel.commission_basis IS
    'FUTURE. NULL in V1 — commission data availability is OQ-072.';

CREATE INDEX distribution_channel_type_idx ON distribution_channel (channel_type, is_active);
