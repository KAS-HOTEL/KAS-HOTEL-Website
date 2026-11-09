package com.kas.platform.security.it;

import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cross-partner isolation — doc 85 §6.3 and §10 control 5.
 *
 * <blockquote>Seed two partners with properties. Authenticate as Partner A's
 * admin. Assert that every admin endpoint returns <strong>404 (not 403)</strong>
 * for Partner B's records — <strong>including when {@code property_id} is
 * supplied directly in the path or body</strong>.</blockquote>
 *
 * <p>The tests run at two levels on purpose. A controller-only test would pass
 * just as happily if the filtering lived in the controller, which is the design
 * doc 59 §7.3 rejects: "a forgotten controller check cannot leak another
 * property's data" is only true if the enforcement is underneath.
 */
class PartnerIsolationIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "partner-admin-password-2291";

    @Autowired
    private PropertyRepository properties;

    @Test
    @DisplayName("the V1 Partner/Sales admin reaches all 8 properties through PARTNER scope")
    void partnerAdminReachesAllEightProperties() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        fixtures.createProperties(partner, SecurityFixtures.V1_PROPERTY_COUNT);
        UUID admin = fixtures.createUser("kas-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partner);

        // One account, one role assignment, eight properties. Doc 85 §2.2: no
        // enumerated property array to hand-maintain, so adding a ninth property
        // needs no change to any user.
        mockMvc.perform(get("/api/v1/admin/properties")
                        .cookie(login(fixtures.emailOf(admin), PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(SecurityFixtures.V1_PROPERTY_COUNT));
    }

    @Test
    @DisplayName("a ninth property is reached with no change to the user or its assignment")
    void newPropertyIsReachedWithoutTouchingTheUser() throws Exception {
        UUID partner = fixtures.createPartner("kas");
        fixtures.createProperties(partner, SecurityFixtures.V1_PROPERTY_COUNT);
        UUID admin = fixtures.createUser("kas-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partner);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        fixtures.createProperties(partner, 1);

        // This is the concrete failure doc 85 §2.2 problem 2 describes: with an
        // enumerated property array the new hotel would be silently invisible.
        mockMvc.perform(get("/api/v1/admin/properties").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(SecurityFixtures.V1_PROPERTY_COUNT + 1));
    }

    @Test
    @DisplayName("Partner A's admin reads Partner A's property")
    void ownPropertyIsReadable() throws Exception {
        UUID partnerA = fixtures.createPartner("a");
        List<UUID> propertiesA = fixtures.createProperties(partnerA, 2);
        UUID adminA = fixtures.createUser("admin-a", PASSWORD);
        fixtures.grantPartnerScope(adminA, partnerA);

        mockMvc.perform(get("/api/v1/admin/properties/" + propertiesA.get(0))
                        .cookie(login(fixtures.emailOf(adminA), PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(propertiesA.get(0).toString()));
    }

    @Test
    @DisplayName("Partner A's admin gets 404 — not 403 — for Partner B's property")
    void anotherPartnersPropertyIsNotFound() throws Exception {
        UUID partnerA = fixtures.createPartner("a");
        fixtures.createProperties(partnerA, 2);
        UUID partnerB = fixtures.createPartner("b");
        List<UUID> propertiesB = fixtures.createProperties(partnerB, 2);

        UUID adminA = fixtures.createUser("admin-a", PASSWORD);
        fixtures.grantPartnerScope(adminA, partnerA);

        // 404 rather than 403: a 403 would confirm the id names a real property,
        // letting Partner A enumerate Partner B's estate one guess at a time.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertiesB.get(0))
                        .cookie(login(fixtures.emailOf(adminA), PASSWORD)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("the 404 for another partner is indistinguishable from a 404 for nothing")
    void missingAndForbiddenAreIndistinguishable() throws Exception {
        UUID partnerA = fixtures.createPartner("a");
        fixtures.createProperties(partnerA, 1);
        UUID partnerB = fixtures.createPartner("b");
        UUID realPropertyOfB = fixtures.createProperties(partnerB, 1).get(0);

        UUID adminA = fixtures.createUser("admin-a", PASSWORD);
        fixtures.grantPartnerScope(adminA, partnerA);
        Cookie[] session = login(fixtures.emailOf(adminA), PASSWORD);

        String otherPartners = mockMvc.perform(
                        get("/api/v1/admin/properties/" + realPropertyOfB).cookie(session))
                .andExpect(status().isNotFound()).andReturn()
                .getResponse().getContentAsString();

        String nonExistent = mockMvc.perform(
                        get("/api/v1/admin/properties/" + UUID.randomUUID()).cookie(session))
                .andExpect(status().isNotFound()).andReturn()
                .getResponse().getContentAsString();

        assertThat(strip(otherPartners)).isEqualTo(strip(nonExistent));
    }

    @Test
    @DisplayName("each partner's list contains only its own properties")
    void listsDoNotOverlap() throws Exception {
        UUID partnerA = fixtures.createPartner("a");
        fixtures.createProperties(partnerA, 8);
        UUID partnerB = fixtures.createPartner("b");
        fixtures.createProperties(partnerB, 3);

        UUID adminA = fixtures.createUser("admin-a", PASSWORD);
        fixtures.grantPartnerScope(adminA, partnerA);
        UUID adminB = fixtures.createUser("admin-b", PASSWORD);
        fixtures.grantPartnerScope(adminB, partnerB);

        mockMvc.perform(get("/api/v1/admin/properties")
                        .cookie(login(fixtures.emailOf(adminA), PASSWORD)))
                .andExpect(jsonPath("$.length()").value(8));

        // The future second partner resolves to its own estate with no code change
        // — doc 85 §2.3, the entire reason the Partner entity was added early.
        mockMvc.perform(get("/api/v1/admin/properties")
                        .cookie(login(fixtures.emailOf(adminB), PASSWORD)))
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    @DisplayName("isolation holds at the REPOSITORY, not only in the controller")
    void isolationIsEnforcedAtTheQuery() {
        UUID partnerA = fixtures.createPartner("a");
        List<UUID> propertiesA = fixtures.createProperties(partnerA, 8);
        UUID partnerB = fixtures.createPartner("b");
        List<UUID> propertiesB = fixtures.createProperties(partnerB, 3);

        UUID actorA = UUID.randomUUID();
        AuthorizationScope scopeA = AuthorizationScope.partner(actorA, partnerA);

        // Called directly, bypassing every controller and filter. If enforcement
        // lived above this line, these assertions would fail.
        assertThat(properties.findById(propertiesA.get(0), scopeA)).isPresent();
        assertThat(properties.findById(propertiesB.get(0), scopeA))
                .as("Partner B's property must not be reachable with Partner A's scope")
                .isEmpty();
        assertThat(properties.countInScope(scopeA)).isEqualTo(8);
        assertThat(properties.findAll(scopeA))
                .extracting(p -> p.partnerId())
                .containsOnly(partnerA);

        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        assertThat(properties.countInScope(scopeB)).isEqualTo(3);
        assertThat(properties.findById(propertiesA.get(0), scopeB)).isEmpty();
    }

    @Test
    @DisplayName("OWN scope reaches no property at all")
    void customerScopeReachesNoProperty() {
        UUID partner = fixtures.createPartner("a");
        List<UUID> owned = fixtures.createProperties(partner, 3);

        AuthorizationScope customer = AuthorizationScope.own(UUID.randomUUID());

        assertThat(properties.countInScope(customer)).isZero();
        assertThat(properties.findById(owned.get(0), customer)).isEmpty();
    }

    private static String strip(String body) {
        return body.replaceAll("\"correlationId\":\"[^\"]*\"", "\"correlationId\":\"*\"");
    }
}
