package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Partner self-registration is withdrawn — doc 154.
 *
 * <p>Staff use one shared SUPER_ADMIN account that KAS creates, so
 * {@code POST /api/v1/public/auth/register} no longer exists and must create
 * nothing. The suite that covered the former endpoint is in version control
 * history should the feature return.
 */
class PartnerRegistrationIT extends SecurityIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("the partner registration endpoint is gone and creates no account")
    void registrationIsWithdrawn() throws Exception {
        String email = "reg-" + UUID.randomUUID() + "@kas.invalid";

        MvcResult result = mockMvc.perform(post("/api/v1/public/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Nguyen Van A\",\"email\":\"" + email
                                + "\",\"phone\":\"+84 912 345 678\",\"password\":\"Passphrase91\","
                                + "\"hotelName\":\"Khach san Ben Nghe\"}"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isNotIn(200, 201, 204);
        assertThat(cookieNamed(cookiesOf(result), "kas_access")).isNull();
        assertThat(jdbc.sql("SELECT count(*) FROM app_user WHERE email = :email")
                .param("email", email).query(Long.class).single()).isZero();
    }
}
