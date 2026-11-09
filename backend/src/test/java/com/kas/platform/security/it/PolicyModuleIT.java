package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PolicyType;
import com.kas.platform.property.PropertyPolicyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The partner's policy module — {@code POST /api/v1/admin/policies} at both
 * scopes, and the scope predicates in {@link PropertyPolicyRepository} under it.
 *
 * <p>Over HTTP against PostgreSQL, like {@link PolicyIT}; every test rolls back.
 * Each test creates its own partners, so version numbers start from 1 whatever
 * the database already holds.
 */
class PolicyModuleIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "policy-module-password-7731";
    private static final String MODULE = "/api/v1/admin/policies";

    @Autowired
    private PropertyPolicyRepository repository;

    // ------------------------------------------------------ shared: no propertyId

    @Test
    @DisplayName("without propertyId, one shared DRAFT row is created for the caller's partner")
    void sharedPolicyIsCreatedForTheCallersPartner() throws Exception {
        Fixture f = partner();

        String body = create(f, shared("CANCELLATION", "2026-01-01"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("CANCELLATION"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.effectiveFrom").value("2026-01-01"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.scope").value("SHARED"))
                .andExpect(jsonPath("$.propertyId").doesNotExist())
                .andExpect(jsonPath("$.translations").isMap())
                .andReturn().getResponse().getContentAsString();

        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isEqualTo(1);
        assertThat(fixtures.policyCount(f.propertyId))
                .as("one row for the portfolio, never one per property")
                .isZero();
        assertThat(fixtures.auditCount("policy.created", idOf(body))).isEqualTo(1);
    }

    @Test
    @DisplayName("shared versions count up, independently of a property's override")
    void sharedVersioningIsPreserved() throws Exception {
        Fixture f = partner();

        create(f, shared("PETS", "2026-01-01")).andExpect(jsonPath("$.version").value(1));
        create(f, shared("PETS", "2026-06-01")).andExpect(jsonPath("$.version").value(2));
        create(f, scoped("PETS", "2026-01-01", f.propertyId))
                .andExpect(jsonPath("$.version").value(1));
        create(f, shared("PETS", "2027-01-01")).andExpect(jsonPath("$.version").value(3));
    }

    @Test
    @DisplayName("a shared policy takes translations and moves through the existing lifecycle")
    void sharedTranslationsAndLifecycleArePreserved() throws Exception {
        Fixture f = partner();
        UUID id = idOf(create(f, shared("SMOKING", "2026-01-01"))
                .andReturn().getResponse().getContentAsString());

        // The activation gate still applies: no text, no ACTIVE.
        setStatus(f, id, "ACTIVE").andExpect(status().isBadRequest());

        translate(f, id, "en", "TEST_SHARED_BODY_EN");
        translate(f, id, "vi", "TEST_SHARED_BODY_VI");
        setStatus(f, id, "ACTIVE").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        mockMvc.perform(get(MODULE + "/" + id).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("SHARED"))
                .andExpect(jsonPath("$.translations.en").value("TEST_SHARED_BODY_EN"))
                .andExpect(jsonPath("$.translations.vi").value("TEST_SHARED_BODY_VI"));

        setStatus(f, id, "ARCHIVED").andExpect(status().isOk());
        setStatus(f, id, "ACTIVE").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a shared policy is invisible and untouchable to another partner")
    void sharedPolicyIsIsolatedBetweenPartners() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        UUID aShared = idOf(create(a, shared("CHILDREN", "2026-01-01"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get(MODULE).cookie(b.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(MODULE + "/" + aShared).cookie(b.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(MODULE + "/" + aShared + "/translations")
                        .with(csrf()).cookie(b.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"en\",\"body\":\"TEST_HIJACK\"}"))
                .andExpect(status().isNotFound());
        setStatus(b, aShared, "ARCHIVED").andExpect(status().isNotFound());

        // B's own first shared CHILDREN is v1: A's rows were not counted.
        create(b, shared("CHILDREN", "2026-01-01")).andExpect(jsonPath("$.version").value(1));
        assertThat(fixtures.sharedPolicyCount(a.partnerId)).isEqualTo(1);
        assertThat(fixtures.policyStatusOf(aShared)).isEqualTo("DRAFT");
    }

    // ---------------------------------------------- property-specific: propertyId

    @Test
    @DisplayName("with propertyId in scope, a DRAFT override is created for that property")
    void propertyPolicyIsCreatedInScope() throws Exception {
        Fixture f = partner();

        String body = create(f, scoped("CANCELLATION", "2026-01-01", f.propertyId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.scope").value("PROPERTY"))
                .andExpect(jsonPath("$.propertyId").value(f.propertyId.toString()))
                .andReturn().getResponse().getContentAsString();

        assertThat(fixtures.policyCount(f.propertyId)).isEqualTo(1);
        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isZero();
        assertThat(fixtures.auditCount("policy.created", idOf(body))).isEqualTo(1);

        // The same row the property route serves — one policy system, two ways in.
        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/policies/" + idOf(body))
                        .cookie(f.session))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("another partner's property is a 404 indistinguishable from a missing one")
    void foreignPropertyIsRefusedWithoutDisclosure() throws Exception {
        Fixture a = partner();
        Fixture b = partner();

        String foreign = create(a, scoped("PETS", "2026-01-01", b.propertyId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andReturn().getResponse().getContentAsString();
        String missing = create(a, scoped("PETS", "2026-01-01", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertThat(withoutCorrelation(foreign)).isEqualTo(withoutCorrelation(missing));
        assertThat(foreign)
                .doesNotContain(b.propertyId.toString())
                .doesNotContain(b.partnerId.toString());
        assertThat(fixtures.policyCount(b.propertyId)).isZero();
        assertThat(fixtures.sharedPolicyCount(a.partnerId)).isZero();
    }

    @Test
    @DisplayName("an override keeps the existing lifecycle and activation gate")
    void propertyPolicyLifecycleIsPreserved() throws Exception {
        Fixture f = partner();
        UUID id = idOf(create(f, scoped("PAYMENT", "2026-01-01", f.propertyId))
                .andReturn().getResponse().getContentAsString());

        setStatus(f, id, "ACTIVE").andExpect(status().isBadRequest());
        translate(f, id, "en", "TEST_OVERRIDE_BODY_EN");
        translate(f, id, "vi", "TEST_OVERRIDE_BODY_VI");
        setStatus(f, id, "ACTIVE").andExpect(status().isOk());
        setStatus(f, id, "PAUSED").andExpect(status().isOk());
        setStatus(f, id, "DRAFT").andExpect(status().isConflict());
    }

    // ------------------------------------------------------------- both branches

    @Test
    @DisplayName("platform policy types are refused at both scopes, and nothing is written")
    void platformTypesAreRefusedAtBothScopes() throws Exception {
        Fixture f = partner();

        for (String type : new String[]{"PRIVACY", "TERMS", "COOKIES"}) {
            create(f, shared(type, "2026-01-01"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details[0].code").value("NOT_PROPERTY_SCOPED"));
            create(f, scoped(type, "2026-01-01", f.propertyId))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details[0].code").value("NOT_PROPERTY_SCOPED"));
        }
        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isZero();
        assertThat(fixtures.policyCount(f.propertyId)).isZero();
    }

    @Test
    @DisplayName("missing or malformed fields are a 400, at both scopes, and nothing is written")
    void malformedBodiesAreRefused() throws Exception {
        Fixture f = partner();
        String property = ",\"propertyId\":\"" + f.propertyId + "\"";

        for (String extra : new String[]{"", property}) {
            create(f, "{\"effectiveFrom\":\"2026-01-01\"" + extra + "}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value("type"));
            create(f, "{\"type\":\"PETS\"" + extra + "}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details[0].field").value("effectiveFrom"));
            create(f, "{\"type\":\"PETS\",\"effectiveFrom\":\"not-a-date\"" + extra + "}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
            create(f, "{\"type\":\"DEPOSIT\",\"effectiveFrom\":\"2026-01-01\"" + extra + "}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        create(f, "{\"type\":\"PETS\",\"effectiveFrom\":\"2026-01-01\",\"propertyId\":\"nope\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        create(f, "{not json").andExpect(status().isBadRequest());

        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isZero();
        assertThat(fixtures.policyCount(f.propertyId)).isZero();
    }

    @Test
    @DisplayName("anonymous is 401, a customer is 403, at both scopes")
    void callersWithoutPropertyManageAreRefused() throws Exception {
        Fixture f = partner();
        UUID customer = fixtures.createUser("policy-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        Cookie[] customerSession = login(fixtures.emailOf(customer), PASSWORD);

        for (String body : new String[]{
                shared("PETS", "2026-01-01"), scoped("PETS", "2026-01-01", f.propertyId)}) {
            mockMvc.perform(post(MODULE).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized());
            mockMvc.perform(post(MODULE).with(csrf()).cookie(customerSession)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isZero();
        assertThat(fixtures.policyCount(f.propertyId)).isZero();
    }

    @Test
    @DisplayName("PROPERTY-scoped staff cannot author a policy for the whole portfolio")
    void propertyScopedStaffCannotCreateSharedPolicy() throws Exception {
        Fixture f = partner();
        UUID staff = fixtures.createUser("policy-staff", PASSWORD);
        fixtures.grantPropertyScope(staff, UserRole.ADMIN, List.of(f.propertyId));
        Cookie[] session = login(fixtures.emailOf(staff), PASSWORD);

        mockMvc.perform(post(MODULE).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(shared("PETS", "2026-01-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(fixtures.sharedPolicyCount(f.partnerId)).isZero();
    }

    // ------------------------------------------------- repository scope predicates

    @Test
    @DisplayName("repository: a shared row is written only within the caller's partner reach")
    void repositoryCreateSharedHonoursScope() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        LocalDate date = LocalDate.parse("2026-01-01");

        assertThat(repository.createShared(a.partnerId, PolicyType.PETS, 1, date, scopeOf(b)))
                .as("another partner's scope writes nothing")
                .isEmpty();
        assertThat(repository.createShared(a.partnerId, PolicyType.PETS, 1, date,
                AuthorizationScope.property(UUID.randomUUID(), Set.of(a.propertyId))))
                .as("one property of the portfolio is not the portfolio")
                .isEmpty();
        assertThat(fixtures.sharedPolicyCount(a.partnerId)).isZero();

        assertThat(repository.createShared(a.partnerId, PolicyType.PETS, 1, date, scopeOf(a)))
                .isPresent();
        assertThat(fixtures.sharedPolicyCount(a.partnerId)).isEqualTo(1);
    }

    @Test
    @DisplayName("repository: versions, rows and translations are read only within scope")
    void repositoryReadsHonourScope() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        create(a, shared("CANCELLATION", "2026-01-01"));
        UUID aShared = idOf(create(a, shared("CANCELLATION", "2026-06-01"))
                .andReturn().getResponse().getContentAsString());
        UUID aOverride = idOf(create(a, scoped("CANCELLATION", "2026-01-01", a.propertyId))
                .andReturn().getResponse().getContentAsString());
        translate(a, aShared, "en", "TEST_SECRET_SHARED");
        translate(a, aOverride, "en", "TEST_SECRET_OVERRIDE");

        // Within scope: the real numbers and rows.
        assertThat(repository.nextVersion(a.partnerId, null, PolicyType.CANCELLATION, scopeOf(a)))
                .isEqualTo(3);
        assertThat(repository.nextVersion(a.partnerId, a.propertyId, PolicyType.CANCELLATION,
                scopeOf(a))).isEqualTo(2);
        assertThat(repository.findTranslations(aShared, a.partnerId, scopeOf(a)))
                .containsEntry("en", "TEST_SECRET_SHARED");

        // Partner A's ids presented under B's scope: nothing of A's is visible.
        AuthorizationScope bScope = scopeOf(b);
        assertThat(repository.nextVersion(a.partnerId, null, PolicyType.CANCELLATION, bScope))
                .as("A's two shared versions are not counted")
                .isEqualTo(1);
        assertThat(repository.nextVersion(a.partnerId, a.propertyId, PolicyType.CANCELLATION,
                bScope)).isEqualTo(1);
        assertThat(repository.findTranslations(aShared, a.partnerId, bScope)).isEmpty();
        assertThat(repository.findTranslations(aOverride, a.partnerId, bScope)).isEmpty();
        assertThat(repository.findById(aShared, a.partnerId, bScope)).isEmpty();
        assertThat(repository.findById(aOverride, a.partnerId, bScope)).isEmpty();
        assertThat(repository.findByPartner(a.partnerId, bScope)).isEmpty();
        assertThat(repository.resolveForProperty(a.propertyId, a.partnerId, bScope)).isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("policy-module");
        UUID admin = fixtures.createUser("policy-module-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        return new Fixture(partnerId, propertyId, session);
    }

    private static AuthorizationScope scopeOf(Fixture f) {
        return AuthorizationScope.partner(UUID.randomUUID(), f.partnerId);
    }

    private ResultActions create(Fixture f, String body) throws Exception {
        return mockMvc.perform(post(MODULE).with(csrf()).cookie(f.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private void translate(Fixture f, UUID policyId, String locale, String text) throws Exception {
        mockMvc.perform(patch(MODULE + "/" + policyId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"body\":\"" + text + "\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions setStatus(Fixture f, UUID policyId, String status) throws Exception {
        return mockMvc.perform(patch(MODULE + "/" + policyId + "/status?status=" + status)
                .with(csrf()).cookie(f.session));
    }

    private static String shared(String type, String effectiveFrom) {
        return "{\"type\":\"%s\",\"effectiveFrom\":\"%s\"}".formatted(type, effectiveFrom);
    }

    private static String scoped(String type, String effectiveFrom, UUID propertyId) {
        return "{\"type\":\"%s\",\"effectiveFrom\":\"%s\",\"propertyId\":\"%s\"}"
                .formatted(type, effectiveFrom, propertyId);
    }

    private static UUID idOf(String body) {
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private static String withoutCorrelation(String body) {
        return body.replaceAll("\"correlationId\"\\s*:\\s*\"[^\"]*\"", "");
    }
}
