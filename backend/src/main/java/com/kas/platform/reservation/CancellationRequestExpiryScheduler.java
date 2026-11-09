package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Closes pending cancellation requests and fee quotes at their check-in deadline. */
@Component
// On by default; set false on extra instances or a QA backend that shares the database.
@ConditionalOnProperty(name = "kas.cancellations.expiry-sweep.enabled", havingValue = "true", matchIfMissing = true)
public class CancellationRequestExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(CancellationRequestExpiryScheduler.class);
    private final CustomerCancellationService cancellations;

    public CancellationRequestExpiryScheduler(CustomerCancellationService cancellations) {
        this.cancellations = cancellations;
    }

    /** Sweep every minute so the status is updated promptly at the local-noon deadline. */
    @Scheduled(fixedDelayString = "${kas.cancellations.expiry-sweep.interval:PT1M}")
    public void sweep() {
        try {
            int expired = cancellations.expireDueRequests();
            if (expired > 0) {
                log.info("cancellation request expiry sweep closed {} request(s)", expired);
            }
        } catch (RuntimeException failure) {
            log.error("cancellation request expiry sweep failed; the next tick will retry", failure);
        }
    }
}
