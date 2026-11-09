package com.kas.platform.security;

import com.kas.platform.shared.CorrelationId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Deny by default, exercised against the real filter chain over HTTP.
 *
 * <p>Doc 59 §7.1. The routes used below intentionally do not exist as
 * controllers: the point is that security refuses them <em>before</em> anything
 * is dispatched, so adding a controller at that path later cannot publish it by
 * accident.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityBoundaryTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("an unauthenticated admin request is refused with 401 in the doc 58 error shape")
    void unauthenticatedAdminRequestIsRefused() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ops/reservations"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.correlationId").isNotEmpty())
                .andExpect(header().exists(CorrelationId.HEADER));
    }

    @Test
    @DisplayName("a listed website origin may preflight PATCH; any other origin may not")
    void corsAllowsPatchOnlyForListedOrigins() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/v1/admin/site-image-slots/hero")
                        .header("Origin", "https://kasluxuryhotel.com")
                        .header("Access-Control-Request-Method", "PATCH"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://kasluxuryhotel.com"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/v1/admin/site-image-slots/hero")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "PATCH"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an AUTHENTICATED actor holding the wrong permission is refused")
    void authenticatedRequestWithWrongPermissionIsRefused() throws Exception {
        // Authentication and authorisation are separate questions, failed
        // separately: this caller is definitely someone, and still may not.
        // reservation.view is a real permission from doc 59 §4.2; it simply is
        // not the one this endpoint declares.
        mockMvc.perform(get("/api/v1/admin/properties")
                        .with(user("staff").authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority(
                                        com.kas.platform.identity.Permissions.RESERVATION_VIEW))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @DisplayName("an authenticated actor cannot reach a route with no handler")
    void authenticatedRequestToNonExistentAdminRouteIsNotServed() throws Exception {
        // No handler exists, so nothing is served. If a handler is ever added
        // here without declaring its permission, UndeclaredEndpointGuard refuses
        // it at runtime and DenyByDefaultTest fails the build.
        //
        // This used to name /admin/ops/reservations, which doc 58 §6 freezes and
        // which has since been implemented. The route below is from the same
        // frozen section and is still unimplemented, so the assertion keeps its
        // exact original meaning: a path the contract names but no controller
        // serves is a 404, not a half-answer.
        mockMvc.perform(get("/api/v1/admin/ops/arrivals")
                        .with(user("staff").authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority(
                                        com.kas.platform.identity.Permissions.RESERVATION_VIEW))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a route invented at random is refused, not served")
    void unknownAdminRouteIsRefused() throws Exception {
        mockMvc.perform(get("/api/v1/admin/anything/at/all"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the public surface is reachable without authentication")
    void publicSurfaceIsNotBlockedBySecurity() throws Exception {
        // Served, unauthenticated — the doc 58 §1 contract for /api/v1/public/**.
        // Until Phase 7.5 there was no handler and this asserted 404; what has
        // always mattered is that it is NOT 401.
        //
        // The body is an empty list rather than the eight seed properties, and
        // that is the publication guarantee showing up here by accident: all
        // eight are DRAFT, so PublishedPropertyRepository excludes them.
        mockMvc.perform(get("/api/v1/public/properties"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("liveness answers an unauthenticated orchestrator")
    void livenessProbeIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("actuator endpoints other than health are not reachable")
    void otherActuatorEndpointsAreRefused() throws Exception {
        // Neither exposed nor permitted. `env` and `configprops` would disclose
        // configuration; `beans` and `mappings` would map the attack surface.
        for (String endpoint : new String[]{"env", "configprops", "beans", "mappings", "loggers"}) {
            mockMvc.perform(get("/actuator/" + endpoint))
                    .andExpect(status().is4xxClientError());
        }
    }

    @Test
    @DisplayName("a refusal discloses nothing about why it was refused")
    void refusalLeaksNothing() throws Exception {
        String body = mockMvc.perform(get("/api/v1/admin/ops/reservations"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("Exception")
                .doesNotContain("org.springframework")
                .doesNotContain("com.kas.platform")
                .doesNotContain("jdbc")
                .doesNotContain("kas_web_app")
                .doesNotContain("at ");
    }
}
