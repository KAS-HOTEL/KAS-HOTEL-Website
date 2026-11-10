package com.kas.platform.reservation;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Layer 3 of the payment deadline (V66): money SePay reported that could not confirm a
 * booking — it had expired or been cancelled, the amount differed, it was already paid, or
 * nothing matched. All payments land in the one KAS account (V51), so only a GLOBAL
 * (SUPER_ADMIN) actor sees and settles these; any other scope gets the not-found answer.
 *
 * <p>Settling records what was done outside KAS ({@code REFUNDED}: money sent back;
 * {@code HANDLED}: settled another way, e.g. a new booking was made for the guest) and a note.
 * Nothing here moves money or changes a booking.
 */
@Service
public class UnmatchedPaymentService {

    public record UnmatchedPayment(UUID id, OffsetDateTime receivedAt, String matchStatus, String invoiceNumber,
                                   String transactionId, String paymentMethod, Long amountMinor, String currency,
                                   String reference, String salesStatus, String guestName, String guestEmail,
                                   String propertyName, Long bookingTotalMinor, OffsetDateTime paymentDueAt,
                                   OffsetDateTime resolvedAt, String resolution, String resolutionNote,
                                   String resolvedByEmail) { }

    private final JdbcClient jdbc;

    public UnmatchedPaymentService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Open items first (oldest first), then up to 50 settled ones (newest first). */
    @Transactional(readOnly = true)
    public List<UnmatchedPayment> list(AuthorizationScope scope) {
        requireGlobal(scope);
        return jdbc.sql(SELECT + """
                 WHERE e.match_status IN ('NO_BOOKING', 'NOT_PENDING', 'AMOUNT_MISMATCH', 'ALREADY_PAID')
                   AND (e.resolved_at IS NULL OR e.id IN (
                        SELECT id FROM sepay_ipn_event
                         WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT 50))
                 ORDER BY (e.resolved_at IS NULL) DESC,
                          CASE WHEN e.resolved_at IS NULL THEN e.received_at END ASC,
                          e.resolved_at DESC
                """).query(this::row).list();
    }

    @Transactional
    public UnmatchedPayment resolve(UUID id, String resolution, String note, AuthorizationScope scope) {
        requireGlobal(scope);
        if (!List.of("REFUNDED", "HANDLED").contains(resolution)) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "Choose how the payment was settled.",
                    List.of(new KasException.ErrorDetail("resolution", "INVALID", "REFUNDED or HANDLED")));
        }
        String text = note == null ? "" : note.trim();
        if (text.isEmpty() || text.length() > 2000) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "Describe what was done.",
                    List.of(new KasException.ErrorDetail("note", "REQUIRED", "1–2000 characters")));
        }
        int changed = jdbc.sql("""
                UPDATE sepay_ipn_event
                   SET resolved_at = now(), resolved_by = :actor, resolution = :resolution, resolution_note = :note
                 WHERE id = :id AND resolved_at IS NULL
                   AND match_status IN ('NO_BOOKING', 'NOT_PENDING', 'AMOUNT_MISMATCH', 'ALREADY_PAID')
                """).param("actor", scope.actorId()).param("resolution", resolution).param("note", text)
                .param("id", id).update();
        if (changed == 0) {
            // Already settled (a repeat is a no-op) or not an unmatched payment at all.
            boolean exists = jdbc.sql("""
                    SELECT count(*) FROM sepay_ipn_event WHERE id = :id AND resolved_at IS NOT NULL
                    """).param("id", id).query(Long.class).single() > 0;
            if (!exists) throw NotFoundException.outOfScope("Payment");
        }
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query(this::row).single();
    }

    private static void requireGlobal(AuthorizationScope scope) {
        if (scope == null || scope.kind() != ScopeKind.GLOBAL) throw NotFoundException.outOfScope("Payment");
    }

    private static final String SELECT = """
            SELECT e.id, e.received_at, e.match_status, e.order_invoice_number, e.transaction_id, e.payment_method,
                   e.amount_minor, e.currency, r.reference, r.sales_status::text AS sales_status, r.guest_name,
                   r.guest_email::text AS guest_email, COALESCE(pt.name, p.slug) AS property_name,
                   r.total_minor, r.payment_due_at, e.resolved_at, e.resolution, e.resolution_note,
                   u.email::text AS resolved_by_email
              FROM sepay_ipn_event e
              LEFT JOIN reservation r ON r.id = e.reservation_id
              LEFT JOIN property p ON p.id = r.property_id
              LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
              LEFT JOIN app_user u ON u.id = e.resolved_by
            """;

    private UnmatchedPayment row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new UnmatchedPayment(rs.getObject("id", UUID.class), rs.getObject("received_at", OffsetDateTime.class),
                rs.getString("match_status"), rs.getString("order_invoice_number"), rs.getString("transaction_id"),
                rs.getString("payment_method"), (Long) rs.getObject("amount_minor"),
                rs.getString("currency") == null ? null : rs.getString("currency").trim(),
                rs.getString("reference"), rs.getString("sales_status"), rs.getString("guest_name"),
                rs.getString("guest_email"), rs.getString("property_name"), (Long) rs.getObject("total_minor"),
                rs.getObject("payment_due_at", OffsetDateTime.class), rs.getObject("resolved_at", OffsetDateTime.class),
                rs.getString("resolution"), rs.getString("resolution_note"), rs.getString("resolved_by_email"));
    }
}
