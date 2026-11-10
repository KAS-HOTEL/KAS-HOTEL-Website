package com.kas.platform.reservation.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.reservation.CustomerCancellationService;
import com.kas.platform.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

/**
 * Hotel operations for responding to late cancellation requests.
 *
 * <p>Under {@code /api/v1/admin/ops} like every other operations route. It used
 * to sit at {@code /api/v1/ops/**}, which the security chain never opened, so
 * every request ended in its final {@code denyAll()} and no hotel could quote a
 * fee.
 */
@RestController
@RequestMapping("/api/v1/admin/ops/reservations/cancellation-requests")
@PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CANCEL + "')")
public class OpsCancellationController {

    private final CustomerCancellationService cancellations;
    private final com.kas.platform.reservation.CancellationNotifier cancellationEmails;
    private final com.kas.platform.reservation.BookingNotificationService notifications;
    private final org.springframework.jdbc.core.simple.JdbcClient jdbc;

    public OpsCancellationController(CustomerCancellationService cancellations,
                                     com.kas.platform.reservation.CancellationNotifier cancellationEmails,
                                     com.kas.platform.reservation.BookingNotificationService notifications,
                                     org.springframework.jdbc.core.simple.JdbcClient jdbc) {
        this.cancellations = cancellations;
        this.cancellationEmails = cancellationEmails;
        this.notifications = notifications;
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<CustomerCancellationService.PendingCancellation> pending() {
        return cancellations.pendingHotelQuotes(CurrentActor.requireScope());
    }

    /** No fee rule applied: SUPER_ADMIN quotes the fee; the guest is emailed to decide. */
    @PostMapping("/{reference}/{requestId}/fee")
    @org.springframework.transaction.annotation.Transactional
    public CustomerCancellationService.CancellationResult quoteFee(
            @PathVariable String reference, @PathVariable UUID requestId,
            @Valid @RequestBody FeeQuote quote) {
        var result = cancellations.quoteFee(reference, requestId,
                quote.feeMinor() == null ? null : quote.feeMinor().longValueExact(), quote.percentage(), quote.note(),
                CurrentActor.require().actor());
        boolean viaEmailLink = "EMAIL_LINK".equals(jdbc.sql(
                "SELECT requested_via FROM reservation_cancellation_request WHERE id = :id")
                .param("id", requestId).query(String.class).optional().orElse(null));
        cancellationEmails.after(result, viaEmailLink);
        return result;
    }

    // ------------------------------------------------------------ manual refunds (2026-11-10)

    /** Cancelled, paid bookings: waiting for a refund, and those already decided. */
    @GetMapping("/refunds")
    @PreAuthorize("hasAuthority('" + Permissions.PAYMENT_RECORD + "')")
    public List<CustomerCancellationService.PendingCancellation> refunds() {
        return cancellations.refundQueue(CurrentActor.requireScope());
    }

    /**
     * SUPER_ADMIN refunded outside KAS: the amount actually refunded, when, and the bank or
     * transfer reference. Only after this is the guest told the refund was made.
     */
    @PostMapping("/refunds/{requestId}/record")
    @PreAuthorize("hasAuthority('" + Permissions.PAYMENT_RECORD + "')")
    @org.springframework.transaction.annotation.Transactional
    public CustomerCancellationService.RefundView recordRefund(@PathVariable UUID requestId,
                                                               @Valid @RequestBody RefundRecord body) {
        var before = cancellations.refundView(requestId, CurrentActor.requireScope());
        var view = cancellations.recordRefund(requestId, body.refundAmountMinor().longValueExact(), body.refundedAt(),
                body.reference(), body.note(), CurrentActor.require().actor());
        if (!"REFUNDED".equals(before.status())) notifications.refundCompleted(view.reference(), requestId);
        return view;
    }

    /** SUPER_ADMIN cannot refund (now): the reason is stored and the guest is told. */
    @PostMapping("/refunds/{requestId}/reject")
    @PreAuthorize("hasAuthority('" + Permissions.PAYMENT_RECORD + "')")
    @org.springframework.transaction.annotation.Transactional
    public CustomerCancellationService.RefundView rejectRefund(@PathVariable UUID requestId,
                                                               @Valid @RequestBody RefundRejection body) {
        var before = cancellations.refundView(requestId, CurrentActor.requireScope());
        var view = cancellations.rejectRefund(requestId, body.reason(), CurrentActor.require().actor());
        if (!"REFUND_REJECTED".equals(before.status())) {
            notifications.refundRejected(view.reference(), requestId, body.reason().trim());
        }
        return view;
    }

    public record RefundRecord(
            @jakarta.validation.constraints.NotNull @PositiveOrZero @Digits(integer = 15, fraction = 0) BigDecimal refundAmountMinor,
            java.time.OffsetDateTime refundedAt,
            @Size(max = 200) String reference,
            @Size(max = 2000) String note) { }

    public record RefundRejection(@jakarta.validation.constraints.NotBlank @Size(max = 2000) String reason) { }

    /** Exactly one of feeMinor and percentage is required; legacy amount quotes remain valid. */
    public record FeeQuote(@PositiveOrZero @Digits(integer = 19, fraction = 0)
                           @DecimalMax("9223372036854775807") BigDecimal feeMinor, BigDecimal percentage,
                           @Size(max = 1000) String note) { }
}
