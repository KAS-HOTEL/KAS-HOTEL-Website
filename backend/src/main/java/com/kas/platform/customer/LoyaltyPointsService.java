package com.kas.platform.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * KAS points on bookings (owner policy, offers.html#member; owner request 2026-11-10).
 *
 * <ul>
 *   <li><b>Use</b>: a booking request {@link #hold holds} the points (cashback_hold, reserved on
 *       the account under a row lock, so the balance can never be spent twice); the payment
 *       being verified {@link #consume consumes} them — one REDEEM ledger entry per booking
 *       (idempotency key {@code REDEEM:<reservation>}), so a repeated SePay IPN changes nothing.
 *       A booking that ends unpaid gets its hold released by {@link #sweep}.</li>
 *   <li><b>Return</b>: a paid booking that is cancelled gets its spent points back as a
 *       REVERSAL credit of that REDEEM (once, {@code REVERSAL:REDEEM:<reservation>}); the expiry
 *       job counts the reversal, so the points keep their original expiry (FIFO lots).</li>
 *   <li><b>Earn</b>: after the stay is checked out and the booking paid, the member earns the
 *       tier rate snapshotted at booking on the room amount actually paid (after voucher, member
 *       discount and points; never taxes), rounded down — {@code EARN:<reservation>}, once. A
 *       check-out undone reverses it.</li>
 * </ul>
 * The ledger is append-only (V33 trigger); balances move only with a ledger row.
 */
@Service
public class LoyaltyPointsService {

    private static final Logger log = LoggerFactory.getLogger(LoyaltyPointsService.class);
    private final JdbcClient jdbc;

    public LoyaltyPointsService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Reserves {@code points} of the member's balance for this booking; false when they no longer have them. */
    @Transactional
    public boolean hold(UUID customerId, UUID reservationId, long points, OffsetDateTime expiresAt) {
        if (points <= 0) return true;
        ensureAccount(customerId);
        int reserved = jdbc.sql("""
                UPDATE cashback_account SET reserved_points = reserved_points + :p, version = version + 1, updated_at = now()
                 WHERE customer_id = :c AND balance_points - reserved_points >= :p
                """).param("p", points).param("c", customerId).update();
        if (reserved == 0) return false;
        jdbc.sql("""
                INSERT INTO cashback_hold (customer_id, reservation_id, points_amount, expires_at)
                VALUES (:c, :r, :p, :e)
                """).param("c", customerId).param("r", reservationId).param("p", points).param("e", expiresAt).update();
        return true;
    }

    /**
     * The booking was paid: spend the points it holds. Idempotent. When the hold had lapsed (the
     * guest still paid the reduced price) the points are taken from the balance if it has them.
     */
    @Transactional
    public void consume(UUID reservationId) {
        var snap = jdbc.sql("""
                SELECT r.customer_id, s.cashback_redeemed_points
                  FROM reservation r JOIN reservation_loyalty_snapshot s ON s.reservation_id = r.id
                 WHERE r.id = :id AND r.customer_id IS NOT NULL AND s.cashback_redeemed_points > 0
                """).param("id", reservationId)
                .query((rs, n) -> new Object[] {rs.getObject(1, UUID.class), rs.getLong(2)}).optional().orElse(null);
        if (snap == null) return;
        UUID customerId = (UUID) snap[0];
        long points = (Long) snap[1];
        lockAccount(customerId);
        String key = "REDEEM:" + reservationId;
        if (exists(key)) return;
        boolean held = jdbc.sql("""
                UPDATE cashback_hold SET status = 'CONSUMED', updated_at = now()
                 WHERE reservation_id = :r AND status = 'ACTIVE'
                """).param("r", reservationId).update() > 0;
        int moved = jdbc.sql("""
                UPDATE cashback_account
                   SET balance_points = balance_points - :p,
                       reserved_points = reserved_points - CASE WHEN :held THEN :p ELSE 0 END,
                       version = version + 1, updated_at = now()
                 WHERE customer_id = :c
                   AND balance_points - CASE WHEN :held THEN 0 ELSE reserved_points END >= :p
                """).param("p", points).param("held", held).param("c", customerId).update();
        if (moved == 0) {
            log.warn("points for a paid booking could not be taken: balance too low reservation={}", reservationId);
            return;
        }
        jdbc.sql("""
                INSERT INTO cashback_ledger (customer_id, reservation_id, entry_type, direction, points_amount,
                                             idempotency_key, reason)
                VALUES (:c, :r, 'REDEEM', 'DEBIT', :p, :key, 'KAS points used on a paid booking')
                """).param("c", customerId).param("r", reservationId).param("p", points).param("key", key).update();
    }

    /**
     * The booking ended unpaid (V66: payment deadline): its held points are free again at once
     * rather than at the next sweep. A consumed hold (paid booking) is untouched. Idempotent.
     */
    @Transactional
    public void release(UUID reservationId) {
        for (var hold : jdbc.sql("""
                SELECT id, customer_id, points_amount FROM cashback_hold
                 WHERE reservation_id = :r AND status = 'ACTIVE'
                 FOR UPDATE
                """).param("r", reservationId)
                .query((rs, n) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getLong(3)})
                .list()) {
            lockAccount((UUID) hold[1]);
            jdbc.sql("UPDATE cashback_hold SET status = 'RELEASED', updated_at = now() WHERE id = :id")
                    .param("id", hold[0]).update();
            jdbc.sql("""
                    UPDATE cashback_account SET reserved_points = GREATEST(0, reserved_points - :p),
                           version = version + 1, updated_at = now()
                     WHERE customer_id = :c
                    """).param("p", hold[2]).param("c", hold[1]).update();
        }
    }

    /**
     * Releases holds of bookings that ended unpaid or ran out, and gives back the points of paid
     * bookings that were cancelled. Safe to repeat and to run from several instances.
     */
    @Transactional
    public int sweep() {
        int changed = 0;
        for (var hold : jdbc.sql("""
                SELECT h.id, h.customer_id, h.points_amount, h.expires_at <= now() AS expired
                  FROM cashback_hold h JOIN reservation r ON r.id = h.reservation_id
                 WHERE h.status = 'ACTIVE'
                   AND (h.expires_at <= now()
                        OR ((r.sales_status IN ('CANCELLED','DECLINED','EXPIRED','ALTERNATIVE_OFFERED') OR r.stay_status = 'CANCELLED')
                            AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED')))
                 FOR UPDATE OF h SKIP LOCKED
                """).query((rs, n) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getLong(3), rs.getBoolean(4)}).list()) {
            lockAccount((UUID) hold[1]);
            jdbc.sql("UPDATE cashback_hold SET status = CAST(:s AS cashback_hold_status), updated_at = now() WHERE id = :id")
                    .param("s", (Boolean) hold[3] ? "EXPIRED" : "RELEASED").param("id", hold[0]).update();
            jdbc.sql("""
                    UPDATE cashback_account SET reserved_points = GREATEST(0, reserved_points - :p),
                           version = version + 1, updated_at = now()
                     WHERE customer_id = :c
                    """).param("p", hold[2]).param("c", hold[1]).update();
            changed++;
        }
        for (var redeem : jdbc.sql("""
                SELECT l.id, l.customer_id, l.reservation_id, l.points_amount
                  FROM cashback_ledger l JOIN reservation r ON r.id = l.reservation_id
                 WHERE l.entry_type = 'REDEEM' AND (r.sales_status = 'CANCELLED' OR r.stay_status = 'CANCELLED')
                   AND NOT EXISTS (SELECT 1 FROM cashback_ledger x WHERE x.idempotency_key = 'REVERSAL:REDEEM:' || l.reservation_id)
                """).query((rs, n) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getObject(3, UUID.class), rs.getLong(4)}).list()) {
            changed += reverse((UUID) redeem[1], (UUID) redeem[2], (UUID) redeem[0], (Long) redeem[3], "CREDIT",
                    "REVERSAL:REDEEM:" + redeem[2], "Points returned: paid booking cancelled") ? 1 : 0;
        }
        return changed;
    }

    /**
     * Points for a checked-out, paid booking by a member at booking. Idempotent; nothing for a
     * guest, an unpaid booking or a 0% tier.
     *
     * @return points earned now (0 when none or already earned)
     */
    @Transactional
    public long earnForCheckout(UUID reservationId) {
        var row = jdbc.sql("""
                SELECT r.customer_id, s.tier_id, s.cashback_rate_percent_snapshot,
                       r.subtotal_minor - r.discount_minor - s.member_discount_minor - s.cashback_redeemed_points AS eligible,
                       cp.id AS program_id
                  FROM reservation r
                  JOIN reservation_loyalty_snapshot s ON s.reservation_id = r.id AND s.member_eligible_at_booking
                  JOIN cashback_program cp ON cp.membership_tier_id = s.tier_id AND cp.status = 'ACTIVE'
                 WHERE r.id = :id AND r.customer_id IS NOT NULL AND r.stay_status IN ('CHECKED_OUT', 'COMPLETED')
                   AND EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id AND p.status = 'VERIFIED')
                """).param("id", reservationId)
                .query((rs, n) -> new Object[] {rs.getObject("customer_id", UUID.class),
                        rs.getBigDecimal("cashback_rate_percent_snapshot"), rs.getLong("eligible"),
                        rs.getObject("program_id", UUID.class)})
                .optional().orElse(null);
        if (row == null || row[1] == null) return 0;
        BigDecimal rate = (BigDecimal) row[1];
        long eligible = Math.max(0, (Long) row[2]);
        long points = BigDecimal.valueOf(eligible).multiply(rate).divide(BigDecimal.valueOf(100), 0, RoundingMode.DOWN).longValue();
        if (points <= 0) return 0;
        UUID customerId = (UUID) row[0];
        ensureAccount(customerId);
        lockAccount(customerId);
        String key = "EARN:" + reservationId;
        if (exists(key)) return 0;
        jdbc.sql("""
                INSERT INTO cashback_ledger (customer_id, program_id, reservation_id, entry_type, direction, points_amount,
                                             eligible_amount_minor, earn_rate_percent_snapshot, idempotency_key, reason)
                VALUES (:c, :prog, :r, 'EARN', 'CREDIT', :p, :eligible, :rate, :key, 'Points earned on a completed stay')
                """).param("c", customerId).param("prog", row[3]).param("r", reservationId).param("p", points)
                .param("eligible", eligible).param("rate", rate).param("key", key).update();
        jdbc.sql("UPDATE cashback_account SET balance_points = balance_points + :p, version = version + 1, updated_at = now() WHERE customer_id = :c")
                .param("p", points).param("c", customerId).update();
        return points;
    }

    /** Staff undid the check-out: take back the points it earned, if the balance still holds them. */
    @Transactional
    public void reverseEarn(UUID reservationId) {
        var earn = jdbc.sql("""
                SELECT id, customer_id, points_amount FROM cashback_ledger
                 WHERE idempotency_key = :key
                """).param("key", "EARN:" + reservationId)
                .query((rs, n) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getLong(3)})
                .optional().orElse(null);
        if (earn == null) return;
        reverse((UUID) earn[1], reservationId, (UUID) earn[0], (Long) earn[2], "DEBIT",
                "REVERSAL:EARN:" + reservationId, "Points taken back: check-out undone");
    }

    private boolean reverse(UUID customerId, UUID reservationId, UUID sourceId, long points, String direction,
                            String key, String reason) {
        lockAccount(customerId);
        if (exists(key)) return false;
        if ("DEBIT".equals(direction)) {
            int moved = jdbc.sql("""
                    UPDATE cashback_account SET balance_points = balance_points - :p, version = version + 1, updated_at = now()
                     WHERE customer_id = :c AND balance_points - reserved_points >= :p
                    """).param("p", points).param("c", customerId).update();
            if (moved == 0) {
                log.warn("points could not be taken back: balance too low reservation={}", reservationId);
                return false;
            }
        } else {
            jdbc.sql("UPDATE cashback_account SET balance_points = balance_points + :p, version = version + 1, updated_at = now() WHERE customer_id = :c")
                    .param("p", points).param("c", customerId).update();
        }
        jdbc.sql("""
                INSERT INTO cashback_ledger (customer_id, reservation_id, entry_type, direction, points_amount,
                                             source_entry_id, idempotency_key, reason)
                VALUES (:c, :r, 'REVERSAL', CAST(:dir AS cashback_direction), :p, :src, :key, :reason)
                """).param("c", customerId).param("r", reservationId).param("dir", direction).param("p", points)
                .param("src", sourceId).param("key", key).param("reason", reason).update();
        return true;
    }

    private void ensureAccount(UUID customerId) {
        jdbc.sql("INSERT INTO cashback_account (customer_id) VALUES (:c) ON CONFLICT (customer_id) DO NOTHING")
                .param("c", customerId).update();
    }

    private void lockAccount(UUID customerId) {
        jdbc.sql("SELECT customer_id FROM cashback_account WHERE customer_id = :c FOR UPDATE")
                .param("c", customerId).query(UUID.class).optional();
    }

    private boolean exists(String key) {
        return jdbc.sql("SELECT count(*) FROM cashback_ledger WHERE idempotency_key = :k")
                .param("k", key).query(Long.class).single() > 0;
    }
}
