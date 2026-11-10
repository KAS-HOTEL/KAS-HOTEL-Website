package com.kas.platform.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * Layer 2 of the payment deadline (V66): SePay checkouts KAS started are recorded, and the
 * ones still open once their booking stopped waiting for payment (expired, cancelled, declined,
 * or paid through another checkout) are cancelled at SePay, so a payment page the guest left
 * open cannot take money any more.
 *
 * <p>SePay's cancel API ({@code POST /v1/order/cancel}, Basic auth merchant id : secret key)
 * accepts bank-transfer orders that are not CAPTURED or CANCELLED. A card order, an order
 * already paid, or a checkout the guest never submitted is refused; after
 * {@link #MAX_ATTEMPTS} refusals the row is closed as CANCEL_FAILED. Money that still arrives
 * is layer 3 (unmatched payments), never an automatic confirmation.
 *
 * <p>The HTTP call runs outside any transaction: a slow SePay never holds a database lock.
 */
@Service
public class SePayCheckoutCanceller {

    private static final Logger log = LoggerFactory.getLogger(SePayCheckoutCanceller.class);
    static final int MAX_ATTEMPTS = 5;
    private static final int BATCH = 50;

    private final SePayProperties props;
    private final JdbcClient jdbc;
    private final HttpClient http;
    private final String apiBaseUrl;

    @org.springframework.beans.factory.annotation.Autowired
    public SePayCheckoutCanceller(SePayProperties props, JdbcClient jdbc,
                                  @Value("${kas.sepay.api-base-url:}") String apiBaseUrl) {
        this(props, jdbc, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), apiBaseUrl);
    }

    SePayCheckoutCanceller(SePayProperties props, JdbcClient jdbc, HttpClient http, String apiBaseUrl) {
        this.props = props;
        this.jdbc = jdbc;
        this.http = http;
        String configured = apiBaseUrl == null ? "" : apiBaseUrl.trim().replaceAll("/+$", "");
        this.apiBaseUrl = !configured.isEmpty() ? configured
                : props.production() ? "https://pgapi.sepay.vn" : "https://pgapi-sandbox.sepay.vn";
    }

    /** A checkout form was just handed to the guest's browser for this booking. */
    @Transactional
    public void record(String invoiceNumber, UUID reservationId, long amountMinor) {
        jdbc.sql("""
                INSERT INTO sepay_checkout (invoice_number, reservation_id, amount_minor)
                VALUES (:invoice, :reservation, :amount)
                ON CONFLICT (invoice_number) DO NOTHING
                """).param("invoice", invoiceNumber).param("reservation", reservationId)
                .param("amount", amountMinor).update();
    }

    /** SePay reported this checkout paid: it is no longer a candidate for cancellation. */
    @Transactional
    public void markPaid(String invoiceNumber) {
        if (invoiceNumber == null) return;
        jdbc.sql("""
                UPDATE sepay_checkout SET status = 'PAID', closed_at = now()
                 WHERE invoice_number = :invoice AND status IN ('OPEN', 'CANCEL_FAILED')
                """).param("invoice", invoiceNumber).update();
    }

    /** Cancels open checkouts whose booking no longer waits for payment. Returns how many closed. */
    public int cancelEnded() {
        if (!props.checkoutEnabled()) return 0;
        List<String> invoices = jdbc.sql("""
                SELECT c.invoice_number
                  FROM sepay_checkout c JOIN reservation r ON r.id = c.reservation_id
                 WHERE c.status = 'OPEN' AND r.sales_status <> 'PAYMENT_PENDING'
                 ORDER BY c.created_at
                 LIMIT :batch
                """).param("batch", BATCH).query(String.class).list();
        int closed = 0;
        for (String invoice : invoices) {
            String error = cancel(invoice);
            if (error == null) {
                closed += jdbc.sql("""
                        UPDATE sepay_checkout SET status = 'CANCELLED', closed_at = now(),
                               cancel_attempts = cancel_attempts + 1, last_error = NULL
                         WHERE invoice_number = :invoice AND status = 'OPEN'
                        """).param("invoice", invoice).update();
            } else {
                jdbc.sql("""
                        UPDATE sepay_checkout
                           SET cancel_attempts = cancel_attempts + 1, last_error = :error,
                               status = CASE WHEN cancel_attempts + 1 >= :max THEN 'CANCEL_FAILED' ELSE 'OPEN' END,
                               closed_at = CASE WHEN cancel_attempts + 1 >= :max THEN now() END
                         WHERE invoice_number = :invoice AND status = 'OPEN'
                        """).param("invoice", invoice).param("error", error).param("max", MAX_ATTEMPTS).update();
            }
        }
        return closed;
    }

    /** Null when SePay cancelled the order; otherwise a short reason kept on the row. */
    String cancel(String invoiceNumber) {
        String auth = Base64.getEncoder().encodeToString(
                (props.merchantId().trim() + ":" + props.secretKey().trim()).getBytes(StandardCharsets.UTF_8));
        String body = "{\"order_invoice_number\":\"" + invoiceNumber.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
        HttpRequest request = HttpRequest.newBuilder(URI.create(apiBaseUrl + "/v1/order/cancel"))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Basic " + auth)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() / 100 == 2) {
                log.info("SePay checkout cancelled invoice={}", invoiceNumber);
                return null;
            }
            String text = response.body() == null ? "" : response.body();
            String reason = "HTTP " + response.statusCode() + " " + (text.length() > 300 ? text.substring(0, 300) : text);
            log.warn("SePay refused to cancel invoice={} {}", invoiceNumber, reason);
            return reason;
        } catch (java.io.IOException e) {
            log.warn("SePay cancel call failed invoice={}: {}", invoiceNumber, e.toString());
            return "IO " + e.getClass().getSimpleName();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "INTERRUPTED";
        }
    }
}
