-- V65 — A voucher is used only when the booking is paid (owner request 2026-11-10).
--
-- Until now a booking request redeemed its voucher at once (voucher_redemption + used_count).
-- Now the request only HOLDS one use: the hold counts against the voucher's limits so two
-- requests cannot both take the last use, but used_count does not move. When the payment is
-- verified (staff, email link or SePay IPN — all through the same confirmation) the hold
-- becomes the redemption and used_count goes up exactly once. A hold is released when the
-- booking ends unpaid (cancelled, declined, expired, alternative offered) and expires at
-- 12:00 on the check-in day if nothing happened. A paid booking cancelled later keeps its
-- redemption: the use is not given back.

CREATE TABLE voucher_hold (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id      uuid        NOT NULL REFERENCES voucher (id) ON DELETE RESTRICT,
    reservation_id  uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    customer_id     uuid        REFERENCES customer (id) ON DELETE SET NULL,
    discount_minor  bigint      NOT NULL CHECK (discount_minor >= 0),
    status          text        NOT NULL DEFAULT 'ACTIVE'
                                CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,
    close_reason    text,
    CONSTRAINT voucher_hold_closed CHECK ((status = 'ACTIVE') = (closed_at IS NULL))
);

-- One hold per booking; the active ones are what limits count.
CREATE UNIQUE INDEX voucher_hold_one_per_reservation ON voucher_hold (reservation_id);
CREATE INDEX voucher_hold_active_idx ON voucher_hold (voucher_id) WHERE status = 'ACTIVE';
CREATE INDEX voucher_hold_expiry_idx ON voucher_hold (expires_at) WHERE status = 'ACTIVE';

COMMENT ON TABLE voucher_hold IS
    'A use of a voucher reserved by an unpaid booking; becomes voucher_redemption when payment is verified.';

-- Requests made before V65 redeemed at once. Any such redemption whose booking was never paid
-- is turned back into a hold (or released if the booking already ended), so the counts are right.
INSERT INTO voucher_hold (voucher_id, reservation_id, customer_id, discount_minor, status, expires_at, closed_at, close_reason)
SELECT vr.voucher_id, vr.reservation_id, vr.customer_id, vr.discount_minor,
       CASE WHEN r.sales_status IN ('CANCELLED', 'DECLINED', 'EXPIRED', 'ALTERNATIVE_OFFERED')
                 OR r.stay_status = 'CANCELLED' THEN 'RELEASED' ELSE 'ACTIVE' END,
       (r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       CASE WHEN r.sales_status IN ('CANCELLED', 'DECLINED', 'EXPIRED', 'ALTERNATIVE_OFFERED')
                 OR r.stay_status = 'CANCELLED' THEN now() END,
       CASE WHEN r.sales_status IN ('CANCELLED', 'DECLINED', 'EXPIRED', 'ALTERNATIVE_OFFERED')
                 OR r.stay_status = 'CANCELLED' THEN 'V65: booking ended unpaid' END
  FROM voucher_redemption vr
  JOIN reservation r ON r.id = vr.reservation_id
 WHERE NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = vr.reservation_id AND p.status = 'VERIFIED');

UPDATE voucher v SET used_count = GREATEST(0, v.used_count - x.n), updated_at = now()
  FROM (SELECT vr.voucher_id, count(*) AS n
          FROM voucher_redemption vr
         WHERE NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = vr.reservation_id AND p.status = 'VERIFIED')
         GROUP BY vr.voucher_id) x
 WHERE v.id = x.voucher_id;

DELETE FROM voucher_redemption vr
 WHERE NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = vr.reservation_id AND p.status = 'VERIFIED');
