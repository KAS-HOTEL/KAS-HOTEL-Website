package com.kas.platform.reservation;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * SePay payment gateway settings — {@code kas.sepay.*}, bound to {@code KAS_SEPAY_*}.
 *
 * <p>No value has a default that could take money: with merchant id or secret key
 * empty the gateway is off and guests see only the bank QR. The keys are never
 * logged or returned by a route.
 */
@ConfigurationProperties(prefix = "kas.sepay")
public record SePayProperties(
        /** "sandbox" or "production"; each has its own merchant id and keys. */
        @DefaultValue("sandbox") String environment,
        String merchantId,
        /** Merchant secret key: signs the checkout form. */
        String secretKey,
        /**
         * The key set in SePay's IPN tab, sent back as {@code X-Secret-Key}. Optional: the
         * sandbox does not send it, and every paid IPN is checked against SePay's order API
         * anyway. When set, an IPN carrying a different key is refused.
         */
        String ipnSecretKey) {

    public boolean checkoutEnabled() {
        return notBlank(merchantId) && notBlank(secretKey);
    }

    public boolean ipnEnabled() {
        return notBlank(ipnSecretKey);
    }

    public boolean production() {
        return "production".equalsIgnoreCase(environment);
    }

    /** SePay's REST API (order lookup), Basic auth with merchant id and secret key. */
    public String apiBaseUrl() {
        return production() ? "https://pgapi.sepay.vn" : "https://pgapi-sandbox.sepay.vn";
    }

    /** Where the guest's browser posts the signed checkout form. */
    public String checkoutUrl() {
        return (production() ? "https://pay.sepay.vn" : "https://pay-sandbox.sepay.vn") + "/v1/checkout/init";
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
