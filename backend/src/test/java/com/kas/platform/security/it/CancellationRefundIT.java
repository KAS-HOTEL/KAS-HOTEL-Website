package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.CustomerCancellationService;
import com.kas.platform.reservation.ReservationEmailActionTokenService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cancellation after the free window, the configured fee, the guest's confirmation by email link,
 * and SUPER_ADMIN's manual refund (owner request 2026-11-10). Rolled back.
 */
class CancellationRefundIT extends SecurityIntegrationTest {

    @Autowired JdbcClient jdbc;
    @Autowired ReservationEmailActionTokenService tokens;
    @Autowired CustomerCancellationService cancellations;

    private static final String PASSWORD = "test-cancellation-refund-519!";
    private static final String ACTIONS = "/api/v1/public/reservation-actions/";
    private static final String REFUNDS = "/api/v1/admin/ops/reservations/cancellation-requests/refunds/";
    private Cookie[] superAdmin;
    private Cookie[] admin;
    private UUID propertyId;
    private String reference;
    private UUID reservationId;
    private String guestEmail;

    @BeforeEach
    void prepare() throws Exception {
        UUID partner = fixtures.createPartner("cancel-refund");
        propertyId = fixtures.createProperties(partner, 1).getFirst();
        UUID sa = fixtures.createUser("cancel-refund-sa", PASSWORD);
        fixtures.grantGlobalScope(sa, UserRole.SUPER_ADMIN);
        superAdmin = login(fixtures.emailOf(sa), PASSWORD);
        UUID ad = fixtures.createUser("cancel-refund-admin", PASSWORD);
        fixtures.grantGlobalScope(ad, UserRole.ADMIN);
        admin = login(fixtures.emailOf(ad), PASSWORD);

        reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        guestEmail = "guest-" + UUID.randomUUID() + "@example.invalid";
        fixtures.insertRawReservation(propertyId, reference);
        jdbc.sql("""
                UPDATE reservation SET guest_email = :email, total_minor = 1000000, subtotal_minor = 1000000,
                       sales_status = 'WON', stay_status = 'CONFIRMED'
                 WHERE reference = :ref
                """).param("email", guestEmail).param("ref", reference).update();
        reservationId = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref").param("ref", reference)
                .query(UUID.class).single();
        // Make the timeline independent of the clock: 00:01 check-in, stay starts tomorrow (hotel time),
        // so a guest's free window (24h before check-in) closed at 00:01 today; online cancellation
        // stays open until 12:00 tomorrow.
        jdbc.sql("UPDATE property SET check_in_time = '00:01' WHERE id = :id").param("id", propertyId).update();
        startsInDays(1);
    }

    private void startsInDays(int days) {
        jdbc.sql("""
                UPDATE reservation
                   SET check_in = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + :d,
                       check_out = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + :d + 2
                 WHERE id = :id
                """).param("d", days).param("id", reservationId).update();
    }

    private void paid(long amount) {
        jdbc.sql("""
                INSERT INTO payment (reservation_id, method, amount_minor, currency, status, received_at, external_reference)
                VALUES (:id, 'QR', :amount, 'VND', 'VERIFIED', now(), :ref)
                """).param("id", reservationId).param("amount", amount)
                .param("ref", "SEPAY-" + UUID.randomUUID().toString().substring(0, 8)).update();
    }

    private void feeRule(String type, Long amount, String percent) {
        jdbc.sql("""
                INSERT INTO cancellation_fee_rule (property_id, fee_type, amount_minor, percent, status)
                VALUES (:p, :t, :a, CAST(:pc AS numeric), 'ACTIVE')
                """).param("p", propertyId).param("t", type).param("a", amount).param("pc", percent).update();
    }

    private String link() {
        return tokens.issue(reservationId, "GUEST_CANCEL", guestEmail, Duration.ofHours(1));
    }

    private String stayStatus() {
        return jdbc.sql("SELECT stay_status::text FROM reservation WHERE id = :id").param("id", reservationId)
                .query(String.class).single();
    }

