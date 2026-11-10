package com.kas.platform.reservation;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** V66: the checkout form KAS forwards to SePay, and the cancel call for an ended booking. */
class SePayCheckoutTest {

    private static final SePayProperties PROPS = new SePayProperties("sandbox", "SP-TEST", "spsk_secret", "ipn");
    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    private static SePayGatewayService gateway() {
        return new SePayGatewayService(PROPS, null, null, null, null, null, null, "https://kas.example");
    }

    @Test
    @DisplayName("the form KAS signed for this booking and amount is accepted; its invoice is returned")
    void acceptsOwnForm() {
        Map<String, String> form = new LinkedHashMap<>(gateway().checkoutFields("KAS0112345", 2_160_000, "vi"));
        assertThat(gateway().verifyCheckout(form, "KAS0112345", 2_160_000)).startsWith("KAS0112345-");
    }

    @Test
    @DisplayName("a tampered amount, another booking's form or a forged signature is refused")
    void refusesTampering() {
        Map<String, String> form = new LinkedHashMap<>(gateway().checkoutFields("KAS0112345", 2_160_000, "vi"));
        assertThat(gateway().verifyCheckout(form, "KAS0112345", 2_000_000)).isNull();
        assertThat(gateway().verifyCheckout(form, "KAS0199999", 2_160_000)).isNull();
        Map<String, String> cheaper = new LinkedHashMap<>(form);
        cheaper.put("order_amount", "1000");
        assertThat(gateway().verifyCheckout(cheaper, "KAS0112345", 1000)).isNull();
        Map<String, String> forged = new LinkedHashMap<>(form);
        forged.put("signature", "AAAA");
        assertThat(gateway().verifyCheckout(forged, "KAS0112345", 2_160_000)).isNull();
    }

    @Test
    @DisplayName("cancel posts the invoice to SePay with Basic merchant:secret; 200 means cancelled")
    void cancelCall() throws IOException {
        AtomicReference<String> auth = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/order/cancel", exchange -> {
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] reply = "{\"message\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, reply.length);
            exchange.getResponseBody().write(reply);
            exchange.close();
        });
        server.start();
        var canceller = new SePayCheckoutCanceller(PROPS, mock(org.springframework.jdbc.core.simple.JdbcClient.class),
                HttpClient.newHttpClient(), "http://127.0.0.1:" + server.getAddress().getPort());

        assertThat(canceller.cancel("KAS0112345-T1")).isNull();
        assertThat(body.get()).isEqualTo("{\"order_invoice_number\":\"KAS0112345-T1\"}");
        assertThat(auth.get()).isEqualTo("Basic " + java.util.Base64.getEncoder()
                .encodeToString("SP-TEST:spsk_secret".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("a refusal from SePay is kept as the reason, never treated as cancelled")
    void cancelRefused() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/order/cancel", exchange -> {
            byte[] reply = "{\"message\":\"order captured\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(400, reply.length);
            exchange.getResponseBody().write(reply);
            exchange.close();
        });
        server.start();
        var canceller = new SePayCheckoutCanceller(PROPS, mock(org.springframework.jdbc.core.simple.JdbcClient.class),
                HttpClient.newHttpClient(), "http://127.0.0.1:" + server.getAddress().getPort());
        assertThat(canceller.cancel("KAS0112345-T1")).startsWith("HTTP 400").contains("order captured");
    }
}
