package com.kas.platform.reservation;

import com.kas.platform.pricing.CancellationFeeRuleService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Free-cancellation boundaries (owner rule): a member at booking until 12:00 on the check-in day,
 * any other guest until 24 hours before the hotel's check-in time — hotel time, instant excluded.
 */
class CancellationWindowTest {

    private final CustomerCancellationService service = new CustomerCancellationService(null, null, null, null, null, null);
    private static final ZoneOffset VN = ZoneOffset.ofHours(7);
    private static final LocalDate CHECK_IN = LocalDate.of(2026, 12, 10);

    private static CustomerCancellationService.StayRow stay(boolean member, LocalTime checkInTime) {
        return new CustomerCancellationService.StayRow(UUID.randomUUID(), "KAS0100001", null, UUID.randomUUID(),
                "WON", "CONFIRMED", CHECK_IN, "VND", member, checkInTime, 1_000_000L);
    }

    @Test
    @DisplayName("member: free until 12:00 on the check-in day, hotel time")
    void memberNoon() {
        var s = stay(true, LocalTime.of(14, 0));
        assertThat(service.freeUntil(s)).isEqualTo(OffsetDateTime.of(2026, 12, 10, 12, 0, 0, 0, VN));
        assertThat(OffsetDateTime.of(2026, 12, 10, 11, 59, 59, 0, VN).isBefore(service.freeUntil(s))).isTrue();
        assertThat(OffsetDateTime.of(2026, 12, 10, 12, 0, 0, 0, VN).isBefore(service.freeUntil(s))).isFalse();
    }

    @Test
    @DisplayName("guest: free until 24 hours before the hotel's check-in time")
    void guest24h() {
        var s = stay(false, LocalTime.of(14, 0));
        assertThat(service.freeUntil(s)).isEqualTo(OffsetDateTime.of(2026, 12, 9, 14, 0, 0, 0, VN));
        assertThat(OffsetDateTime.of(2026, 12, 9, 13, 59, 59, 0, VN).isBefore(service.freeUntil(s))).isTrue();
        assertThat(OffsetDateTime.of(2026, 12, 9, 14, 0, 0, 0, VN).isBefore(service.freeUntil(s))).isFalse();
    }

    @Test
    @DisplayName("an instant given in UTC is compared in hotel time")
    void utcInstant() {
        var s = stay(false, LocalTime.of(14, 0));
        // 06:59:59Z = 13:59:59 in Vietnam: still free; 07:00Z = 14:00: not.
        assertThat(OffsetDateTime.of(2026, 12, 9, 6, 59, 59, 0, ZoneOffset.UTC).isBefore(service.freeUntil(s))).isTrue();
        assertThat(OffsetDateTime.of(2026, 12, 9, 7, 0, 0, 0, ZoneOffset.UTC).isBefore(service.freeUntil(s))).isFalse();
    }

    @Test
    @DisplayName("an early check-in time moves the guest deadline to the day before, across midnight")
    void earlyCheckInTime() {
        assertThat(service.freeUntil(stay(false, LocalTime.of(0, 30))))
                .isEqualTo(OffsetDateTime.of(2026, 12, 9, 0, 30, 0, 0, VN));
    }

    @Test
    @DisplayName("online cancellation closes for everyone at 12:00 on the check-in day")
    void closesAtNoon() {
        var s = stay(true, LocalTime.of(14, 0));
        assertThat(service.cancellableProblem(s, OffsetDateTime.of(2026, 12, 10, 11, 59, 0, 0, VN))).isNull();
        assertThat(service.cancellableProblem(s, OffsetDateTime.of(2026, 12, 10, 12, 0, 0, 0, VN)))
                .isEqualTo("CANCELLATION_WINDOW_EXPIRED");
    }

    @Test
    @DisplayName("only pending or confirmed, not started stays can be cancelled")
    void onlyOpenStays() {
        var checkedIn = new CustomerCancellationService.StayRow(UUID.randomUUID(), "KAS0100002", null, UUID.randomUUID(),
                "WON", "CHECKED_IN", CHECK_IN, "VND", false, LocalTime.of(14, 0), 1_000_000L);
        assertThat(service.cancellableProblem(checkedIn, OffsetDateTime.of(2026, 12, 1, 9, 0, 0, 0, VN)))
                .isEqualTo("CHECKED_IN");
        var awaitingPayment = new CustomerCancellationService.StayRow(UUID.randomUUID(), "KAS0100003", null, UUID.randomUUID(),
                "PAYMENT_PENDING", null, CHECK_IN, "VND", false, LocalTime.of(14, 0), 1_000_000L);
        assertThat(service.cancellableProblem(awaitingPayment, OffsetDateTime.of(2026, 12, 1, 9, 0, 0, 0, VN))).isNull();
    }

    // ------------------------------------------------------------------ fee arithmetic

    private static CancellationFeeRuleService.Rule fixed(long amount) {
        return new CancellationFeeRuleService.Rule(UUID.randomUUID(), null, "FIXED_AMOUNT", amount, null, "VND");
    }

    private static CancellationFeeRuleService.Rule percent(String p) {
        return new CancellationFeeRuleService.Rule(UUID.randomUUID(), null, "PERCENT_OF_TOTAL", null, new BigDecimal(p), "VND");
    }

    @Test
    @DisplayName("fixed fee, capped at the booking total")
    void fixedFee() {
        assertThat(CancellationFeeRuleService.fee(fixed(300_000), 1_000_000).feeMinor()).isEqualTo(300_000);
        assertThat(CancellationFeeRuleService.fee(fixed(2_000_000), 1_000_000).feeMinor()).isEqualTo(1_000_000);
    }

    @Test
    @DisplayName("percent fee rounds half-up to the dong and is never negative")
    void percentFee() {
        assertThat(CancellationFeeRuleService.fee(percent("12.5"), 1_000_005).feeMinor()).isEqualTo(125_001);
        assertThat(CancellationFeeRuleService.fee(percent("50"), 4_968_000).feeMinor()).isEqualTo(2_484_000);
        assertThat(CancellationFeeRuleService.fee(percent("50"), 0).feeMinor()).isZero();
        assertThat(CancellationFeeRuleService.fee(percent("100"), -5).feeMinor()).isZero();
    }
}