    private String requestStatus() {
        return jdbc.sql("""
                SELECT status::text FROM reservation_cancellation_request WHERE reservation_id = :id
                 ORDER BY created_at DESC LIMIT 1
                """).param("id", reservationId).query(String.class).optional().orElse("NONE");
    }

    private long mails(String prefix) {
        return jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE aggregate_reference = :ref AND event_key LIKE :p")
                .param("ref", reference).param("p", prefix + "%").query(Long.class).single();
    }

    @Test
    @DisplayName("late, paid, with a rule: the page shows fee and refund; confirming cancels and queues the refund")
    void lateWithRuleConfirmQueuesRefund() throws Exception {
        paid(1_000_000);
        feeRule("PERCENT_OF_TOTAL", null, "10");
        String token = link();

        mockMvc.perform(get(ACTIONS + token)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("100.000 VND")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("900.000 VND")));
        assertThat(stayStatus()).as("looking changes nothing").isEqualTo("CONFIRMED");

        mockMvc.perform(post(ACTIONS + token + "/guest-cancel").param("decision", "confirm").param("expectedFeeMinor", "100000"))
                .andExpect(status().isOk());
        assertThat(stayStatus()).isEqualTo("CANCELLED");
        assertThat(requestStatus()).isEqualTo("REFUND_PENDING");
        assertThat(jdbc.sql("""
                SELECT fee_amount_minor || '/' || paid_amount_minor || '/' || refund_due_minor || '/' || fee_source
                  FROM reservation_cancellation_request WHERE reservation_id = :id
                """).param("id", reservationId).query(String.class).single()).isEqualTo("100000/1000000/900000/RULE");
        assertThat(mails("refund-requested-")).as("SUPER_ADMIN told").isPositive();
        assertThat(mails("refund-completed-")).as("no 'refunded' mail before the record").isZero();

