-- =============================================================================
-- V30 — Message templates and automated-message idempotency
-- Source: 58-phase-4-api-contract.md §5 (guest-visible messages, preview before
--         send), 14-reservation-history (reservation_message), 10 §7 (a retried
--         job cannot double-send)
-- =============================================================================
-- WHAT THIS DOES NOT DO
--
-- It creates NO second message table, NO conversation table and NO customer
-- table. `reservation_message` (V14) already holds a guest-visible message and
-- already ties it to a reservation, which is the only thread identity this
-- domain has: one reservation IS one conversation. Two columns are added to it
-- rather than a parallel structure beside it.
--
-- It creates NO delivery mechanism. There is no mail sender, no SMS provider and
-- no push transport in this application (OQ-162, re-confirmed open in docs
-- 118-121), so `reservation_message.sent_at` stays NULL and the product says so.
-- Nothing here implies a message reached a guest.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- What causes a template to be used.
--
-- MANUAL is an agent picking it in the composer. BEFORE_CHECK_IN is the ONE
-- automated trigger this application can actually observe: it needs only
-- `reservation.check_in` and a clock, both of which exist, and it runs on the
-- same @Scheduled infrastructure the S13 hold sweep already uses.
--
-- The stay lifecycle's other transitions — CHECK_IN_READY, CHECKED_IN,
-- CHECKED_OUT, NO_SHOW — are deliberately NOT trigger values. Their routes
-- (doc 58 §6 /check-in, /check-out, /no-show) are unimplemented and this
-- application has no domain-event pipeline, so nothing could observe them. A
-- trigger nothing can fire would be a promise the enum could not keep.
-- ---------------------------------------------------------------------------
CREATE TYPE message_trigger AS ENUM ('MANUAL', 'BEFORE_CHECK_IN');

CREATE TABLE message_template (
    id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owned by the partner, not by a property: a partner writes a house style
    -- once. `property_id` narrows it to one hotel when they want that, and NULL
    -- means every property in the partner's scope.
    partner_id  uuid            NOT NULL REFERENCES partner  (id) ON DELETE CASCADE,
    property_id uuid            REFERENCES property (id) ON DELETE CASCADE,

    name        text            NOT NULL,
    body        text            NOT NULL,
    locale      char(2)         NOT NULL DEFAULT 'vi',

    trigger     message_trigger NOT NULL DEFAULT 'MANUAL',

    -- How many days before check-in an automated template fires. Required for
    -- BEFORE_CHECK_IN and forbidden otherwise, so a row cannot describe a
    -- schedule its trigger does not have.
    lead_days   smallint,

    -- For MANUAL: whether the composer offers it. For BEFORE_CHECK_IN: whether
    -- the sweep may send it. Off by default — automation is never switched on
    -- by the act of creating a template.
    enabled     boolean         NOT NULL DEFAULT false,

    created_by  uuid            REFERENCES app_user (id) ON DELETE SET NULL,
    created_at  timestamptz     NOT NULL DEFAULT now(),
    updated_at  timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT message_template_name_unique  UNIQUE (partner_id, name),
    CONSTRAINT message_template_locale_valid CHECK (locale IN ('vi', 'en')),
    CONSTRAINT message_template_name_len     CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT message_template_body_len     CHECK (length(btrim(body)) BETWEEN 1 AND 4000),

    -- lead_days belongs to BEFORE_CHECK_IN and to nothing else.
    CONSTRAINT message_template_lead_days_matches_trigger CHECK (
        (trigger = 'BEFORE_CHECK_IN' AND lead_days IS NOT NULL AND lead_days BETWEEN 0 AND 30)
     OR (trigger <> 'BEFORE_CHECK_IN' AND lead_days IS NULL)
    )
);

COMMENT ON TABLE message_template IS
    'Reusable guest-visible message bodies. Owned by a partner; property_id NULL means every property in scope.';
COMMENT ON COLUMN message_template.trigger IS
    'MANUAL or BEFORE_CHECK_IN. No stay-lifecycle triggers exist: their routes are unimplemented and there is no event pipeline to observe them.';

CREATE INDEX message_template_partner_idx ON message_template (partner_id, trigger, enabled);

-- The sweep's working set: enabled automated templates only.
CREATE INDEX message_template_automation_idx
    ON message_template (trigger, lead_days) WHERE enabled AND trigger <> 'MANUAL';

-- ---------------------------------------------------------------------------
-- reservation_message gains two columns — not a new table.
-- ---------------------------------------------------------------------------
ALTER TABLE reservation_message
    -- Which template produced it, when one did. SET NULL rather than CASCADE:
    -- deleting a template must never delete the messages already written from
    -- it, because those are a record of what was said.
    ADD COLUMN template_id    uuid REFERENCES message_template (id) ON DELETE SET NULL,

    -- NULL for anything an agent wrote by hand. For an automated message it is
    -- the trigger occurrence, and it is what makes duplication IMPOSSIBLE
    -- rather than merely unlikely.
    ADD COLUMN automation_key text;

-- The whole idempotency guarantee, in one line.
--
-- Doc 10 §7's rule for email_log, applied to the same problem here: the second
-- insert for one (reservation, template, occurrence) is refused by PostgreSQL,
-- so a re-run sweep, a retried transaction, a restarted process and two workers
-- racing all converge on exactly one message. No application discipline, no
-- advisory lock and no leader election is involved.
--
-- Partial, so the hand-written messages — every one of which has a NULL key —
-- are unaffected.
CREATE UNIQUE INDEX reservation_message_automation_key_uk
    ON reservation_message (automation_key) WHERE automation_key IS NOT NULL;

COMMENT ON COLUMN reservation_message.automation_key IS
    'reservation + template + trigger occurrence. UNIQUE, so a retried job physically cannot write a second automated message.';

-- The inbox reads newest-first per reservation; V14 already indexed
-- (reservation_id, created_at DESC), which serves both the thread and the
-- last-message lookup behind the conversation list.
