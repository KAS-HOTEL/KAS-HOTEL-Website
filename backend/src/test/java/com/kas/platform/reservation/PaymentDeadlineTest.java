package com.kas.platform.reservation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/** Owner decision 2026-11-10: 24h; 2h for a stay starting today; never past check-in time. */
class PaymentDeadlineTest {

    private static final Duration DAY = Duration.ofHours(24);
    private static final Duration TWO_HOURS = Duration.ofHours(2);
    private static final LocalTime CHECK_IN = LocalTime.of(14, 0);

    private static OffsetDateTime at(String localDateTime) {
        return LocalDateTime.parse(localDateTime).atZone(PaymentDeadline.HOTEL_ZONE).toOffsetDateTime();
    }

    private static OffsetDateTime due(String approvedAt, String checkIn) {
        return PaymentDeadline.dueAt(at(approvedAt), LocalDate.parse(checkIn), CHECK_IN, DAY, TWO_HOURS);
    }

    @Test
    @DisplayName("a stay a week away gets 24 hours")
    void standardWindow() {
        assertThat(due("2026-11-10T09:00", "2026-11-17")).isEqualTo(at("2026-11-11T09:00"));
    }

    @Test
    @DisplayName("24 hours is cut at the check-in time of the next day")
    void cappedAtCheckInTime() {
        assertThat(due("2026-11-10T20:00", "2026-11-11")).isEqualTo(at("2026-11-11T14:00"));
    }

    @Test
    @DisplayName("a stay starting today gets 2 hours")
    void sameDayWindow() {
        assertThat(due("2026-11-10T09:00", "2026-11-10")).isEqualTo(at("2026-11-10T11:00"));
    }

    @Test
    @DisplayName("same day, 2 hours never runs past the check-in time")
    void sameDayCappedAtCheckIn() {
        assertThat(due("2026-11-10T13:00", "2026-11-10")).isEqualTo(at("2026-11-10T14:00"));
    }

    @Test
    @DisplayName("approved after check-in time on the day itself: still 2 hours, not a deadline in the past")
    void afterCheckInTimeStillPayable() {
        assertThat(due("2026-11-10T18:00", "2026-11-10")).isEqualTo(at("2026-11-10T20:00"));
    }

    @Test
    @DisplayName("no check-in time on the property: 14:00 is assumed")
    void defaultCheckInTime() {
        assertThat(PaymentDeadline.dueAt(at("2026-11-10T20:00"), LocalDate.parse("2026-11-11"), null, DAY, TWO_HOURS))
                .isEqualTo(at("2026-11-11T14:00"));
    }

    @Test
    @DisplayName("the deadline is written in hotel time, per guest language")
    void formatted() {
        assertThat(PaymentDeadline.format(at("2026-11-11T15:30"), true)).isEqualTo("15:30 ngày 11/11/2026");
        assertThat(PaymentDeadline.format(at("2026-11-11T15:30"), false)).isEqualTo("15:30, 11 Nov 2026 (Vietnam time)");
    }

    @Test
    @DisplayName("the payment gate is open only while waiting for payment and before the deadline")
    void payable() {
        OffsetDateTime now = at("2026-11-11T10:00");
        assertThat(ReservationEmailActionService.payable("PAYMENT_PENDING", Optional.of(at("2026-11-11T11:00")), now)).isTrue();
        assertThat(ReservationEmailActionService.payable("PAYMENT_PENDING", Optional.of(at("2026-11-11T10:00")), now)).isFalse();
        assertThat(ReservationEmailActionService.payable("PAYMENT_PENDING", Optional.empty(), now)).isTrue();
        assertThat(ReservationEmailActionService.payable("EXPIRED", Optional.of(at("2026-11-11T11:00")), now)).isFalse();
        assertThat(ReservationEmailActionService.payable("WON", Optional.empty(), now)).isFalse();
    }

    @Test
    @DisplayName("voucher and points holds end at 12:00 on the check-out day, not the check-in day")
    void holdBackstop() {
        assertThat(S1Transaction.holdUntil(LocalDate.parse("2026-11-12"))).isEqualTo(at("2026-11-12T12:00"));
    }
}