        // The link is used up.
        mockMvc.perform(post(ACTIONS + token + "/guest-cancel").param("decision", "confirm"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("SUPER_ADMIN records the refund once; repeating is harmless; ADMIN cannot; over-refund refused")
    void superAdminRecordsRefund() throws Exception {
        paid(1_000_000);
        feeRule("FIXED_AMOUNT", 300_000L, null);
        cancellations.requestForGuest(reservationId, true, 300_000L);
        UUID requestId = jdbc.sql("SELECT id FROM reservation_cancellation_request WHERE reservation_id = :id")
                .param("id", reservationId).query(UUID.class).single();

        mockMvc.perform(get(REFUNDS.substring(0, REFUNDS.length() - 1)).cookie(admin)).andExpect(status().isForbidden());
        mockMvc.perform(post(REFUNDS + requestId + "/record").cookie(admin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"refundAmountMinor\":700000}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(REFUNDS + requestId + "/record").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"refundAmountMinor\":1000001}"))
                .andExpect(status().isBadRequest());
        assertThat(requestStatus()).isEqualTo("REFUND_PENDING");

        String body = "{\"refundAmountMinor\":700000,\"reference\":\"FT-123\",\"note\":\"Chuyển khoản Vietcombank\"}";
        mockMvc.perform(post(REFUNDS + requestId + "/record").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REFUNDED"))
                .andExpect(jsonPath("$.refundAmountMinor").value(700000));
        assertThat(mails("refund-completed-")).isEqualTo(1);
        mockMvc.perform(post(REFUNDS + requestId + "/record").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REFUNDED"));
        assertThat(mails("refund-completed-")).as("one email however often it is recorded").isEqualTo(1);
        mockMvc.perform(post(REFUNDS + requestId + "/reject").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"late\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_id = :id AND action = 'reservation.refund_recorded'")
                .param("id", reservationId).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("SUPER_ADMIN can record that a refund was not made, with the reason")
    void superAdminRejectsRefund() throws Exception {
        paid(1_000_000);
        feeRule("FIXED_AMOUNT", 0L, null);
        cancellations.requestForGuest(reservationId, true, 0L);
        UUID requestId = jdbc.sql("SELECT id FROM reservation_cancellation_request WHERE reservation_id = :id")
                .param("id", reservationId).query(UUID.class).single();
        mockMvc.perform(post(REFUNDS + requestId + "/reject").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"   \"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(REFUNDS + requestId + "/reject").cookie(superAdmin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Tài khoản khách bị khoá\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REFUND_REJECTED"));
        assertThat(mails("refund-rejected-")).isEqualTo(1);
        assertThat(mails("refund-completed-")).isZero();
    }

    @Test
    @DisplayName("late with no rule: SUPER_ADMIN reviews; nothing is cancelled and no fee is guessed")
    void lateWithoutRuleGoesToReview() throws Exception {
        String token = link();
        mockMvc.perform(post(ACTIONS + token + "/guest-cancel").param("decision", "confirm")).andExpect(status().isOk());
        assertThat(stayStatus()).isEqualTo("CONFIRMED");
        assertThat(requestStatus()).isEqualTo("PENDING_HOTEL_FEE");
        assertThat(jdbc.sql("SELECT fee_amount_minor IS NULL FROM reservation_cancellation_request WHERE reservation_id = :id")
                .param("id", reservationId).query(Boolean.class).single()).isTrue();
        assertThat(mails("cancellation-review-")).isPositive();
    }

    @Test
    @DisplayName("keeping the booking declines the quoted fee and changes nothing else")
    void keepDeclines() throws Exception {
        feeRule("PERCENT_OF_TOTAL", null, "20");
        cancellations.requestForGuest(reservationId, false, null);
        assertThat(requestStatus()).isEqualTo("QUOTED");
        mockMvc.perform(post(ACTIONS + link() + "/guest-cancel").param("decision", "keep")).andExpect(status().isOk());
        assertThat(requestStatus()).isEqualTo("DECLINED");
        assertThat(stayStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("a fee that changed after it was shown is refused, not charged")
    void changedFeeIsRefused() {
        feeRule("PERCENT_OF_TOTAL", null, "10");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> cancellations.requestForGuest(reservationId, true, 5L))
                .isInstanceOf(com.kas.platform.shared.KasException.class);
        assertThat(stayStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("inside the free window and unpaid: cancelled at once, no fee")
    void freeWindowUnpaidCancelsNow() throws Exception {
        startsInDays(30);
        feeRule("PERCENT_OF_TOTAL", null, "50");
        mockMvc.perform(post(ACTIONS + link() + "/guest-cancel").param("decision", "confirm")).andExpect(status().isOk());
        assertThat(stayStatus()).isEqualTo("CANCELLED");
        assertThat(requestStatus()).isEqualTo("NONE");
    }

    @Test
    @DisplayName("inside the free window but paid: SUPER_ADMIN reviews first (owner rule 2026-11-07)")
    void freeWindowPaidIsReviewed() throws Exception {
        startsInDays(30);
        paid(1_000_000);
        mockMvc.perform(post(ACTIONS + link() + "/guest-cancel").param("decision", "confirm")).andExpect(status().isOk());
        assertThat(stayStatus()).isEqualTo("CONFIRMED");
        assertThat(requestStatus()).isEqualTo("PENDING_HOTEL_FEE");
        assertThat(jdbc.sql("SELECT fee_source FROM reservation_cancellation_request WHERE reservation_id = :id")
                .param("id", reservationId).query(String.class).single()).isEqualTo("FREE_WINDOW");
    }

    @Test
    @DisplayName("the link form answers the same for a wrong email and sends nothing")
    void linkRequestIsGeneric() throws Exception {
        mockMvc.perform(post("/api/v1/public/cancellations/link").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reference\":\"" + reference + "\",\"email\":\"someone-else@example.invalid\"}"))
                .andExpect(status().isAccepted());
        assertThat(mails("guest-cancel-link-")).isZero();
        mockMvc.perform(post("/api/v1/public/cancellations/link").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reference\":\"" + reference + "\",\"email\":\"" + guestEmail.toUpperCase() + "\"}"))
                .andExpect(status().isAccepted());
        assertThat(mails("guest-cancel-link-")).isEqualTo(1);
    }
}
