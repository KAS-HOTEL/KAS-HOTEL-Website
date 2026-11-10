package com.kas.platform.security.it;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT as V62 configures it for every hotel (owner decision 2026-11-09): 8% on the room amount
 * after any voucher, rounded half-up to the dong. Tests state expected totals through this
 * rather than as bare numbers, so the rule is written once.
 */
final class Vat {
    static final BigDecimal RATE_PERCENT = BigDecimal.valueOf(8);

    private Vat() {
    }

    static long of(long roomsMinor) {
        return BigDecimal.valueOf(roomsMinor).multiply(RATE_PERCENT)
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
    }

    /** What the guest pays for this room amount: rooms + VAT. */
    static long with(long roomsMinor) {
        return roomsMinor + of(roomsMinor);
    }
}
