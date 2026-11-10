package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/** Expires bookings not paid by their deadline (V66), then closes their open SePay checkouts. */
@Component
@ConditionalOnProperty(name = "kas.booking.payment-deadline-sweep.enabled", havingValue = "true", matchIfMissing = true)
class PaymentDeadlineScheduler {

    private static final Logger log = LoggerFactory.getLogger(PaymentDeadlineScheduler.class);
    private final PaymentDeadlineService deadlines;
    private final SePayCheckoutCanceller sePayCheckouts;

    PaymentDeadlineScheduler(PaymentDeadlineService deadlines, SePayCheckoutCanceller sePayCheckouts) {
        this.deadlines = deadlines;
        this.sePayCheckouts = sePayCheckouts;
    }

    @Scheduled(initialDelayString = "${kas.booking.payment-deadline-sweep.initial-delay:PT40S}",
            fixedDelayString = "${kas.booking.payment-deadline-sweep.interval:PT1M}")
    void sweep() {
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
