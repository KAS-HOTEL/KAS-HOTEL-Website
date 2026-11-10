package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Layer 1 of the payment deadline (V66, owner 2026-11-10): a booking still waiting for payment
 * after its {@code payment_due_at} expires.
 *
 * <p>Skipped, deliberately:
 * <ul>
 *   <li>a booking whose guest already reported a bank transfer (used "I have made the
 *       transfer" link) — the money may be in the account; the hotel checks it first;</li>
 *   <li>a booking with a VERIFIED payment (cannot be PAYMENT_PENDING anyway, belt and braces);</li>
 *   <li>bookings approved before V66 ({@code payment_due_at} NULL) — they were never given a
 *       deadline, so none is enforced on them.</li>
 * </ul>
 * Expiring releases the voucher use and the KAS points at once, retires the booking's email
 * links and emails the guest and the hotel. SePay checkouts still open for it are cancelled
 * by {@link SePayCheckoutCanceller} (layer 2); money arriving afterwards is layer 3.
 */
@Service
public class PaymentDeadlineService {

    static final String REASON = "PAYMENT_DEADLINE";
    private static final int BATCH = 200;

    private final JdbcClient jdbc;
    private final VoucherHoldService voucherHolds;
    private final com.kas.platform.customer.LoyaltyPointsService loyaltyPoints;
    private final BookingNotificationService notifications;

    public PaymentDeadlineService(JdbcClient jdbc, VoucherHoldService voucherHolds,
                                  com.kas.platform.customer.LoyaltyPointsService loyaltyPoints,
                                  BookingNotificationService notifications) {
        this.jdbc = jdbc;
        this.voucherHolds = voucherHolds;
        this.loyaltyPoints = loyaltyPoints;
        this.notifications = notifications;
    }

    @Transactional
    public List<String> expireOverdue() {
        List<Due> due = jdbc.sql("""
                        SELECT r.id, r.reference, r.payment_due_at, p.email::text AS property_email,
                               COALESCE(t.name, p.slug) AS property_name
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
                         WHERE r.sales_status = 'PAYMENT_PENDING'
                           AND r.payment_due_at IS NOT NULL
                           AND r.payment_due_at <= now()
                           AND NOT EXISTS (SELECT 1 FROM reservation_email_action_token tk
                                            WHERE tk.reservation_id = r.id AND tk.action = 'GUEST_MARK_PAID'
                                              AND tk.used_at IS NOT NULL)
                           AND NOT EXISTS (SELECT 1 FROM payment pm
                                            WHERE pm.reservation_id = r.id AND pm.status = 'VERIFIED')
                         ORDER BY r.payment_due_at
                         LIMIT :batch
                           FOR UPDATE OF r SKIP LOCKED
                        """)
                .param("batch", BATCH)
                .query((rs, n) -> new Due(rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getObject("payment_due_at", OffsetDateTime.class), rs.getString("property_email"),
                        rs.getString("property_name")))
                .list();

        List<String> expired = new ArrayList<>();
        for (Due row : due) {
            int changed = jdbc.sql("""
                            UPDATE reservation SET sales_status = 'EXPIRED', updated_at = now()
                             WHERE id = :id AND sales_status = 'PAYMENT_PENDING'
                            """).param("id", row.id()).update();
            if (changed != 1) continue;
            jdbc.sql("""
                            INSERT INTO reservation_status_history (reservation_id, field, from_status, to_status,
                                                                    actor_id, actor_type, reason, note, created_at)
                            VALUES (:id, 'SALES', 'PAYMENT_PENDING', 'EXPIRED', NULL, 'SYSTEM', :reason, :note, clock_timestamp())
                            """)
                    .param("id", row.id()).param("reason", REASON)
                    .param("note", "Quá hạn thanh toán lúc " + PaymentDeadline.format(row.dueAt(), true)
                            + "; hệ thống tự chuyển sang quá hạn và trả lại voucher/điểm.")
                    .update();
            jdbc.sql("""
                            UPDATE reservation_email_action_token SET invalidated_at = now()
                             WHERE reservation_id = :id AND used_at IS NULL AND invalidated_at IS NULL
                            """).param("id", row.id()).update();
            voucherHolds.release(row.id(), "BOOKING_ENDED_UNPAID");
            loyaltyPoints.release(row.id());
            notifications.paymentDeadlinePassed(row.reference(), row.dueAt(), row.propertyEmail(), row.propertyName());
            expired.add(row.reference());
        }
        return expired;
    }

    private record Due(UUID id, String reference, OffsetDateTime dueAt, String propertyEmail, String propertyName) { }
}
