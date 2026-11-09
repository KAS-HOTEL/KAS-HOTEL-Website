-- =============================================================================
-- V56 — "Quy tắc đặc biệt" (special price rules), owner-approved pricing redesign
-- 2026-11-08.
--
-- One special rule the operator sees (a holiday, a season, a weekday pattern) is a
-- fixed price per room type over the same dates. The rate engine already prices from
-- ROOM_TYPE-scoped rate_rule rows, so a group creates one such row per priced room
-- type and ties them together here. The engine itself is unchanged: precedence stays
-- day price > rate rule (priority, specificity) > base price.
--
-- kind drives the rule priority (HOLIDAY 30 > SEASON 20 > OTHER 15 > WEEKLY 10), so a
-- holiday inside a season wins, and a season beats a weekend pattern.
-- Additive only: no existing row changes.
-- =============================================================================

CREATE TABLE rate_rule_group (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid        NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    kind         text        NOT NULL,
    name         text        NOT NULL,
    date_from    date,
    date_to      date,
    days_of_week smallint[],
    active       boolean     NOT NULL DEFAULT true,
    archived     boolean     NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT rate_rule_group_kind CHECK (kind IN ('HOLIDAY', 'SEASON', 'WEEKLY', 'OTHER')),
    CONSTRAINT rate_rule_group_name CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT rate_rule_group_dates CHECK (date_from IS NULL OR date_to IS NULL OR date_to >= date_from)
);

CREATE INDEX rate_rule_group_property ON rate_rule_group (property_id) WHERE NOT archived;

ALTER TABLE rate_rule ADD COLUMN group_id uuid REFERENCES rate_rule_group (id) ON DELETE SET NULL;
CREATE INDEX rate_rule_group_member ON rate_rule (group_id) WHERE group_id IS NOT NULL;

COMMENT ON TABLE rate_rule_group IS
    'A special price rule as the operator sees it; one ROOM_TYPE rate_rule per priced room type (rate_rule.group_id).';
