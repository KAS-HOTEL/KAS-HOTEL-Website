package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A SePay IPN only counts when SePay's own order API backs it (webdemo, 2026-11-10). */
class SePayIpnVerificationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SePayProperties CONFIGURED =
            new SePayProperties("sandbox", "SP-TEST-ABC", "spsk_test_x", "ipn-key");

    /** The order API answering a fixed order (or none, or failing). */
    private static SePayOrderApi api(SePayOrderApi.Order order, boolean down) {
        return new SePayOrderApi(CONFIGURED, JSON) {
            @Override
            public Optional<Order> order(String invoiceNumber) {
                if (down) throw new UnavailableException("down", null);
                return Optional.ofNullable(order);
            }
        };
    }

    private static SePayGatewayService gateway(SePayProperties props, SePayOrderApi api) {
        return new SePayGatewayService(props, null, JSON, null, null, null, api, "https://site");
    }

    private static SePayOrderApi.Order order(String invoice, String status, long amount, String txStatus) {
        return new SePayOrderApi.Order(invoice, status, amount, "VND",
                List.of(new SePayOrderApi.Transaction("t1", txStatus, amount, "BANK_TRANSFER")));
    }

    @Test
    @DisplayName("SePay's answer is read: status, amount, currency, transactions")
    void parsesOrderDetail() throws Exception {
        // Shape of GET https://pgapi-sandbox.sepay.vn/v1/order/detail/{invoice}, 2026-11-10.
        var root = JSON.readTree("""
                {"data":{"id":"2e01f4a9","order_id":"PAY1","order_invoice_number":"KAS0112345-X1",
                 "order_status":"CAPTURED","order_amount":"972000.00","order_currency":"vnd",
                 "transactions":[{"id":"3091c6a0","payment_method":"BANK_TRANSFER","transaction_amount":"972000",
                   "transaction_status":"APPROVED"}]}}""");
        var order = SePayOrderApi.parse(root);
        assertThat(order.invoiceNumber()).isEqualTo("KAS0112345-X1");
        assertThat(order.captured()).isTrue();
        assertThat(order.amountMinor()).isEqualTo(972_000L);
        assertThat(order.currency()).isEqualTo("VND");
        assertThat(order.hasApprovedPayment()).isTrue();
        assertThat(SePayOrderApi.parse(JSON.readTree("{\"status\":404}"))).isNull();
    }

    @Test
    @DisplayName("captured at SePay with the same amount: confirmed")
    void backedBySePay() {
        var g = gateway(CONFIGURED, api(order("KAS0112345-X1", "CAPTURED", 972_000, "APPROVED"), false));
        assertThat(g.notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).isNull();
    }

    @Test
    @DisplayName("a forged or wrong IPN is not backed: unknown order, unpaid, other amount, other invoice")
    void notBacked() {
        assertThat(gateway(CONFIGURED, api(null, false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).contains("no such order");
        assertThat(gateway(CONFIGURED, api(order("KAS0112345-X1", "PENDING", 972_000, "PENDING"), false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).contains("PENDING");
        assertThat(gateway(CONFIGURED, api(order("KAS0112345-X1", "CAPTURED", 972_000, "DECLINED"), false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).contains("approved");
        assertThat(gateway(CONFIGURED, api(order("KAS0112345-X1", "CAPTURED", 10_000, "APPROVED"), false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).contains("amount");
        assertThat(gateway(CONFIGURED, api(order("KAS0199999-X1", "CAPTURED", 972_000, "APPROVED"), false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND")).contains("another invoice");
        assertThat(gateway(CONFIGURED, api(order("KAS0112345-X1", "CAPTURED", 972_000, "APPROVED"), false))
                .notConfirmedBySePay("KAS0112345-X1", 972_000L, "USD")).contains("currency");
    }

    @Test
    @DisplayName("SePay unreachable: the error goes up, so the IPN is rolled back and can be resent")
    void unavailablePropagates() {
        var g = gateway(CONFIGURED, api(null, true));
        assertThatThrownBy(() -> g.notConfirmedBySePay("KAS0112345-X1", 972_000L, "VND"))
                .isInstanceOf(SePayOrderApi.UnavailableException.class);
    }

    @Test
    @DisplayName("header: optional (sandbox sends none), refused only when present and wrong")
    void headerRules() {
        var g = gateway(CONFIGURED, api(null, false));
        assertThat(g.authenticate(null)).isEqualTo(SePayGatewayService.IpnAuth.OK);
        assertThat(g.authenticate("ipn-key")).isEqualTo(SePayGatewayService.IpnAuth.OK);
        assertThat(g.authenticate("wrong")).isEqualTo(SePayGatewayService.IpnAuth.REFUSED);

        var noIpnKey = gateway(new SePayProperties("sandbox", "SP-TEST-ABC", "spsk_test_x", ""), api(null, false));
        assertThat(noIpnKey.authenticate("anything")).isEqualTo(SePayGatewayService.IpnAuth.OK);

        var off = gateway(new SePayProperties("sandbox", "", "", "ipn-key"), api(null, false));
        assertThat(off.authenticate("ipn-key")).isEqualTo(SePayGatewayService.IpnAuth.NOT_CONFIGURED);
    }

    @Test
    @DisplayName("the API host follows the environment")
    void apiHost() {
        assertThat(CONFIGURED.apiBaseUrl()).isEqualTo("https://pgapi-sandbox.sepay.vn");
        assertThat(new SePayProperties("production", "m", "s", "").apiBaseUrl()).isEqualTo("https://pgapi.sepay.vn");
    }
}
