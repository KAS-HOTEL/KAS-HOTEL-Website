package com.kas.platform.security.it;

import com.kas.platform.reservation.PaymentDeadlineService;
import com.kas.platform.reservation.SePayCheckoutCanceller;
import com.kas.platform.reservation.SePayGatewayService;
import com.kas.platform.reservation.SePayOrderApi;
import com.kas.platform.reservation.SePayPaymentPoller;
import com.kas.platform.reservation.UnmatchedPaymentService;
import com.kas.platform.reservation.VoucherHoldService;
import com.kas.platform.shared.EmailOutboxCipher;
import com.kas.platform.shared.NotFoundException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * V66 against the real schema: the payment deadline expires a booking and gives its voucher
 * use back (layer 1), a paid SePay checkout is never cancelled (layer 2), and money SePay
 * reports for a booking that can no longer take it is alerted and settled by SUPER_ADMIN
 * (layer 3). Since 2026-11-14 KAS also asks SePay's order API about open checkouts, so a paid
 * order confirms its booking without an IPN. Rolled back. SePay is "on" by configuration only
 * (fake keys; the order API is a mock); the background sweep is off.
 */
@TestPropertySource(properties = {
        "kas.sepay.environment=sandbox",
        "kas.sepay.merchant-id=SP-TEST-IT",
        "kas.sepay.secret-key=spsk_it_dummy",
        "kas.booking.payment-deadline-sweep.enabled=false"})
class PaymentDeadlineIT extends SecurityIntegrationTest {

    @Autowired JdbcClient jdbc;
    @Autowired PaymentDeadlineService deadlines;
    @Autowired EmailOutboxCipher outboxCipher;
    @Autowired ObjectMapper json;
    @Autowired VoucherHoldService holds;
    @Autowired SePayGatewayService gateway;
    @Autowired SePayCheckoutCanceller checkouts;
    @Autowired UnmatchedPaymentService unmatched;
    @Autowired SePayPaymentPoller poller;
    /** SePay's order API, answering that every order asked about was paid 972,000 VND. */
    @MockitoBean SePayOrderApi orderApi;

    private UUID propertyId;
    private UUID voucherId;

