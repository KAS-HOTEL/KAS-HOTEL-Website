package com.kas.platform.integration.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import java.util.Map;

/** Quarterly Trip.com aggregate refresh. Restricted to platform integration managers. */
@RestController
@RequestMapping("/api/v1/admin/properties")
@PreAuthorize("hasAuthority('" + Permissions.INTEGRATION_MANAGE + "')")
public class AdminTripRatingController {
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public AdminTripRatingController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @PutMapping("/{propertyId}/trip-rating")
    @Transactional
    public RatingSnapshot update(@PathVariable UUID propertyId,
                                 @Valid @RequestBody UpdateTripRating request,
                                 HttpServletRequest httpRequest) {
        LocalDate quarter = request.quarterStart();
        if (quarter.getDayOfMonth() != 1 || !java.util.Set.of(1, 4, 7, 10).contains(quarter.getMonthValue())) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, "quarterStart must be the first day of a calendar quarter");
        }
        try {
            var source = java.net.URI.create(request.sourceUrl().trim());
            if (!java.util.Set.of("https", "http").contains(source.getScheme()) || source.getHost() == null) {
                throw new IllegalArgumentException("invalid URL");
            }
        } catch (IllegalArgumentException invalid) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, "sourceUrl must be an HTTP(S) URL");
        }
        UUID actor = CurrentActor.require().userId();
        Integer exists = jdbc.sql("SELECT 1 FROM property WHERE id = :id FOR UPDATE")
                .param("id", propertyId).query(Integer.class).optional().orElse(null);
        if (exists == null) throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Property not found");

        jdbc.sql("""
                INSERT INTO trip_com_rating_quarterly_snapshot
                    (property_id, quarter_start, rating, review_count, source_url, observed_on, updated_by)
                VALUES (:property, :quarter, :rating, :count, :url, :observed, :actor)
                ON CONFLICT (property_id, quarter_start) DO UPDATE SET
                    rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
                    source_url = EXCLUDED.source_url, observed_on = EXCLUDED.observed_on,
                    updated_by = EXCLUDED.updated_by, updated_at = now()
                """)
                .param("property", propertyId).param("quarter", quarter)
                .param("rating", request.rating()).param("count", request.reviewCount())
                .param("url", request.sourceUrl().trim()).param("observed", request.observedOn())
                .param("actor", actor).update();
        jdbc.sql("""
                UPDATE property p SET (trip_com_rating, trip_com_review_count,
                       trip_com_source_url, trip_com_observed_on) = (
                    SELECT s.rating, s.review_count, s.source_url, s.observed_on
                      FROM trip_com_rating_quarterly_snapshot s
                     WHERE s.property_id = p.id ORDER BY s.quarter_start DESC LIMIT 1
                ), updated_at = now() WHERE p.id = :property
                """)
                .param("property", propertyId).update();
        audit.record(new AuditEvent(actor, "SUPER_ADMIN", "TRIP_RATING_QUARTERLY_UPDATED", "property",
                propertyId, null, Map.of("quarterStart", quarter.toString(),
                "rating", request.rating(), "reviewCount", request.reviewCount(),
                "observedOn", request.observedOn().toString()), request.sourceUrl(),
                httpRequest.getRemoteAddr(), httpRequest.getHeader("User-Agent"),
                CorrelationId.current(), CurrentActor.requireScope().kind().name()));
        return new RatingSnapshot(propertyId, quarter, request.rating(), request.reviewCount(),
                request.sourceUrl().trim(), request.observedOn());
    }

    public record UpdateTripRating(@NotNull LocalDate quarterStart,
                                  @NotNull @DecimalMin("0.0") @DecimalMax("10.0") BigDecimal rating,
                                  @Min(0) int reviewCount,
                                  @NotBlank String sourceUrl,
                                  @NotNull LocalDate observedOn) {}
    public record RatingSnapshot(UUID propertyId, LocalDate quarterStart, BigDecimal rating,
                                 int reviewCount, String sourceUrl, LocalDate observedOn) {}
}
