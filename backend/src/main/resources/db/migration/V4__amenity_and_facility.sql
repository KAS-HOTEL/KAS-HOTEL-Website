-- =============================================================================
-- V4 — Amenity taxonomy and Facility
-- Source: 53-phase-4-database-erd.md §3.4, 52-phase-4-domain-model.md §3.14
-- =============================================================================
-- Amenity  = a shared controlled vocabulary. A checkbox.
-- Facility = a physical thing at a property WITH editorial content and its own
--            gallery. A story.
-- The distinction is what makes the additive-flagship model work: facility
-- blocks render for ANY property that has the content, not only the flagship
-- (doc 67 §2).
-- =============================================================================

CREATE TABLE amenity (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text        NOT NULL,
    category      text        NOT NULL,
    icon          text,
    is_highlight  boolean     NOT NULL DEFAULT false,
    sort_order    int         NOT NULL DEFAULT 0,
    archived_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT amenity_code_key    UNIQUE (code),
    CONSTRAINT amenity_code_format CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
    CONSTRAINT amenity_category_valid CHECK (category IN (
        'CONNECTIVITY','COMFORT','BATHROOM','MEDIA','FOOD_DRINK',
        'PROPERTY_FACILITY','SERVICES','ACCESSIBILITY','FAMILY'))
);

COMMENT ON TABLE amenity IS
    'Shared controlled vocabulary across all properties. Actual amenity set is BLOCKED on config A9 — none is seeded.';

CREATE TABLE amenity_translation (
    amenity_id  uuid    NOT NULL REFERENCES amenity (id) ON DELETE CASCADE,
    locale      char(2) NOT NULL,
    name        text    NOT NULL,
    description text,
    PRIMARY KEY (amenity_id, locale),
    CONSTRAINT amenity_tr_locale CHECK (locale IN ('vi', 'en')),
    CONSTRAINT amenity_tr_name_len CHECK (length(btrim(name)) > 0)
);

CREATE TABLE property_amenity (
    property_id  uuid    NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    amenity_id   uuid    NOT NULL REFERENCES amenity  (id) ON DELETE RESTRICT,
    is_highlight boolean NOT NULL DEFAULT false,
    sort_order   int     NOT NULL DEFAULT 0,
    PRIMARY KEY (property_id, amenity_id)
);

-- ---------------------------------------------------------------------------
-- Facility — available to EVERY property. Milestone stands out by HAVING more,
-- not by the system PERMITTING it more (doc 67 §2, doc 85).
-- ---------------------------------------------------------------------------
CREATE TABLE facility (
    id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id            uuid          NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    facility_type          facility_type NOT NULL,
    opening_hours          jsonb,
    open_to_non_residents  boolean,
    sort_order             int           NOT NULL DEFAULT 0,
    archived_at            timestamptz,
    created_at             timestamptz   NOT NULL DEFAULT now(),
    updated_at             timestamptz   NOT NULL DEFAULT now(),
    created_by             uuid REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by             uuid REFERENCES app_user (id) ON DELETE SET NULL
);

COMMENT ON TABLE facility IS
    'A physical thing with editorial content and its own gallery. Renders a first-class page block for ANY property that has one.';

CREATE INDEX facility_property_idx ON facility (property_id, sort_order);
CREATE INDEX facility_type_idx     ON facility (facility_type);

CREATE TABLE facility_translation (
    facility_id uuid    NOT NULL REFERENCES facility (id) ON DELETE CASCADE,
    locale      char(2) NOT NULL,
    name        text    NOT NULL,
    description text,
    PRIMARY KEY (facility_id, locale),
    CONSTRAINT facility_tr_locale CHECK (locale IN ('vi', 'en')),
    CONSTRAINT facility_tr_name_len CHECK (length(btrim(name)) > 0)
);
