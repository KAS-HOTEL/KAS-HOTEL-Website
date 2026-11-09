package com.kas.platform.security.it;

import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Permission enforcement and the four scope kinds — doc 59 §2–§5, doc 85 §5.
 *
 * <p>Authentication, authorisation and scope are three separate questions here
 * and each is failed independently: an authenticated customer is refused for
 * want of a permission, and a permitted admin is still confined by scope.
 */
class RbacAndScopeIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "rbac-test-password-8812";

    @Autowired
    private PropertyRepository properties;

    // ------------------------------------------------------------------ RBAC

    @Test
    @DisplayName("an authenticated CUSTOMER is refused an ADMIN endpoint — 403, not 401")
    void customerLacksAdminPermission() throws Exception {
        UUID customer = fixtures.createUser("customer", PASSWORD);
        fixtures.grantOwnScope(customer);

        // 403 not 401 is the point: authentication succeeded, authorisation did
        // not. Doc 59 §5 gives CUSTOMER own-account permissions only.
        mockMvc.perform(get("/api/v1/admin/properties")
                        .cookie(login(fixtures.emailOf(customer), PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @DisplayName("an ADMIN holding property.manage is allowed")
    void adminHoldsPropertyManage() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        fixtures.createProperties(partner, 2);
        UUID admin = fixtures.createUser("admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partner);

        assertThat(com.kas.platform.identity.RoleCatalogue.permissionsFor(UserRole.ADMIN))
                .contains(Permissions.PROPERTY_MANAGE);

        mockMvc.perform(get("/api/v1/admin/properties")
                        .cookie(login(fixtures.emailOf(admin), PASSWORD)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a user with no active role assignment is refused everything")
    void noRoleAssignmentGrantsNothing() throws Exception {
        UUID orphan = fixtures.createUser("orphan", PASSWORD);
        // Deliberately no grant. Deny by default means this must not fall back to
        // some baseline set of rights.
        Cookie[] session = login(fixtures.emailOf(orphan), PASSWORD);

        mockMvc.perform(get("/api/v1/admin/properties").cookie(session))
                .andExpect(status().isForbidden());
        // /me is ownership-based, so it remains reachable — and empty.
        mockMvc.perform(get("/api/v1/me/sessions").cookie(session))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an undeclared route is refused even for an authenticated admin")
    void undeclaredRouteIsRefused() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        UUID admin = fixtures.createUser("admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partner);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        // Inside the admin tree, so it passes `authenticated()`, but no handler
        // declares it. It must not be reachable.
        //
        // `/admin/rates/grid` was this test's original example and is no longer
        // undeclared — Phase 7.5E implemented it. `/admin/tax-rules` replaces it
        // and makes this assertion do double duty: doc 58 §8 defines that route,
        // and it is deliberately absent because tax is outside KAS V1 by owner
        // decision (doc 99 §12). If a tax surface ever appears in V1, this fails
        // alongside `TaxIsOutOfScopeForV1Test`.
        mockMvc.perform(get("/api/v1/admin/tax-rules").cookie(session))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/admin/users").cookie(session))
                .andExpect(status().isNotFound());
        // Outside every declared tree: refused by the final denyAll.
        mockMvc.perform(get("/api/v1/internal/anything").cookie(session))
                .andExpect(status().isForbidden());
    }

    // ----------------------------------------------------------------- scope

    @Test
    @DisplayName("GLOBAL scope reaches every partner's properties")
    void globalScopeReachesEverything() {
        UUID partnerA = fixtures.createPartner("a");
        List<UUID> propertiesA = fixtures.createProperties(partnerA, 8);
        UUID partnerB = fixtures.createPartner("b");
        List<UUID> propertiesB = fixtures.createProperties(partnerB, 3);

        // GLOBAL is verified at the authorization layer where scope is decided.
        AuthorizationScope global = AuthorizationScope.global(UUID.randomUUID());

        assertThat(properties.findById(propertiesA.get(0), global)).isPresent();
        assertThat(properties.findById(propertiesB.get(0), global)).isPresent();
        assertThat(properties.countInScope(global)).isGreaterThanOrEqualTo(11);
    }

    @Test
    @DisplayName("GLOBAL is the only scope that is unrestricted")
    void onlyGlobalIsUnrestricted() {
        UUID partner = fixtures.createPartner("a");
        fixtures.createProperties(partner, 4);

        UUID actor = UUID.randomUUID();
        long global = properties.countInScope(AuthorizationScope.global(actor));
        long partnerScoped = properties.countInScope(AuthorizationScope.partner(actor, partner));

        assertThat(partnerScoped).isEqualTo(4);
        assertThat(global).isGreaterThanOrEqualTo(partnerScoped);
    }

    @Test
    @DisplayName("PROPERTY scope reaches only the assigned properties, over HTTP")
    void propertyScopeIsHonouredEndToEnd() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        List<UUID> all = fixtures.createProperties(partner, 8);
        List<UUID> assigned = all.subList(0, 2);

        UUID staff = fixtures.createUser("property-staff", PASSWORD);
        // No V1 role holds PROPERTY scope (doc 59 §3), so this is a data
        // configuration rather than a new role: the scope kind must already work
        // for the property-scoped staff doc 59 §6 anticipates.
        fixtures.grantPropertyScope(staff, UserRole.ADMIN, assigned);
        Cookie[] session = login(fixtures.emailOf(staff), PASSWORD);

        mockMvc.perform(get("/api/v1/admin/properties").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mockMvc.perform(get("/api/v1/admin/properties/" + assigned.get(0)).cookie(session))
                .andExpect(status().isOk());

        // Same partner, unassigned property. Scope is narrower than ownership.
        mockMvc.perform(get("/api/v1/admin/properties/" + all.get(7)).cookie(session))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("property scope cannot be widened by supplying another property_id")
    void propertyScopeCannotBeBypassedByPathManipulation() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        List<UUID> all = fixtures.createProperties(partner, 8);

        UUID staff = fixtures.createUser("property-staff", PASSWORD);
        fixtures.grantPropertyScope(staff, UserRole.ADMIN, List.of(all.get(0)));
        Cookie[] session = login(fixtures.emailOf(staff), PASSWORD);

        // Every other property of the same partner, tried one at a time.
        for (UUID unreachable : all.subList(1, all.size())) {
            mockMvc.perform(get("/api/v1/admin/properties/" + unreachable).cookie(session))
                    .andExpect(status().isNotFound());
        }
    }

    // ------------------------------------------------------------- OWN scope

    @Test
    @DisplayName("a customer sees only their own sessions")
    void customerSeesOnlyOwnSessions() throws Exception {
        UUID first = fixtures.createUser("customer-one", PASSWORD);
        fixtures.grantOwnScope(first);
        UUID second = fixtures.createUser("customer-two", PASSWORD);
        fixtures.grantOwnScope(second);

        login(fixtures.emailOf(second), PASSWORD);
        login(fixtures.emailOf(second), PASSWORD);
        Cookie[] firstSession = login(fixtures.emailOf(first), PASSWORD);

        mockMvc.perform(get("/api/v1/me/sessions").cookie(firstSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("a customer cannot revoke another customer's session — 404")
    void customerCannotRevokeAnotherSession() throws Exception {
        UUID victim = fixtures.createUser("victim", PASSWORD);
        fixtures.grantOwnScope(victim);
        UUID attacker = fixtures.createUser("attacker", PASSWORD);
        fixtures.grantOwnScope(attacker);

        login(fixtures.emailOf(victim), PASSWORD);
        UUID victimSessionId = fixtures.firstActiveSessionId(victim);

        // The id is a valid, existing session. Holding a reference is not holding
        // a right — doc 58 §10: "a reference is an identifier, never a credential".
        mockMvc.perform(delete("/api/v1/me/sessions/" + victimSessionId)
                        .with(csrf())
                        .cookie(login(fixtures.emailOf(attacker), PASSWORD)))
                .andExpect(status().isNotFound());

        assertThat(fixtures.activeSessionCount(victim))
                .as("the victim's session must survive")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("sign out everywhere revokes only the caller's own sessions")
    void signOutEverywhereIsScopedToTheCaller() throws Exception {
        UUID one = fixtures.createUser("customer-one", PASSWORD);
        fixtures.grantOwnScope(one);
        UUID two = fixtures.createUser("customer-two", PASSWORD);
        fixtures.grantOwnScope(two);

        login(fixtures.emailOf(one), PASSWORD);
        Cookie[] oneSession = login(fixtures.emailOf(one), PASSWORD);
        login(fixtures.emailOf(two), PASSWORD);

        mockMvc.perform(delete("/api/v1/me/sessions").with(csrf()).cookie(oneSession))
                .andExpect(status().isNoContent());

        assertThat(fixtures.activeSessionCount(one)).isZero();
        assertThat(fixtures.activeSessionCount(two))
                .as("another customer's sessions are untouched")
                .isEqualTo(1);
    }

}
