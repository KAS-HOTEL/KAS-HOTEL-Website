-- =============================================================================
-- V3 — Property and its owned content
-- Source: 53-phase-4-database-erd.md §3.1, 85-partner-property-model-amendment.md §4.2
-- =============================================================================
-- The 8 KAS properties remain fully independent hotels. Partner ownership adds
-- a scope boundary; it does not merge them.
-- =============================================================================

CREATE TABLE property (
    id                  uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),

    -- PARTNER OWNERSHIP (doc 85 §4.2) — 1 partner -> N properties
    partner_id          uuid                     NOT NULL
                        REFERENCES partner (id) ON DELETE RESTRICT,

    slug                text                     NOT NULL,
    lifecycle_state     property_lifecycle_state NOT NULL DEFAULT 'DRAFT',
    is_flagship         boolean                  NOT NULL DEFAULT false,

    -- OQ-009 (collections vs tiers) is UNRESOLVED. Deliberately text, not an
    -- enum: inventing enum values would silently resolve an open business
    -- decision. Becomes an enum when OQ-009 is answered.
    collection          text,

    star_rating         smallint,
    opened_year         smallint,
    total_rooms         int,

    district            text,
    ward                text,
    city                text                     NOT NULL DEFAULT 'Ho Chi Minh City',
    country             char(2)                  NOT NULL DEFAULT 'VN',
    latitude            numeric(9,6),
    longitude           numeric(9,6),

    phone               text,
    email               citext,
    zalo                text,

    check_in_time       time,
    check_out_time      time,

    sort_order          int                      NOT NULL DEFAULT 0,
    version             int                      NOT NULL DEFAULT 0,

    published_at        timestamptz,
    archived_at         timestamptz,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    updated_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES app_user (id) ON DELETE SET NULL,

    -- Slugs are GLOBALLY unique, not per-partner: they are public URLs and
    -- must never collide across partners (doc 85 §4.2).
    CONSTRAINT property_slug_key      UNIQUE (slug),
    CONSTRAINT property_slug_format   CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
    CONSTRAINT property_lat_range     CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
    CONSTRAINT property_lng_range     CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT property_star_range    CHECK (star_rating IS NULL OR star_rating BETWEEN 1 AND 5),
    CONSTRAINT property_rooms_nonneg  CHECK (total_rooms IS NULL OR total_rooms >= 0),
    CONSTRAINT property_country_fmt   CHECK (country ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE  property IS 'An individual KAS hotel. Independent identity, rooms, rates, inventory, media.';
COMMENT ON COLUMN property.partner_id IS 'Owning partner. NOT NULL — every property has exactly one.';
COMMENT ON COLUMN property.collection IS 'OQ-009 unresolved; text until the business decides. Not an invented enum.';
COMMENT ON COLUMN property.is_flagship IS 'Placement weight only. NEVER gates content capability (doc 67 §2).';

-- Partner scope resolution (doc 85 §4.2)
CREATE INDEX property_partner_idx        ON property (partner_id);
CREATE INDEX property_partner_state_idx  ON property (partner_id, lifecycle_state, sort_order);
CREATE INDEX property_district_idx       ON property (district) WHERE district IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Localised property content. Locale is a DIMENSION, not duplicated records.
-- ---------------------------------------------------------------------------
CREATE TABLE property_translation (
    property_id          uuid    NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    locale               char(2) NOT NULL,
    name                 text    NOT NULL,
    signature_line       text,
    short_description    text,
    introduction         text,
    story                text,
    neighbourhood_story  text,
    directions           text,
    meta_title           text,
    meta_description     text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, locale),
    CONSTRAINT property_tr_locale_valid CHECK (locale IN ('vi', 'en')),
    CONSTRAINT property_tr_name_len     CHECK (length(btrim(name)) > 0),
    CONSTRAINT property_tr_sig_len      CHECK (signature_line IS NULL OR length(signature_line) <= 90),
    CONSTRAINT property_tr_short_len    CHECK (short_description IS NULL OR length(short_description) <= 220)
);

COMMENT ON COLUMN property_translation.signature_line IS
    'Max 90 chars. Must be unique across PUBLISHED properties — enforced at publish time in application code (doc 72 §3.1).';

-- ---------------------------------------------------------------------------
-- Versioned policies. A reservation pins terms_version so changing a policy
-- never rewrites the terms of a historical reservation (doc 23 §7).
-- ---------------------------------------------------------------------------
CREATE TABLE property_policy (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     uuid        REFERENCES property (id) ON DELETE CASCADE,
    policy_type     text        NOT NULL,
    version         int         NOT NULL DEFAULT 1,
    effective_from  date        NOT NULL,
    status          rule_status NOT NULL DEFAULT 'DRAFT',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT property_policy_type_valid CHECK (policy_type IN (
        'BOOKING','CANCELLATION','CHILDREN','PETS','SMOKING',
        'PAYMENT','ACCESSIBILITY','PRIVACY','TERMS','COOKIES','NO_SHOW')),
    CONSTRAINT property_policy_version_pos CHECK (version >= 1),
    CONSTRAINT property_policy_unique UNIQUE (property_id, policy_type, version)
);

COMMENT ON TABLE property_policy IS
    'property_id NULL = a global policy. CANCELLATION and NO_SHOW content is BLOCKED on config A4/A5 — no placeholder text is seeded.';

CREATE TABLE property_policy_translation (
    policy_id  uuid    NOT NULL REFERENCES property_policy (id) ON DELETE CASCADE,
    locale     char(2) NOT NULL,
    summary    text,
    body       text,
    PRIMARY KEY (policy_id, locale),
    CONSTRAINT property_policy_tr_locale CHECK (locale IN ('vi', 'en'))
);

-- ---------------------------------------------------------------------------
-- Nearby landmarks. Distances must be VERIFIED, never estimated (OQ-060).
-- ---------------------------------------------------------------------------
CREATE TABLE property_landmark (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      uuid        NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    landmark_type    text,
    distance_metres  int,
    walking_minutes  int,
    sort_order       int         NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT property_landmark_dist_nonneg CHECK (distance_metres IS NULL OR distance_metres >= 0),
    CONSTRAINT property_landmark_walk_nonneg CHECK (walking_minutes IS NULL OR walking_minutes >= 0)
);

CREATE INDEX property_landmark_property_idx ON property_landmark (property_id, sort_order);

CREATE TABLE property_landmark_translation (
    landmark_id uuid    NOT NULL REFERENCES property_landmark (id) ON DELETE CASCADE,
    locale      char(2) NOT NULL,
    name        text    NOT NULL,
    description text,
    PRIMARY KEY (landmark_id, locale),
    CONSTRAINT property_landmark_tr_locale CHECK (locale IN ('vi', 'en'))
);

-- ---------------------------------------------------------------------------
-- Signature experiences. >= 1 required to publish a property — the rule that
-- structurally prevents "one rich flagship page and seven thin ones"
-- (doc 67 §2). Enforced at publish time in application code.
-- ---------------------------------------------------------------------------
CREATE TABLE property_experience (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid        NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    time_of_day  text,
    sort_order   int         NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_experience_property_idx ON property_experience (property_id, sort_order);

CREATE TABLE property_experience_translation (
    experience_id uuid    NOT NULL REFERENCES property_experience (id) ON DELETE CASCADE,
    locale        char(2) NOT NULL,
    title         text    NOT NULL,
    description   text,
    PRIMARY KEY (experience_id, locale),
    CONSTRAINT property_experience_tr_locale CHECK (locale IN ('vi', 'en'))
);
