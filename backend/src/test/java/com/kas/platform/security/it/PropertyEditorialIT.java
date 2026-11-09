package com.kas.platform.security.it;

import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.27 — the two editorial fields the publish gate has always required
 * and nothing could write.
 *
 * <p>Doc 52 §3.1 makes {@code signatureLine} and both-locale
 * {@code shortDescription} publish invariants, doc 23 §7 repeats the gate
 * verbatim — <em>"A property cannot publish without name, signatureLine, and
 * shortDescription in both locales"</em> — and
 * {@code PropertyCompletenessChecker} has blocked submission on them since it
 * was written. Until this step the only INSERT into {@code property_translation}
 * wrote {@code name} alone, so the gate was unsatisfiable through the API. Step
 * 16A.26 found that by trying.
 *
 * <p>The bounds are not invented either: doc 23 §3.2 gives ≤ 90 and ≤ 220
 * characters, and {@code property_tr_sig_len} / {@code property_tr_short_len}
 * enforce those same numbers in the schema.
 */
class PropertyEditorialIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "editorial-author-password-8823";

    /** {@code SecurityFixtures.createProperties} inserts properties at version 1. */
    private static final int FIXTURE_VERSION = 1;

    private static final String SIGNATURE_VI = "Tầm nhìn sân thượng khiến người ta quay lại";
    private static final String SHORT_VI = "Khách sạn boutique giữa Quận 1, với sân thượng nhìn ra sông.";
    private static final String SHORT_EN = "A boutique hotel in District 1, with a rooftop over the river.";

    @Autowired
    private PropertyRepository properties;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("a partner writes the signature line and both short descriptions")
    void writesEditorialText() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "signatureLines": {"vi": "%s"},
                         "shortDescriptions": {"vi": "%s", "en": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, SIGNATURE_VI, SHORT_VI, SHORT_EN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLines.vi").value(SIGNATURE_VI))
                .andExpect(jsonPath("$.shortDescriptions.vi").value(SHORT_VI))
                .andExpect(jsonPath("$.shortDescriptions.en").value(SHORT_EN));
    }

    @Test
    @DisplayName("what the write accepts, the read returns — the OQ-132 lesson")
    void readsBackWhatItWrote() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"en": "The rooftop view of District 1"}}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isOk());

        // Doc 101 §2 recorded the cost of a write with no matching read: PATCH
        // accepted address fields GET never returned, which became OQ-132.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLines.en").value("The rooftop view of District 1"));

        mockMvc.perform(get("/api/v1/admin/properties").cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + propertyId + "')].signatureLines.en")
                        .value(org.hamcrest.Matchers.hasItem("The rooftop view of District 1")));
    }

    @Test
    @DisplayName("an omitted field keeps its stored value; a blank one clears it")
    void absentIsNotBlank() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "signatureLines": {"vi": "%s"},
                         "shortDescriptions": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, SIGNATURE_VI, SHORT_VI)))
                .andExpect(status().isOk());

        // Only the description is sent this time. The signature line must survive:
        // a draft is built up over several sessions, not resent whole each time.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "shortDescriptions": {"vi": "Đã đổi."}}
                        """.formatted(FIXTURE_VERSION + 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLines.vi").value(SIGNATURE_VI))
                .andExpect(jsonPath("$.shortDescriptions.vi").value("Đã đổi."));

        // Blank is an instruction, not an omission: the completeness checker
        // counts a blank string as missing, so the column agrees and stores NULL.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "  "}}
                        """.formatted(FIXTURE_VERSION + 3)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLines.vi").doesNotExist());
    }

    // ------------------------------------------------------------------ the gate

    @Test
    @DisplayName("writing them clears the two Basic information blockers submission reported")
    void satisfiesTheIdentityHalfOfTheGate() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name == 'Basic information')].missing")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.hasItems(
                                "shortDescription (both locales)", "signatureLine"))));

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "signatureLines": {"vi": "%s"},
                         "shortDescriptions": {"vi": "%s", "en": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, SIGNATURE_VI, SHORT_VI, SHORT_EN)))
                .andExpect(status().isOk());

        // Basic information is now complete. The property still cannot be
        // submitted — a hero image needs OQ-106 and a signature experience has no
        // endpoint — and this asserts only what this step actually closed.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name == 'Basic information')].complete")
                        .value(org.hamcrest.Matchers.hasItem(true)))
                .andExpect(jsonPath("$.complete").value(false));
    }

    // ------------------------------------------------------------------ validation

    @Test
    @DisplayName("the frozen character bounds are refused before they reach the CHECK")
    void enforcesTheDocumentedLengths() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // Doc 23 §3.2: signatureLine ≤ 90, shortDescription ≤ 220 — the same
        // numbers property_tr_sig_len and property_tr_short_len carry. A 400
        // naming the field, never a 500 from a constraint violation.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, "x".repeat(91))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "shortDescriptions": {"en": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, "x".repeat(221))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // And the boundary itself is accepted, so the bound is the documented one.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, "x".repeat(90))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unsupported locale is a field error naming that field")
    void rejectsUnknownLocales() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"fr": "Bonjour"}}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("signatureLines.fr"));
    }

    @Test
    @DisplayName("editorial text for a locale with no name is refused, not silently dropped")
    void refusesALocaleThatHasNoName() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // property_translation.name is NOT NULL with a non-blank CHECK, so there
        // is no row to attach the text to. Accepting it and dropping it would be
        // worse than saying so.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION, SIGNATURE_VI)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("names.vi"));

        assertThat(properties.findEditorial(List.of(propertyId), AuthorizationScope.global(UUID.randomUUID()))
                .getOrDefault(propertyId, java.util.Map.of()))
                .isEmpty();
    }

    @Test
    @DisplayName("a stale version still conflicts, and writes nothing")
    void respectsTheOptimisticLock() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION, SIGNATURE_VI)))
                .andExpect(status().isConflict());

        assertThat(properties.findEditorial(List.of(propertyId), AuthorizationScope.global(UUID.randomUUID()))
                .getOrDefault(propertyId, java.util.Map.of())
                .get("vi"))
                .satisfiesAnyOf(
                        text -> assertThat(text).isNull(),
                        text -> assertThat(text.signatureLine()).isNull());
    }

    // ------------------------------------------------------------------ scope

    @Test
    @DisplayName("another partner's property is 404, and its text is unreachable")
    void cannotWriteAnotherPartnersEditorial() throws Exception {
        Partner mine = partnerAccount();
        UUID theirs = fixtures.createProperties(
                fixtures.createPartner("other-" + UUID.randomUUID().toString().substring(0, 6)),
                1).getFirst();

        mockMvc.perform(patchProperty(theirs, mine, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION, SIGNATURE_VI)))
                .andExpect(status().isNotFound());

        // 404 not 403 — doc 85 §6.3, a reference is an identifier, never a
        // credential. And the read is scoped by the same predicate.
        mockMvc.perform(get("/api/v1/admin/properties/" + theirs).cookie(mine.session))
                .andExpect(status().isNotFound());

        assertThat(properties.findEditorial(List.of(theirs), scopeOf(mine))).isEmpty();
    }

    @Test
    @DisplayName("the list endpoint shows no other partner's editorial text")
    void listStaysScoped() throws Exception {
        Partner mine = partnerAccount();
        UUID theirs = fixtures.createProperties(
                fixtures.createPartner("other-" + UUID.randomUUID().toString().substring(0, 6)),
                1).getFirst();
        fixtures.setPropertyName(theirs, "vi", "Của đối thủ");

        mockMvc.perform(get("/api/v1/admin/properties").cookie(mine.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + theirs + "')]").doesNotExist());
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("editorial-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static AuthorizationScope scopeOf(Partner partner) {
        return AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
    }

    /**
     * A property with both names already set — editorial text attaches to a
     * translation row, and {@code name} is what creates one.
     */
    private UUID named(Partner partner) throws Exception {
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "names": {"vi": "Khách sạn Thử", "en": "Test Hotel"}}
                        """.formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());
        return propertyId;
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            patchProperty(UUID propertyId, Partner partner, String body) {
        return patch("/api/v1/admin/properties/" + propertyId)
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }
}
