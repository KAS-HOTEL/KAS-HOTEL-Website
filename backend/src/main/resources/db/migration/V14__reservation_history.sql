-- =============================================================================
-- V14 — Reservation history, contact log, notes, messages, changes
-- Source: 53-phase-4-database-erd.md §5.4, 54-phase-4-state-machines.md §9
-- =============================================================================
-- CRITICAL BOUNDARY: reservation_note (internal) and reservation_message
-- (guest-visible) are TWO SEPARATE TABLES, not one table with a visibility
-- flag. No guest-facing API can return reservation_note because no guest
-- surface for it exists (doc 21 §5.4).
-- =============================================================================

CREATE TABLE reservation_status_history (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid         NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,

    -- Distinguishes WHICH lifecycle moved
    field          status_field NOT NULL,
    from_status    text,
    to_status      text         NOT NULL,

    actor_id       uuid         REFERENCES app_user (id) ON DELETE SET NULL,
    actor_type     actor_type   NOT NULL,
    reason         text,
    note           text,
    created_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reservation_status_history.field IS
    'SALES or STAY — the two lifecycles are recorded in one history table but never conflated.';

CREATE INDEX reservation_history_idx ON reservation_status_history (reservation_id, created_at DESC);

CREATE TABLE reservation_contact_log (
    id             uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid              NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    admin_id       uuid              REFERENCES app_user (id) ON DELETE SET NULL,
    channel        contact_channel   NOT NULL,
    direction      contact_direction NOT NULL,
    outcome        text,
    notes          text,
    contacted_at   timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX reservation_contact_idx ON reservation_contact_log (reservation_id, contacted_at DESC);

-- INTERNAL ONLY. No guest surface exists for this table.
CREATE TABLE reservation_note (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    admin_id       uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    body           text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_note_not_blank CHECK (length(btrim(body)) > 0)
);

COMMENT ON TABLE reservation_note IS
    'INTERNAL. NEVER guest-visible. A separate table from reservation_message by design, not a visibility flag.';

CREATE INDEX reservation_note_idx ON reservation_note (reservation_id, created_at DESC);

-- GUEST-VISIBLE. Requires an explicit preview before sending.
CREATE TABLE reservation_message (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    admin_id       uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    body           text        NOT NULL,
    locale         char(2)     NOT NULL DEFAULT 'vi',
    sent_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_message_locale CHECK (locale IN ('vi', 'en')),
    CONSTRAINT reservation_message_not_blank CHECK (length(btrim(body)) > 0)
);

COMMENT ON TABLE reservation_message IS
    'GUEST-VISIBLE. Distinct object from reservation_note. Preview required before send.';

CREATE INDEX reservation_message_idx ON reservation_message (reservation_id, created_at DESC);

CREATE TABLE reservation_change (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id  uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    actor_id        uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    before_state    jsonb,
    after_state     jsonb,
    reason          text        NOT NULL,
    guest_notified  boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reservation_change_idx ON reservation_change (reservation_id, created_at DESC);
