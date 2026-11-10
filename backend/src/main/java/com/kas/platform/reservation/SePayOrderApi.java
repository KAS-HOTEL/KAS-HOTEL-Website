package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * SePay payment gateway API, read side: the order as SePay itself records it.
 *
 * <p>An IPN is only a claim that an order was paid. SePay's sandbox sends it without the
 * {@code X-Secret-Key} the IPN tab is configured with (seen on webdemo 2026-11-10), so
 * before a booking is confirmed the order is read back from SePay with the merchant's
 * own credentials ({@code GET /v1/order/detail/{order_invoice_number}}, Basic auth
 * {@code merchant_id:secret_key}, as in sepayvn/sepay-pg-php). Nobody without the
 * secret key can make that answer say "paid".
 */
@Component
public class SePayOrderApi {

    /** One payment order as SePay reports it. */
    public record Order(String invoiceNumber, String status, Long amountMinor, String currency,
                        List<Transaction> transactions) {
        public boolean captured() {
            return "CAPTURED".equalsIgnoreCase(status);
        }

        public boolean hasApprovedPayment() {
            return transactions.stream().anyMatch(t -> "APPROVED".equalsIgnoreCase(t.status()));
        }
    }

    public record Transaction(String id, String status, Long amountMinor, String paymentMethod) {
    }

    /** SePay could not be asked (network, 5xx, refused credentials): try again later. */
    public static class UnavailableException extends RuntimeException {
        public UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final SePayProperties props;
    private final ObjectMapper json;
    private final HttpClient http;

    @Autowired
    public SePayOrderApi(SePayProperties props, ObjectMapper json) {
        this(props, json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build());
    }

    SePayOrderApi(SePayProperties props, ObjectMapper json, HttpClient http) {
        this.props = props;
        this.json = json;
        this.http = http;
    }

    /**
     * The order with this invoice number, or empty when SePay has no such order.
     *
     * @throws UnavailableException when SePay cannot answer
     */
    public Optional<Order> order(String invoiceNumber) {
        if (!props.checkoutEnabled()) throw new IllegalStateException("SePay is not configured");
        String credentials = props.merchantId().trim() + ":" + props.secretKey().trim();
        HttpRequest request = HttpRequest.newBuilder(URI.create(props.apiBaseUrl() + "/v1/order/detail/"
                        + URLEncoder.encode(invoiceNumber, StandardCharsets.UTF_8).replace("+", "%20")))
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json")
                .header("Authorization", "Basic " + Base64.getEncoder()
                        .encodeToString(credentials.getBytes(StandardCharsets.UTF_8)))
                .GET().build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UnavailableException("SePay order API unreachable", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UnavailableException("interrupted while asking SePay", e);
        }
        if (response.statusCode() == 404) return Optional.empty();
        if (response.statusCode() != 200) {
            throw new UnavailableException("SePay order API answered HTTP " + response.statusCode(), null);
        }
        try {
            return Optional.ofNullable(parse(json.readTree(response.body())));
        } catch (IOException e) {
            throw new UnavailableException("SePay order API answered something that is not JSON", e);
        }
    }

    /** {@code {"data": {...order..., "transactions": [...]}}} → Order; null without data. */
    static Order parse(JsonNode root) {
        JsonNode data = root.path("data");
        if (!data.isObject()) return null;
        List<Transaction> transactions = new ArrayList<>();
        for (JsonNode tx : data.path("transactions")) {
            transactions.add(new Transaction(text(tx, "id"), text(tx, "transaction_status"),
                    minor(text(tx, "transaction_amount")), text(tx, "payment_method")));
        }
        String currency = text(data, "order_currency");
        return new Order(text(data, "order_invoice_number"), text(data, "order_status"),
                minor(text(data, "order_amount")), currency == null ? null : currency.toUpperCase(),
                List.copyOf(transactions));
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return null;
        String text = value.asText();
        return text.isBlank() ? null : text.trim();
    }

    /** "100000.00" → 100000; a fractional VND amount or anything unparsable → null. */
    static Long minor(String amount) {
        if (amount == null) return null;
        try {
            return new BigDecimal(amount).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            return null;
        }
    }
}
