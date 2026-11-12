package com.kas.platform.reservation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Owner 2026-11-10: SePay makes its own QR; the static QR is needed only without SePay. */
class PaymentMethodRuleTest {

    @Test
    @DisplayName("SePay alone is a way to pay; without SePay a static QR is required")
    void rule() {
        assertThat(ReservationEmailActionService.hasPaymentMethod(true, null)).isTrue();
        assertThat(ReservationEmailActionService.hasPaymentMethod(true, " ")).isTrue();
        assertThat(ReservationEmailActionService.hasPaymentMethod(false, "https://x.example/qr.png")).isTrue();
        assertThat(ReservationEmailActionService.hasPaymentMethod(false, null)).isFalse();
        assertThat(ReservationEmailActionService.hasPaymentMethod(false, "  ")).isFalse();
    }
}
