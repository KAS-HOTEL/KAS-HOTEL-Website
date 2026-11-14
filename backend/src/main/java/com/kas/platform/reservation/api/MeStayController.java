package com.kas.platform.reservation.api;

import com.kas.platform.identity.UserRole;
import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.reservation.CustomerCancellationService;
import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.security.CurrentActor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Customer reservation history. Results are restricted to the signed-in account. */
@RestController
@RequestMapping("/api/v1/me/stays")
@PreAuthorize("isAuthenticated()")
public class MeStayController {

    private final JdbcClient jdbc;
    private final CustomerCancellationService cancellations;
    private final BookingNotificationService notifications;
    private final com.kas.platform.reservation.CheckoutRequestService checkouts;
    private final com.kas.platform.reservation.CancellationNotifier cancellationEmails;

    public MeStayController(JdbcClient jdbc, CustomerCancellationService cancellations,
                            BookingNotificationService notifications,
                            com.kas.platform.reservation.CheckoutRequestService checkouts,
                            com.kas.platform.reservation.CancellationNotifier cancellationEmails) {
        this.jdbc = jdbc;
        this.cancellations = cancellations;
        this.notifications = notifications;
        this.checkouts = checkouts;
        this.cancellationEmails = cancellationEmails;
    }

    /**
     * What cancelling now would mean — free-cancellation deadline, policy, fee, amount paid and
     * the refund — decided by the backend and shown before the guest confirms. Changes nothing.
     */
    @GetMapping("/{reference}/cancel/preview")
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_CANCEL + "')")
    public CustomerCancellationService.CancellationTerms previewCancellation(@PathVariable String reference) {
        return cancellations.preview(reference, requireCustomerActor());
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_VIEW + "')")
    public List<Stay> list(@RequestParam(defaultValue = "vi") String locale) {
        var actor = CurrentActor.require().actor();
        if (!actor.roles().contains(UserRole.CUSTOMER)) {
            throw new AccessDeniedException("A customer account is required.");
        }

        cancellations.expireDueRequests();
        UUID userId = actor.userId();
        return jdbc.sql("""
                        SELECT r.reference, p.slug AS property_slug, pt.name AS property_name,
                               r.check_in, r.check_out, r.sales_status::text AS sales_status,
                               r.stay_status::text AS stay_status, r.currency,
                               r.total_minor, r.subtotal_minor, r.created_at, r.adults, r.children,
                               r.guest_name, r.guest_email::text, r.special_requests, r.payment_verified_at,
                               r.checkout_requested_at, r.checkout_request_source,
                               p.check_in_time, p.check_out_time,
                               rl.rooms, rl.room_names,
                               cr.id AS cancellation_request_id,
                               cr.status::text AS cancellation_request_status,
                               cr.fee_amount_minor, cr.fee_currency, cr.fee_note,
                               cr.refund_due_minor, cr.refund_amount_minor,
                               r.payment_due_at,
                               EXISTS (SELECT 1 FROM payment pm
                                        WHERE pm.reservation_id = r.id AND pm.status = 'VERIFIED') AS has_verified_payment,
                               EXISTS (SELECT 1 FROM reservation_email_action_token tk
                                        WHERE tk.reservation_id = r.id AND tk.action = 'GUEST_MARK_PAID'
                                          AND tk.used_at IS NOT NULL) AS transfer_reported,
                               (SELECT h.reason FROM reservation_status_history h
                                 WHERE h.reservation_id = r.id AND h.field = 'SALES' AND h.to_status = r.sales_status::text
                                 ORDER BY h.created_at DESC, h.id DESC LIMIT 1) AS sales_status_reason
                          FROM reservation r
                          JOIN customer c ON c.id = r.customer_id
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN LATERAL (
                               SELECT sum(l.quantity)::int AS rooms,
                                      string_agg(l.room_type_name_snapshot || ' × ' || l.quantity, ', ' ORDER BY l.id) AS room_names
                                 FROM reservation_line l WHERE l.reservation_id=r.id
                          ) rl ON true
                          LEFT JOIN property_translation pt
                                 ON pt.property_id = p.id AND pt.locale = :locale
                          LEFT JOIN LATERAL (
                               SELECT id, status, fee_amount_minor, fee_currency, fee_note, refund_due_minor, refund_amount_minor
                                 FROM reservation_cancellation_request
                                WHERE reservation_id = r.id
                                ORDER BY created_at DESC, id DESC LIMIT 1
                          ) cr ON true
                         WHERE c.user_id = :userId AND c.merged_into_id IS NULL
                         ORDER BY r.created_at DESC, r.id DESC
                        """)
                .param("locale", locale)
                .param("userId", userId)
                .query((rs, row) -> new Stay(
                        rs.getString("reference"),
                        rs.getString("property_slug"),
                        rs.getString("property_name"),
                        rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class),
                        rs.getString("sales_status"),
                        rs.getString("stay_status"),
                        rs.getString("currency"),
                        (Long) rs.getObject("total_minor"),
                        rs.getObject("created_at", java.time.OffsetDateTime.class),
                        rs.getObject("cancellation_request_id", UUID.class),
                        rs.getString("cancellation_request_status"),
                        (Long) rs.getObject("fee_amount_minor"), rs.getString("fee_currency"),
                        rs.getString("fee_note"), rs.getInt("adults"), rs.getInt("children"),
                        rs.getInt("rooms"), rs.getString("room_names"),
                        java.time.temporal.ChronoUnit.DAYS.between(rs.getObject("check_in", LocalDate.class), rs.getObject("check_out", LocalDate.class)),
                        rs.getObject("check_in_time", java.time.LocalTime.class), rs.getObject("check_out_time", java.time.LocalTime.class),
                        rs.getString("guest_name"), rs.getString("guest_email"), rs.getString("special_requests"),
                        (Long) rs.getObject("subtotal_minor"), rs.getObject("payment_verified_at", java.time.OffsetDateTime.class),
                        rs.getObject("checkout_requested_at", java.time.OffsetDateTime.class), rs.getString("checkout_request_source"),
                        (Long) rs.getObject("refund_due_minor"), (Long) rs.getObject("refund_amount_minor"),
                        paymentStatus(rs.getString("sales_status"),
                                rs.getObject("payment_verified_at") != null || rs.getBoolean("has_verified_payment"),
                                rs.getBoolean("transfer_reported"), (Long) rs.getObject("refund_amount_minor")),
                        rs.getObject("payment_due_at", java.time.OffsetDateTime.class),
                        rs.getString("sales_status_reason")))
                .list();
    }

    /**
     * Payment state, kept apart from the booking state (2026-11-12): a paid booking never
     * reads "awaiting payment". PAID once a payment is verified (SePay IPN or the hotel),
     * PENDING when the guest reported a transfer the hotel has not checked yet, UNPAID while
     * payment is due, REFUNDED once a refund is recorded, NONE when no payment step was
     * reached (under review, declined, expired before paying).
     */
    static String paymentStatus(String salesStatus, boolean paid, boolean transferReported, Long refundAmountMinor) {
        if (refundAmountMinor != null && refundAmountMinor > 0) return "REFUNDED";
        if (paid) return "PAID";
        if ("PAYMENT_PENDING".equals(salesStatus)) return transferReported ? "PENDING" : "UNPAID";
        return "NONE";
    }

    @PostMapping("/{reference}/cancel")
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_CANCEL + "')")
    @org.springframework.transaction.annotation.Transactional
    public CustomerCancellationService.CancellationResult requestCancellation(
            @PathVariable String reference,
            @RequestBody(required = false) CancellationRequestBody body) {
        // expectedFeeMinor: the fee the guest was shown; a changed fee is refused, not charged.
        var result = cancellations.request(reference, requireCustomerActor(),
                body == null ? null : body.expectedFeeMinor());
        cancellationEmails.after(result, false);
        return result;
    }

    public record CancellationRequestBody(Long expectedFeeMinor) { }

    /**
     * The guest presses "Trả phòng" (V59). SUPER_ADMIN confirms the check-out, which is what counts
     * towards the membership tier. Only a checked-in stay of the caller; asking again is not an error.
     */
    @PostMapping("/{reference}/check-out-request")
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_CHECKOUT + "')")
    public com.kas.platform.reservation.CheckoutRequestService.Requested requestCheckOut(@PathVariable String reference) {
        return checkouts.request(reference, requireCustomerActor().userId());
    }

    @PostMapping("/{reference}/cancel/decision")
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_CANCEL + "')")
    @org.springframework.transaction.annotation.Transactional
    public CustomerCancellationService.CancellationResult decideCancellation(
            @PathVariable String reference, @RequestBody CancellationDecision decision) {
        var result = cancellations.decide(reference, decision.accept(), requireCustomerActor());
        cancellationEmails.after(result, false);
        return result;
    }

    private ResolvedActor requireCustomerActor() {
        ResolvedActor actor = CurrentActor.require().actor();
        if (!actor.roles().contains(UserRole.CUSTOMER)) {
            throw new AccessDeniedException("A customer account is required.");
        }
        return actor;
    }

    public record Stay(String reference, String propertySlug, String propertyName,
                       LocalDate checkIn, LocalDate checkOut, String salesStatus,
                       String stayStatus, String currency, Long totalMinor,
                       java.time.OffsetDateTime createdAt, UUID cancellationRequestId,
                       String cancellationRequestStatus, Long cancellationFeeMinor,
                       String cancellationFeeCurrency, String cancellationFeeNote,
                       int adults, int children, int rooms, String roomName, long nights,
                       java.time.LocalTime checkInTime, java.time.LocalTime checkOutTime,
                       String guestName, String guestEmail, String specialRequests, Long subtotalMinor,
                       java.time.OffsetDateTime paymentVerifiedAt,
                       java.time.OffsetDateTime checkoutRequestedAt, String checkoutRequestSource,
                       /** Refund KAS owes / has recorded for a cancelled, paid stay (2026-11-10). */
                       Long refundDueMinor, Long refundAmountMinor,
                       /** NONE, UNPAID, PENDING, PAID or REFUNDED — see {@link #paymentStatus} (2026-11-12). */
                       String paymentStatus,
                       /** When payment is due (V66); null when no deadline applies. */
                       java.time.OffsetDateTime paymentDueAt,
                       /** Why the booking reached its current sales status, e.g. SLA_EXPIRED, PAYMENT_DEADLINE. */
                       String salesStatusReason) { }
    public record CancellationDecision(boolean accept) { }
}
