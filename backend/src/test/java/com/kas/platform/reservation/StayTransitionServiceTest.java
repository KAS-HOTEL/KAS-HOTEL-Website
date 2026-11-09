package com.kas.platform.reservation;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class StayTransitionServiceTest {

    private static final LocalTime CUTOFF = LocalTime.of(23, 59);

    @Test
    void noShowWaitsUntilTheCheckInDateCutoff() {
        // Timing only; the source states are covered by AdminOperationsIT.
        LocalDate checkIn = LocalDate.of(2026, 10, 26);

        assertThat(StayTransitionService.noShowWindowOpen(checkIn, checkIn.minusDays(1),
                LocalTime.MAX, CUTOFF)).isFalse();
        assertThat(StayTransitionService.noShowWindowOpen(checkIn, checkIn,
                LocalTime.of(23, 58, 59), CUTOFF)).isFalse();
        assertThat(StayTransitionService.noShowWindowOpen(checkIn, checkIn,
                CUTOFF, CUTOFF)).isTrue();
        assertThat(StayTransitionService.noShowWindowOpen(checkIn, checkIn.plusDays(1),
                LocalTime.MIDNIGHT, CUTOFF)).isTrue();
    }
}
