package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * The stay lifecycle when nobody presses the button (owner 2026-11-14). Check-out still needs a
 * check-in first; the hotel's check-out time is {@code property.check_out_time} (12:00 when unset),
 * in hotel time (Asia/Ho_Chi_Minh).
 *
 * <ul>
 *   <li>Checked in, not checked out: at check-out time + 2 hours the stay is checked out
 *       automatically, and counts for the membership tier and KAS points like any check-out.</li>
 *   <li>Confirmed (paid) but never checked in by the check-out time: the stay becomes NO_SHOW at
 *       once — the booking ends, nothing is refunded. Only the "complete the stay" form
 *       ({@link StayTransitionService#completeStay}) turns it back into a finished stay.</li>
 * </ul>
 * Run every few minutes by {@code CheckoutRequestJobs}.
 */
@Service
public class StayAutoTransitionService {

    static final String AUTO_CHECK_OUT = "AUTO_CHECK_OUT";
    static final String AUTO_NO_SHOW = "AUTO_NO_SHOW";
    private static final int BATCH = 200;

    private final JdbcClient jdbc;
    private final com.kas.platform.customer.MembershipTierService tiers;
    private final com.kas.platform.customer.LoyaltyPointsService loyaltyPoints;

    public StayAutoTransitionService(JdbcClient jdbc, com.kas.platform.customer.MembershipTierService tiers,
                                     com.kas.platform.customer.LoyaltyPointsService loyaltyPoints) {
        this.jdbc = jdbc;
        this.tiers = tiers;
        this.loyaltyPoints = loyaltyPoints;
    }

    /** Checks out stays still checked in 2 hours after their check-out time. Returns their references. */
    @Transactional
    public List<String> checkOutOverdue() {
        List<Row> due = jdbc.sql("""
                        SELECT r.id, r.reference
                          FROM reservation r JOIN property p ON p.id = r.property_id
                         WHERE r.stay_status = 'CHECKED_IN'
                           AND (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                               >= (r.check_out + coalesce(p.check_out_time, TIME '12:00') + interval '2 hours')
                         ORDER BY r.check_out
                         LIMIT :batch
                           FOR UPDATE OF r SKIP LOCKED
                        """)
                .param("batch", BATCH)
                .query((rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getString("reference")))
                .list();
        for (Row row : due) {
            jdbc.sql("""
                            UPDATE reservation r
                               SET stay_status = 'CHECKED_OUT',
                                   checked_out_at = ((r.check_out + coalesce(p.check_out_time, TIME '12:00') + interval '2 hours')
                                                     AT TIME ZONE 'Asia/Ho_Chi_Minh')
                              FROM property p
                             WHERE r.id = :id AND p.id = r.property_id AND r.stay_status = 'CHECKED_IN'
                            """).param("id", row.id()).update();
            history(row.id(), "CHECKED_IN", "CHECKED_OUT", AUTO_CHECK_OUT,
                    "Không ai bấm trả phòng: tự check-out lúc giờ trả phòng + 2 tiếng.");
            tiers.recordCheckout(row.id(), null);
            loyaltyPoints.earnForCheckout(row.id());
        }
        return due.stream().map(Row::reference).toList();
    }

    /**
     * Ends as NO_SHOW the paid stays nobody checked in by the hotel's check-out time. Nothing is
     * refunded (owner 2026-11-14). Returns their references.
     */
    @Transactional
    public List<String> noShowOverdue() {
        List<Row> due = jdbc.sql("""
                        SELECT r.id, r.reference, r.stay_status::text AS stay_status
                          FROM reservation r JOIN property p ON p.id = r.property_id
                         WHERE r.stay_status IN ('CONFIRMED', 'CHECK_IN_READY')
                           AND r.sales_status = 'WON'
                           AND (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                               >= (r.check_out + coalesce(p.check_out_time, TIME '12:00'))
                         ORDER BY r.check_out
                         LIMIT :batch
                           FOR UPDATE OF r SKIP LOCKED
                        """)
                .param("batch", BATCH)
                .query((rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getString("stay_status")))
                .list();
        for (Row row : due) {
            jdbc.sql("""
                            UPDATE reservation SET stay_status = 'NO_SHOW'
                             WHERE id = :id AND stay_status IN ('CONFIRMED', 'CHECK_IN_READY')
                            """).param("id", row.id()).update();
            history(row.id(), row.stayStatus(), "NO_SHOW", AUTO_NO_SHOW,
                    "Chưa check-in khi đã qua giờ trả phòng: khách không đến, đơn kết thúc, không hoàn tiền. "
                            + "Chỉ sửa lại được bằng biểu mẫu nhập giờ check-in / check-out thực tế.");
        }
        return due.stream().map(Row::reference).toList();
    }

    private void history(UUID reservationId, String from, String to, String reason, String note) {
        jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_type, reason, note, created_at)
                        VALUES (:id, 'STAY', :from, :to, 'SYSTEM', :reason, :note, clock_timestamp())
                        """)
                .param("id", reservationId).param("from", from).param("to", to)
                .param("reason", reason).param("note", note).update();
    }

    private record Row(UUID id, String reference, String stayStatus) {
        Row(UUID id, String reference) { this(id, reference, null); }
    }
}
