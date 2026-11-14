package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Asks SePay for the result of KAS's open checkouts (owner 2026-11-14: "nhận kết quả thanh toán
 * từ SePay"). The IPN stays the fast path; this is the pull side, for when an IPN is late, lost,
 * or cannot reach the server at all (a developer machine).
 *
 * <p>For each open checkout it reads the order from SePay's order API. A captured order with an
 * approved transaction is handed to {@link SePayGatewayService#handleIpn} as the notification
 * SePay would have sent, so one path does everything: the order is read back from SePay again,
 * the event is recorded (deduplicated), the booking is confirmed only when it waits for payment
 * and the amount and currency match, the checkout is marked paid, and money that cannot confirm
 * a booking is alerted for SUPER_ADMIN. An order not paid yet records nothing.
 *
 * <p>Runs from {@code PaymentDeadlineScheduler} before the deadline sweep, and on demand when the
 * guest comes back from SePay ({@link #syncReference}).
 */
@Service
public class SePayPaymentPoller {

    private static final Logger log = LoggerFactory.getLogger(SePayPaymentPoller.class);
    private static final Pattern REFERENCE = Pattern.compile("^KAS\\d{7}$");
    /** Checkouts older than this are not asked about any more (SePay's own orders end well before). */
    static final String WINDOW = "3 days";
    private static final int BATCH = 50;
    /** One on-demand check per booking at most this often (a guest page polls every few seconds). */
    private static final long RETURN_THROTTLE_MS = 3_000;

    private final SePayProperties props;
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final SePayOrderApi orderApi;
    private final SePayGatewayService gateway;
    private final Map<String, Long> lastReturnCheck = new ConcurrentHashMap<>();

    public SePayPaymentPoller(SePayProperties props, JdbcClient jdbc, ObjectMapper json,
                              SePayOrderApi orderApi, SePayGatewayService gateway) {
        this.props = props;
        this.jdbc = jdbc;
        this.json = json;
        this.orderApi = orderApi;
        this.gateway = gateway;
    }

    /** Asks SePay about every recent open checkout. Returns how many paid orders were processed. */
    public int pollOpen() {
        if (!props.checkoutEnabled()) return 0;
        List<String> invoices = jdbc.sql("""
                SELECT invoice_number FROM sepay_checkout
                 WHERE status = 'OPEN' AND created_at > now() - CAST(:window AS interval)
                 ORDER BY created_at DESC
                 LIMIT :batch
                """).param("window", WINDOW).param("batch", BATCH).query(String.class).list();
        int processed = 0;
        for (String invoice : invoices) {
            if (sync(invoice) != null) processed++;
        }
        return processed;
    }

    /**
     * The guest is back from SePay for booking {@code reference}: ask SePay now about that
     * booking's open checkouts instead of waiting for the IPN or the next sweep. Says nothing
     * back, so a reference cannot be probed through it.
     */
    public void syncReference(String reference) {
        if (!props.checkoutEnabled() || reference == null) return;
        String ref = reference.trim().toUpperCase();
        if (!REFERENCE.matcher(ref).matches()) return;
        long now = System.currentTimeMillis();
        Long last = lastReturnCheck.put(ref, now);
        if (last != null && now - last < RETURN_THROTTLE_MS) return;
        if (lastReturnCheck.size() > 10_000) lastReturnCheck.clear();
        List<String> invoices = jdbc.sql("""
                SELECT c.invoice_number FROM sepay_checkout c JOIN reservation r ON r.id = c.reservation_id
                 WHERE r.reference = :ref AND c.status = 'OPEN'
                   AND c.created_at > now() - CAST(:window AS interval)
                 ORDER BY c.created_at DESC
                 LIMIT 5
                """).param("ref", ref).param("window", WINDOW).query(String.class).list();
        invoices.forEach(this::sync);
    }

    /**
     * One checkout: null when SePay does not (yet) record it as paid or could not be asked;
     * otherwise the match status the gateway stored (CONFIRMED, DUPLICATE, NOT_PENDING, ...).
     */
    String sync(String invoice) {
        try {
            SePayOrderApi.Order order = orderApi.order(invoice).orElse(null);
            if (order == null || !order.captured() || !order.hasApprovedPayment()) return null;
            SePayOrderApi.Transaction tx = order.transactions().stream()
                    .filter(t -> "APPROVED".equalsIgnoreCase(t.status())).findFirst().orElseThrow();
            String status = gateway.handleIpn(notificationFor(order, tx));
            log.info("SePay order poll invoice={} result={}", invoice, status);
            return status;
        } catch (SePayOrderApi.UnavailableException unavailable) {
            log.warn("SePay order poll invoice={} skipped, SePay unavailable: {}", invoice, unavailable.getMessage());
            return null;
        } catch (java.io.IOException | RuntimeException failure) {
            log.error("SePay order poll invoice={} failed; the next poll retries", invoice, failure);
            return null;
        }
    }

    /** The ORDER_PAID notification SePay sends, built from SePay's own order record. */
    String notificationFor(SePayOrderApi.Order order, SePayOrderApi.Transaction tx) {
        ObjectNode root = json.createObjectNode();
        root.put("notification_type", "ORDER_PAID");
        root.put("kas_source", "ORDER_API_POLL");
        ObjectNode o = root.putObject("order");
        o.put("order_invoice_number", order.invoiceNumber());
        o.put("order_status", order.status());
        o.put("order_amount", order.amountMinor() == null ? null : Long.toString(order.amountMinor()));
        o.put("order_currency", order.currency() == null ? "VND" : order.currency());
        ObjectNode t = root.putObject("transaction");
        t.put("transaction_id", tx.id());
        t.put("transaction_status", tx.status());
        t.put("payment_method", tx.paymentMethod());
        return root.toString();
    }
}
