package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Creating a property from the Partner console — {@code POST /admin/properties}.
 *
 * <p>The endpoint has existed since the onboarding phase; nothing in the console
 * called it, so nothing exercised it as the thing a Partner does when they take
 * on another hotel. These tests cover that path: who may create, what a created
 * property starts as, and the two ways the request can be refused.
 *
 * <h2>The uniqueness one is the interesting one</h2>
 *
 * {@code property_slug_key} is UNIQUE across <em>every</em> partner, not per
 * partner. A caller cannot check for a clash first — listing another partner's
 * slugs is precisely what the scope filter prevents — so the refusal has to be
 * usable when it arrives. Before this it was an unmapped
 * {@code DuplicateKeyException}, which reached the client as a 500.
 */
class PropertyCreationIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "property-creation-password-8842";
    private static final String PROPERTIES = "/api/v1/admin/properties";

    // ------------------------------------------------------------------ success

    @Test
    @DisplayName("a partner creates a property in their own estate")
    void partnerCreatesAProperty() throws Exception {
        Partner partner = partnerAccount();
        String slug = uniqueSlug();

        mockMvc.perform(create(partner, slug, "Kas Riverside Hotel"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.slug").value(slug))
                // The name is written to both console locales by the handler, so
                // the property is never nameless in either.
                .andExpect(jsonPath("$.names.vi").value("Kas Riverside Hotel"))
                .andExpect(jsonPath("$.names.en").value("Kas Riverside Hotel"));
    }

    @Test
    @DisplayName("a created property starts as a DRAFT, not as anything a guest can see")
    void createdPropertyIsADraft() throws Exception {
        Partner partner = partnerAccount();

        mockMvc.perform(create(partner, uniqueSlug(), "Kas Draft Hotel"))
                .andExpect(status().isCreated())
                // Creation and publication stay separate: the review workflow is
                // what moves a property out of DRAFT, and this route is not it.
                .andExpect(jsonPath("$.lifecycleState").value("DRAFT"))
                .andExpect(jsonPath("$.isFlagship").value(false));
    }

    @Test
    @DisplayName("the new property appears in the partner's own list")
    void createdPropertyIsListed() throws Exception {
        Partner partner = partnerAccount();
        String slug = uniqueSlug();

        mockMvc.perform(create(partner, slug, "Kas Listed Hotel")).andExpect(status().isCreated());

        String listed = mockMvc.perform(get(PROPERTIES).cookie(partner.session()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(listed).contains(slug);
    }

    @Test
    @DisplayName("a second property sorts after the first rather than fighting it for a position")
    void sortOrderFollowsTheEstate() throws Exception {
        Partner partner = partnerAccount();

        String first = mockMvc.perform(create(partner, uniqueSlug(), "Kas First"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String second = mockMvc.perform(create(partner, uniqueSlug(), "Kas Second"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(intField(second, "sortOrder")).isGreaterThan(intField(first, "sortOrder"));
    }

    // ------------------------------------------------------------ authorization

    @Test
    @DisplayName("an anonymous caller cannot create a property")
    void anonymousCannotCreate() throws Exception {
        mockMvc.perform(post(PROPERTIES).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(uniqueSlug(), "Kas Anonymous")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the property belongs to the caller's partner, never to one named in the body")
    void ownershipComesFromTheScope() throws Exception {
        Partner a = partnerAccount();
        Partner b = partnerAccount();
        String slug = uniqueSlug();

        // There is no partnerId field on the request, so the only way to attempt
        // this is to send one and watch it be ignored — which is the point:
        // `fail-on-unknown-properties` refuses the body outright.
        mockMvc.perform(post(PROPERTIES).with(csrf()).cookie(a.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slug":"%s","name":"Kas Smuggled","partnerId":"%s"}
                                """.formatted(slug, b.partnerId())))
                .andExpect(status().isBadRequest());

        // And nothing was created by the attempt.
        String listedForB = mockMvc.perform(get(PROPERTIES).cookie(b.session()))
                .andReturn().getResponse().getContentAsString();
        assertThat(listedForB).doesNotContain(slug);
    }

    @Test
    @DisplayName("one partner's new property is invisible to another")
    void creationStaysInsideTheEstate() throws Exception {
        Partner a = partnerAccount();
        Partner b = partnerAccount();
        String slug = uniqueSlug();

        mockMvc.perform(create(a, slug, "Kas Private")).andExpect(status().isCreated());

        String listedForB = mockMvc.perform(get(PROPERTIES).cookie(b.session()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(listedForB).doesNotContain(slug);
    }

    // --------------------------------------------------------- invalid input

    @Test
    @DisplayName("a blank name is refused")
    void blankNameIsRefused() throws Exception {
        Partner partner = partnerAccount();

        mockMvc.perform(create(partner, uniqueSlug(), " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("a slug the database CHECK would reject is refused at the boundary")
    void malformedSlugIsRefused() throws Exception {
        Partner partner = partnerAccount();

        // Upper case, spaces and a leading hyphen all fail `property_slug_format`.
        for (String bad : new String[] {"Kas Hotel", "-leading-hyphen", "UPPER", "has_underscore"}) {
            mockMvc.perform(create(partner, bad, "Kas Malformed"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details[0].field").value("slug"));
        }
    }

    // ------------------------------------------------------------- uniqueness

    @Test
    @DisplayName("a slug the same partner already used is a field error, not a server fault")
    void duplicateSlugWithinTheEstateIsAFieldError() throws Exception {
        Partner partner = partnerAccount();
        String slug = uniqueSlug();

        mockMvc.perform(create(partner, slug, "Kas Original")).andExpect(status().isCreated());

        mockMvc.perform(create(partner, slug, "Kas Duplicate"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("slug"))
                .andExpect(jsonPath("$.details[0].code").value("SLUG_TAKEN"));
    }

    @Test
    @DisplayName("a slug another partner holds is refused the same way, disclosing nothing")
    void duplicateSlugAcrossPartnersIsAFieldError() throws Exception {
        Partner a = partnerAccount();
        Partner b = partnerAccount();
        String slug = uniqueSlug();

        mockMvc.perform(create(a, slug, "Kas Theirs")).andExpect(status().isCreated());

        // The refusal must not name the other partner or their property. That the
        // address is taken is all it says — the same thing any public URL says.
        String refusal = mockMvc.perform(create(b, slug, "Kas Ours"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("SLUG_TAKEN"))
                .andReturn().getResponse().getContentAsString();

        assertThat(refusal)
                .doesNotContain(a.partnerId().toString())
                .doesNotContain("Kas Theirs");
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("c-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("property-creation-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    /** Unique per test run, so a rerun does not collide with its own leftovers. */
    private static String uniqueSlug() {
        return "kas-created-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private MockHttpServletRequestBuilder create(Partner partner, String slug, String name) {
        return post(PROPERTIES).with(csrf()).cookie(partner.session())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(slug, name));
    }

    private static String body(String slug, String name) {
        return """
                {"slug":"%s","name":"%s"}
                """.formatted(slug, name);
    }

    private static int intField(String json, String field) {
        return Integer.parseInt(
                json.replaceAll("^.*?\"" + field + "\"\\s*:\\s*(-?\\d+).*$", "$1"));
    }
}
