-- =============================================================================
-- V5 — Room type: the customer-facing room PRODUCT
-- Source: 53-phase-4-database-erd.md §3.2, 04-room-architecture.md §3
-- =============================================================================
-- A room type is NOT a physical room and NOT a rate.
--
-- CRITICAL: this table has NO column capable of holding a room number, floor,
-- or unit identifier. The customer/internal boundary is enforced by the ABSENCE
-- of the field, not by filtering (doc 04 §2.1). PhysicalRoom is deliberately
-- excluded from V1 (doc 52 §6) — room numbers cannot leak if they do not exist.
-- =============================================================================

CREATE TABLE room_type (
    id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id       uuid             NOT NULL REFERENCES property (id) ON DELETE RESTRICT,
    slug              text             NOT NULL,
    status            room_type_status NOT NULL DEFAULT 'DRAFT',

    area_sqm          numeric(6,2),
    max_adults        smallint         NOT NULL,
    max_children      smallint         NOT NULL DEFAULT 0,
    max_occupancy     smallint         NOT NULL,
    view_type         view_type,
    smoking           boolean          NOT NULL DEFAULT false,

    -- Layer 0 of the pricing model (doc 56 §3). The AUTHORITATIVE price for a
    -- stay is computed by the pricing module and FROZEN into the reservation
    -- price snapshot. Actual rates are BLOCKED on config B6 — none is seeded.
    base_price_minor  bigint,
    currency          char(3)          NOT NULL DEFAULT 'VND',

    sort_order        int              NOT NULL DEFAULT 0,
    version           int              NOT NULL DEFAULT 0,
    archived_at       timestamptz,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    updated_at        timestamptz      NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by        uuid REFERENCES app_user (id) ON DELETE SET NULL,

    -- Slug unique WITHIN a property: "Deluxe Room" at Milestone and at Sonata
    -- are different products at different URLs (doc 22 §3.2).
    CONSTRAINT room_type_slug_unique   UNIQUE (property_id, slug),
    CONSTRAINT room_type_slug_format   CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
    CONSTRAINT room_type_adults_pos    CHECK (max_adults >= 1),
    CONSTRAINT room_type_children_nonneg CHECK (max_children >= 0),
    CONSTRAINT room_type_occupancy_pos CHECK (max_occupancy >= 1),
    CONSTRAINT room_type_occupancy_fit CHECK (max_occupancy <= max_adults + max_children),
    CONSTRAINT room_type_area_pos      CHECK (area_sqm IS NULL OR area_sqm > 0),
    CONSTRAINT room_type_price_nonneg  CHECK (base_price_minor IS NULL OR base_price_minor >= 0),
    CONSTRAINT room_type_currency_fmt  CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE room_type IS
    'Customer-facing room product. Guests see room type + available quantity only — never a room number.';
COMMENT ON COLUMN room_type.base_price_minor IS
    'Minor units. VND is ZERO-DECIMAL: 1 VND = 1 minor unit. A generic /100 assumption is 100x wrong (doc 56 §6).';

CREATE INDEX room_type_property_idx ON room_type (property_id, status, sort_order);

CREATE TABLE room_type_translation (
    room_type_id      uuid    NOT NULL REFERENCES room_type (id) ON DELETE CASCADE,
    locale            char(2) NOT NULL,
    name              text    NOT NULL,
    short_description text,
    long_description  text,
    PRIMARY KEY (room_type_id, locale),
    CONSTRAINT room_type_tr_locale   CHECK (locale IN ('vi', 'en')),
    CONSTRAINT room_type_tr_name_len CHECK (length(btrim(name)) > 0)
);

COMMENT ON TABLE room_type_translation IS
    'Actual room type names are BLOCKED on config A1/OQ-010. None is seeded.';

-- ---------------------------------------------------------------------------
-- Bed configurations. A room type may offer alternatives (1 King, or 2 Twin).
-- ---------------------------------------------------------------------------
CREATE TABLE room_type_bed_config (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type_id uuid        NOT NULL REFERENCES room_type (id) ON DELETE CASCADE,
    bed_type     text        NOT NULL,
    bed_count    smallint    NOT NULL DEFAULT 1,
    is_default   boolean     NOT NULL DEFAULT false,
    sort_order   int         NOT NULL DEFAULT 0,
    CONSTRAINT room_type_bed_count_pos CHECK (bed_count >= 1),
    CONSTRAINT room_type_bed_type_len  CHECK (length(btrim(bed_type)) > 0)
);

CREATE INDEX room_type_bed_config_idx ON room_type_bed_config (room_type_id, sort_order);

CREATE TABLE room_type_amenity (
    room_type_id uuid NOT NULL REFERENCES room_type (id) ON DELETE CASCADE,
    amenity_id   uuid NOT NULL REFERENCES amenity   (id) ON DELETE RESTRICT,
    is_highlight boolean NOT NULL DEFAULT false,
    sort_order   int     NOT NULL DEFAULT 0,
    PRIMARY KEY (room_type_id, amenity_id)
);
