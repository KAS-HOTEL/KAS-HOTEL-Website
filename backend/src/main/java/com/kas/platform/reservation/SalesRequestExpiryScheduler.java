package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Runs {@link SalesRequestExpiryService} on a timer, so a request becomes overdue
 * whether or not anyone has the admin console open.
 *
 * <p>Off in the test profile, like the other timers: a background job that moves
 * statuses would make every other integration test non-deterministic.
 * {@code SalesRequestExpiryIT} drives the service directly.
 */
@Component
@ConditionalOnProperty(name = "kas.sales.expiry-sweep.enabled", havingValue = "true", matchIfMissing = true)
public class SalesRequestExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(SalesRequestExpiryScheduler.class);
    private final SalesRequestExpiryService expiry;

    public SalesRequestExpiryScheduler(SalesRequestExpiryService expiry) {
        this.expiry = expiry;
    }

    @Scheduled(initialDelayString = "${kas.sales.expiry-sweep.initial-delay:PT30S}",
            fixedDelayString = "${kas.sales.expiry-sweep.interval:PT1M}")
    public void sweep() {
        try {
            List<String> expired = expiry.expireOverdue();
            if (!expired.isEmpty()) {
                log.info("sales request expiry sweep expired {} request(s)", expired.size());
            }
        } catch (RuntimeException failure) {
            log.error("sales request expiry sweep failed; the next tick will retry", failure);
        }
    }
}