    @BeforeEach
    void prepare() {
        when(orderApi.order(anyString())).thenAnswer(call -> Optional.of(new SePayOrderApi.Order(
                call.getArgument(0), "CAPTURED", 972_000L, "VND",
                List.of(new SePayOrderApi.Transaction("tx", "APPROVED", 972_000L, "BANK_TRANSFER")))));
        UUID partner = fixtures.createPartner("payment-deadline");
        propertyId = fixtures.createProperties(partner, 1).getFirst();
        voucherId = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO voucher (id, code, name, voucher_type, value_percent, usage_limit_total, status)
                VALUES (:id, :code, 'Deadline test', 'PERCENTAGE', 10, 1, 'ACTIVE')
                """).param("id", voucherId).param("code", "KAS-DL" + UUID.randomUUID().toString().substring(0, 6))
                .update();
    }

    /** A booking waiting for payment, with the given deadline, reference KAS09xxxxx. */
    private UUID pending(OffsetDateTime dueAt) {
        String ref = "KAS09" + String.format("%05d", ThreadLocalRandom.current().nextInt(100_000));
        fixtures.insertRawReservation(propertyId, ref);
        UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref").param("ref", ref).query(UUID.class).single();
        jdbc.sql("""
                UPDATE reservation SET voucher_id = :v, discount_minor = 100000, subtotal_minor = 1000000,
                       total_minor = 972000, sales_status = 'PAYMENT_PENDING', payment_due_at = :due,
                       guest_email = 'guest@example.com', guest_country = 'VN'
                 WHERE id = :id
                """).param("v", voucherId).param("due", dueAt).param("id", id).update();
        return id;
    }

    private String salesStatus(UUID id) {
        return jdbc.sql("SELECT sales_status::text FROM reservation WHERE id = :id").param("id", id).query(String.class).single();
    }

    private String holdStatus(UUID id) {
        return jdbc.sql("SELECT status FROM voucher_hold WHERE reservation_id = :id").param("id", id)
                .query(String.class).optional().orElse("NONE");
    }

    private String reference(UUID id) {
        return jdbc.sql("SELECT reference FROM reservation WHERE id = :id").param("id", id).query(String.class).single();
    }

    private static String ipn(String invoice, long amount, String txId) {
        return """
                {"timestamp":1762848000,"notification_type":"ORDER_PAID",
                 "order":{"id":"o-%s","order_invoice_number":"%s","order_status":"CAPTURED","order_amount":"%d.00","order_currency":"VND"},
                 "transaction":{"transaction_id":"%s","transaction_status":"APPROVED","payment_method":"BANK_TRANSFER"}}
                """.formatted(txId, invoice, amount, txId);
    }

    @Test
    @DisplayName("past its deadline a booking expires, its voucher use is free again and the reason is recorded")
    void deadlineExpiresBooking() {
        UUID overdue = pending(OffsetDateTime.now().minusMinutes(1));
        UUID inTime = pending(OffsetDateTime.now().plusHours(3));
        assertThat(holds.hold(voucherId, overdue, null, 100_000, OffsetDateTime.now().plusDays(5))).isTrue();

        assertThat(deadlines.expireOverdue()).contains(reference(overdue)).doesNotContain(reference(inTime));

        assertThat(salesStatus(overdue)).isEqualTo("EXPIRED");
        assertThat(salesStatus(inTime)).isEqualTo("PAYMENT_PENDING");
        assertThat(holdStatus(overdue)).isEqualTo("RELEASED");
        assertThat(jdbc.sql("""
                SELECT reason FROM reservation_status_history
                 WHERE reservation_id = :id AND to_status = 'EXPIRED'
                """).param("id", overdue).query(String.class).single()).isEqualTo("PAYMENT_DEADLINE");
        // The freed use can be held by the next booking (limit 1).
        assertThat(holds.hold(voucherId, inTime, null, 100_000, OffsetDateTime.now().plusDays(5))).isTrue();
    }

    @Test
    @DisplayName("an expired booking emails the guest with the PAYMENT_DEADLINE_PASSED template")
    void expiryEmailsGuestWithTemplate() {
        UUID overdue = pending(OffsetDateTime.now().minusMinutes(1));
        assertThat(deadlines.expireOverdue()).contains(reference(overdue));

        JsonNode mail = outboxEvent("payment-deadline-guest-" + reference(overdue));
        assertThat(mail.path("templateKey").asText()).isEqualTo("PAYMENT_DEADLINE_PASSED");
        JsonNode params = mail.path("params");
        assertThat(params.path("bookingReference").asText()).isEqualTo(reference(overdue));
        assertThat(params.path("reference").asText()).isEqualTo(reference(overdue));
        assertThat(params.path("paymentDeadline").asText()).isNotBlank();
        assertThat(params.path("newBookingUrl").asText()).endsWith("/hotels.html?lang=vi");
        // A booking still in time gets no such email.
        UUID inTime = pending(OffsetDateTime.now().plusHours(3));
        deadlines.expireOverdue();
        assertThat(jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key = :key")
                .param("key", "payment-deadline-guest-" + reference(inTime)).query(Long.class).single()).isZero();
    }

    private JsonNode outboxEvent(String eventKey) {
        var row = jdbc.sql("SELECT payload_nonce, payload_ciphertext FROM email_delivery_outbox WHERE event_key = :key ORDER BY created_at DESC LIMIT 1")
                .param("key", eventKey).query((rs, n) -> new byte[][]{rs.getBytes("payload_nonce"), rs.getBytes("payload_ciphertext")}).single();
        try { return json.readTree(outboxCipher.decrypt(row[0], row[1])); }
        catch (java.io.IOException ex) { throw new AssertionError("Outbox payload should be valid JSON", ex); }
    }

    @Test
    @DisplayName("a guest's old 'I have made the transfer' report no longer holds a booking open (SePay only)")
    void reportedTransferStillExpires() {
        UUID reported = pending(OffsetDateTime.now().minusMinutes(5));
        jdbc.sql("""
                INSERT INTO reservation_email_action_token (reservation_id, action, token_hash, recipient_email,
                                                            created_at, expires_at, used_at)
                VALUES (:id, 'GUEST_MARK_PAID', :hash, 'guest@example.com', now() - interval '1 hour',
                        now() - interval '1 minute', now() - interval '10 minutes')
                """).param("id", reported).param("hash", UUID.randomUUID().toString()).update();
        assertThat(deadlines.expireOverdue()).contains(reference(reported));
        assertThat(salesStatus(reported)).isEqualTo("EXPIRED");
    }

    @Test
    @DisplayName("bookings approved before V66 (no deadline) never auto-expire")
    void noDeadlineNoExpiry() {
        UUID legacy = pending(null);
        assertThat(deadlines.expireOverdue()).doesNotContain(reference(legacy));
        assertThat(salesStatus(legacy)).isEqualTo("PAYMENT_PENDING");
    }

    @Test
    @DisplayName("SePay money for an expired booking is not confirmed: it is alerted, listed and settled by SUPER_ADMIN")
    void lateMoneyIsUnmatched() throws Exception {
        UUID late = pending(OffsetDateTime.now().minusMinutes(1));
        deadlines.expireOverdue();
        String invoice = reference(late) + "-T1";
        checkouts.record(invoice, late, 972_000);

        assertThat(gateway.handleIpn(ipn(invoice, 972_000, "tx-" + UUID.randomUUID()))).isEqualTo("NOT_PENDING");

        assertThat(salesStatus(late)).isEqualTo("EXPIRED");
        assertThat(jdbc.sql("SELECT status FROM sepay_checkout WHERE invoice_number = :i").param("i", invoice)
                .query(String.class).single()).as("a paid checkout is never cancelled").isEqualTo("PAID");
        UUID event = jdbc.sql("""
                SELECT id FROM sepay_ipn_event WHERE reservation_id = :id AND alert_sent_at IS NOT NULL
                """).param("id", late).query(UUID.class).single();

        // A user of its own: CI starts from an empty database.
        UUID staff = fixtures.createUser("deadline-sa-" + UUID.randomUUID().toString().substring(0, 8), "Passw0rd-Deadline!");
        AuthorizationScope superAdmin = AuthorizationScope.global(staff);
        assertThat(unmatched.list(superAdmin)).anySatisfy(row -> {
            assertThat(row.id()).isEqualTo(event);
            assertThat(row.matchStatus()).isEqualTo("NOT_PENDING");
            assertThat(row.salesStatus()).isEqualTo("EXPIRED");
            assertThat(row.resolvedAt()).isNull();
        });
        assertThatThrownBy(() -> unmatched.list(AuthorizationScope.partner(UUID.randomUUID(), UUID.randomUUID())))
                .isInstanceOf(NotFoundException.class);

        var settled = unmatched.resolve(event, "REFUNDED", "Đã hoàn qua ngân hàng FT1", superAdmin);
        assertThat(settled.resolution()).isEqualTo("REFUNDED");
        assertThat(settled.resolvedAt()).isNotNull();
    }

    @Test
    @DisplayName("money that arrives in time still confirms the booking and closes its checkout as paid")
    void inTimeMoneyConfirms() throws Exception {
        UUID booking = pending(OffsetDateTime.now().plusHours(2));
        String invoice = reference(booking) + "-T2";
        checkouts.record(invoice, booking, 972_000);
        assertThat(gateway.handleIpn(ipn(invoice, 972_000, "tx-" + UUID.randomUUID()))).isEqualTo("CONFIRMED");
        assertThat(salesStatus(booking)).isEqualTo("WON");
        assertThat(jdbc.sql("SELECT status FROM sepay_checkout WHERE invoice_number = :i").param("i", invoice)
                .query(String.class).single()).isEqualTo("PAID");
    }

    @Test
    @DisplayName("asking SePay confirms a paid checkout with no IPN; the IPN arriving later is not unmatched money")
    void orderPollConfirmsWithoutIpn() throws Exception {
        UUID booking = pending(OffsetDateTime.now().plusHours(2));
        String invoice = reference(booking) + "-P1";
        checkouts.record(invoice, booking, 972_000);

        poller.syncReference(reference(booking));

        assertThat(salesStatus(booking)).isEqualTo("WON");
        assertThat(jdbc.sql("SELECT status FROM sepay_checkout WHERE invoice_number = :i").param("i", invoice)
                .query(String.class).single()).isEqualTo("PAID");
        assertThat(jdbc.sql("SELECT match_status FROM sepay_ipn_event WHERE order_invoice_number = :i")
                .param("i", invoice).query(String.class).single()).isEqualTo("CONFIRMED");
        assertThat(jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id = :id AND status = 'VERIFIED'")
                .param("id", booking).query(Long.class).single()).isEqualTo(1);
        assertThat(outboxEvent("booking-confirmed-" + reference(booking)).path("templateKey").asText())
                .isEqualTo("BOOKING_CONFIRMED");

        // SePay's IPN for the same order, with its own transaction id shape: nothing new.
        assertThat(gateway.handleIpn(ipn(invoice, 972_000, "ipn-" + UUID.randomUUID()))).isEqualTo("IGNORED");
        assertThat(jdbc.sql("SELECT count(*) FROM sepay_ipn_event WHERE reservation_id = :id AND alert_sent_at IS NOT NULL")
                .param("id", booking).query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id = :id")
                .param("id", booking).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("an order SePay has not captured yet changes nothing and records nothing")
    void unpaidOrderChangesNothing() {
        UUID booking = pending(OffsetDateTime.now().plusHours(2));
        String invoice = reference(booking) + "-P2";
        checkouts.record(invoice, booking, 972_000);
        when(orderApi.order(invoice)).thenReturn(Optional.of(new SePayOrderApi.Order(
                invoice, "PENDING", 972_000L, "VND", List.of())));

        poller.syncReference(reference(booking));

        assertThat(salesStatus(booking)).isEqualTo("PAYMENT_PENDING");
        assertThat(jdbc.sql("SELECT status FROM sepay_checkout WHERE invoice_number = :i").param("i", invoice)
                .query(String.class).single()).isEqualTo("OPEN");
        assertThat(jdbc.sql("SELECT count(*) FROM sepay_ipn_event WHERE order_invoice_number = :i")
                .param("i", invoice).query(Long.class).single()).isZero();
    }
}
