-- =============================================================================
-- V16 — Review  (Verified Stay, structurally)
-- Source: 61-phase-4-customer-review.md §5, 53-phase-4-database-erd.md §6
-- =============================================================================
-- UNIQUE (reservation_id) is the structural proof of a Verified Stay: a review
-- CANNOT exist without a reservation, and there can be at most one per stay.
--
-- Eligibility depends on a COMPLETED stay, NOT on the channel. OTA guests are
-- eligible on identical terms (doc 61 §5.1) — distribution_channel does not
-- appear in the eligibility rule.
--
-- There is deliberately NO mechanism for staff to edit review text. The UI has
-- no such action and the API has no such endpoint (doc 61 §5.3).
-- =============================================================================

CREATE TABLE review (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ONE review per stay. The Verified Stay guarantee.
    reservation_id    uuid          NOT NULL REFERENCES reservation (id) ON DELETE RESTRICT,
    customer_id       uuid          NOT NULL REFERENCES customer    (id) ON DELETE RESTRICT,
    property_id       uuid          NOT NULL REFERENCES property    (id) ON DELETE RESTRICT,

    overall           smallint      NOT NULL,
    cleanliness       smallint,
    service           smallint,
    location          smallint,
    room              smallint,
    value             smallint,

    title             text,
    body              text          NOT NULL,
    language          char(2)       NOT NULL,

    -- Month only, never exact dates — a privacy measure (doc 61 §5.2)
    stay_month        date          NOT NULL,

    status            review_status NOT NULL DEFAULT 'PENDING',
    rejection_reason  text,
    moderated_by      uuid          REFERENCES app_user (id) ON DELETE SET NULL,
    moderated_at      timestamptz,
    published_at      timestamptz,

    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT review_reservation_key UNIQUE (reservation_id),
    CONSTRAINT review_overall_range CHECK (overall BETWEEN 1 AND 5),
    CONSTRAINT review_subscores_range CHECK (
        (cleanliness IS NULL OR cleanliness BETWEEN 1 AND 5)
    AND (service     IS NULL OR service     BETWEEN 1 AND 5)
    AND (location    IS NULL OR location    BETWEEN 1 AND 5)
    AND (room        IS NULL OR room        BETWEEN 1 AND 5)
    AND (value       IS NULL OR value       BETWEEN 1 AND 5)
    ),
    CONSTRAINT review_body_not_blank CHECK (length(btrim(body)) > 0),
    CONSTRAINT review_language_valid CHECK (language IN ('vi', 'en')),
    CONSTRAINT review_rejected_has_reason CHECK (
        status <> 'REJECTED' OR rejection_reason IS NOT NULL
    ),
    CONSTRAINT review_published_has_timestamp CHECK (
        status <> 'APPROVED' OR published_at IS NOT NULL
    )
);

COMMENT ON TABLE review IS
    'UNIQUE reservation_id = Verified Stay, structurally. Channel-agnostic: OTA guests eligible on identical terms.';
COMMENT ON COLUMN review.stay_month IS
    'Month of stay. Exact dates are never published — a privacy measure.';
COMMENT ON COLUMN review.rejection_reason IS
    'From a FIXED list (abusive / off-topic / personal data / spam / not about this stay). "Unfavourable" is never a reason.';

CREATE INDEX review_property_published_idx
    ON review (property_id, status, published_at DESC);
CREATE INDEX review_customer_idx ON review (customer_id);
CREATE INDEX review_moderation_idx ON review (status, created_at) WHERE status = 'PENDING';

CREATE TABLE review_photo (
    id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id    uuid          NOT NULL REFERENCES review      (id) ON DELETE CASCADE,
    media_id     uuid          NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    status       review_status NOT NULL DEFAULT 'PENDING',
    sort_order   int           NOT NULL DEFAULT 0,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT review_photo_unique UNIQUE (review_id, media_id)
);

COMMENT ON TABLE review_photo IS 'Moderated separately from the review text.';

CREATE TABLE review_reply (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id    uuid        NOT NULL REFERENCES review (id) ON DELETE CASCADE,
    admin_id     uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    body         text        NOT NULL,
    published_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_reply_unique    UNIQUE (review_id),
    CONSTRAINT review_reply_not_blank CHECK (length(btrim(body)) > 0)
);

CREATE TABLE review_report (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   uuid        NOT NULL REFERENCES review (id) ON DELETE CASCADE,
    reporter_id uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    reason      text        NOT NULL,
    status      text        NOT NULL DEFAULT 'OPEN',
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_report_status_valid CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED'))
);

COMMENT ON TABLE review_report IS
    'A review is never auto-hidden on report count alone — that would allow brigading.';

CREATE INDEX review_report_open_idx ON review_report (status, created_at) WHERE status = 'OPEN';
