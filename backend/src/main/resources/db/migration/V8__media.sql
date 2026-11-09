-- =============================================================================
-- V8 — Media library and polymorphic attachment
-- Source: 62-phase-4-media.md, 85-partner-property-model-amendment.md §4.3
-- =============================================================================
-- ONE asset library + a polymorphic link table, NOT three galleries. An asset
-- uploaded once appears in a property gallery and a facility gallery without
-- duplication, and replacing it updates every usage at once.
-- =============================================================================

CREATE TABLE media_asset (
    id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),

    -- THE ONE PLACE PARTNER DOES NOT DERIVE (doc 85 §4.3).
    -- A media_asset is not owned by a property — it may be linked to several
    -- properties of the same partner — so partner cannot be derived through
    -- one. Without this column nothing structurally prevents Partner A's asset
    -- being linked to Partner B's property in a future multi-partner model.
    partner_id   uuid             NOT NULL REFERENCES partner (id) ON DELETE RESTRICT,

    -- INTERNAL. Never leaves the server. On the public response denylist —
    -- the public API returns resolved delivery URLs only (doc 62 §6).
    storage_key  text             NOT NULL,

    mime_type    text             NOT NULL,
    width        int,
    height       int,
    size_bytes   bigint,
    checksum     text,

    category     media_category   NOT NULL,
    visibility   media_visibility NOT NULL DEFAULT 'PUBLIC',
    status       media_status     NOT NULL DEFAULT 'DRAFT',

    -- Focal point drives object-position so a 4:5 mobile crop keeps the
    -- subject, not the ceiling (doc 83 §12.1).
    focal_x      numeric(4,3)     NOT NULL DEFAULT 0.5,
    focal_y      numeric(4,3)     NOT NULL DEFAULT 0.5,

    uploaded_by  uuid             REFERENCES app_user (id) ON DELETE SET NULL,
    archived_at  timestamptz,
    created_at   timestamptz      NOT NULL DEFAULT now(),
    updated_at   timestamptz      NOT NULL DEFAULT now(),

    CONSTRAINT media_asset_storage_key_key UNIQUE (storage_key),
    CONSTRAINT media_asset_dims_pos    CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
    CONSTRAINT media_asset_size_pos    CHECK (size_bytes IS NULL OR size_bytes > 0),
    CONSTRAINT media_asset_focal_range CHECK (focal_x BETWEEN 0 AND 1 AND focal_y BETWEEN 0 AND 1)
);

COMMENT ON TABLE media_asset IS
    'Central library. partner_id is the isolation boundary — the one entity where partner cannot derive through property.';
COMMENT ON COLUMN media_asset.storage_key IS
    'INTERNAL ONLY. On the public response denylist (doc 58 §9).';

CREATE INDEX media_asset_partner_idx ON media_asset (partner_id, category, status);

CREATE TABLE media_asset_translation (
    media_asset_id uuid    NOT NULL REFERENCES media_asset (id) ON DELETE CASCADE,
    locale         char(2) NOT NULL,
    -- Required in BOTH locales before an asset may be used publicly. A publish
    -- gate, not a backlog item (doc 62 §5) — a photography-led site is
    -- inaccessible without it, and English alt text on a Vietnamese page is
    -- itself a failure.
    alt_text       text    NOT NULL,
    caption        text,
    PRIMARY KEY (media_asset_id, locale),
    CONSTRAINT media_tr_locale       CHECK (locale IN ('vi', 'en')),
    CONSTRAINT media_tr_alt_not_blank CHECK (length(btrim(alt_text)) > 0)
);

COMMENT ON TABLE media_asset_translation IS
    'alt_text is NOT NULL and non-blank. Publishing without it is impossible at the database level.';

-- ---------------------------------------------------------------------------
-- media_link — polymorphic attachment to PROPERTY / ROOM_TYPE / FACILITY / ...
-- Cross-partner attachment is prohibited; enforced at the service layer and
-- asserted in tests (doc 85 §4.3).
-- ---------------------------------------------------------------------------
CREATE TABLE media_link (
    id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id uuid             NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    owner_type     media_owner_type NOT NULL,
    owner_id       uuid             NOT NULL,
    display_order  int              NOT NULL DEFAULT 0,
    is_cover       boolean          NOT NULL DEFAULT false,
    status         media_status     NOT NULL DEFAULT 'DRAFT',
    created_at     timestamptz      NOT NULL DEFAULT now(),
    updated_at     timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT media_link_unique UNIQUE (owner_type, owner_id, media_asset_id)
);

COMMENT ON TABLE media_link IS
    'One asset, many owners — no duplication. Deletion of an in-use asset is blocked by ON DELETE RESTRICT.';

-- Exactly one cover per owner, enforced by a PARTIAL unique index.
CREATE UNIQUE INDEX media_link_one_cover_idx
    ON media_link (owner_type, owner_id) WHERE is_cover;

CREATE INDEX media_link_owner_idx ON media_link (owner_type, owner_id, display_order);
CREATE INDEX media_link_asset_idx ON media_link (media_asset_id);
