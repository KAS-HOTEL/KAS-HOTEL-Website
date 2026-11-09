package com.kas.platform.security.it;

import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 6 — editing property information, and the optimistic lock that guards it.
 *
 * <p>Doc 58 §2 has required {@code If-Match} / {@code version} on MASTER updates
 * since Phase 4, but {@code UpdatePropertyRequest} carried no version, so
 * {@code PATCH} was a blind write: two partners editing the same hotel both
 * succeeded and the second silently erased the first. These tests are the proof
 * that it no longer can.
 *
 * <p>The security-critical case is {@link #crossPartnerIsStillNotFoundNotConflict()}.
 * Order of checks is everything: version before scope would let a guessed version
 * distinguish "wrong version" from "not yours", and a {@code 409} on another
 * partner's property confirms that the property exists.
 */
class PropertyInformationIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "property-editor-password-4417";

    /** {@code SecurityFixtures.createProperties} inserts properties at version 1. */
    private static final int FIXTURE_VERSION = 1;

    @Autowired
    private PropertyRepository properties;

    // ------------------------------------------------------------------ happy path

    @Test
    @DisplayName("a partner edits names and address in one request")
    void editsNamesAndAddressTogether() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "names": {"vi": "Khách sạn Hoa Sen", "en": "Lotus Hotel"},
                         "district": "Quận 3", "ward": "Phường Võ Thị Sáu",
                         "city": "Hồ Chí Minh", "phone": "+84 28 3930 1111"}
                        """.formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.vi").value("Khách sạn Hoa Sen"))
                .andExpect(jsonPath("$.names.en").value("Lotus Hotel"))
                .andExpect(jsonPath("$.district").value("Quận 3"))
                .andExpect(jsonPath("$.ward").value("Phường Võ Thị Sáu"))
                .andExpect(jsonPath("$.city").value("Hồ Chí Minh"))
                .andExpect(jsonPath("$.phone").value("+84 28 3930 1111"))
                // One edit, one version — whichever tables it touched.
                .andExpect(jsonPath("$.version").value(FIXTURE_VERSION + 1));
    }

    @Test
    @DisplayName("an omitted field is left alone, not blanked")
    void omittedFieldsSurvive() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"district\":\"Quận 1\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());

        // A second PATCH naming only the phone must not erase the district — this
        // is what lets a Partner build a draft up over several sessions.
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"phone\":\"+84 90 000 0000\"}".formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.district").value("Quận 1"))
                .andExpect(jsonPath("$.phone").value("+84 90 000 0000"));
    }

    @Test
    @DisplayName("one locale can be set without touching the other")
    void oneLocaleAtATime() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"vi\":\"Chỉ Tiếng Việt\"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.vi").value("Chỉ Tiếng Việt"))
                // An absent key is "leave it alone", never "delete it".
                .andExpect(jsonPath("$.names.en").doesNotExist());

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"en\":\"Vietnamese Only\"}}".formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.vi").value("Chỉ Tiếng Việt"))
                .andExpect(jsonPath("$.names.en").value("Vietnamese Only"));
    }

    @Test
    @DisplayName("a rename alone still advances the version")
    void renameAdvancesTheVersion() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Names live in property_translation, so a rename touches no column on
        // `property`. Without the bump, another editor's copy would still look
        // current and would overwrite this rename without ever seeing a conflict.
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"vi\":\"Tên Mới\"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(FIXTURE_VERSION + 1));

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"vi\":\"Tên Cũ\"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isConflict());
    }

    // ------------------------------------------------------------------ the lock

    @Test
    @DisplayName("a stale version is refused with 409 VERSION_CONFLICT")
    void staleVersionIsRefused() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"district\":\"Quận 1\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"district\":\"Quận 5\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        // And the refused edit changed nothing.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.district").value("Quận 1"));
    }

    @Test
    @DisplayName("a refused edit rolls back its names too")
    void refusedEditWritesNothing() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Tên Gốc");

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": 999, "names": {"vi": "Không Bao Giờ"}, "district": "Không Bao Giờ"}
                        """))
                .andExpect(status().isConflict());

        // The name write happens after the compare-and-set, so a conflict must
        // leave both tables untouched rather than half-applying the edit.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.names.vi").value("Tên Gốc"))
                .andExpect(jsonPath("$.district").doesNotExist());
    }

    @Test
    @DisplayName("of two editors holding the same version, exactly one wins")
    void lastWriteNoLongerWins() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Both read version 1 and both submit. Before this step both succeeded and
        // the second silently erased the first.
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"phone\":\"+84 111\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"phone\":\"+84 222\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.phone").value("+84 111"));
    }

    @Test
    @DisplayName("the version must be supplied at all")
    void versionIsMandatory() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // An optional version is one a caller forgets, and a caller who forgets
        // gets exactly the blind write the field exists to prevent.
        mockMvc.perform(patchProperty(propertyId, partner, "{\"district\":\"Quận 1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[?(@.field == 'version')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    // ------------------------------------------------------------------ isolation

    @Test
    @DisplayName("another partner's property is 404, never 409, whatever version is guessed")
    void crossPartnerIsStillNotFoundNotConflict() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirs = fixtures.createProperties(partnerB, 1).getFirst();
        fixtures.setPropertyNames(theirs, "Khách sạn Của Người Khác");

        // Doc 85 §6.3. A 409 here would confirm the property exists, and a
        // correct-version 409 versus wrong-version 409 would even leak its
        // version. Both the right version and a wrong one must look identical.
        for (int guessed : new int[] {FIXTURE_VERSION, 999}) {
            String body = mockMvc.perform(patchProperty(theirs, partnerA,
                            "{\"version\":%d,\"names\":{\"vi\":\"Cướp\"},\"district\":\"Cướp\"}"
                                    .formatted(guessed)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                    .andReturn().getResponse().getContentAsString();
            assertThat(body).doesNotContain("Khách sạn Của Người Khác");
        }

        // Nothing was written to the other partner's property.
        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        assertThat(properties.findById(theirs, scopeB).orElseThrow().district()).isNull();
        assertThat(properties.findNames(java.util.List.of(theirs), scopeB).get(theirs))
                .containsEntry("vi", "Khách sạn Của Người Khác");
    }

    @Test
    @DisplayName("an absent property is 404, not 409")
    void absentPropertyIsNotFound() throws Exception {
        Partner partner = partnerAccount();

        mockMvc.perform(patchProperty(UUID.randomUUID(), partner,
                        "{\"version\":%d,\"district\":\"Quận 1\"}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the compare-and-set carries the scope in its own statement")
    void updateIsScopedAtTheQuery() {
        UUID partnerA = fixtures.createPartner("a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirs = fixtures.createProperties(partnerB, 1).getFirst();

        AuthorizationScope scopeA = AuthorizationScope.partner(UUID.randomUUID(), partnerA);

        // Called directly, past every controller and filter, with the correct
        // version. Enforcement that lived above this line would let it through.
        assertThat(properties.updateDetails(
                theirs, FIXTURE_VERSION, "hijack", null, null, null, null, null, scopeA))
                .isFalse();
    }

    // ------------------------------------------------------------------ validation

    @Test
    @DisplayName("an unsupported locale is a field error, not a database failure")
    void unsupportedLocaleIsRejected() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Without this check the key would reach property_tr_locale_valid and
        // surface as a 500. Doc 25 freezes vi and en.
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"fr\":\"Hôtel\"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[?(@.field == 'names.fr')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("every unsupported locale is reported at once")
    void allBadLocalesAtOnce() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"fr\":\"a\",\"de\":\"b\"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(2));
    }

    @Test
    @DisplayName("a blank name is refused rather than written")
    void blankNameIsRejected() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // property_tr_name_len requires a non-blank name; catching it here keeps
        // the constraint from becoming a 500.
        mockMvc.perform(patchProperty(propertyId, partner,
                        "{\"version\":%d,\"names\":{\"vi\":\"   \"}}".formatted(FIXTURE_VERSION)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a rename satisfies the completeness check it is meant to satisfy")
    void renameClearsTheCompletenessBlocker() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name == 'Basic information')].missing")
                        .value(org.hamcrest.Matchers.hasItem(
                                org.hamcrest.Matchers.hasItem("name (both locales)"))));

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "names": {"vi": "Khách sạn Đủ Tên", "en": "Complete Hotel"}}
                        """.formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());

        // The point of making names editable: it is a submission blocker, and the
        // Partner now has a way to clear it.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId + "/completeness")
                        .cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name == 'Basic information')].missing")
                        .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(
                                org.hamcrest.Matchers.hasItem("name (both locales)")))));
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("property-editor", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            patchProperty(UUID propertyId, Partner partner, String body) {
        return patch("/api/v1/admin/properties/" + propertyId)
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }
}
