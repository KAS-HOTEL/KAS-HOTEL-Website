-- =============================================================================
-- V59 — Membership tier review (owner decisions 2026-11-09).
--
-- A booking counts towards the tier review once when it was made on the KAS website by a
-- signed-in member, and the stay has been checked out (guest request, or automatic request
-- after the check-out time, then SUPER_ADMIN confirmation; SUPER_ADMIN may also check out
-- directly). Cancelled and no-show stays never reach CHECKED_OUT. The quarter is that of the
-- booking's check-out date (Vietnam). Gold from 15, Platinum from 30 bookings a quarter.
--
--   * membership_qualifying_booking — one row per counted booking; a reversed row (check-out
--     undone) stops counting and may lower the tier at once.
--   * membership_quarter_review — one row per member per quarter: the tier the start-of-quarter
--     review gave (base_tier_id). The tier during a quarter is never below that base.
--   * reservation.checkout_requested_at / checkout_request_source — the guest's (or the
--     automatic) check-out request that SUPER_ADMIN confirms.
--
-- Data: counts the qualifying bookings already checked out in the current quarter (owner:
-- "tính đơn trong quý này"); the application upgrades those members on start-up. The current
-- quarter is recorded as reviewed with each member's current tier, so nobody is lowered at
-- deploy; the first automatic review is at the start of the next quarter.
-- =============================================================================

ALTER TABLE reservation
    ADD COLUMN checkout_requested_at   timestamptz,
    ADD COLUMN checkout_request_source text,
    ADD CONSTRAINT reservation_checkout_request_source
        CHECK (checkout_request_source IS NULL OR checkout_request_source IN ('GUEST', 'AUTO')),
    ADD CONSTRAINT reservation_checkout_request_pair
        CHECK ((checkout_requested_at IS NULL) = (checkout_request_source IS NULL));

CREATE INDEX reservation_checkout_requested_idx
    ON reservation (checkout_requested_at)
    WHERE checkout_requested_at IS NOT NULL AND stay_status = 'CHECKED_IN';

CREATE TABLE membership_qualifying_booking (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id   uuid        NOT NULL REFERENCES customer_membership (id) ON DELETE RESTRICT,
    reservation_id  uuid        NOT NULL UNIQUE REFERENCES reservation (id) ON DELETE RESTRICT,
    quarter_start   date        NOT NULL,
    checkout_date   date        NOT NULL,
    counted_at      timestamptz NOT NULL DEFAULT now(),
    reversed_at     timestamptz,
    reversal_reason text,
    CONSTRAINT membership_qualifying_quarter_start
        CHECK (quarter_start = date_trunc('quarter', checkout_date)::date),
    CONSTRAINT membership_qualifying_reversal_pair
        CHECK ((reversed_at IS NULL) = (reversal_reason IS NULL))
);

CREATE INDEX membership_qualifying_count_idx
    ON membership_qualifying_booking (membership_id, quarter_start)
    WHERE reversed_at IS NULL;

COMMENT ON TABLE membership_qualifying_booking IS
    'Bookings counted towards the quarterly tier review: website bookings by a signed-in member, checked out. One row per booking.';

CREATE TABLE membership_quarter_review (
    membership_id         uuid        NOT NULL REFERENCES customer_membership (id) ON DELETE RESTRICT,
    quarter_start         date        NOT NULL,
    previous_tier_id      uuid        REFERENCES membership_tier (id) ON DELETE RESTRICT,
    base_tier_id          uuid        NOT NULL REFERENCES membership_tier (id) ON DELETE RESTRICT,
    previous_quarter_bookings int     NOT NULL DEFAULT 0,
    reviewed_at           timestamptz NOT NULL DEFAULT now(),
    note                  text,
    PRIMARY KEY (membership_id, quarter_start),
    CONSTRAINT membership_quarter_review_start CHECK (quarter_start = date_trunc('quarter', quarter_start)::date),
    CONSTRAINT membership_quarter_review_bookings CHECK (previous_quarter_bookings >= 0)
);

COMMENT ON TABLE membership_quarter_review IS
    'Start-of-quarter tier review, one row per member per quarter. base_tier_id is the floor of the tier during that quarter.';

-- Qualifying bookings already checked out this quarter (Vietnam date).
INSERT INTO membership_qualifying_booking (membership_id, reservation_id, quarter_start, checkout_date, counted_at)
SELECT s.customer_membership_id, r.id, date_trunc('quarter', r.check_out)::date, r.check_out, now()
  FROM reservation r
  JOIN reservation_loyalty_snapshot s ON s.reservation_id = r.id
  JOIN customer_membership cm ON cm.id = s.customer_membership_id AND cm.status = 'ACTIVE'
 WHERE r.channel_type = 'DIRECT'
   AND r.lead_source = 'WEBSITE'
   AND r.customer_id IS NOT NULL
   AND s.member_eligible_at_booking
   AND r.stay_status IN ('CHECKED_OUT', 'COMPLETED')
   AND r.check_out >= date_trunc('quarter', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
ON CONFLICT (reservation_id) DO NOTHING;

-- The current quarter counts as reviewed with every member's current tier.
INSERT INTO membership_quarter_review (membership_id, quarter_start, previous_tier_id, base_tier_id, note)
SELECT h.membership_id, date_trunc('quarter', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date, h.tier_id, h.tier_id,
       'V59: tier review introduced mid-quarter; current tier kept'
  FROM customer_membership_tier_history h
  JOIN customer_membership cm ON cm.id = h.membership_id AND cm.status = 'ACTIVE'
 WHERE h.effective_to IS NULL
ON CONFLICT DO NOTHING;
