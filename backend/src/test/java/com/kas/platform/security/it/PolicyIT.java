package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 7.5D — property policies, over HTTP, against PostgreSQL.
 *
 * <p>Covers the frozen type list, effective-dated versioning, translations, the
 * activation gate, lifecycle, isolation, publication filtering and audit.
 *
 * <p>No test asserts a policy <em>value</em>. Cancellation windows, deposit
 * percentages and child ages are unresolved business inputs (doc 51 A4/A5, B11,
 * B12); the fixtures below use obviously synthetic wording so nothing here can be
 * mistaken for a KAS commercial term.
 */
class PolicyIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "policy-password-5528";

    // -------------------------------------------------------------- policy types

    @Test
    @DisplayName("a policy type outside the frozen CHECK is refused")
    void unknownPolicyTypeIsRefused() throws Exception {
        Fixture f = partner();

        // CHECK_IN, EXTRA_BED and DEPOSIT are NOT in property_policy_type_valid.
        // Check-in times are columns on `property`; the other two are commercial
        // terms. None was added to the enum to make a nicer API.
        for (String absent : new String[]{"CHECK_IN", "CHECK_OUT", "EXTRA_BED", "DEPOSIT"}) {
            mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(create(absent, "2026-01-01")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }

    @Test
    @DisplayName("a platform-level policy type cannot be authored per property")
    void platformPolicyTypesAreRefused() throws Exception {
        Fixture f = partner();

        // PRIVACY, TERMS and COOKIES are global (property_id IS NULL) legal
        // documents. A Partner does not author them.
        for (String type : new String[]{"PRIVACY", "TERMS", "COOKIES"}) {
            mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(create(type, "2026-01-01")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details[0].code").value("NOT_PROPERTY_SCOPED"));
        }
    }

    // --------------------------------------------------------------- versioning

    @Test
    @DisplayName("versions are assigned by the platform and increment per type")
    void versionsIncrementPerType() throws Exception {
        Fixture f = partner();

        mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("CANCELLATION", "2026-01-01")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("CANCELLATION", "2026-06-01")))
                .andExpect(jsonPath("$.version").value(2));

        // A different type starts its own sequence.
        mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("PETS", "2026-01-01")))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    @DisplayName("a version number is never reused, even after the version is archived")
    void versionNumbersAreNeverReused() throws Exception {
        Fixture f = partner();
        UUID v1 = createPolicy(f, "CANCELLATION", LocalDate.now());
        UUID v2 = createPolicy(f, "CANCELLATION", LocalDate.now().plusDays(1));

        setStatus(f, v1, "ARCHIVED").andExpect(status().isOk());
        setStatus(f, v2, "ARCHIVED").andExpect(status().isOk());

        // max(version) + 1, not count + 1: a reused number would collide with a
        // reservation that pinned the old one through terms_version.
        mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("CANCELLATION", LocalDate.now().toString())))
                .andExpect(jsonPath("$.version").value(3));

        assertThat(fixtures.constraintExists("property_policy", "property_policy_unique"))
                .as("the read-then-insert above is guarded by the constraint, not by luck")
                .isTrue();
    }

    @Test
    @DisplayName("several versions may be ACTIVE at once — that is what effective_from is for")
    void multipleActiveVersionsCoexist() throws Exception {
        Fixture f = partner();
        activePolicy(f, "CANCELLATION", LocalDate.now().minusDays(30));
        activePolicy(f, "CANCELLATION", LocalDate.now().plusDays(30));

        // No constraint prevents this, and none should: a policy taking effect
        // next month sits alongside the one in force today.
        mockMvc.perform(get(policies(f)).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$[1].status").value("ACTIVE"));
    }

    // ------------------------------------------------------------- translations

    @Test
    @DisplayName("translations are stored per locale and updated in place")
    void translationsAreStoredPerLocale() throws Exception {
        Fixture f = partner();
        UUID policyId = createPolicy(f, "PETS", LocalDate.now());

        translate(f, policyId, "en", "TEST_POLICY_BODY_EN");
        translate(f, policyId, "vi", "TEST_POLICY_BODY_VI");

        mockMvc.perform(get(policies(f) + "/" + policyId).cookie(f.session))
                .andExpect(jsonPath("$.translations.en").value("TEST_POLICY_BODY_EN"))
                .andExpect(jsonPath("$.translations.vi").value("TEST_POLICY_BODY_VI"));

        // A second write to the same locale replaces, it does not duplicate:
        // (policy_id, locale) is the primary key.
        translate(f, policyId, "en", "TEST_POLICY_BODY_EN_REVISED");

        mockMvc.perform(get(policies(f) + "/" + policyId).cookie(f.session))
                .andExpect(jsonPath("$.translations.en").value("TEST_POLICY_BODY_EN_REVISED"))
                .andExpect(jsonPath("$.translations.length()").value(2));
    }

    @Test
    @DisplayName("a locale outside the frozen pair is refused")
    void unknownLocaleIsRefused() throws Exception {
        Fixture f = partner();
        UUID policyId = createPolicy(f, "PETS", LocalDate.now());

        mockMvc.perform(patch(policies(f) + "/" + policyId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"fr\",\"body\":\"TEST_POLICY_BODY_FR\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    // ---------------------------------------------------------- activation gate

    @Test
    @DisplayName("a policy cannot be activated without text in both locales")
    void activationRequiresBothLocales() throws Exception {
        Fixture f = partner();
        UUID policyId = createPolicy(f, "CANCELLATION", LocalDate.now());

        setStatus(f, policyId, "ACTIVE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("body"));

        translate(f, policyId, "en", "TEST_POLICY_BODY_EN");
        setStatus(f, policyId, "ACTIVE").andExpect(status().isBadRequest());

        translate(f, policyId, "vi", "TEST_POLICY_BODY_VI");
        setStatus(f, policyId, "ACTIVE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        assertThat(fixtures.policyStatusOf(policyId)).isEqualTo("ACTIVE");
    }

    // --------------------------------------------------------------- lifecycle

    @Test
    @DisplayName("ACTIVE can pause and resume; ARCHIVED is terminal")
    void lifecycleTransitions() throws Exception {
        Fixture f = partner();
        UUID policyId = activePolicy(f, "PETS", LocalDate.now());

        setStatus(f, policyId, "PAUSED").andExpect(status().isOk());
        setStatus(f, policyId, "ACTIVE").andExpect(status().isOk());
        setStatus(f, policyId, "ARCHIVED").andExpect(status().isOk());

        // A reservation may have pinned this version through terms_version, so it
        // is retired and kept readable — never deleted, never revived.
        setStatus(f, policyId, "ACTIVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        mockMvc.perform(get(policies(f) + "/" + policyId).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
    }

    @Test
    @DisplayName("a DRAFT policy cannot be paused")
    void draftCannotBePaused() throws Exception {
        Fixture f = partner();
        UUID policyId = createPolicy(f, "SMOKING", LocalDate.now());

        setStatus(f, policyId, "PAUSED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.policyStatusOf(policyId)).isEqualTo("DRAFT");
    }

    // ------------------------------------------------------------ authorisation

    @Test
    @DisplayName("policy routes require authentication and property.manage")
    void policyRoutesAreNotOpen() throws Exception {
        Fixture f = partner();

        mockMvc.perform(get(policies(f))).andExpect(status().isUnauthorized());

        UUID customer = fixtures.createUser("policy-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        Cookie[] customerSession = login(fixtures.emailOf(customer), PASSWORD);

        mockMvc.perform(get(policies(f)).cookie(customerSession))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(policies(f)).with(csrf()).cookie(customerSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("PETS", "2026-01-01")))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot read or change another Partner's policies")
    void crossPartnerIsolation() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        UUID bPolicy = activePolicy(b, "CANCELLATION", LocalDate.now());

        // 404, never 403 — doc 85 §6.3. A 403 would confirm the row exists.
        mockMvc.perform(get(policies(b)).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(policies(b) + "/" + bPolicy).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(policies(b) + "/" + bPolicy + "/status?status=ARCHIVED")
                        .with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(policies(b) + "/" + bPolicy + "/translations")
                        .with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"en\",\"body\":\"TEST_HIJACK\"}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(policies(b)).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create("PETS", "2026-01-01")))
                .andExpect(status().isNotFound());

        assertThat(fixtures.policyStatusOf(bPolicy))
                .as("B's policy is untouched")
                .isEqualTo("ACTIVE");
        assertThat(fixtures.policyCount(b.propertyId))
                .as("and A created nothing under B")
                .isEqualTo(1);
    }

    // ------------------------------------------------------- publication safety

    @Test
    @DisplayName("policies are public only when ACTIVE, effective, and the property is visible")
    void publicationRequiresAllThreeConditions() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);

        UUID policyId = createPolicy(f, "CANCELLATION", LocalDate.now());
        translate(f, policyId, "en", "TEST_POLICY_BODY_EN");
        translate(f, policyId, "vi", "TEST_POLICY_BODY_VI");

        // 1. DRAFT policy, DRAFT property
        assertNoPublicPolicies(slug);

        // 2. ACTIVE policy, but the property is still DRAFT
        setStatus(f, policyId, "ACTIVE").andExpect(status().isOk());
        assertNoPublicPolicies(slug);

        // 3. property approved — now, and only now, it appears
        approveProperty(f);
        mockMvc.perform(get(publicPolicies(slug)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].type").value("CANCELLATION"))
                .andExpect(jsonPath("$[0].version").value(1))
                .andExpect(jsonPath("$[0].body").value("TEST_POLICY_BODY_EN"));
    }

    @Test
    @DisplayName("a future-dated policy is not yet public")
    void futureDatedPolicyIsNotPublic() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);
        approveProperty(f);

        activePolicy(f, "PETS", LocalDate.now().plusDays(30));

        // ACTIVE, property visible — but effective_from has not arrived.
        assertNoPublicPolicies(slug);
    }

    @Test
    @DisplayName("a paused policy disappears from the public surface and can come back")
    void pausedPolicyIsNotPublic() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);
        approveProperty(f);

        UUID policyId = activePolicy(f, "SMOKING", LocalDate.now());
        mockMvc.perform(get(publicPolicies(slug))).andExpect(jsonPath("$.length()").value(1));

        setStatus(f, policyId, "PAUSED").andExpect(status().isOk());
        assertNoPublicPolicies(slug);

        setStatus(f, policyId, "ACTIVE").andExpect(status().isOk());
        mockMvc.perform(get(publicPolicies(slug))).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("only the current version of each type is public")
    void onlyCurrentVersionIsPublic() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);
        approveProperty(f);

        activePolicy(f, "CANCELLATION", LocalDate.now().minusDays(60));
        activePolicy(f, "CANCELLATION", LocalDate.now().minusDays(1));

        // Both ACTIVE and both effective; DISTINCT ON returns the newer only.
        mockMvc.perform(get(publicPolicies(slug)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].version").value(2));
    }

    @Test
    @DisplayName("the public endpoint serves the requested locale")
    void publicPolicyRespectsLocale() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);
        approveProperty(f);
        activePolicy(f, "CHILDREN", LocalDate.now());

        mockMvc.perform(get(publicPolicies(slug) + "?locale=vi"))
                .andExpect(jsonPath("$[0].body").value("TEST_POLICY_BODY_VI"));
        mockMvc.perform(get(publicPolicies(slug)))
                .andExpect(jsonPath("$[0].body").value("TEST_POLICY_BODY_EN"));
    }

    @Test
    @DisplayName("the public policy response exposes nothing internal")
    void publicPolicyResponseIsClean() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        approveProperty(f);
        UUID policyId = activePolicy(f, "CANCELLATION", LocalDate.now());

        String body = mockMvc.perform(get(publicPolicies(fixtures.slugOf(f.propertyId))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("partnerId")
                .doesNotContain("propertyId")
                .doesNotContain("status")
                .doesNotContain("effectiveFrom")
                .doesNotContain(f.partnerId.toString())
                .doesNotContain(f.propertyId.toString())
                .doesNotContain(policyId.toString());
        // version IS public — doc 58 §3.1 returns it so a reservation can pin
        // termsVersion and the guest can be shown what they agreed to.
        assertThat(body).contains("\"version\":1");
    }

    // -------------------------------------------------------------------- audit

    @Test
    @DisplayName("creation, translation and status changes are all audited")
    void policyChangesAreAudited() throws Exception {
        Fixture f = partner();
        UUID policyId = activePolicy(f, "PAYMENT", LocalDate.now());
        setStatus(f, policyId, "PAUSED").andExpect(status().isOk());

        assertThat(fixtures.auditCount("policy.created", policyId)).isEqualTo(1);
        assertThat(fixtures.auditCount("policy.translation_updated", policyId)).isEqualTo(2);
        assertThat(fixtures.auditCount("policy.status_changed", policyId))
                .as("DRAFT → ACTIVE and ACTIVE → PAUSED")
                .isEqualTo(2);

        // A refused transition must not leave an entry claiming it happened.
        setStatus(f, policyId, "DRAFT").andExpect(status().isConflict());
        assertThat(fixtures.auditCount("policy.status_changed", policyId)).isEqualTo(2);
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("policy");
        UUID admin = fixtures.createUser("policy-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    private String policies(Fixture f) {
        return "/api/v1/admin/properties/" + f.propertyId + "/policies";
    }

    private static String publicPolicies(String slug) {
        return "/api/v1/public/properties/" + slug + "/policies";
    }

    private UUID createPolicy(Fixture f, String type, LocalDate effectiveFrom) throws Exception {
        String body = mockMvc.perform(post(policies(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(create(type, effectiveFrom.toString())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    /** A DRAFT version, given text in both locales, then activated. */
    private UUID activePolicy(Fixture f, String type, LocalDate effectiveFrom) throws Exception {
        UUID id = createPolicy(f, type, effectiveFrom);
        translate(f, id, "en", "TEST_POLICY_BODY_EN");
        translate(f, id, "vi", "TEST_POLICY_BODY_VI");
        setStatus(f, id, "ACTIVE").andExpect(status().isOk());
        return id;
    }

    private void translate(Fixture f, UUID policyId, String locale, String text) throws Exception {
        mockMvc.perform(patch(policies(f) + "/" + policyId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"body\":\"" + text + "\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions setStatus(Fixture f, UUID policyId, String status) throws Exception {
        return mockMvc.perform(patch(policies(f) + "/" + policyId + "/status?status=" + status)
                .with(csrf()).cookie(f.session));
    }

    /** Submit and approve, so the property becomes publicly visible. */
    private void approveProperty(Fixture f) throws Exception {
        String submission = mockMvc.perform(
                        post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                                .with(csrf()).cookie(f.session))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID submissionId = UUID.fromString(
                submission.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        assertThat(fixtures.lifecycleStateOf(f.propertyId)).isEqualTo("COMING_SOON");
    }

    /**
     * An empty list, not a 404.
     *
     * <p>A hidden property's policy endpoint answers exactly as a visible
     * property with no policies does, so the response discloses nothing about
     * whether the property exists. See doc 96 §7.
     */
    private void assertNoPublicPolicies(String slug) throws Exception {
        mockMvc.perform(get(publicPolicies(slug)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private static String create(String type, String effectiveFrom) {
        return "{\"type\":\"%s\",\"effectiveFrom\":\"%s\"}".formatted(type, effectiveFrom);
    }
}
