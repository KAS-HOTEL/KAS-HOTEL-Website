package com.kas.platform.review.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

/** A signed-in guest may review their own checked-out (or completed) reservation exactly once. */
@RestController
@RequestMapping("/api/v1/me/reviews")
@PreAuthorize("hasAuthority('" + Permissions.REVIEW_CREATE + "')")
public class MeGuestReviewController {
    private final JdbcClient jdbc;

    public MeGuestReviewController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping
    @Transactional
    public CreatedReview create(@Valid @RequestBody CreateReview request) {
        UUID userId = CurrentActor.require().userId();
        Stay stay = jdbc.sql("""
                SELECT r.customer_id, r.property_id, r.stay_status, r.check_in,
                       c.user_id
                  FROM reservation r
                  JOIN customer c ON c.id = r.customer_id
                 WHERE r.id = :reservation
                """)
                .param("reservation", request.reservationId())
                .query((rs, row) -> new Stay(rs.getObject("customer_id", UUID.class),
                        rs.getObject("property_id", UUID.class), rs.getString("stay_status"),
                        rs.getObject("check_in", LocalDate.class), rs.getObject("user_id", UUID.class)))
                .optional().orElseThrow(() -> new ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Completed reservation not found"));
        if (!userId.equals(stay.userId())) {
            throw new org.springframework.security.access.AccessDeniedException("Reservation does not belong to this customer");
        }
        // Check-out ends a stay at CHECKED_OUT; COMPLETED is kept for stays that carry it (V70).
        if (!"CHECKED_OUT".equals(stay.stayStatus()) && !"COMPLETED".equals(stay.stayStatus())) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "A review can be submitted only after the stay is completed");
        }
        try {
            UUID id = jdbc.sql("""
                    INSERT INTO review (reservation_id, customer_id, property_id, overall,
                        cleanliness, service, location, room, value, title, body, language, stay_month)
                    VALUES (:reservation, :customer, :property, :overall, :cleanliness,
                        :service, :location, :room, :value, :title, :body, :language,
                        date_trunc('month', CAST(:checkIn AS date))::date)
                    RETURNING id
                    """)
                    .param("reservation", request.reservationId()).param("customer", stay.customerId())
                    .param("property", stay.propertyId()).param("overall", request.overall())
                    .param("cleanliness", request.cleanliness()).param("service", request.service())
                    .param("location", request.location()).param("room", request.room())
                    .param("value", request.value()).param("title", request.title())
                    .param("body", request.body().trim()).param("language", request.language())
                    .param("checkIn", stay.checkIn()).query(UUID.class).single();
            return new CreatedReview(id, "PENDING", "Review submitted for moderation");
        } catch (org.springframework.dao.DuplicateKeyException duplicate) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "This reservation already has a review");
        }
    }

    private record Stay(UUID customerId, UUID propertyId, String stayStatus,
                        LocalDate checkIn, UUID userId) {}

    public record CreateReview(@NotNull UUID reservationId,
                               @NotNull @Min(1) @Max(5) Integer overall,
                               @Min(1) @Max(5) Integer cleanliness,
                               @Min(1) @Max(5) Integer service,
                               @Min(1) @Max(5) Integer location,
                               @Min(1) @Max(5) Integer room,
                               @Min(1) @Max(5) Integer value,
                               @Size(max = 180) String title,
                               @NotBlank @Size(max = 5000) String body,
                               @NotNull @Pattern(regexp = "vi|en") String language) {}

    public record CreatedReview(UUID id, String status, String message) {}
}
