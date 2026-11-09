-- =============================================================================
-- V10 — CENTRAL INVENTORY  ***THE HIGHEST-PRIORITY CORRECTNESS CONCERN***
-- Source: 55-phase-4-inventory.md §3, 53-phase-4-database-erd.md §4.1
-- =============================================================================
-- Grain: ONE room type, ONE date.
--
-- A stay checkIn -> checkOut occupies nights checkIn .. checkOut-1.
-- The check-out night is NOT occupied. Dates are property-local calendar dates
-- in Asia/Ho_Chi_Minh, stored as `date` — never timestamptz. Conflating the two
-- produces midnight-boundary defects (doc 55 §2).
--
-- AVAILABILITY EXPRESSION (doc 55 §3.1) — the authoritative definition:
--
--   availableDirect = total
--                   - maintenance
--                   - other_blocks
--                   - direct_committed
--                   - ota_committed
--                   - GREATEST(buffer_target - ota_committed, 0)
--
-- The buffer blocks only its UNUSED portion. Subtracting the full buffer AND
-- the OTA commitments would withhold 8 rooms for 5 rooms' worth of protection.
--
-- Check-in is a RELABEL, not a new consumption: a commitment covering night d
-- consumes one unit of d whether the guest is CONFIRMED, CHECK_IN_READY or
-- CHECKED_IN. There is deliberately NO separate `occupied` counter — treating
-- occupancy as a subtractable bucket double-counted the same room (doc 55 §3.2,
-- §3.3). Occupancy is DERIVED from stay_status.
-- =============================================================================

CREATE TABLE room_type_inventory_day (
    room_type_id      uuid        NOT NULL REFERENCES room_type (id) ON DELETE RESTRICT,
    date              date        NOT NULL,

    total             int         NOT NULL DEFAULT 0,
    maintenance       int         NOT NULL DEFAULT 0,
    other_blocks      int         NOT NULL DEFAULT 0,

    -- Materialised caches. The AUTHORITY is the row-derived query over
    -- reservation lines and active holds (doc 55 §3.4). A reconciliation job
    -- compares the two and ALERTS on drift — it never silently corrects.
    direct_committed  int         NOT NULL DEFAULT 0,
    ota_committed     int         NOT NULL DEFAULT 0,

    -- Materialised from ota_safety_buffer_rule. 0 when no rule is configured.
    buffer_target     int         NOT NULL DEFAULT 0,

    updated_at        timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (room_type_id, date),

    CONSTRAINT inv_total_nonneg        CHECK (total            >= 0),
    CONSTRAINT inv_maintenance_nonneg  CHECK (maintenance      >= 0),
    CONSTRAINT inv_other_blocks_nonneg CHECK (other_blocks     >= 0),
    CONSTRAINT inv_direct_nonneg       CHECK (direct_committed >= 0),
    CONSTRAINT inv_ota_nonneg          CHECK (ota_committed    >= 0),
    CONSTRAINT inv_buffer_nonneg       CHECK (buffer_target    >= 0),

    -- =======================================================================
    -- THE OVERSELL GUARANTEE
    -- The database itself refuses to write a row that would oversell,
    -- independently of any application logic (doc 55 §2.2).
    -- =======================================================================
    CONSTRAINT inv_no_oversell CHECK (
        total - maintenance - other_blocks - direct_committed - ota_committed
              - GREATEST(buffer_target - ota_committed, 0) >= 0
    )
);

COMMENT ON TABLE room_type_inventory_day IS
    'Availability truth, one room type per date. availableDirect is DERIVED, never an editable column.';
COMMENT ON COLUMN room_type_inventory_day.direct_committed IS
    'CACHE of direct reservation lines + active direct holds. Authority is the row-derived query.';
COMMENT ON COLUMN room_type_inventory_day.buffer_target IS
    'Materialised OTA safety buffer. TRANSITIONAL. 0 when unconfigured (config B3 outstanding).';

-- NOTE: ota_reserved <= ota_allotment is DELIBERATELY ABSENT.
-- It was WITHDRAWN in Phase 3.5 and the withdrawal is reaffirmed here: it would
-- refuse to record a real OTA reservation when a stale allotment is exceeded.
-- Availability fails closed; recording fails open (doc 55 §6.3).

CREATE INDEX inv_date_idx ON room_type_inventory_day (date);

-- ---------------------------------------------------------------------------
-- Derived availability. A FUNCTION, not a column — availability can never be
-- typed in by an operator (doc 55 §2.1).
-- ---------------------------------------------------------------------------
CREATE FUNCTION available_direct(inv room_type_inventory_day)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
    SELECT inv.total
         - inv.maintenance
         - inv.other_blocks
         - inv.direct_committed
         - inv.ota_committed
         - GREATEST(inv.buffer_target - inv.ota_committed, 0);
$$;

COMMENT ON FUNCTION available_direct(room_type_inventory_day) IS
    'The authoritative availability expression (doc 55 §3.1). The buffer blocks only its UNUSED portion.';

CREATE VIEW v_room_type_availability AS
SELECT
    i.room_type_id,
    i.date,
    i.total,
    available_direct(i.*) AS available_direct,
    GREATEST(i.buffer_target - i.ota_committed, 0) AS buffer_remaining
FROM room_type_inventory_day i;

COMMENT ON VIEW v_room_type_availability IS
    'Convenience read model. INTERNAL — only available_direct reaches a customer surface.';
