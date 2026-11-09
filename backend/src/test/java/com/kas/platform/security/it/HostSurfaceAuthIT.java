package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Server separation (doc 156): the website proxy sends {@code X-KAS-Surface: customer},
 * the console proxy {@code X-KAS-Surface: console}. Staff sign in only on the console,
 * customers only on the website; without the header nothing changes.
 */
class HostSurfaceAuthIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "correct-horse-battery-staple-7431";
    private static final String SURFACE = "X-KAS-Surface";

    private ResultActions loginOn(String surface, String email) throws Exception {
        var request = post("/api/v1/public/auth/login").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(credentials(email, PASSWORD));
        if (surface != null) request.header(SURFACE, surface);
        return mockMvc.perform(request);
    }

    private UUID staff() {
        UUID id = fixtures.createUser("surface-staff", PASSWORD);
        fixtures.grantGlobalScope(id, UserRole.SUPER_ADMIN);
        return id;
    }

    private UUID customer() {
        UUID id = fixtures.createUser("surface-customer", PASSWORD);
        fixtures.grantOwnScope(id);
        return id;
    }

    @Test
    @DisplayName("staff cannot sign in through the customer website, and no session is opened")
    void staffRefusedOnCustomerSite() throws Exception {
        UUID id = staff();
        loginOn("customer", fixtures.emailOf(id))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.details[0].code").value("USE_ADMIN_CONSOLE"));
        assertThat(fixtures.activeSessionCount(id)).isZero();
    }

    @Test
    @DisplayName("a wrong staff password on the website is the usual uniform 401, not the host hint")
    void wrongPasswordStillUniform() throws Exception {
        UUID id = staff();
        var request = post("/api/v1/public/auth/login").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(credentials(fixtures.emailOf(id), "not-the-password"))
                .header(SURFACE, "customer");
        mockMvc.perform(request).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("staff sign in on the console")
    void staffSignInOnConsole() throws Exception {
        UUID id = staff();
        loginOn("console", fixtures.emailOf(id)).andExpect(status().isNoContent());
        assertThat(fixtures.activeSessionCount(id)).isEqualTo(1);
    }

    @Test
    @DisplayName("customers sign in on the website")
    void customerSignInOnWebsite() throws Exception {
        UUID id = customer();
        loginOn("customer", fixtures.emailOf(id)).andExpect(status().isNoContent());
        assertThat(fixtures.activeSessionCount(id)).isEqualTo(1);
    }

    @Test
    @DisplayName("customers cannot sign in through the console")
    void customerRefusedOnConsole() throws Exception {
        UUID id = customer();
        loginOn("console", fixtures.emailOf(id))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.details[0].code").value("USE_CUSTOMER_SITE"));
        assertThat(fixtures.activeSessionCount(id)).isZero();
    }

    @Test
    @DisplayName("without the header (direct API call) both kinds of account sign in as before")
    void noHeaderKeepsPreviousBehaviour() throws Exception {
        loginOn(null, fixtures.emailOf(staff())).andExpect(status().isNoContent());
        loginOn(null, fixtures.emailOf(customer())).andExpect(status().isNoContent());
        loginOn("something-else", fixtures.emailOf(customer())).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("a staff session is not extended on the website, but still is on the console")
    void staffRefreshRefusedOnCustomerSite() throws Exception {
        UUID id = staff();
        Cookie[] cookies = cookiesOf(loginOn("console", fixtures.emailOf(id)).andReturn());

        mockMvc.perform(post("/api/v1/public/auth/refresh").with(csrf()).cookie(cookies)
                        .header(SURFACE, "customer"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/public/auth/refresh").with(csrf()).cookie(cookies)
                        .header(SURFACE, "console"))
                .andExpect(status().isNoContent());
        assertThat(fixtures.activeSessionCount(id)).isEqualTo(1);
    }

    @Test
    @DisplayName("a customer session is not extended on the console")
    void customerRefreshRefusedOnConsole() throws Exception {
        UUID id = customer();
        Cookie[] cookies = cookiesOf(loginOn("customer", fixtures.emailOf(id)).andReturn());
        mockMvc.perform(post("/api/v1/public/auth/refresh").with(csrf()).cookie(cookies)
                        .header(SURFACE, "console"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("authorization is unchanged: a customer still cannot reach the admin API")
    void customerStillBlockedFromAdminApi() throws Exception {
        UUID id = customer();
        Cookie[] cookies = cookiesOf(loginOn("customer", fixtures.emailOf(id)).andReturn());
        mockMvc.perform(get("/api/v1/admin/properties").cookie(cookies))
                .andExpect(status().isForbidden());
    }
}
