package com.kas.platform.pricing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The order offers.html#member states: voucher, member discount on what is left, VAT on the
 * rooms after both, then KAS points (1 point = 1 VND) against the room part only.
 */
class StayAdjustmentComputeTest {

    private static final List<StayAdjustmentService.TaxRule> VAT_8 =
            List.of(new StayAdjustmentService.TaxRule("VAT", "ROOM_SUBTOTAL", BigDecimal.valueOf(8), false));

    private static StayAdjustmentService.MemberPricing member(long available) {
        return new StayAdjustmentService.MemberPricing(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "GOLD",
                UUID.randomUUID(), BigDecimal.valueOf(10), BigDecimal.valueOf(2), available, true, 1, BigDecimal.valueOf(50));
    }

    private static StayAdjustmentService.VoucherCheck voucher10(long subtotal) {
        var v = new StayAdjustmentService.Voucher(UUID.randomUUID(), "KAS-TEN", "Ten", null, "PERCENTAGE",
                BigDecimal.TEN, null, null, "VND", null, null, null, null, null, null, List.of(), List.of(),
                null, 0, "ACTIVE", 0);
        return new StayAdjustmentService.VoucherCheck(v, null, StayAdjustmentService.discount(v, subtotal));
    }

    @Test
    @DisplayName("guest: rooms + VAT 8%")
    void guest() {
        var a = StayAdjustmentService.compute(4_600_000, null, null, 0, VAT_8);
        assertThat(a.taxMinor()).isEqualTo(368_000);
        assertThat(a.totalMinor()).isEqualTo(4_968_000);
        assertThat(a.memberDiscountMinor()).isZero();
    }

    @Test
    @DisplayName("member: 10% off the rooms after the voucher, VAT on the rest")
    void memberAfterVoucher() {
        var a = StayAdjustmentService.compute(4_600_000, voucher10(4_600_000), member(0), 0, VAT_8);
        assertThat(a.discountMinor()).isEqualTo(460_000);          // voucher
        assertThat(a.memberDiscountMinor()).isEqualTo(414_000);    // 10% of 4,140,000
        assertThat(a.netMinor()).isEqualTo(3_726_000);
        assertThat(a.taxMinor()).isEqualTo(298_080);               // 8% of 3,726,000
        assertThat(a.totalMinor()).isEqualTo(4_024_080);
    }

    @Test
    @DisplayName("points pay the room part after the taxes are worked out; capped at 50% and the balance")
    void pointsAfterTaxes() {
        var a = StayAdjustmentService.compute(1_000_000, null, member(600_000), 450_000, VAT_8);
        assertThat(a.netMinor()).isEqualTo(900_000);
        assertThat(a.taxMinor()).as("VAT is on the rooms, not reduced by points").isEqualTo(72_000);
        assertThat(a.pointsUsed()).isEqualTo(450_000);
        assertThat(a.totalMinor()).isEqualTo(900_000 + 72_000 - 450_000);
    }

    @Test
    @DisplayName("points over 50% of the rooms after offers, over the balance, or without membership are refused")
    void pointsRefused() {
        assertThatThrownBy(() -> StayAdjustmentService.compute(1_000_000, null, member(1_000_000), 450_001, VAT_8))
                .isInstanceOfSatisfying(StayAdjustmentService.PointsRefused.class, r -> {
                    assertThat(r.reason()).isEqualTo(StayAdjustmentService.PointsReason.OVER_LIMIT);
                    assertThat(r.limit()).isEqualTo(450_000);
                });
        assertThatThrownBy(() -> StayAdjustmentService.compute(1_000_000, null, member(100), 200, VAT_8))
                .isInstanceOfSatisfying(StayAdjustmentService.PointsRefused.class,
                        r -> assertThat(r.reason()).isEqualTo(StayAdjustmentService.PointsReason.OVER_BALANCE));
        assertThatThrownBy(() -> StayAdjustmentService.compute(1_000_000, null, null, 10, VAT_8))
                .isInstanceOfSatisfying(StayAdjustmentService.PointsRefused.class,
                        r -> assertThat(r.reason()).isEqualTo(StayAdjustmentService.PointsReason.NOT_A_MEMBER));
    }
}
