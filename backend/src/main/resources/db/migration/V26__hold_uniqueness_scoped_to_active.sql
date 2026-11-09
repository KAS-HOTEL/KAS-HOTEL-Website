-- =============================================================================
-- V26 — Forward fix: hold uniqueness must apply to LIVE holds only
-- Source: 54-phase-4-state-machines.md §4 S8, 14-booking-state-machine.md §7,
--         57-phase-4-reservation-sales.md §6, 55-phase-4-inventory.md §4
-- =============================================================================
-- CORRECTS V25, WHICH THIS AUTHOR SHIPPED ONE MIGRATION AGO.
--
-- V25 fixed a real defect — the original hold_unique could never fire, because
-- hold_exactly_one_owner forces a NULL into every candidate key and PostgreSQL
-- compares NULLs as distinct. NULLS NOT DISTINCT made it fire. That half was
-- right and is preserved here.
--
-- But V25 was OVER-BROAD, and an adversarial review caught it. `status` is not
-- in the key, and a hold is NEVER deleted — it is state-transitioned and the row
-- is retained (doc 14 §7: "hold.status = 'EXPIRED', released_at = now()"; the
-- hold_released_has_timestamp CHECK exists precisely because rows persist). So a
-- dead hold permanently occupied its identity, and four FROZEN flows that
-- release a hold and then create a new one for the same room type and night
-- became impossible:
--
--   S8   doc 54 §4:72  — "**Superseded holds released**; new holds created"
--                        with "Prior offer superseded, retained"
--   S8   doc 14:290    — "Prior hold `RELEASED`; new hold created"
--   mod  doc 14:519    — "old holds released, availability re-checked, new holds
--                        placed, price recalculated — one transaction"
--        doc 57:171    — "Old holds released, new holds placed — one transaction"
--   re-offer doc 57:205 — "Hold `EXPIRED`; offer may be re-made if availability
--                        allows"
--
-- The most ordinary amendment — a guest adding one night — would have failed
-- 23505 on every overlapping night, inside the single transaction those flows
-- mandate, with no way to defer the check.
--
-- THE CORRECT IDENTITY IS SCOPED TO LIVE HOLDS.
--
-- At most one ACTIVE hold per (hold_type, owner, room_type, date). A RELEASED,
-- EXPIRED or CONVERTED row is history, not a claim on inventory, and must not
-- occupy the slot. This is not a new idea in this schema — it is what the
-- database already believes everywhere else:
--
--   * v_active_hold_demand (V13) counts `WHERE status = 'ACTIVE'` only;
--   * hold_availability_idx (V13) is partial on `status = 'ACTIVE'`;
--   * hold_expiry_sweep_idx (V13) is partial on `status = 'ACTIVE'`;
--   * V22's property_submission_one_open_idx is the same pattern — a partial
--     unique index scoped to the open status, letting closed rows accumulate,
--     which doc 117 §11 itself quotes as the codebase's precedent.
--
-- A table CONSTRAINT cannot carry a WHERE clause, so this becomes a partial
-- UNIQUE INDEX. NULLS NOT DISTINCT is kept: hold_exactly_one_owner still forces
-- one owner column to NULL, so without it the index would inherit V13's defect.
--
-- Renamed rather than reused. `hold_unique` claimed to cover every row; this
-- covers live rows, and a name that still said "unique" without qualification
-- would misdescribe it in exactly the way that produced V25's error.
--
-- The S1 guarantee doc 117 §11 requires is fully preserved: a REQUEST hold
-- cannot be inserted twice for the same reservation, room type and night.
--
-- Fixed FORWARD — V25 is applied and is never edited (migration README rule 1).
--
-- Nothing else changes. hold_exactly_one_owner, hold_expiry_after_creation,
-- hold_qty_pos, hold_released_has_timestamp, all five foreign keys, the primary
-- key and the four original indexes are untouched, as is inv_no_oversell on
-- room_type_inventory_day.
-- =============================================================================

ALTER TABLE inventory_hold DROP CONSTRAINT hold_unique;

CREATE UNIQUE INDEX hold_active_unique_idx
    ON inventory_hold (hold_type, reservation_id, inquiry_id, room_type_id, date)
    NULLS NOT DISTINCT
    WHERE status = 'ACTIVE';

COMMENT ON INDEX hold_active_unique_idx IS
    'At most one ACTIVE hold per (type, owner, room type, night). Released/expired/converted rows are history and must not block re-holding — doc 54 S8, doc 14 §7, doc 57 §6.';
