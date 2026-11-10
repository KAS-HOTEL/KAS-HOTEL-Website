package com.kas.platform.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Releases point holds of bookings that ended unpaid and returns points of paid, cancelled ones. */
@Component
@ConditionalOnProperty(name = "kas.loyalty.points-sweep.enabled", havingValue = "true", matchIfMissing = true)
class LoyaltyPointsSweeper {
    private static final Logger log = LoggerFactory.getLogger(LoyaltyPointsSweeper.class);
    private final LoyaltyPointsService points;

    LoyaltyPointsSweeper(LoyaltyPointsService points) {
        this.points = points;
    }

    @Scheduled(fixedDelayString = "${kas.loyalty.points-sweep.interval:PT5M}")
    void sweep() {
        try {
            int changed = points.sweep();
            if (changed > 0) log.info("KAS points holds/returns processed: {}", changed);
        } catch (RuntimeException e) {
            log.error("KAS points sweep failed; the next run will retry", e);
        }
    }
}
