package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Frees voucher uses held by bookings that ended unpaid or whose hold ran out (V65). */
@Component
@ConditionalOnProperty(name = "kas.vouchers.hold-sweep.enabled", havingValue = "true", matchIfMissing = true)
class VoucherHoldSweeper {
    private static final Logger log = LoggerFactory.getLogger(VoucherHoldSweeper.class);
    private final VoucherHoldService holds;

    VoucherHoldSweeper(VoucherHoldService holds) {
        this.holds = holds;
    }

    @Scheduled(fixedDelayString = "${kas.vouchers.hold-sweep.interval:PT5M}")
    void sweep() {
        try {
            int closed = holds.sweep();
            if (closed > 0) log.info("voucher holds closed: {}", closed);
        } catch (RuntimeException e) {
            log.error("voucher hold sweep failed; the next run will retry", e);
        }
    }
}
