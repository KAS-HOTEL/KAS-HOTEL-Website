package com.kas.platform.reservation.api;

import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.security.PublicEndpoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Cancellation for a guest who booked without an account (2026-11-10).
 *
 * <p>The guest types the booking reference and the booking's email address. When they match a
 * booking that can still be cancelled, a one-time link goes to that address; the page behind it
 * shows the policy, any fee and the refund, and is where the guest confirms. The answer is the
 * same whether or not anything matched, so the form cannot be used to probe bookings, and
 * nothing changes until the link is used.
 */
@RestController
@RequestMapping("/api/v1/public/cancellations")
public class PublicCancellationController {

    private final JdbcClient jdbc;
    private final BookingNotificationService notifications;

    public PublicCancellationController(JdbcClient jdbc, BookingNotificationService notifications) {
        this.jdbc = jdbc;
        this.notifications = notifications;
    }

    @PostMapping("/link")
    @PublicEndpoint(reason = "Sends a cancellation link only to the booking's own email; same answer either way")
    @Transactional
    public ResponseEntity<Map<String, Object>> requestLink(@Valid @RequestBody LinkRequest request) {
        String reference = request.reference().trim().toUpperCase();
        boolean match = jdbc.sql("""
                SELECT count(*) FROM reservation r
                 WHERE r.reference = :ref AND r.guest_email = CAST(:email AS citext)
                   AND r.channel_type = 'DIRECT'
                   AND ((r.stay_status IS NULL AND r.sales_status IN
                          ('REQUESTED','ASSIGNED','AVAILABILITY_CHECK','CUSTOMER_CONTACTED','PAYMENT_PENDING'))
                     OR (r.sales_status = 'WON' AND r.stay_status IN ('CONFIRMED','CHECK_IN_READY')))
                """).param("ref", reference).param("email", request.email().trim())
                .query(Long.class).single() > 0;
        if (match) notifications.guestCancellationLink(reference);
        return ResponseEntity.accepted().body(Map.of("accepted", true));
    }

    public record LinkRequest(@NotBlank @Size(max = 40) String reference,
                              @NotBlank @Email @Size(max = 254) String email) { }
}
