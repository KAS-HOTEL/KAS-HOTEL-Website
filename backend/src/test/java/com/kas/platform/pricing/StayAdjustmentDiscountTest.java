package com.kas.platform.pricing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StayAdjustmentDiscountTest {

    private static StayAdjustmentService.Voucher voucher(String type, BigDecimal pct, Long amount) {
        return new StayAdjustmentService.Voucher(null, "KAS-TEST", "Test", null, type, pct, amount,
                "VALUE_ADD".equals(type) ? "Welcome drink" : null, "VND", null, null, null, null, null, null,
                List.of(), List.of(), null, 0, "ACTIVE", 0, null, null, "ALL", List.of());
    }

    @Test
    @DisplayName("percentage voucher rounds half-up on the room amount")
    void percentage() {
        assertThat(StayAdjustmentService.discount(voucher("PERCENTAGE", new BigDecimal("10"), null), 4_600_000))
                .isEqualTo(460_000);
        assertThat(StayAdjustmentService.discount(voucher("PERCENTAGE", new BigDecimal("12.5"), null), 1_000_005))
                .isEqualTo(125_001);
    }

    @Test
    @DisplayName("fixed voucher never takes more than the room amount; a gift takes nothing off")
    void fixedAndGift() {
        assertThat(StayAdjustmentService.discount(voucher("FIXED_AMOUNT", null, 200_000L), 4_600_000)).isEqualTo(200_000);
        assertThat(StayAdjustmentService.discount(voucher("FIXED_AMOUNT", null, 900_000L), 500_000)).isEqualTo(500_000);
        assertThat(StayAdjustmentService.discount(voucher("VALUE_ADD", null, null), 500_000)).isZero();
    }
}
