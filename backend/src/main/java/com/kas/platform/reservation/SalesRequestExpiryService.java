package com.kas.platform.reservation;

import com.kas.platform.shared.EmailOutboxService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Closes direct booking requests whose response deadline has passed.
 *
 * <h2>One deadline, already stored</h2>
 *
 * The deadline is {@code reservation.sla_due_at}, computed once at creation from
 * the owner setting {@code SALES_FIRST_CONTACT_SLA}. This class adds no second
 * rule: a request is overdue exactly when that stored instant is in the past. A
 * request without a deadline is never expired here.
 *
 * <h2>Which requests</h2>
 *
 * Only those the hotel has not yet answered: {@link #EXPIRABLE}. A request the
 * hotel accepted ({@code PAYMENT_PENDING}, {@code WON}), offered an alternative
 * for, contacted the guest about, declined, or that was cancelled is never
 * touched.
 *
 * <h2>Idempotent</h2>
 *
 * Rows are locked with {@code SKIP LOCKED} and each update re-checks the source
 * status, so a concurrent sweep or a staff action in the same instant cannot
 * expire a request twice or overwrite a decision. The status history row and
 * the hotel email are written only for a row this sweep actually changed, and
 * the email's outbox event key is unique per request.
 */
@Service
public class SalesRequestExpiryService {

    /** Awaiting the hotel's first response. Shared with the queue's "awaiting" view. */
    public static final Set<String> EXPIRABLE = Set.of("REQUESTED", "ASSIGNED", "AVAILABILITY_CHECK");

    static final String EXPIRED = "EXPIRED";
    static final String REASON = "SLA_EXPIRED";
    private static final int BATCH = 200;
    private static final String HOTEL_EMAIL_MISSING = "HOTEL_EMAIL_MISSING";
    private static final java.time.format.DateTimeFormatter DUE_FORMAT = java.time.format.DateTimeFormatter
            .ofPattern("HH:mm dd/MM/yyyy").withZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));

    private final JdbcClient jdbc;
    private final EmailOutboxService outbox;
    private final String operationsEmail;

    public SalesRequestExpiryService(JdbcClient jdbc, EmailOutboxService outbox,
                                     @Value("${kas.booking.operations-email:}") String operationsEmail) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.operationsEmail = operationsEmail == null ? "" : operationsEmail.trim();
    }

    /** Expires every overdue unanswered request (in batches); returns the references expired. */
    @Transactional
    public List<String> expireOverdue() {
        List<Due> due = jdbc.sql("""
                        SELECT r.id, r.reference, r.sales_status::text AS sales_status, r.guest_name,
                               r.check_in, r.check_out, r.sla_due_at, p.email::text AS property_email,
                               COALESCE(t.name, p.slug) AS property_name
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
                         WHERE r.channel_type = 'DIRECT'
                           AND r.sales_status::text IN ('REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK')
                           AND r.sla_due_at IS NOT NULL
                           AND r.sla_due_at < now()
                         ORDER BY r.sla_due_at
                         LIMIT :batch
                           FOR UPDATE OF r SKIP LOCKED
                        """)
                .param("batch", BATCH)
                .query((rs, n) -> new Due(rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getString("sales_status"), rs.getString("guest_name"),
                        String.valueOf(rs.getObject("check_in")), String.valueOf(rs.getObject("check_out")),
                        rs.getObject("sla_due_at", OffsetDateTime.class), rs.getString("property_email"),
                        rs.getString("property_name")))
                .list();

        List<String> expired = new ArrayList<>();
        for (Due row : due) {
            int changed = jdbc.sql("""
                            UPDATE reservation SET sales_status = 'EXPIRED', updated_at = now()
                             WHERE id = :id AND sales_status::text = :from
                            """)
                    .param("id", row.id()).param("from", row.status()).update();
            if (changed != 1) {
                continue;
            }
            jdbc.sql("""
                            INSERT INTO reservation_status_history (reservation_id, field, from_status, to_status,
                                                                    actor_id, actor_type, reason, note, created_at)
                            VALUES (:id, 'SALES', :from, 'EXPIRED', NULL, 'SYSTEM', :reason, :note, clock_timestamp())
                            """)
                    .param("id", row.id()).param("from", row.status()).param("reason", REASON)
                    .param("note", "Hết hạn phản hồi lúc " + DUE_FORMAT.format(row.dueAt()) + "; hệ thống tự chuyển sang quá hạn.")
                    .update();
            notifyHotel(row);
            expired.add(row.reference());
        }
        return expired;
    }

    /** The hotel's own address, then the operations mailbox — the same recipients as the request email. */
    private void notifyHotel(Due row) {
        String recipient = row.propertyEmail() != null && !row.propertyEmail().isBlank()
                ? row.propertyEmail().trim() : operationsEmail;
        String eventKey = "sales-request-expired-" + row.reference();
        if (recipient.isEmpty()) {
            outbox.recordUndeliverable(row.reference(), eventKey, HOTEL_EMAIL_MISSING);
            return;
        }
        outbox.inlineForReservation(row.reference(), eventKey, recipient, row.propertyName(),
                "Yêu cầu đặt phòng " + row.reference() + " đã quá hạn phản hồi",
                "<p>Yêu cầu <strong>" + esc(row.reference()) + "</strong> của khách " + esc(row.guestName())
                        + " (" + esc(row.checkIn()) + " – " + esc(row.checkOut()) + ") tại "
                        + esc(row.propertyName()) + " đã quá hạn phản hồi và được hệ thống chuyển sang trạng thái"
                        + " <strong>Quá hạn</strong>.</p><p>Vui lòng kiểm tra trong trang quản trị KAS.</p>");
    }

    private static String esc(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private record Due(UUID id, String reference, String status, String guestName, String checkIn,
                       String checkOut, OffsetDateTime dueAt, String propertyEmail, String propertyName) { }
}
