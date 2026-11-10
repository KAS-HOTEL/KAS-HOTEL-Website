package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * SePay payment gateway: the signed checkout form a guest posts to SePay, and the IPN
 * SePay sends back when an order is paid.
 *
 * <p>The signature follows SePay's official SDK (sepayvn/sepay-pg-php,
 * {@code SignatureGenerator}): the signed fields in the order they appear in the form,
 * each as {@code field=value}, joined with commas, HMAC-SHA256 with the merchant secret
 * key, base64 encoded.
 */
@Service
public class SePayGatewayService {
    private static final Logger log = LoggerFactory.getLogger(SePayGatewayService.class);
    private static final Pattern REFERENCE = Pattern.compile("^KAS\\d{7}$");
    /** Fields SePay signs, as in the SDK; anything else in the form (e.g. lang) is not signed. */
    private static final List<String> SIGNED = List.of("merchant", "env", "operation", "payment_method",
            "order_amount", "currency", "order_invoice_number", "order_description", "customer_id",
            "agreement_id", "agreement_name", "agreement_type", "agreement_payment_frequency",
            "agreement_amount_per_payment", "success_url", "error_url", "cancel_url");

    /** IPN results that leave money with KAS without a booking to show for it (V66 layer 3). */
    static final java.util.Set<String> UNMATCHED = java.util.Set.of(
            "NO_BOOKING", "NOT_PENDING", "AMOUNT_MISMATCH", "ALREADY_PAID");

    private final SePayProperties props;
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final ReservationEmailActionService actions;
    private final BookingNotificationService notifications;
    private final SePayCheckoutCanceller checkouts;
    private final SePayOrderApi orderApi;
    private final String siteBaseUrl;

    public SePayGatewayService(SePayProperties props, JdbcClient jdbc, ObjectMapper json,
                               ReservationEmailActionService actions, BookingNotificationService notifications,
                               SePayCheckoutCanceller checkouts,
                               SePayOrderApi orderApi,
                               @Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBaseUrl) {
        this.props = props;
        this.jdbc = jdbc;
        this.json = json;
        this.actions = actions;
        this.notifications = notifications;
        this.checkouts = checkouts;
        this.orderApi = orderApi;
        this.siteBaseUrl = siteBaseUrl.replaceAll("/+$", "");
    }

