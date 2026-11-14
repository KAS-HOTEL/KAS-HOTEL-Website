package com.kas.platform.review.api;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Moderation controls for first-party reviews; review text is never editable. */
@RestController
@RequestMapping("/api/v1/admin/reviews")
@PreAuthorize("hasAuthority('" + Permissions.REVIEW_MODERATE + "')")
public class AdminGuestReviewController {
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public AdminGuestReviewController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping
    public List<ReviewRow> list(@RequestParam(required = false) String hotelKey,
                                @RequestParam(defaultValue = "false") boolean includeHidden,
                                @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "50") int size) {
        return jdbc.sql("""
                SELECT r.id, p.frontend_key, r.overall, r.title, r.body, r.language,
                       r.stay_month, r.status::text AS status, r.hidden_at, r.deleted_at, r.published_at,
                       COALESCE((SELECT pt.name FROM property_translation pt WHERE pt.property_id = p.id
                                  ORDER BY (pt.locale = 'vi') DESC, pt.locale LIMIT 1), p.slug) AS hotel_name,
                       res.reference AS booking_reference, res.guest_name,
                       c.full_name AS customer_name, c.customer_code, r.created_at
                  FROM review r JOIN property p ON p.id = r.property_id
                  JOIN reservation res ON res.id = r.reservation_id
                  JOIN customer c ON c.id = r.customer_id
                 WHERE (CAST(:hotelKey AS text) IS NULL OR p.frontend_key = :hotelKey)
                   AND (:includeHidden OR (r.hidden_at IS NULL AND r.deleted_at IS NULL))
                 ORDER BY r.created_at DESC, r.id DESC LIMIT :limit OFFSET :offset
                """)
                .param("hotelKey", hotelKey == null || hotelKey.isBlank() ? null : hotelKey.trim())
                .param("includeHidden", includeHidden)
                .param("limit", Math.clamp(size, 1, 100))
                .param("offset", (long) Math.max(0, page) * Math.clamp(size, 1, 100))
                .query((rs, row) -> new ReviewRow(rs.getObject("id", UUID.class),
                        rs.getString("frontend_key"), rs.getInt("overall"), rs.getString("title"),
                        rs.getString("body"), rs.getString("language"),
                        rs.getObject("stay_month", java.time.LocalDate.class), rs.getString("status"),
                        instant(rs, "hidden_at"), instant(rs, "deleted_at"), instant(rs, "published_at"),
                        rs.getString("hotel_name"), rs.getString("booking_reference"), rs.getString("customer_name"),
                        rs.getString("customer_code"), rs.getString("guest_name"), instant(rs, "created_at")))
                .list();
    }

    @PatchMapping("/{reviewId}/moderation")
    @Transactional
    public ReviewRow moderate(@PathVariable UUID reviewId,
                              @Valid @RequestBody ModerationRequest request,
                              HttpServletRequest httpRequest) {
        String action = request.action().trim().toUpperCase(java.util.Locale.ROOT);
        if (!List.of("APPROVE", "REJECT", "HIDE", "SHOW", "DELETE").contains(action)) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "action must be APPROVE, REJECT, HIDE, SHOW, or DELETE");
        }
        var actor = CurrentActor.require();
        if (action.equals("DELETE") && !actor.permissions().contains(Permissions.REVIEW_DELETE)) {
            throw new org.springframework.security.access.AccessDeniedException("review.delete is required");
        }
        ReviewRow before = get(reviewId, true);
        if (before.deletedAt() != null) throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Review has been deleted");
        if ((action.equals("HIDE") || action.equals("SHOW")) && !"APPROVED".equals(before.status())) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.ILLEGAL_TRANSITION,
                    "Only approved reviews can be hidden or shown");
        }
        if ((action.equals("APPROVE") || action.equals("REJECT")) && !"PENDING".equals(before.status())) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.ILLEGAL_TRANSITION,
                    "Only pending reviews can be approved or rejected");
        }
        if (action.equals("REJECT") && !List.of("ABUSIVE", "OFF_TOPIC", "PERSONAL_DATA", "SPAM", "NOT_ABOUT_STAY").contains(request.reason())) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, "Choose a supported rejection reason");
        }
        switch (action) {
            case "APPROVE" -> jdbc.sql("UPDATE review SET status = 'APPROVED', moderated_by = :actor, moderated_at = now(), published_at = now(), updated_at = now() WHERE id = :id")
                    .param("actor", actor.userId()).param("id", reviewId).update();
            case "REJECT" -> jdbc.sql("UPDATE review SET status = 'REJECTED', rejection_reason = :reason, moderated_by = :actor, moderated_at = now(), updated_at = now() WHERE id = :id")
                    .param("reason", request.reason()).param("actor", actor.userId()).param("id", reviewId).update();
            case "HIDE" -> jdbc.sql("UPDATE review SET hidden_at = now(), updated_at = now() WHERE id = :id")
                    .param("id", reviewId).update();
            case "SHOW" -> jdbc.sql("UPDATE review SET hidden_at = NULL, updated_at = now() WHERE id = :id")
                    .param("id", reviewId).update();
            case "DELETE" -> jdbc.sql("""
                    UPDATE review SET deleted_at = now(), deleted_by = :actor,
                           deletion_reason = :reason, updated_at = now() WHERE id = :id
                    """).param("actor", actor.userId()).param("reason", request.reason().trim())
                    .param("id", reviewId).update();
            default -> throw new IllegalStateException("Unreachable review action");
        }
        jdbc.sql("""
                INSERT INTO review_moderation_event (review_id, actor_id, action, reason)
                VALUES (:review, :actor, :action, :reason)
                """).param("review", reviewId).param("actor", actor.userId())
                .param("action", action).param("reason", request.reason().trim()).update();
        ReviewRow after = get(reviewId, true);
        audit.record(new AuditEvent(actor.userId(), actor.permissions().contains(Permissions.CUSTOMER_VIEW)
                ? "SUPER_ADMIN" : "ADMIN", "REVIEW_" + action, "review", reviewId,
                Map.of("status", before.status(), "hidden", before.hiddenAt() != null,
                        "deleted", before.deletedAt() != null),
                Map.of("status", after.status(), "hidden", after.hiddenAt() != null,
                        "deleted", after.deletedAt() != null), request.reason().trim(),
                httpRequest.getRemoteAddr(), httpRequest.getHeader("User-Agent"),
                CorrelationId.current(), actor.scope().kind().name()));
        return after;
    }

    private ReviewRow get(UUID id, boolean includeDeleted) {
        return jdbc.sql("""
                SELECT r.id, p.frontend_key, r.overall, r.title, r.body, r.language,
                       r.stay_month, r.status::text AS status, r.hidden_at, r.deleted_at, r.published_at,
                       COALESCE((SELECT pt.name FROM property_translation pt WHERE pt.property_id = p.id
                                  ORDER BY (pt.locale = 'vi') DESC, pt.locale LIMIT 1), p.slug) AS hotel_name,
                       res.reference AS booking_reference, res.guest_name,
                       c.full_name AS customer_name, c.customer_code, r.created_at
                  FROM review r JOIN property p ON p.id = r.property_id
                  JOIN reservation res ON res.id = r.reservation_id
                  JOIN customer c ON c.id = r.customer_id
                 WHERE r.id = :id AND (:includeDeleted OR r.deleted_at IS NULL) FOR UPDATE OF r
                """)
                .param("id", id).param("includeDeleted", includeDeleted)
                .query((rs, row) -> new ReviewRow(rs.getObject("id", UUID.class),
                        rs.getString("frontend_key"), rs.getInt("overall"), rs.getString("title"),
                        rs.getString("body"), rs.getString("language"),
                        rs.getObject("stay_month", java.time.LocalDate.class), rs.getString("status"),
                        instant(rs, "hidden_at"), instant(rs, "deleted_at"), instant(rs, "published_at"),
                        rs.getString("hotel_name"), rs.getString("booking_reference"), rs.getString("customer_name"),
                        rs.getString("customer_code"), rs.getString("guest_name"), instant(rs, "created_at")))
                .optional().orElseThrow(() -> new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Review not found"));
    }

    private static java.time.Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    public record ModerationRequest(@NotBlank String action, @NotBlank @Size(max = 500) String reason) {}
    public record ReviewRow(UUID id, String hotelKey, int rating, String title, String body,
                            String language, java.time.LocalDate stayMonth, String status,
                            java.time.Instant hiddenAt, java.time.Instant deletedAt,
                            java.time.Instant publishedAt,
                            /** Tracing (owner, 2026-11-14): the hotel, booking and customer a review belongs to. */
                            String hotelName, String bookingReference, String customerName,
                            String customerCode, String guestName, java.time.Instant submittedAt) {}
}
