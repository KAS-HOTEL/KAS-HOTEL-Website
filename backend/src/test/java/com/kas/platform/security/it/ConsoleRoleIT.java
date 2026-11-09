package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Admin and Super Admin consoles against what the backend actually permits.
 *
 * <p>{@code navigation.tsx} gives each screen to exactly one role, and the lists
 * below prove each role is refused the other's. A change to {@code RoleCatalogue}
 * that moves a screen fails here, so the menu cannot drift from the permissions.
 */
class ConsoleRoleIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "console-role-password-5521";
    private Cookie[] admin;

    @BeforeEach
    void signInAdmin() throws Exception {
        UUID partner = fixtures.createPartner("console-role");
        UUID user = fixtures.createUser("console-admin", PASSWORD);
        fixtures.grantPartnerScope(user, partner);
        admin = login(fixtures.emailOf(user), PASSWORD);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/admin/properties",
            "/api/v1/admin/property-submissions",
            "/api/v1/admin/policies",
            "/api/v1/admin/site-image-slots"})
    void adminReachesTheScreensOfItsConsole(String path) throws Exception {
        mockMvc.perform(get(path).cookie(admin)).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/admin/customers",
            "/api/v1/admin/vouchers",
            "/api/v1/admin/sales/requests",
            "/api/v1/admin/ops/reservations",
            "/api/v1/admin/ops/reservations/cancellation-requests",
            "/api/v1/admin/payment-account",
            "/api/v1/admin/surcharges",
            "/api/v1/admin/reviews?hotelKey=&includeHidden=true&page=0"})
    void adminIsRefusedTheSuperAdminScreens(String path) throws Exception {
        mockMvc.perform(get(path).cookie(admin)).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/admin/customers",
            "/api/v1/admin/vouchers",
            "/api/v1/admin/sales/requests",
            "/api/v1/admin/ops/reservations",
            "/api/v1/admin/ops/reservations/cancellation-requests",
            "/api/v1/admin/payment-account",
            "/api/v1/admin/surcharges",
            "/api/v1/admin/reviews?hotelKey=&includeHidden=true&page=0"})
    void superAdminReachesThem(String path) throws Exception {
        UUID user = fixtures.createUser("console-super", PASSWORD);
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        mockMvc.perform(get(path).cookie(login(fixtures.emailOf(user), PASSWORD))).andExpect(status().isOk());
    }

    /**
     * Room prices moved to SUPER_ADMIN (2026-11-08). {@code rate.view} lets it read the
     * hotel list it prices — but it still cannot create or change a hotel.
     */
    @Test
    void superAdminReadsHotelsForPricingButCannotEditThem() throws Exception {
        UUID user = fixtures.createUser("console-super", PASSWORD);
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        Cookie[] session = login(fixtures.emailOf(user), PASSWORD);
        mockMvc.perform(get("/api/v1/admin/properties").cookie(session)).andExpect(status().isOk());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/admin/properties")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                        .cookie(session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"x\",\"slug\":\"console-role-x\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/admin/rates/base?propertyId=" + UUID.randomUUID()).cookie(admin))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/v1/admin/property-submissions",
            "/api/v1/admin/policies",
            "/api/v1/admin/site-image-slots"})
    void superAdminIsRefusedTheAdminScreens(String path) throws Exception {
        UUID user = fixtures.createUser("console-super", PASSWORD);
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        mockMvc.perform(get(path).cookie(login(fixtures.emailOf(user), PASSWORD))).andExpect(status().isForbidden());
    }

    @Test
    void theConsoleFollowsTheRole() throws Exception {
        mockMvc.perform(get("/api/v1/me/console").cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.console").value("ADMIN"));

        UUID superAdmin = fixtures.createUser("console-super", PASSWORD);
        fixtures.grantGlobalScope(superAdmin, UserRole.SUPER_ADMIN);
        mockMvc.perform(get("/api/v1/me/console").cookie(login(fixtures.emailOf(superAdmin), PASSWORD)))
                .andExpect(jsonPath("$.console").value("SUPER_ADMIN"));

        UUID customer = fixtures.createUser("console-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        mockMvc.perform(get("/api/v1/me/console").cookie(login(fixtures.emailOf(customer), PASSWORD)))
                .andExpect(jsonPath("$.console").value("NONE"));

        mockMvc.perform(get("/api/v1/me/console")).andExpect(status().isUnauthorized());
    }
}
