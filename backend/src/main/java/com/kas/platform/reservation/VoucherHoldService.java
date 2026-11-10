package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The life of one voucher use (V65, owner request 2026-11-10).
 *
 * <ul>
 *   <li>{@link #hold}: a booking request reserves one use. Counted against the voucher's total
 *       and per-guest limits under a row lock on the voucher, so concurrent requests cannot
 *       overrun them; {@code used_count} does not move.</li>
 *   <li>{@link #consume}: the payment was verified — the hold becomes the redemption and
 *       {@code used_count} goes up exactly once (one redemption per booking, unique index), so a
 *       repeated SePay IPN or a retried confirmation changes nothing.</li>
 *   <li>{@link #release} / {@link #sweep}: the booking ended unpaid (expired by its payment
 *       deadline, cancelled, declined) — the use is free again. Since V66 a hold lives with its
 *       booking; 12:00 on the check-out day is only the backstop expiry.</li>
 * </ul>
 * A paid booking cancelled later keeps its redemption: the use is not given back.
 */
@Service
public class VoucherHoldService {

    private final JdbcClient jdbc;

    public VoucherHoldService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Reserves one use for this booking; false when the voucher is used up (in total or by this guest). */
    @Transactional
    public boolean hold(UUID voucherId, UUID reservationId, UUID customerId, long discountMinor,
                        OffsetDateTime expiresAt) {
        var limits = jdbc.sql("""
                SELECT usage_limit_total, usage_limit_per_customer, used_count
                  FROM voucher WHERE id = :id AND status = 'ACTIVE' FOR UPDATE
                """).param("id", voucherId)
                .query((rs, n) -> new Integer[] {(Integer) rs.getObject(1), (Integer) rs.getObject(2), rs.getInt(3)})
                .optional().orElse(null);
        if (limits == null) return false;
        long activeHolds = jdbc.sql("""
                SELECT count(*) FROM voucher_hold WHERE voucher_id = :id AND status = 'ACTIVE' AND expires_at > now()
                """).param("id", voucherId).query(Long.class).single();
        if (limits[0] != null && limits[2] + activeHolds >= limits[0]) return false;
        if (limits[1] != null && customerId != null) {
            long mine = jdbc.sql("""
                    SELECT (SELECT count(*) FROM voucher_redemption WHERE voucher_id = :id AND customer_id = :c)
                         + (SELECT count(*) FROM voucher_hold WHERE voucher_id = :id AND customer_id = :c
                                                              AND status = 'ACTIVE' AND expires_at > now())
                    """).param("id", voucherId).param("c", customerId).query(Long.class).single();
            if (mine >= limits[1]) return false;
        }
        jdbc.sql("""
                INSERT INTO voucher_hold (voucher_id, reservation_id, customer_id, discount_minor, expires_at)
                VALUES (:voucherId, :reservationId, :customerId, :discount, :expiresAt)
                """).param("voucherId", voucherId).param("reservationId", reservationId)
                .param("customerId", customerId).param("discount", discountMinor).param("expiresAt", expiresAt).update();
        return true;
    }

    /**
     * The booking's payment was verified. Records the redemption from the booking's own voucher
     * and discount (the guest paid that price, so it counts even if the hold had lapsed) and
     * bumps {@code used_count} only when the redemption is new.
     *
     * @return true when a redemption was recorded now
     */
    @Transactional
    public boolean consume(UUID reservationId) {
        var row = jdbc.sql("""
                SELECT voucher_id, customer_id, discount_minor FROM reservation
                 WHERE id = :id AND voucher_id IS NOT NULL
                """).param("id", reservationId)
                .query((rs, n) -> new Object[] {rs.getObject("voucher_id", UUID.class),
                        rs.getObject("customer_id", UUID.class), rs.getLong("discount_minor")})
                .optional().orElse(null);
        if (row == null) return false;
        UUID voucherId = (UUID) row[0];
        // Same lock order as hold(): voucher first.
        jdbc.sql("SELECT id FROM voucher WHERE id = :id FOR UPDATE").param("id", voucherId).query(UUID.class).optional();
        int inserted = jdbc.sql("""
                INSERT INTO voucher_redemption (voucher_id, reservation_id, customer_id, discount_minor)
                VALUES (:voucherId, :reservationId, :customerId, :discount)
                ON CONFLICT DO NOTHING
                """).param("voucherId", voucherId).param("reservationId", reservationId)
                .param("customerId", row[1]).param("discount", row[2]).update();
        if (inserted == 1) {
            jdbc.sql("UPDATE voucher SET used_count = used_count + 1, updated_at = now() WHERE id = :id")
                    .param("id", voucherId).update();
        }
        jdbc.sql("""
                UPDATE voucher_hold SET status = 'CONSUMED', closed_at = now(), close_reason = 'PAID'
                 WHERE reservation_id = :id AND status <> 'CONSUMED'
                """).param("id", reservationId).update();
        return inserted == 1;
    }

    /** The booking ended unpaid: give the use back. A consumed hold (paid) is never released. */
    @Transactional
    public void release(UUID reservationId, String reason) {
        jdbc.sql("""
                UPDATE voucher_hold SET status = 'RELEASED', closed_at = now(), close_reason = :reason
                 WHERE reservation_id = :id AND status = 'ACTIVE'
                """).param("id", reservationId).param("reason", reason).update();
    }

    /**
     * Releases the holds of bookings that ended unpaid and expires the ones past their time.
     * Safe to run at any moment and from any number of instances.
     */
    @Transactional
    public int sweep() {
        int released = jdbc.sql("""
                UPDATE voucher_hold h SET status = 'RELEASED', closed_at = now(), close_reason = 'BOOKING_ENDED_UNPAID'
                  FROM reservation r
                 WHERE r.id = h.reservation_id AND h.status = 'ACTIVE'
                   AND (r.sales_status IN ('CANCELLED', 'DECLINED', 'EXPIRED', 'ALTERNATIVE_OFFERED')
                        OR r.stay_status = 'CANCELLED')
                   AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED')
                """).update();
        int expired = jdbc.sql("""
                UPDATE voucher_hold SET status = 'EXPIRED', closed_at = now(), close_reason = 'HOLD_EXPIRED'
                 WHERE status = 'ACTIVE' AND expires_at <= now()
                """).update();
        return released + expired;
    }
}
