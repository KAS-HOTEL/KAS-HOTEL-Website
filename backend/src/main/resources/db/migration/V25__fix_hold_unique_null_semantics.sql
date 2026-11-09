-- =============================================================================
-- V25 — Forward fix: inventory_hold.hold_unique could never reject anything
-- Source: 117-phase-7-5f-step-16a-contract-amendment.md §11, OQ-169
-- =============================================================================
-- DEFECT, VERIFIED EMPIRICALLY BEFORE THIS MIGRATION WAS WRITTEN.
--
-- V13 declared both of these on inventory_hold:
--
--   CONSTRAINT hold_exactly_one_owner CHECK ((reservation_id IS NOT NULL) <> (inquiry_id IS NOT NULL))
--   CONSTRAINT hold_unique UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
--
-- The XOR guarantees that ONE of the two owner columns is ALWAYS NULL. A
-- PostgreSQL UNIQUE constraint defaults to NULLS DISTINCT, so any row carrying a
-- NULL in the key is never equal to any other row. The constraint therefore
-- could not fire at all: two byte-identical holds were inserted successfully in
-- a rolled-back transaction reproducing this exact shape.
--
-- This is the SAME defect class V21 already fixed for property_policy, whose
-- header states it plainly: "In PostgreSQL, NULLs are DISTINCT in a UNIQUE
-- constraint by default."
--
-- It matters because S1 (doc 54 §4) creates a REQUEST hold PER ROOM TYPE PER
-- NIGHT, and this constraint is the only structural guard against inserting the
-- same logical hold twice. No data is affected: inventory_hold holds 0 rows.
--
-- THE FIX IS THE NARROWEST ONE AVAILABLE.
--
-- Same constraint name. Same columns. Same intended identity. Only the NULL
-- comparison semantics change, via NULLS NOT DISTINCT (PostgreSQL 15+; this
-- server is 17.10). inventory_hold is NOT redesigned.
--
-- Ownership semantics are preserved exactly as V13 defined them: the key still
-- spans hold_type, BOTH owner columns, room_type_id and date, so a REQUEST hold
-- owned by a reservation and an ALTERNATIVE_OFFER hold owned by an inquiry
-- remain distinct identities, and hold_exactly_one_owner still decides which
-- owner column may be populated. This migration adds no new ownership rule and
-- does not collapse the two branches into one universal uniqueness rule
-- (doc 117 §11).
--
-- Fixed FORWARD, not by editing V13 — migration README rule 1.
--
-- NOTHING ELSE IS TOUCHED. hold_exactly_one_owner, hold_expiry_after_creation,
-- hold_qty_pos, hold_released_has_timestamp, every foreign key, and the four
-- indexes (hold_expiry_sweep_idx, hold_availability_idx, hold_reservation_idx,
-- hold_inquiry_idx) are unchanged. The oversell guard is inv_no_oversell on
-- room_type_inventory_day (V10) and is not affected by this migration.
-- =============================================================================

ALTER TABLE inventory_hold DROP CONSTRAINT hold_unique;

ALTER TABLE inventory_hold ADD CONSTRAINT hold_unique
    UNIQUE NULLS NOT DISTINCT (hold_type, reservation_id, inquiry_id, room_type_id, date);

COMMENT ON CONSTRAINT hold_unique ON inventory_hold IS
    'One hold per (type, owner, room type, night). NULLS NOT DISTINCT because hold_exactly_one_owner forces a NULL into every key — see V25.';
