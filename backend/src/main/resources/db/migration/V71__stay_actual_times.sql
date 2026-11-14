-- Actual check-in / check-out times of a stay (owner 2026-11-14).
--
-- Rules this supports (StayTransitionService, StayAutoTransitionService):
--   * check-out only after check-in;
--   * a checked-in stay nobody checks out is checked out automatically at the hotel's
--     check-out time + 2 hours;
--   * a confirmed stay never checked in by the hotel's check-out time becomes NO_SHOW at
--     once (no refund), and only the "complete the stay" form, with the real check-in and
--     check-out times, turns it back into a finished stay.
-- The columns hold when the guest really arrived and left: now() for the console buttons,
-- the scheduled time + 2 h for the automatic check-out, the typed times for the form.
ALTER TABLE reservation
    ADD COLUMN checked_in_at  timestamptz,
    ADD COLUMN checked_out_at timestamptz,
    ADD CONSTRAINT reservation_stay_times_order_chk
        CHECK (checked_in_at IS NULL OR checked_out_at IS NULL OR checked_out_at > checked_in_at);

COMMENT ON COLUMN reservation.checked_in_at IS
    'When the guest actually checked in (console button, or the time typed in the complete-the-stay form).';
COMMENT ON COLUMN reservation.checked_out_at IS
    'When the guest actually checked out (console button, automatic check-out at check-out time + 2 h, or the form).';
