package com.kas.platform.reservation;

import org.springframework.stereotype.Component;

/**
 * Which emails follow a cancellation step, in one place so the account page, the guest email
 * link and the console send the same ones. Called inside the step's transaction: the emails
 * are queued in the outbox and leave only if the step commits.
 */
@Component
public class CancellationNotifier {

    private final BookingNotificationService notifications;

    public CancellationNotifier(BookingNotificationService notifications) {
        this.notifications = notifications;
    }

    public void after(CustomerCancellationService.CancellationResult result, boolean viaEmailLink) {
        switch (result.status()) {
            case "CANCELLED" -> notifications.bookingCancelled(result.reference());
            case "REFUND_PENDING" -> {
                notifications.bookingCancelled(result.reference());
                notifications.refundRequested(result.reference());
            }
            case "QUOTED" -> notifications.cancellationFeeQuoted(result.reference(), result, viaEmailLink);
            case "PENDING_HOTEL_FEE" -> notifications.cancellationNeedsReview(result.reference(), result.requestId());
            default -> { /* DECLINED and repeats: nothing to send */ }
        }
    }
}
