package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 10 minutes, files the check-out request for checked-in stays whose hotel check-out time
 * has passed (owner decision 2026-11-09; V59). SUPER_ADMIN still confirms each check-out.
 * On by default; {@code kas.membership.jobs.enabled=false} turns it off (tests, extra instances).
 */
@Component
@ConditionalOnProperty(name = "kas.membership.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class CheckoutRequestJobs {

    private static final Logger log = LoggerFactory.getLogger(CheckoutRequestJobs.class);

    private final CheckoutRequestService checkouts;

    public CheckoutRequestJobs(CheckoutRequestService checkouts) {
        this.checkouts = checkouts;
    }

    @Scheduled(fixedDelayString = "PT10M", initialDelayString = "PT1M")
    public void requestOverdueCheckouts() {
        int filed = checkouts.requestOverdue();
        if (filed > 0) log.info("automatic check-out requests filed={}", filed);
    }
}