    /**
     * Checks a checkout form the guest's browser posted back to KAS before it goes on to
     * SePay (V66): our merchant, an invoice for this booking, the amount still owed, and our
     * own signature over exactly those fields. Returns the invoice number, or null.
     */
    public String verifyCheckout(Map<String, String> posted, String reference, long amountMinor) {
        if (!props.checkoutEnabled() || posted == null) return null;
        String invoice = posted.get("order_invoice_number");
        if (invoice == null || !invoice.startsWith(reference + "-")) return null;
        if (!props.merchantId().trim().equals(posted.get("merchant"))) return null;
        if (!Long.toString(amountMinor).equals(posted.get("order_amount"))) return null;
        Map<String, String> canonical = new LinkedHashMap<>();
        for (String name : List.of("merchant", "currency", "order_amount", "operation", "order_description",
                "order_invoice_number", "success_url", "error_url", "cancel_url")) {
            canonical.put(name, posted.get(name));
        }
        String expected = sign(canonical, props.secretKey().trim());
        String given = posted.get("signature");
        return given != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                given.getBytes(StandardCharsets.UTF_8)) ? invoice : null;
    }

    public boolean checkoutEnabled() { return props.checkoutEnabled(); }

    public String checkoutUrl() { return props.checkoutUrl(); }

    /**
     * The fields of the checkout form for one payment attempt, signature last. The invoice
     * number is the booking reference plus an attempt suffix, so a guest who leaves the
     * SePay page and comes back starts a fresh order; the IPN maps it back by the prefix.
     */
    public Map<String, String> checkoutFields(String reference, long amountMinor, String language) {
        if (!props.checkoutEnabled()) throw new IllegalStateException("SePay checkout is not configured");
        String back = siteBaseUrl + "/manage-booking.html?ref=" + reference;
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("merchant", props.merchantId().trim());
        fields.put("currency", "VND");
        fields.put("order_amount", Long.toString(amountMinor));
        fields.put("operation", "PURCHASE");
        fields.put("order_description", "KAS booking " + reference);
        fields.put("order_invoice_number", reference + "-" + Long.toString(System.currentTimeMillis() / 1000, 36).toUpperCase());
        fields.put("success_url", back + "&payment=success");
        fields.put("error_url", back + "&payment=error");
        fields.put("cancel_url", back + "&payment=cancel");
        fields.put("signature", sign(fields, props.secretKey().trim()));
        fields.put("lang", "vi".equals(language) ? "vi" : "en");
        return fields;
    }

    /** SePay's checkout signature (see class comment). Package-visible for the test. */
    static String sign(Map<String, String> fields, String secretKey) {
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, String> field : fields.entrySet()) {
            if (SIGNED.contains(field.getKey()) && field.getValue() != null) {
                parts.add(field.getKey() + "=" + field.getValue());
            }
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(
                    mac.doFinal(String.join(",", parts).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    // ------------------------------------------------------------------ IPN

    public enum IpnAuth { OK, NOT_CONFIGURED, REFUSED }

    /**
     * Whether to take this IPN in. The header is not the authority: SePay's sandbox sends
     * none even with "Secret Key" chosen, so a paid IPN is always read back from SePay's
     * order API before anything is confirmed ({@link #handleIpn}). What is checked here:
     * the gateway must be configured (the API needs merchant id + secret key), and a
     * header that is present must match the configured IPN key (constant time).
     */
    public IpnAuth authenticate(String secretHeader) {
        if (!props.checkoutEnabled()) return IpnAuth.NOT_CONFIGURED;
        if (secretHeader == null || secretHeader.isBlank() || !props.ipnEnabled()) return IpnAuth.OK;
        boolean same = MessageDigest.isEqual(secretHeader.trim().getBytes(StandardCharsets.UTF_8),
                props.ipnSecretKey().trim().getBytes(StandardCharsets.UTF_8));
        return same ? IpnAuth.OK : IpnAuth.REFUSED;
    }

    /**
     * Records one IPN and, for a captured payment that matches a booking waiting for
     * payment, confirms the stay. One transaction: if anything fails the record is rolled
     * back too, so SePay's resend is processed again rather than skipped as a duplicate.
     *
     * @return the match status stored for this notification
     */
    @Transactional
    public String handleIpn(String rawBody) throws java.io.IOException {
        JsonNode root = json.readTree(rawBody);
        JsonNode order = root.path("order");
        JsonNode tx = root.path("transaction");
        String type = text(root, "notification_type");
        String invoice = text(order, "order_invoice_number");
        String orderStatus = text(order, "order_status");
        String txId = text(tx, "transaction_id") != null ? text(tx, "transaction_id") : text(tx, "id");
        String txStatus = text(tx, "transaction_status");
        String method = text(tx, "payment_method");
        String currency = text(order, "order_currency");
        Long amount = minor(text(order, "order_amount"));
        String dedupe = (type == null ? "UNKNOWN" : type) + ":"
                + (txId != null ? txId : (text(order, "id") != null ? "order-" + text(order, "id") : "body-" + sha256(rawBody)));

        java.util.UUID eventId = jdbc.sql("""
                INSERT INTO sepay_ipn_event (dedupe_key, notification_type, order_invoice_number, order_status,
                        transaction_id, transaction_status, payment_method, amount_minor, currency,
                        match_status, raw)
                VALUES (:dedupe, :type, :invoice, :orderStatus, :txId, :txStatus, :method, :amount, :currency,
                        'RECEIVED', CAST(:raw AS jsonb))
                ON CONFLICT (dedupe_key) DO NOTHING
                RETURNING id
                """).param("dedupe", dedupe).param("type", type == null ? "UNKNOWN" : type)
                .param("invoice", invoice).param("orderStatus", orderStatus).param("txId", txId)
                .param("txStatus", txStatus).param("method", method).param("amount", amount)
                .param("currency", currency == null ? null : currency.toUpperCase())
                .param("raw", rawBody).query(java.util.UUID.class).optional().orElse(null);
        if (eventId == null) {
            log.info("SePay IPN repeated, already recorded key={}", dedupe);
            return "DUPLICATE";
        }

        String status;
        java.util.UUID reservationId = null;
        String reference = invoice == null ? null : invoice.split("-", 2)[0].trim().toUpperCase();
        boolean paid = "ORDER_PAID".equals(type) && "CAPTURED".equalsIgnoreCase(orderStatus)
                && (txStatus == null || "APPROVED".equalsIgnoreCase(txStatus));
        String unverified = paid ? notConfirmedBySePay(invoice, amount, currency) : null;
        if (!paid) {
            status = "IGNORED";
        } else if (unverified != null) {
            // A claim SePay's own records do not back: never confirms a stay.
            log.warn("SePay IPN invoice={} not confirmed by the SePay order API: {}", invoice, unverified);
            status = "IGNORED";
        } else if (reference == null || !REFERENCE.matcher(reference).matches() || amount == null) {
            status = "NO_BOOKING";
        } else {
            var result = actions.confirmPaymentByGateway(reference, amount, currency == null ? "VND" : currency,
                    "SEPAY-" + (txId != null ? txId : invoice), method);
            status = result.match().name();
            reservationId = result.reservationId();
            if (result.match() == ReservationEmailActionService.GatewayMatch.CONFIRMED) {
                notifications.bookingConfirmed(result.booking());
            }
        }
        // Layer 2: a paid checkout is never cancelled at SePay. Only SePay-verified money counts:
        // an IPN the order API does not back neither protects a checkout nor raises an alert.
        boolean verifiedPaid = paid && unverified == null;
        if (verifiedPaid) checkouts.markPaid(invoice);
        // Layer 3: money that could not confirm a booking is alerted and listed for SUPER_ADMIN.
        boolean unmatched = verifiedPaid && UNMATCHED.contains(status);
        if (unmatched) {
            notifications.unmatchedPayment(eventId,
                    reference != null && REFERENCE.matcher(reference).matches() ? reference : null,
                    status, amount, currency, txId);
        }
        jdbc.sql("""
                UPDATE sepay_ipn_event SET match_status = :status, reservation_id = :reservationId, processed_at = now(),
                       alert_sent_at = CASE WHEN :alerted THEN now() END
                 WHERE id = :id
                """).param("status", status).param("reservationId", reservationId)
                .param("alerted", unmatched).param("id", eventId).update();
        log.info("SePay IPN type={} invoice={} result={}", type, invoice, status);
        return status;
    }

    /**
     * Reads the order back from SePay. Null when SePay records it as paid with this very
     * amount and currency; otherwise why not. SePay being unreachable throws
     * ({@link SePayOrderApi.UnavailableException}), which rolls the IPN record back so a
     * resend is processed again instead of being skipped as a duplicate.
     */
    String notConfirmedBySePay(String invoice, Long amount, String currency) {
        if (invoice == null) return "no invoice number";
        var order = orderApi.order(invoice).orElse(null);
        if (order == null) return "no such order at SePay";
        if (!invoice.equalsIgnoreCase(order.invoiceNumber())) return "SePay answered for another invoice";
        if (!order.captured()) return "order status " + order.status();
        if (!order.hasApprovedPayment()) return "no approved transaction";
        if (amount == null || !amount.equals(order.amountMinor())) {
            return "amount " + amount + " in IPN, " + order.amountMinor() + " at SePay";
        }
        String ipnCurrency = currency == null ? "VND" : currency.toUpperCase();
        String sePayCurrency = order.currency() == null ? "VND" : order.currency();
        if (!ipnCurrency.equals(sePayCurrency)) return "currency " + ipnCurrency + " in IPN, " + sePayCurrency + " at SePay";
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return null;
        String text = value.asText();
        return text.isBlank() ? null : text.trim();
    }

    private static Long minor(String amount) {
        return SePayOrderApi.minor(amount);
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
