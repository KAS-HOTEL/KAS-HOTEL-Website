-- =============================================================================
-- V18 — Notification and email log  (persistence only)
-- Source: 53-phase-4-database-erd.md §3.9, 10-system-requirements.md §7
-- =============================================================================
-- Database foundation ONLY. No delivery mechanism is built in Phase 7.2.
--
-- email_log.idempotency_key is UNIQUE so a retried job physically CANNOT send a
-- duplicate booking confirmation (doc 10 §7).
-- =============================================================================

CREATE TABLE notification (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    type        text        NOT NULL,
    title       text        NOT NULL,
    body        text,
    entity_type text,
    entity_id   uuid,
    locale      char(2)     NOT NULL DEFAULT 'vi',
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_locale_valid CHECK (locale IN ('vi', 'en')),
    CONSTRAINT notification_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX notification_unread_idx ON notification (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE email_log (
    id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key        text         NOT NULL,
    template_version    text,
    to_email            citext       NOT NULL,
    locale              char(2)      NOT NULL DEFAULT 'vi',

    reservation_id      uuid         REFERENCES reservation (id) ON DELETE SET NULL,
    customer_id         uuid         REFERENCES customer    (id) ON DELETE SET NULL,

    provider_message_id text,
    status              email_status NOT NULL DEFAULT 'QUEUED',
    error               text,

    -- Prevents duplicate sends structurally, not by application discipline.
    idempotency_key     text         NOT NULL,

    sent_at             timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT email_log_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT email_log_locale_valid    CHECK (locale IN ('vi', 'en'))
);

COMMENT ON COLUMN email_log.idempotency_key IS
    'UNIQUE per (event, reservation, recipient). A retried job cannot double-send a confirmation.';

CREATE INDEX email_log_reservation_idx ON email_log (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX email_log_status_idx      ON email_log (status, created_at DESC);

-- Bounce / complaint suppression
CREATE TABLE email_suppression (
    email      citext      PRIMARY KEY,
    reason     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
