-- =============================================================================
-- V13 — Inventory holds
-- Source: 55-phase-4-inventory.md §5, 53-phase-4-database-erd.md §4.2,
--         14-booking-state-machine.md §6
-- =============================================================================
-- Two hold types:
--   REQUEST            — created when a direct request is submitted
--   ALTERNATIVE_OFFER  — created when sales offers an alternative AND
--                        explicitly chooses to hold it (never automatic)
--
-- *** expires_at IS NOT NULL AT CREATION, ALWAYS. ***
-- This is the structural guarantee that no hold — including one attached to an
-- abandoned inquiry — can lock inventory permanently. It is cleared only when a
-- hold becomes firm on sales_status = WON.
--
-- NO DURATION VALUE IS HARD-CODED. DIRECT_REQUEST_HOLD_DURATION and
-- DIRECT_ALTERNATIVE_HOLD_DURATION live in system_setting (V20) and are UNSET
-- until the business supplies them (config B1/B2). With no duration configured,
-- placing a hold FAILS with a config error rather than inventing a value.
-- =============================================================================

CREATE TABLE inventory_hold (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    hold_type      hold_type   NOT NULL,

    -- Exactly ONE of these. An ALTERNATIVE_OFFER hold may reference an inquiry
    -- because THE HOLD carries the stay parameters the inquiry does not.
    reservation_id uuid        REFERENCES reservation   (id) ON DELETE CASCADE,
    inquiry_id     uuid        REFERENCES sales_inquiry (id) ON DELETE CASCADE,

    property_id    uuid        NOT NULL REFERENCES property  (id) ON DELETE RESTRICT,
    room_type_id   uuid        NOT NULL REFERENCES room_type (id) ON DELETE RESTRICT,
    date           date        NOT NULL,      -- one row per night
    quantity       int         NOT NULL,
    status         hold_status NOT NULL DEFAULT 'ACTIVE',

    created_by     uuid        REFERENCES app_user (id) ON DELETE SET NULL,  -- NULL = system
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    released_at    timestamptz,
    release_reason text,

    CONSTRAINT hold_qty_pos CHECK (quantity >= 1),

    -- Exactly one owner reference — XOR
    CONSTRAINT hold_exactly_one_owner CHECK (
        (reservation_id IS NOT NULL) <> (inquiry_id IS NOT NULL)
    ),

    CONSTRAINT hold_expiry_after_creation CHECK (expires_at > created_at),

    CONSTRAINT hold_released_has_timestamp CHECK (
        status = 'ACTIVE' OR released_at IS NOT NULL
    ),

    CONSTRAINT hold_unique UNIQUE (hold_type, reservation_id, inquiry_id, room_type_id, date)
);

COMMENT ON TABLE inventory_hold IS
    'Time-bounded claim on inventory. expires_at is MANDATORY — no hold can permanently consume availability.';
COMMENT ON COLUMN inventory_hold.expires_at IS
    'NOT NULL at creation, always. Duration comes from system_setting; NO value is hard-coded (config B1/B2).';
COMMENT ON COLUMN inventory_hold.inquiry_id IS
    'An inquiry holds no inventory itself. THIS HOLD carries the stay parameters, and always expires.';

-- Expiry sweep (doc 55 §5.1)
CREATE INDEX hold_expiry_sweep_idx ON inventory_hold (expires_at) WHERE status = 'ACTIVE';

-- Availability derivation — the defensive query excludes holds past expires_at
-- even before the sweep runs (doc 55 §3.5)
CREATE INDEX hold_availability_idx ON inventory_hold (room_type_id, date) WHERE status = 'ACTIVE';

CREATE INDEX hold_reservation_idx ON inventory_hold (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX hold_inquiry_idx     ON inventory_hold (inquiry_id)     WHERE inquiry_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Active-hold demand per room type per date, EXCLUDING expired holds even if
-- the sweep has not yet run. A stalled sweep therefore degrades into slightly
-- generous availability which the under-lock re-check still catches — never
-- phantom holds blocking real inventory (doc 55 §3.5).
-- ---------------------------------------------------------------------------
CREATE VIEW v_active_hold_demand AS
SELECT room_type_id,
       date,
       sum(quantity)::int AS held_quantity
FROM inventory_hold
WHERE status = 'ACTIVE'
  AND expires_at > now()
GROUP BY room_type_id, date;

COMMENT ON VIEW v_active_hold_demand IS
    'Defensive: excludes holds past expires_at regardless of sweep lag.';
