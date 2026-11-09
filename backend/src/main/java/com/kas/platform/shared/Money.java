package com.kas.platform.shared;

import java.util.Objects;

/**
 * The money shape frozen by doc 58 §2:
 * {@code { "amountMinor": 1850000, "currency": "VND", "exponent": 0 }}.
 *
 * <p>Minor units only. There is deliberately no {@code double}, no
 * {@code BigDecimal} and no float anywhere in the money path.
 *
 * <p>VND is zero-decimal. USD is display-only and, per doc 58 §2, never appears
 * in a commitment response — that rule is enforced by the response mappers, not
 * by this type. No FX rate is defined here: {@code USD_FX_RATE_SOURCE} is an
 * outstanding business input (doc 51 B22) and must never be invented.
 */
public record Money(long amountMinor, String currency, int exponent) {

    public static final String VND = "VND";

    public Money {
        Objects.requireNonNull(currency, "currency");
        if (currency.length() != 3) {
            throw new IllegalArgumentException("currency must be an ISO 4217 alphabetic code");
        }
        if (exponent < 0) {
            throw new IllegalArgumentException("exponent must not be negative");
        }
    }

    /** VND is zero-decimal: the minor unit is the dong. */
    public static Money vnd(long amountMinor) {
        return new Money(amountMinor, VND, 0);
    }
}
