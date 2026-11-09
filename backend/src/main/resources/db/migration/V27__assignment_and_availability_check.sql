-- =============================================================================
-- V27 — Assignment history and the availability-check record
-- Source: 54-phase-4-state-machines.md §4 S2/S3/S4, 52-phase-4-domain-model.md
--         §3.13, 29-*.md §73, 21-*.md §585, 14-booking-state-machine.md §168,
--         131-phase-7-5f-step-16a-8-owner-decision-sheet.md §7.2 and §7.4
-- =============================================================================
-- Two tables, both required by an explicit owner ruling (Step 16A.9):
--
--   Decision 5 — assignment history gets a DEDICATED table. Assignment is a
--   separate auditable event from reservation status history, reassignment
--   WITHOUT a status change must be supported, and free-form notes are not a
--   history. reservation_status_history cannot carry it: it records WHICH
--   lifecycle moved and to what value, and an S2 reassignment moves no status.
--
--   Decision 6 — S3's live availability re-check gets a DEDICATED record.
--   Doc 54 S3 requires the re-check be "recorded WITH RESULT". No storage of
--   any kind existed; a status-history note was explicitly refused.
--
-- Nothing else changes. No existing table, constraint, index or view is
-- touched, and V1–V26 are untouched.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The verdict of one availability check.
-- -----------------------------------------------------------------------------
-- Two values, because the check answers exactly one question: could every line
-- of this reservation be satisfied under lock, at this instant. Anything finer
-- (which line, by how much) is evidence and lives in the detail document.
CREATE TYPE availability_check_outcome AS ENUM ('AVAILABLE', 'UNAVAILABLE');


-- -----------------------------------------------------------------------------
-- reservation_assignment — who owned this request, from when, and who moved it
-- -----------------------------------------------------------------------------
-- Doc 29 §73 names the four facts a reassignment must preserve: "who, when, by
-- whom, why". They are to_owner_id, created_at, actor_id and reason. from_owner_id
-- is the fifth, required by the owner ruling: "history must preserve old owner
-- and new owner".
--
-- The CURRENT owner remains reservation.sales_owner_id (V12:38). This table is
-- the log, never the source of truth for who owns the request now — one place
-- to read, one place to append.
CREATE TABLE reservation_assignment (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    reservation_id uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,

    -- Property scope, denormalised deliberately. Every scoped read in this
    -- codebase joins reservation → property → partner; carrying property_id
    -- lets the ownership predicate apply to THIS row without a second hop, and
    -- it is immutable for the life of a reservation.
    property_id    uuid        NOT NULL REFERENCES property (id) ON DELETE RESTRICT,

    -- NULL on the first assignment — there was no previous owner. Not "unknown".
    from_owner_id  uuid        REFERENCES app_user (id) ON DELETE RESTRICT,
    to_owner_id    uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,

    -- Who performed the assignment, which is NOT necessarily the new owner:
    -- S4's implicit self-assignment makes them the same, an explicit S2 need not.
    -- SET NULL matches reservation_status_history.actor_id and audit_log.actor_id:
    -- the actor is an attribute of the event, not its subject.
    actor_id       uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    actor_type     actor_type  NOT NULL,

    reason         text,
    created_at     timestamptz NOT NULL DEFAULT now(),

    -- An assignment that changes nothing is not an event. Without this, a
    -- double-submit would append a second row saying the owner moved from X to
    -- X, and the history would record work that never happened.
    CONSTRAINT assignment_owner_changed CHECK (from_owner_id IS DISTINCT FROM to_owner_id)
);

COMMENT ON TABLE reservation_assignment IS
    'Append-only log of S2/S4 sales-owner assignments. The CURRENT owner is reservation.sales_owner_id; this is its history. Reassignment without a status change is recorded here and nowhere else.';
COMMENT ON COLUMN reservation_assignment.from_owner_id IS
    'NULL means this was the first assignment, not that the previous owner is unknown.';
COMMENT ON COLUMN reservation_assignment.to_owner_id IS
    'ON DELETE RESTRICT: the owner ruling requires the history preserve both owners, so a user who has ever owned a request cannot be deleted out from under it.';

-- The only read this table has: the assignment trail of one reservation,
-- newest first.
CREATE INDEX reservation_assignment_reservation_idx
    ON reservation_assignment (reservation_id, created_at DESC);

-- Answers "what is this agent carrying" without scanning.
CREATE INDEX reservation_assignment_owner_idx
    ON reservation_assignment (to_owner_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- reservation_availability_check — S3's live re-check, recorded with its result
-- -----------------------------------------------------------------------------
-- Doc 54 S3's side effect is "Live availability re-check recorded with result",
-- and S4's side effects are "S2 + S3". The outcome is an enum so the verdict is
-- queryable; the per-line evidence is jsonb, the same shape and the same
-- storage decision as reservation.price_snapshot.
--
-- The outcome column carries both values because the check itself can reach
-- either. What is DURABLE is a different question: a refused check rolls back
-- together with the transition it would have authorised, because the owner
-- ruling requires "rollback on refusal" and this codebase has exactly one
-- transaction boundary. So UNAVAILABLE is reachable in a transaction that then
-- fails; it is not written by a transaction that succeeds.
CREATE TABLE reservation_availability_check (
    id             uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),

    reservation_id uuid                       NOT NULL
                                              REFERENCES reservation (id) ON DELETE CASCADE,
    property_id    uuid                       NOT NULL
                                              REFERENCES property (id) ON DELETE RESTRICT,

    checked_at     timestamptz                NOT NULL DEFAULT now(),

    actor_id       uuid                       REFERENCES app_user (id) ON DELETE SET NULL,
    actor_type     actor_type                 NOT NULL,

    outcome        availability_check_outcome NOT NULL,

    -- One object per reservation line: roomTypeId, roomTypeName, quantity
    -- requested, lowest available across the stay, and whether that line was
    -- satisfied. Written from the values the check actually read under lock —
    -- never recomputed afterwards.
    detail         jsonb                      NOT NULL,

    CONSTRAINT availability_check_detail_is_array CHECK (jsonb_typeof(detail) = 'array')
);

COMMENT ON TABLE reservation_availability_check IS
    'S3/S4 live availability re-check, recorded with its result. Both AVAILABLE and UNAVAILABLE outcomes are kept — a refusal is the record of why a request could not advance.';
COMMENT ON COLUMN reservation_availability_check.detail IS
    'Per-line evidence read under lock: room type, quantity requested, lowest available across the stay, satisfied. Never recomputed after the fact.';

CREATE INDEX reservation_availability_check_reservation_idx
    ON reservation_availability_check (reservation_id, checked_at DESC);
