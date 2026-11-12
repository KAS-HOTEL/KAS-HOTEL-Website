package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.ReservationEmailActionTokenService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Owner 2026-11-10: SePay makes its own QR for every order, so with the gateway on the static
 * QR of the payment account is optional. Approval goes through without it; the guest page
 * offers SePay alone, and manual transfer only when a static QR is kept. Rolled back.
 *
 * <p>SePay is "on" here only by configuration (fake sandbox keys); nothing calls SePay: the
 * deadline sweep that could cancel checkouts is off for this context.
 */
@TestPropertySource(properties = {
        "kas.sepay.environment=sandbox",
        "kas.sepay.merchant-id=SP-TEST-IT",
        "kas.sepay.secret-key=spsk_it_dummy",
        "kas.booking.payment-deadline-sweep.enabled=false"})
class SePayOnlyPaymentIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "test-sepay-only-payment-91!";
    private static final String SALES = "/api/v1/admin/sales/requests/";
    private static final String ACTIONS = "/api/v1/public/reservation-actions/";

    @Autowired JdbcClient jdbc;
    @Autowired ReservationEmailActionTokenService tokens;

    private Cookie[] session;
    private String reference;
    private UUID reservationId;

    @BeforeEach
    void prepare() throws Exception {
        UUID partnerId = fixtures.createPartner("sepay-only");
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        UUID actor = fixtures.createUser("sepay-only", PASSWORD);
        fixtures.grantGlobalScope(actor, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(actor), PASSWORD);
        reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, reference);
        jdbc.sql("""
                UPDATE reservation SET guest_email = 'guest@example.invalid', guest_country = 'VN',
                       total_minor = 2160000, subtotal_minor = 2000000
                 WHERE reference = :ref
                """).param("ref", reference).update();
        reservationId = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref").param("ref", reference)
                .query(UUID.class).single();
        jdbc.sql("UPDATE property SET email = 'hotel@example.invalid' WHERE id = :id").param("id", propertyId).update();
        jdbc.sql("UPDATE payment_account SET qr_url = NULL, bank_name = NULL, account_holder = NULL, account_number = NULL").update();
    }

    private String salesStatus() {
        return jdbc.sql("SELECT sales_status::text FROM reservation WHERE id = :id").param("id", reservationId)
                .query(String.class).single();
    }

    private String guestPage() throws Exception {
        String token = tokens.issue(reservationId, "GUEST_MARK_PAID", "guest@example.invalid", Duration.ofHours(2));
        return mockMvc.perform(get(ACTIONS + token)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("with SePay on, approval needs no static QR and the guest page offers SePay only")
    void sePayWithoutStaticQr() throws Exception {
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isNoContent());
        assertThat(salesStatus()).isEqualTo("PAYMENT_PENDING");
        assertThat(jdbc.sql("SELECT payment_due_at IS NOT NULL FROM reservation WHERE id = :id")
                .param("id", reservationId).query(Boolean.class).single()).isTrue();

        String page = guestPage();
        assertThat(page).contains("/sepay\"").contains("Thanh toán online 2.160.000 VND");
        assertThat(page).doesNotContain("Tôi đã chuyển khoản").doesNotContain("Số tài khoản");
    }

    @Test
    @DisplayName("a static QR kept alongside SePay adds the manual transfer, with the bank details on the page")
    void sePayPlusManualTransfer() throws Exception {
        jdbc.sql("""
                UPDATE payment_account SET qr_url = 'https://images.example.invalid/qr.png', bank_name = 'Vietcombank',
                       account_holder = 'KAS HOTEL', account_number = '0123456789'
                """).update();
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isNoContent());

        String page = guestPage();
        assertThat(page).contains("/sepay\"").contains("Hoặc chuyển khoản").contains("Số tài khoản: 0123456789")
                .contains("Nội dung chuyển khoản: " + reference).contains("Tôi đã chuyển khoản");
    }
}
