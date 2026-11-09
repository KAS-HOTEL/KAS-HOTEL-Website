package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The property submission workflow, over HTTP, against PostgreSQL.
 *
 * <p>Covers the state machine, mandatory reasons, audit, publication safety and
 * cross-partner isolation of the new routes. The ninth-property acceptance proof
 * is separate, in {@code NinthPropertyE2EIT}.
 */
class OnboardingWorkflowIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "onboarding-workflow-password-4417";

    // ------------------------------------------------------------------ submit

    @Test
    @DisplayName("an incomplete property cannot be submitted, and is told everything missing")
    void incompletePropertyCannotBeSubmitted() throws Exception {
        Partner partner = partnerWithProperty();

        mockMvc.perform(post("/api/v1/admin/properties/" + partner.propertyId + "/submit")
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                // Doc 52 §3.1's invariant, reported field by field rather than
                // one at a time.
                .andExpect(jsonPath("$.details.length()").value(
                        org.hamcrest.Matchers.greaterThan(0)));

        assertThat(fixtures.lifecycleStateOf(partner.propertyId))
                .as("a refused submit must not move the lifecycle")
                .isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("completeness reports section by section")
    void completenessReportsSections() throws Exception {
        Partner partner = partnerWithProperty();

        mockMvc.perform(get("/api/v1/admin/properties/" + partner.propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections.length()").value(5))
                .andExpect(jsonPath("$.complete").value(false));

        fixtures.makePropertyComplete(partner.propertyId, partner.partnerId);

        mockMvc.perform(get("/api/v1/admin/properties/" + partner.propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.complete").value(true));
    }

    @Test
    @DisplayName("a complete property submits, and the submission is audited")
    void completePropertySubmits() throws Exception {
        Partner partner = completePartnerProperty();

        UUID submissionId = submit(partner);

        assertThat(fixtures.submissionStatusOf(submissionId)).isEqualTo("SUBMITTED");
        assertThat(fixtures.auditCount("property.submission.submitted", submissionId))
                .as("doc 59 §7.6 — privileged actions are audit-logged")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a second submit while one is open is refused by the state machine")
    void duplicateOpenSubmissionIsRefused() throws Exception {
        Partner partner = completePartnerProperty();
        submit(partner);

        // The V22 partial unique index is the real guard; a check-then-insert
        // would leave a window in which two concurrent submits both pass. What
        // changed is only how that guard is reported: the constraint violation
        // used to escape as a 500, which told a Partner who pressed the button
        // twice that the system had broken. It is a refusal, and now says so.
        mockMvc.perform(post("/api/v1/admin/properties/" + partner.propertyId + "/submit")
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // Nothing is read back afterwards on purpose. The unique violation
        // aborts the PostgreSQL transaction, and these tests share one outer
        // transaction, so any further statement here fails with 25P02 rather
        // than telling us anything. In a real request the rollback is the whole
        // point: the refused attempt writes nothing.
    }

    // ------------------------------------------------------------------ review

    @Test
    @DisplayName("approve publishes the property and its room types, atomically")
    void approvePublishes() throws Exception {
        Partner partner = completePartnerProperty();
        UUID submissionId = submit(partner);

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        assertThat(fixtures.submissionStatusOf(submissionId)).isEqualTo("APPROVED");
        assertThat(fixtures.lifecycleStateOf(partner.propertyId))
                .as("doc 03 §8 — publicly listed, but not yet bookable")
                .isEqualTo("COMING_SOON");
        assertThat(fixtures.auditCount("property.submission.approved", submissionId)).isEqualTo(1);
    }

    @Test
    @DisplayName("reject requires a reason, and persists it")
    void rejectRequiresAndPersistsReason() throws Exception {
        Partner partner = completePartnerProperty();
        UUID submissionId = submit(partner);

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/reject")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"\"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/reject")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Hero image is a placeholder.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));

        assertThat(fixtures.decisionReasonOf(submissionId))
                .isEqualTo("Hero image is a placeholder.");
        assertThat(fixtures.lifecycleStateOf(partner.propertyId))
                .as("a rejected property must not be published")
                .isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("request changes lets the Partner resubmit as a new submission")
    void requestChangesAllowsResubmission() throws Exception {
        Partner partner = completePartnerProperty();
        UUID first = submit(partner);

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + first + "/request-changes")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Please add a ward.\"}"))
                .andExpect(status().isOk());

        UUID second = submit(partner);

        assertThat(second).isNotEqualTo(first);
        assertThat(fixtures.submissionStatusOf(first))
                .as("the original decision is retained, not overwritten")
                .isEqualTo("CHANGES_REQUESTED");

        mockMvc.perform(get("/api/v1/admin/properties/" + partner.propertyId + "/submissions")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.length()").value(2));
    }

    // ----------------------------------------------------------- state machine

    @Test
    @DisplayName("a decided submission cannot be decided again")
    void decidedSubmissionIsTerminal() throws Exception {
        Partner partner = completePartnerProperty();
        UUID submissionId = submit(partner);

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isOk());

        // APPROVED → REJECTED is forbidden. Approval already published the
        // property; letting a second reviewer reverse it silently would leave the
        // public site and the submission disagreeing.
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/reject")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"changed my mind\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.submissionStatusOf(submissionId)).isEqualTo("APPROVED");
    }

    @Test
    @DisplayName("concurrent approve and reject resolve to exactly one decision")
    void concurrentDecisionsResolveToOne() throws Exception {
        Partner partner = completePartnerProperty();
        UUID submissionId = submit(partner);

        // Sequential here because MockMvc shares the test transaction, but the
        // guard under test is the compare-and-set in the UPDATE's WHERE clause:
        // the second statement matches no row because the status already moved.
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/request-changes")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"race\"}"))
                .andExpect(status().isConflict());

        assertThat(fixtures.submissionStatusOf(submissionId))
                .as("exactly one decision survives")
                .isEqualTo("APPROVED");
    }

    // ------------------------------------------------------- publication safety

    @Test
    @DisplayName("a DRAFT property is never public, however far the workflow got")
    void draftIsNeverPublic() throws Exception {
        Partner partner = completePartnerProperty();
        String slug = slugOf(partner);

        // Not submitted.
        assertNotPublic(slug);

        // Submitted but not decided — brief §8: a submission existing must not publish.
        UUID submissionId = submit(partner);
        assertNotPublic(slug);

        // Opened by a reviewer.
        mockMvc.perform(get("/api/v1/admin/property-submissions/" + submissionId)
                .cookie(partner.session)).andExpect(status().isOk());
        assertNotPublic(slug);

        // Rejected.
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/reject")
                        .with(csrf()).cookie(partner.session)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"not yet\"}"))
                .andExpect(status().isOk());
        assertNotPublic(slug);
    }

    @Test
    @DisplayName("the eight seed properties are DRAFT and therefore not public")
    void seedPropertiesAreNotPublic() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(fixtures.noPublishedSeedProperties(),
                "kas_web_test holds published hotels for manual website testing");
        mockMvc.perform(get("/api/v1/public/properties"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='kas-milestone-premium-hotel')]").isEmpty());
    }

    // ----------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot submit, review or read another Partner's property")
    void crossPartnerIsolationHoldsOnTheNewRoutes() throws Exception {
        Partner a = completePartnerProperty();
        Partner b = completePartnerProperty();

        UUID bSubmission = submit(b);

        // Every new route, with A's session against B's records. 404, never 403.
        mockMvc.perform(post("/api/v1/admin/properties/" + b.propertyId + "/submit")
                .with(csrf()).cookie(a.session)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/admin/properties/" + b.propertyId + "/completeness")
                .cookie(a.session)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/admin/properties/" + b.propertyId + "/submissions")
                .cookie(a.session)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/admin/property-submissions/" + bSubmission)
                .cookie(a.session)).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + bSubmission + "/approve")
                .with(csrf()).cookie(a.session)).andExpect(status().isNotFound());

        assertThat(fixtures.submissionStatusOf(bSubmission))
                .as("B's submission is untouched")
                .isEqualTo("SUBMITTED");
    }

    @Test
    @DisplayName("the review queue shows only the reviewer's own scope")
    void reviewQueueIsScoped() throws Exception {
        Partner a = completePartnerProperty();
        Partner b = completePartnerProperty();
        submit(b);

        mockMvc.perform(get("/api/v1/admin/property-submissions").cookie(a.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        submit(a);

        mockMvc.perform(get("/api/v1/admin/property-submissions").cookie(a.session))
                .andExpect(jsonPath("$.length()").value(1));
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    /** A partner, an admin with PARTNER scope, and one empty DRAFT property. */
    private Partner partnerWithProperty() throws Exception {
        UUID partnerId = fixtures.createPartner("onboarding");
        UUID admin = fixtures.createUser("partner-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        // The seed gives properties a name; a created one gets it from the API.
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");

        return new Partner(partnerId, propertyId, session);
    }

    private Partner completePartnerProperty() throws Exception {
        Partner partner = partnerWithProperty();
        fixtures.makePropertyComplete(partner.propertyId, partner.partnerId);
        return partner;
    }

    private UUID submit(Partner partner) throws Exception {
        String body = mockMvc.perform(
                        post("/api/v1/admin/properties/" + partner.propertyId + "/submit")
                                .with(csrf()).cookie(partner.session))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private String slugOf(Partner partner) throws Exception {
        String body = mockMvc.perform(get("/api/v1/admin/properties/" + partner.propertyId)
                        .cookie(partner.session))
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll("^.*?\"slug\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }

    private void assertNotPublic(String slug) throws Exception {
        mockMvc.perform(get("/api/v1/public/properties/" + slug))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/public/properties"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").isEmpty());
    }
}
