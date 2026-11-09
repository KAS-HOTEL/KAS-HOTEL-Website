package com.kas.platform.inventory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the expiry sweep on the cadence doc 55 §5.1 froze: <em>"every 5
 * minutes"</em>.
 *
 * <h2>The number is the contract's, not a guess</h2>
 *
 * {@code PT5M} is the default because doc 55 §5.1 opens its pseudocode with
 * those exact words. It is exposed as a property so an operator can slow it for
 * a maintenance window and so tests can disable it — <strong>not</strong> so a
 * different cadence can be chosen casually. Changing it changes how long an
 * abandoned request keeps inventory out of sale.
 *
 * <h2>Thin on purpose</h2>
 *
 * The method holds no business logic and no transaction. Everything that decides
 * anything lives in {@link HoldExpiryService}, which is directly callable and
 * therefore directly testable without a clock.
 *
 * <h2>Enabled by default, off in tests</h2>
 *
 * A background job that mutates inventory would make every other integration
 * test non-deterministic, so the test profile turns it off and drives
 * {@link HoldExpiryService} directly instead. Production has no such setting and
 * gets the default.
 *
 * <h2>More than one instance</h2>
 *
 * Two schedulers running this concurrently is safe rather than merely tolerated:
 * doc 55 §5.1's idempotence is enforced by the {@code status = 'ACTIVE'}
 * predicate on every statement plus the inventory row locks, so the second
 * worker finds nothing to do. No lock table, leader election or advisory lock is
 * introduced, because the frozen design does not need one.
 */
@Deprecated // Retired: stock is managed manually outside the website.
public class HoldExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(HoldExpiryScheduler.class);

    private final HoldExpiryService expiry;

    public HoldExpiryScheduler(HoldExpiryService expiry) {
        this.expiry = expiry;
    }

    /**
     * {@code fixedDelay}, not {@code fixedRate}: the gap is measured from the end
     * of one pass, so a slow sweep cannot have a second one queued on top of it.
     */
    public void sweep() {
        try {
            int swept = expiry.sweep();
            if (swept > 0) {
                log.info("hold expiry sweep released {} reservation(s)", swept);
            }
        } catch (RuntimeException failure) {
            // A thrown exception would silently stop the schedule for the life of
            // the process. The next tick must still run: an expiry that is late
            // holds inventory out of sale, and one that never runs again holds it
            // out forever.
            log.error("hold expiry sweep failed; the next tick will retry", failure);
        }
    }
}
