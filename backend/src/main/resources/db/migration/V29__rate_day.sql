-- =============================================================================
-- V29 — A price for one room type on one date
-- Source: STEP H PART C — "click a specific price cell … saving must update ONLY
--         that date"
-- =============================================================================
-- Until now the only way to change a price was `rate_rule`: a named, prioritised
-- rule over a date RANGE. Changing a single Tuesday meant authoring a rule whose
-- range happened to be one day long, and the rule list filled with them. That is
-- the workflow the owner asked to stop being primary.
--
-- So the daily price gets the table it always needed. One row is one
-- (room_type_id, date) — the shape every hotel extranet actually stores, and the
-- shape that makes "saving one date does not touch another" true by
-- construction rather than by careful code.
--
-- Precedence, most specific first:
--
--   rate_day        a price an operator typed for that exact date
--   rate_rule       a range rule, ranked by priority as before
--   room_type base  the standing price
--
-- rate_rule is NOT touched. Its table, its resolver ranking and its endpoints all
-- stay exactly as they were: doc 56's rule semantics are still the contract for
-- seasons and campaigns, and the reservation read path still resolves through
-- them. This adds a layer above, it does not replace one.
-- =============================================================================

CREATE TABLE rate_day (
    room_type_id uuid        NOT NULL REFERENCES room_type (id) ON DELETE CASCADE,
    date         date        NOT NULL,

    -- Minor units, like every other money column in the schema. A price of zero
    -- is legitimate (a complimentary night an operator wants to show as free);
    -- "no price for this date" is the absence of the row, not a zero.
    price_minor  bigint      NOT NULL CHECK (price_minor >= 0),
    currency     character(3) NOT NULL DEFAULT 'VND',

    -- Who last set it, for the audit trail. Nullable because a future import
    -- would have no user behind it.
    set_by       uuid        REFERENCES app_user (id) ON DELETE SET NULL,

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    -- The primary key IS the uniqueness rule: one price per room type per day,
    -- so an edit is an UPSERT and can never produce two answers for one cell.
    PRIMARY KEY (room_type_id, date)
);

-- The grid reads a contiguous window for several room types at once.
CREATE INDEX rate_day_date_idx ON rate_day (date, room_type_id);

COMMENT ON TABLE rate_day IS
    'One price for one room type on one date. Overrides rate_rule and the room type base price.';
COMMENT ON COLUMN rate_day.price_minor IS
    'Minor currency units. Absence of the row means "no day price", not zero.';
