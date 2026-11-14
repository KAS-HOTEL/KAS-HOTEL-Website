package com.kas.platform.reservation.api;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Payment state is kept apart from the booking state (2026-11-12). */
class MeStayPaymentStatusTest {

    @Test
    void verifiedPaymentIsPaidWhateverTheSalesStatus() {
        assertThat(MeStayController.paymentStatus("WON", true, false, null)).isEqualTo("PAID");
        // A verified payment never reads "awaiting payment", even if the booking state lags.
        assertThat(MeStayController.paymentStatus("PAYMENT_PENDING", true, true, null)).isEqualTo("PAID");
    }

    @Test
    void paymentDueIsUnpaidUntilTheGuestReportsATransfer() {
        assertThat(MeStayController.paymentStatus("PAYMENT_PENDING", false, false, null)).isEqualTo("UNPAID");
        assertThat(MeStayController.paymentStatus("PAYMENT_PENDING", false, true, null)).isEqualTo("PENDING");
    }

    @Test
    void recordedRefundWins() {
        assertThat(MeStayController.paymentStatus("WON", true, false, 500_000L)).isEqualTo("REFUNDED");
        assertThat(MeStayController.paymentStatus("WON", true, false, 0L)).isEqualTo("PAID");
    }

    @Test
    void noPaymentStepBeforeApprovalOrAfterAnUnpaidEnd() {
        assertThat(MeStayController.paymentStatus("REQUESTED", false, false, null)).isEqualTo("NONE");
        assertThat(MeStayController.paymentStatus("EXPIRED", false, false, null)).isEqualTo("NONE");
        assertThat(MeStayController.paymentStatus("DECLINED", false, false, null)).isEqualTo("NONE");
    }
}
