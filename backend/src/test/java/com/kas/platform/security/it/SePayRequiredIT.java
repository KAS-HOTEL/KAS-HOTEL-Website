package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Owner 2026-11-14: SePay is the only way to pay. With the gateway off (the test profile sets no
 * SePay keys) a request cannot be sent for payment, even with a static QR in the payment account,
 * and it stays where it was. Rolled back.
 */
class SePayRequiredIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "test-sepay-required-73!";
    private static final String SALES = "/api/v1/admin/sales/requests/";

    @Autowired JdbcClient jdbc;

    private Cookie[] session;
    private String reference;

    @BeforeEach
    void prepare() throws Exception {
        UUID partnerId = fixtures.createPartner("sepay-required");
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        UUID actor = fixtures.createUser("sepay-required", PASSWORD);
        fixtures.grantGlobalScope(actor, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(actor), PASSWORD);
        reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, reference);
        jdbc.sql("UPDATE reservation SET guest_email = 'guest@example.invalid', total_minor = 1500000 WHERE reference = :ref")
                .param("ref", reference).update();
        jdbc.sql("UPDATE property SET email = 'hotel@example.invalid' WHERE id = :id").param("id", propertyId).update();
        jdbc.sql("UPDATE payment_account SET qr_url = 'https://images.example.invalid/qr.png'").update();
    }

    @Test
    @DisplayName("with SePay off, approval is refused (CONFIG_MISSING) and the request does not move")
    void approvalNeedsSePay() throws Exception {
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CONFIG_MISSING"));
        assertThat(jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference = :ref").param("ref", reference)
                .query(String.class).single()).isEqualTo("REQUESTED");
    }
}
