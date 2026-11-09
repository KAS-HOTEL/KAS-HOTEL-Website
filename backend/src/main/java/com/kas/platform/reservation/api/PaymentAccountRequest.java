package com.kas.platform.reservation.api;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The one KAS account every booking is paid into (V51).
 *
 * <p>The QR image is what the payment email cannot do without; the bank name, account
 * holder and account number fill the matching fields of that email, which prints
 * "see the QR" where one is empty. All optional; an empty value clears it.
 */
public record PaymentAccountRequest(
        @Size(max = 2048) String qrImageUrl,
        @Size(max = 2000) String instructions,
        @Size(max = 120) String bankName,
        @Size(max = 120) String accountHolder,
        @Pattern(regexp = "^$|^[0-9A-Za-z .-]{4,40}$", message = "Use 4–40 digits or letters.") String accountNumber) {
}
