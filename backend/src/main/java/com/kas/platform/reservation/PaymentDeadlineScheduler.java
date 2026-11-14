package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Every minute, in this order: asks SePay about open checkouts (a paid order confirms its booking
 * even when the IPN never arrived), expires bookings not paid by their deadline (V66), then
 * closes the SePay checkouts of bookings that ended. Asking SePay first means money paid just
 * before the deadline confirms the booking instead of expiring with it.
 */
@Component
@ConditionalOnProperty(name = "kas.booking.payment-deadline-sweep.enabled", havingValue = "true", matchIfMissing = true)
class PaymentDeadlineScheduler {

    private static final Logger log = LoggerFactory.getLogger(PaymentDeadlineScheduler.class);
    private final PaymentDeadlineService deadlines;
    private final SePayCheckoutCanceller sePayCheckouts;
    private final SePayPaymentPoller sePayPoller;

    PaymentDeadlineScheduler(PaymentDeadlineService deadlines, SePayCheckoutCanceller sePayCheckouts,
                             SePayPaymentPoller sePayPoller) {
        this.deadlines = deadlines;
        this.sePayCheckouts = sePayCheckouts;
        this.sePayPoller = sePayPoller;
    }

    @Scheduled(initialDelayString = "${kas.booking.payment-deadline-sweep.initial-delay:PT40S}",
            fixedDelayString = "${kas.booking.payment-deadline-sweep.interval:PT1M}")
    void sweep() {
        try {
            int paid = sePayPoller.pollOpen();
            if (paid > 0) log.info("SePay order poll processed paid orders: {}", paid);
        } catch (RuntimeException failure) {
            log.error("SePay order poll failed; the next tick will retry", failure);
        }
        try {
            List<String> expired = deadlines.expireOverdue();
            if (!expired.isEmpty()) log.info("payment deadline passed, bookings expired: {}", expired);
        } catch (RuntimeException failure) {
            log.error("payment deadline sweep failed; the next tick will retry", failure);
        }
        try {
            int closed = sePayCheckouts.cancelEnded();
            if (closed > 0) log.info("SePay checkouts closed for ended bookings: {}", closed);
        } catch (RuntimeException failure) {
            log.error("SePay checkout cancellation failed; the next tick will retry", failure);
        }
    }
}
