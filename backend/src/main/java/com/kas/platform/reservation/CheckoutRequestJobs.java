package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Every 5 minutes, for stays past the hotel's check-out time (owner decisions 2026-11-09 and
 * 2026-11-14; V59, V71):
 * <ol>
 *   <li>files the check-out request for checked-in stays (SUPER_ADMIN may confirm it);</li>
 *   <li>checks out automatically the stays still checked in 2 hours after check-out time;</li>
 *   <li>ends as NO_SHOW the paid stays nobody checked in (no refund; the "complete the stay"
 *       form is the only way back).</li>
 * </ol>
 * On by default; {@code kas.membership.jobs.enabled=false} turns it off (tests, extra instances).
 */
@Component
@ConditionalOnProperty(name = "kas.membership.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class CheckoutRequestJobs {

    private static final Logger log = LoggerFactory.getLogger(CheckoutRequestJobs.class);

    private final CheckoutRequestService checkouts;
    private final StayAutoTransitionService autoStays;

    public CheckoutRequestJobs(CheckoutRequestService checkouts, StayAutoTransitionService autoStays) {
        this.checkouts = checkouts;
        this.autoStays = autoStays;
    }

    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT1M")
    public void requestOverdueCheckouts() {
        try {
            int filed = checkouts.requestOverdue();
            if (filed > 0) log.info("automatic check-out requests filed={}", filed);
        } catch (RuntimeException failure) {
            log.error("check-out request job failed; the next tick will retry", failure);
        }
        try {
            List<String> checkedOut = autoStays.checkOutOverdue();
            if (!checkedOut.isEmpty()) log.info("stays checked out automatically (check-out time + 2h): {}", checkedOut);
        } catch (RuntimeException failure) {
            log.error("automatic check-out failed; the next tick will retry", failure);
        }
        try {
            List<String> noShows = autoStays.noShowOverdue();
            if (!noShows.isEmpty()) log.info("stays never checked in by check-out time, now NO_SHOW: {}", noShows);
        } catch (RuntimeException failure) {
            log.error("automatic no-show failed; the next tick will retry", failure);
        }
    }
}
