package com.kas.platform.reservation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SePayGatewayServiceTest {

    private static Map<String, String> form() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("merchant", "SP-TEST-ABC");
        fields.put("currency", "VND");
        fields.put("order_amount", "100000");
        fields.put("operation", "PURCHASE");
        fields.put("order_description", "KAS booking KAS0112345");
        fields.put("order_invoice_number", "KAS0112345-X1");
        fields.put("success_url", "https://a/s");
        fields.put("error_url", "https://a/e");
        fields.put("cancel_url", "https://a/c");
        return fields;
    }

    @Test
    @DisplayName("signs field=value pairs in form order, comma-joined, HMAC-SHA256, base64 (SePay SDK)")
    void signatureMatchesSdkAlgorithm() {
        // Expected value computed independently:
        // printf '%s' 'merchant=SP-TEST-ABC,...,cancel_url=https://a/c' | openssl dgst -sha256 -hmac spsk_test_dummy -binary | base64
        assertThat(SePayGatewayService.sign(form(), "spsk_test_dummy"))
                .isEqualTo("0IWAlUk2vCmUUSbxPjeNwztz+junCvViEXwHpdPC+MQ=");
    }

    @Test
    @DisplayName("fields SePay does not sign (lang, signature) do not change the signature")
    void unsignedFieldsAreIgnored() {
        Map<String, String> withExtras = form();
        withExtras.put("lang", "vi");
        withExtras.put("signature", "anything");
        assertThat(SePayGatewayService.sign(withExtras, "spsk_test_dummy"))
                .isEqualTo(SePayGatewayService.sign(form(), "spsk_test_dummy"));
    }

    @Test
    @DisplayName("checkout points at the sandbox unless production is chosen")
    void checkoutUrlFollowsEnvironment() {
        assertThat(new SePayProperties("sandbox", "m", "s", "i").checkoutUrl())
                .isEqualTo("https://pay-sandbox.sepay.vn/v1/checkout/init");
        assertThat(new SePayProperties("production", "m", "s", "i").checkoutUrl())
                .isEqualTo("https://pay.sepay.vn/v1/checkout/init");
        assertThat(new SePayProperties("sandbox", "", "s", "i").checkoutEnabled()).isFalse();
    }
}
