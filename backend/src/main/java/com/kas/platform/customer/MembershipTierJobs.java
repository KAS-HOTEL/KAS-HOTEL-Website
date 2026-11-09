package com.kas.platform.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Timed work of the membership tier review (V59):
 * <ul>
 *   <li>00:05 on the first day of each quarter (Vietnam): the start-of-quarter review;</li>
 *   <li>on start-up: the same review (catches a quarter start the server missed) and the upgrades
 *       already earned (e.g. the bookings V59 counted for the current quarter);</li>
 * </ul>
 * On by default; set {@code kas.membership.jobs.enabled=false} on extra instances or tests.
 */
@Component
@ConditionalOnProperty(name = "kas.membership.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class MembershipTierJobs {

    private static final Logger log = LoggerFactory.getLogger(MembershipTierJobs.class);

    private final MembershipTierService tiers;
    public MembershipTierJobs(MembershipTierService tiers) {
        this.tiers = tiers;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            int reviewed = tiers.reviewCurrentQuarter();
            int upgraded = tiers.upgradeAll();
            log.info("membership tier start-up: quarter review changed={} upgrades={}", reviewed, upgraded);
        } catch (RuntimeException failure) {
            // Never stop the API over this; the next run retries.
            log.error("membership tier start-up run failed", failure);
        }
    }

    @Scheduled(cron = "0 5 0 1 1,4,7,10 *", zone = "Asia/Ho_Chi_Minh")
    public void quarterReview() {
        log.info("membership quarter review changed={}", tiers.reviewCurrentQuarter());
    }

}
