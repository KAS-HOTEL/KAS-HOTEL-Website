package com.kas.platform.reservation;

import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Check-out requests (owner decisions 2026-11-09; V59). The guest presses "Trả phòng" in My KAS,
 * or the system files the request for them once the hotel's check-out time has passed; SUPER_ADMIN
 * then confirms with the ordinary check-out, which is what counts towards the membership tier.
 * SUPER_ADMIN may still check out a stay directly without any request.
 */
@Service
public class CheckoutRequestService {

    private final JdbcClient jdbc;

    public CheckoutRequestService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Requested(String reference, OffsetDateTime requestedAt, String source) { }

    /** The signed-in guest asks to check out of their own stay. Asking twice is not an error. */
    @Transactional
    public Requested request(String reference, UUID userId) {
        var row = jdbc.sql("""
                        SELECT r.id, r.stay_status::text AS stay_status, r.checkout_requested_at, r.checkout_request_source
                          FROM reservation r JOIN customer c ON c.id = r.customer_id
                         WHERE r.reference = :reference AND c.user_id = :user AND c.merged_into_id IS NULL
                         FOR UPDATE OF r
                        """)
                .param("reference", reference).param("user", userId)
                .query((rs, n) -> new Object[] {rs.getObject("id", UUID.class), rs.getString("stay_status"),
                        rs.getObject("checkout_requested_at", OffsetDateTime.class), rs.getString("checkout_request_source")})
                .optional()
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        if (row[2] != null) {
            return new Requested(reference, (OffsetDateTime) row[2], (String) row[3]);
        }
        if (!"CHECKED_IN".equals(row[1])) {
            throw ConflictException.illegalTransition("stayStatus", String.valueOf(row[1]), "CHECK_OUT_REQUESTED");
        }
        OffsetDateTime at = jdbc.sql("""
                        UPDATE reservation SET checkout_requested_at = now(), checkout_request_source = 'GUEST'
                         WHERE id = :id RETURNING checkout_requested_at
                        """)
                .param("id", row[0]).query(OffsetDateTime.class).single();
        jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_id, actor_type, reason, note, created_at)
                        VALUES (:id, 'STAY', 'CHECKED_IN', 'CHECKED_IN', :user, 'CUSTOMER', 'CHECK_OUT_REQUESTED',
                                'The guest asked to check out; awaiting confirmation.', clock_timestamp())
                        """)
                .param("id", row[0]).param("user", userId).update();
        return new Requested(reference, at, "GUEST");
    }

    /**
     * Files the request for every checked-in stay whose check-out time (the hotel's, 12:00 when
     * unset) has passed on the check-out date, Vietnam time. Returns how many were filed.
     */
    @Transactional
    public int requestOverdue() {
        return jdbc.sql("""
                        WITH filed AS (
                            UPDATE reservation r
                               SET checkout_requested_at = now(), checkout_request_source = 'AUTO'
                              FROM property p
                             WHERE p.id = r.property_id
                               AND r.stay_status = 'CHECKED_IN'
                               AND r.checkout_requested_at IS NULL
                               AND (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                                   >= (r.check_out + coalesce(p.check_out_time, TIME '12:00'))
                            RETURNING r.id)
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_type, reason, note, created_at)
                        SELECT id, 'STAY', 'CHECKED_IN', 'CHECKED_IN', 'SYSTEM', 'CHECK_OUT_REQUESTED',
                               'Check-out time passed; requested automatically, awaiting confirmation.', clock_timestamp()
                          FROM filed
                        """)
                .update();
    }

    public record Pending(String reference, String propertySlug, String propertyName, String guestName,
                          java.time.LocalDate checkIn, java.time.LocalDate checkOut,
                          OffsetDateTime requestedAt, String source) { }

    /** Checked-in stays waiting for SUPER_ADMIN to confirm the check-out, oldest request first. */
    public java.util.List<Pending> pending(com.kas.platform.shared.scope.AuthorizationScope scope, String locale) {
        var filter = com.kas.platform.shared.scope.ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        java.util.List<Object> params = new java.util.ArrayList<>();
        params.add(locale);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        SELECT r.reference, p.slug, coalesce(pt.name, p.slug) AS property_name, r.guest_name,
                               r.check_in, r.check_out, r.checkout_requested_at, r.checkout_request_source
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = ?
                         WHERE r.stay_status = 'CHECKED_IN' AND r.checkout_requested_at IS NOT NULL AND %s
                         ORDER BY r.checkout_requested_at, r.reference
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new Pending(rs.getString("reference"), rs.getString("slug"),
                        rs.getString("property_name"), rs.getString("guest_name"),
                        rs.getObject("check_in", java.time.LocalDate.class), rs.getObject("check_out", java.time.LocalDate.class),
                        rs.getObject("checkout_requested_at", OffsetDateTime.class), rs.getString("checkout_request_source")))
                .list();
    }
}
