package com.kas.platform.security.it;

import com.kas.platform.property.ExperienceRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.47 — {@code /admin/properties/{id}/experiences}, and signature
 * experiences on the guest property detail.
 *
 * <p>This closes the publish gate that has blocked the entire portfolio. Doc 52
 * §3.1 makes <em>"≥1 signature experience"</em> a CONFIRMED invariant and
 * {@code PropertyCompletenessChecker} has always enforced it, but nothing could
 * write a row — so no property could be published at all.
 *
 * <p>The V1 content contract is the owner's A/A/A ruling: title required,
 * description optional, {@code sortOrder} for ordering, <strong>no
 * {@code timeOfDay}, no image, no maximum count</strong>.
 */
class ExperienceIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "experience-author-password-7742";

    @Autowired
    private ExperienceRepository experiences;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("a partner adds an experience and reads it straight back")
    void createsAnExperience() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"sortOrder": 1,
                         "translations": {
                           "en": {"title": "Rooftop at dusk",
                                  "description": "The hour the city turns gold."},
                           "vi": {"title": "Sân thượng lúc hoàng hôn"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.titles.en").value("Rooftop at dusk"))
                .andExpect(jsonPath("$.titles.vi").value("Sân thượng lúc hoàng hôn"))
                .andExpect(jsonPath("$.descriptions.en").value("The hour the city turns gold."))
                // A locale with no description contributes no key.
                .andExpect(jsonPath("$.descriptions.vi").doesNotExist())
                .andExpect(jsonPath("$.sortOrder").value(1));
    }

    @Test
    @DisplayName("a description is optional")
    void descriptionIsOptional() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // Doc 23 §5 lists description beside title and the column is nullable.
        // An experience that is only a name is a real thing a Partner may write.
        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"title": "Breakfast on the terrace"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.titles.en").value("Breakfast on the terrace"))
                .andExpect(jsonPath("$.descriptions").isEmpty());
    }

    @Test
    @DisplayName("a title is required in at least one locale")
    void titleIsRequired() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // property_experience_translation.title is NOT NULL — and the publish
        // gate counts base rows, so a titleless experience would satisfy a
        // checklist item it cannot honestly meet.
        mockMvc.perform(create(propertyId, partner, "{\"sortOrder\": 0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("translations"));

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"title": "   "}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("translations.en.title"));

        assertThat(experiences.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    @Test
    @DisplayName("an unsupported locale is refused by name")
    void refusesUnsupportedLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"fr": {"title": "Le toit"}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("translations.fr"))
                .andExpect(jsonPath("$.details[0].code").value("UNSUPPORTED_LOCALE"));
    }

    @Test
    @DisplayName("timeOfDay and image are refused rather than silently dropped")
    void refusesFieldsOutOfV1Scope() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // Step 16A.47 omitted both from V1: timeOfDay's enum has no members in any
        // document, and media_owner_type has no EXPERIENCE. Because
        // fail-on-unknown-properties is on, a client that sends either is told so
        // instead of watching the value vanish.
        mockMvc.perform(create(propertyId, partner, """
                        {"timeOfDay": "DUSK",
                         "translations": {"en": {"title": "Rooftop at dusk"}}}
                        """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(create(propertyId, partner, """
                        {"image": "rooftop.jpg",
                         "translations": {"en": {"title": "Rooftop at dusk"}}}
                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("neither timeOfDay nor an image is required to create one")
    void neitherTimeOfDayNorImageIsRequired() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        String body = mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"title": "Wellness at first light"}}}
                        """))
                .andExpect(status().isCreated())
                // The V1 shape carries neither key at all.
                .andExpect(jsonPath("$.timeOfDay").doesNotExist())
                .andExpect(jsonPath("$.image").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("timeOfDay").doesNotContain("image");
    }

    // ------------------------------------------------------------------ reading

    @Test
    @DisplayName("the list returns them in the operator's order")
    void listsInTheOperatorsOrder() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, body("Third", 3))).andExpect(status().isCreated());
        mockMvc.perform(create(propertyId, partner, body("First", 1))).andExpect(status().isCreated());
        mockMvc.perform(create(propertyId, partner, body("Second", 2))).andExpect(status().isCreated());

        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // sort_order, not insertion order and not alphabetical.
                .andExpect(jsonPath("$[0].titles.en").value("First"))
                .andExpect(jsonPath("$[1].titles.en").value("Second"))
                .andExpect(jsonPath("$[2].titles.en").value("Third"));
    }

    @Test
    @DisplayName("a property with none returns an empty list, not an error")
    void emptyIsAnAnswer() throws Exception {
        Partner partner = partnerAccount();

        mockMvc.perform(get(route(property(partner))).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ------------------------------------------------------------------ updating

    @Test
    @DisplayName("an update changes the text and the order")
    void updatesAnExperience() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(created(propertyId, partner, body("Rooftop", 1)));

        mockMvc.perform(update(propertyId, id, partner, """
                        {"sortOrder": 5,
                         "translations": {"en": {"title": "The Rooftop",
                                                 "description": "Dusk, every evening."}}}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titles.en").value("The Rooftop"))
                .andExpect(jsonPath("$.descriptions.en").value("Dusk, every evening."))
                .andExpect(jsonPath("$.sortOrder").value(5));
    }

    @Test
    @DisplayName("reordering does not require re-sending the words")
    void reorderKeepsTheText() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(created(propertyId, partner, """
                        {"sortOrder": 1,
                         "translations": {"en": {"title": "Rooftop", "description": "At dusk."},
                                          "vi": {"title": "Sân thượng"}}}
                        """));

        // A locale the caller omits keeps its stored text — the same rule the
        // landmark and editorial writers follow. Without it, a drag-to-reorder
        // would have to re-send every word to avoid erasing it.
        mockMvc.perform(update(propertyId, id, partner, "{\"sortOrder\": 9}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sortOrder").value(9))
                .andExpect(jsonPath("$.titles.en").value("Rooftop"))
                .andExpect(jsonPath("$.titles.vi").value("Sân thượng"))
                .andExpect(jsonPath("$.descriptions.en").value("At dusk."));
    }

    @Test
    @DisplayName("an omitted description keeps the stored one")
    void omittedDescriptionIsKept() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(created(propertyId, partner, """
                        {"translations": {"en": {"title": "Rooftop", "description": "At dusk."}}}
                        """));

        mockMvc.perform(update(propertyId, id, partner, """
                        {"translations": {"en": {"title": "The Rooftop"}}}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titles.en").value("The Rooftop"))
                .andExpect(jsonPath("$.descriptions.en").value("At dusk."));
    }

    // ------------------------------------------------------------------ deleting

    @Test
    @DisplayName("a delete removes it and its translations")
    void deletesAnExperience() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(created(propertyId, partner, body("Rooftop", 1)));

        mockMvc.perform(delete(route(propertyId) + "/" + id).with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());

        // A real delete — property_experience has no archived_at — and the
        // translation goes with it by ON DELETE CASCADE.
        assertThat(experiences.findByProperty(propertyId, scopeOf(partner))).isEmpty();
        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ------------------------------------------------------------------ security

    @Test
    @DisplayName("anonymous cannot reach any of the admin routes")
    void requiresASession() throws Exception {
        UUID propertyId = property(partnerAccount());

        mockMvc.perform(get(route(propertyId))).andExpect(status().isUnauthorized());
        mockMvc.perform(post(route(propertyId)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body("X", 0)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch(route(propertyId) + "/" + UUID.randomUUID()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body("X", 0)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(route(propertyId) + "/" + UUID.randomUUID()).with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("another partner's property is 404, never 403")
    void crossPartnerIsNotFound() throws Exception {
        Partner owner = partnerAccount();
        Partner stranger = partnerAccount();
        UUID propertyId = property(owner);
        String id = idOf(created(propertyId, owner, body("Rooftop", 1)));

        // Doc 85 §6.3 — a cross-partner read must not distinguish itself from an
        // absent one, or the 403 would confirm the property exists.
        mockMvc.perform(create(propertyId, stranger, body("Theirs", 0)))
                .andExpect(status().isNotFound());
        mockMvc.perform(update(propertyId, id, stranger, body("Theirs", 0)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete(route(propertyId) + "/" + id).with(csrf()).cookie(stranger.session))
                .andExpect(status().isNotFound());

        // The list is the one exception, and deliberately: [] is what a property
        // with no experiences returns too, so it discloses nothing.
        mockMvc.perform(get(route(propertyId)).cookie(stranger.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // The owner's experience survived every one of those attempts.
        assertThat(experiences.findByProperty(propertyId, scopeOf(owner))).hasSize(1);
    }

    @Test
    @DisplayName("an unknown experience id is 404")
    void unknownIdIsNotFound() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(update(propertyId, UUID.randomUUID().toString(), partner, body("X", 0)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete(route(propertyId) + "/" + UUID.randomUUID())
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ the publish gate

    @Test
    @DisplayName("an authored experience satisfies the publish checklist")
    void satisfiesThePublishGate() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // The gate is unchanged and still counts rows. What changed in this step
        // is that a Partner can now produce one through the product rather than
        // only through SQL.
        mockMvc.perform(get(completeness(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].complete")
                        .value(false));

        mockMvc.perform(create(propertyId, partner, body("Rooftop at dusk", 1)))
                .andExpect(status().isCreated());

        mockMvc.perform(get(completeness(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].complete")
                        .value(true));
    }

    @Test
    @DisplayName("one is enough — a second changes nothing, and there is no maximum")
    void oneIsEnoughAndThereIsNoMaximum() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // Doc 03 and doc 67 §1 propose "1–4", but only "≥1" is confirmed and Step
        // 16A.47 declined the cap. A fifth is accepted because nothing forbids it.
        for (int i = 1; i <= 5; i++) {
            mockMvc.perform(create(propertyId, partner, body("Experience " + i, i)))
                    .andExpect(status().isCreated());
        }

        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.length()").value(5));
        mockMvc.perform(get(completeness(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].complete")
                        .value(true));
    }

    @Test
    @DisplayName("deleting the last one makes the checklist fail again")
    void deletingTheLastOneReopensTheGate() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(created(propertyId, partner, body("Rooftop", 1)));

        mockMvc.perform(get(completeness(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].complete")
                        .value(true));

        // The delete is allowed. Refusing it would invent a rule no document
        // states and would trap a Partner replacing their only experience with a
        // better one — the gate simply closes again until they write the next.
        mockMvc.perform(delete(route(propertyId) + "/" + id).with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(completeness(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].complete")
                        .value(false))
                .andExpect(jsonPath("$.sections[?(@.name=='Signature experiences')].missing[0]")
                        .value("at least one signature experience"));
    }

    // ------------------------------------------------------------------ the guest surface

    @Test
    @DisplayName("a published hotel's experiences reach the guest detail")
    void experiencesReachTheGuestDetail() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "Experience Test Hotel");

        mockMvc.perform(create(propertyId, partner, """
                        {"sortOrder": 2,
                         "translations": {
                           "en": {"title": "Breakfast on the terrace"},
                           "vi": {"title": "Bữa sáng trên sân thượng"}}}
                        """))
                .andExpect(status().isCreated());
        mockMvc.perform(create(propertyId, partner, """
                        {"sortOrder": 1,
                         "translations": {
                           "en": {"title": "Rooftop at dusk", "description": "The hour the city turns gold."},
                           "vi": {"title": "Sân thượng lúc hoàng hôn"}}}
                        """))
                .andExpect(status().isCreated());

        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                // The operator's order, not the order they were written in.
                .andExpect(jsonPath("$.experiences.length()").value(2))
                .andExpect(jsonPath("$.experiences[0].title").value("Rooftop at dusk"))
                .andExpect(jsonPath("$.experiences[0].description")
                        .value("The hour the city turns gold."))
                .andExpect(jsonPath("$.experiences[1].title").value("Breakfast on the terrace"));

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.experiences[0].title").value("Sân thượng lúc hoàng hôn"));
    }

    @Test
    @DisplayName("the guest shape carries no id, order or internal field")
    void guestShapeLeaksNothing() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "Experience Leak Hotel");
        String id = idOf(created(propertyId, partner, body("Rooftop at dusk", 1)));

        fixtures.openProperty(propertyId);

        String body = mockMvc.perform(
                        get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                                .param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.experiences[0].id").doesNotExist())
                .andExpect(jsonPath("$.experiences[0].sortOrder").doesNotExist())
                .andExpect(jsonPath("$.experiences[0].propertyId").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        // Doc 58 §9 layer 2 — no database id reaches the public surface. The
        // guest record has no field able to carry one.
        assertThat(body).doesNotContain(id);
        assertThat(body).doesNotContain(partner.partnerId.toString());
        assertThat(body).doesNotContain("timeOfDay").doesNotContain("sortOrder");

        // The property id is checked against the experiences fragment rather than
        // the whole document: the test fixture's slug is literally
        // "test-property-{propertyId}", and the slug is a public identifier by
        // contract, so a whole-body assertion would fail on the fixture's naming
        // rather than on anything this step exposes.
        String experiences = body.substring(body.indexOf("\"experiences\""));
        assertThat(experiences).doesNotContain(propertyId.toString());
    }

    @Test
    @DisplayName("an untranslated experience is omitted rather than shown blank")
    void untranslatedIsOmitted() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "Experience Locale Hotel");

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"title": "Rooftop at dusk"}}}
                        """))
                .andExpect(status().isCreated());

        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(jsonPath("$.experiences.length()").value(1));

        // The translation join is inner, matching amenities and landmarks: a
        // Vietnamese reader gets no card rather than an English one they did not
        // ask for or an empty box.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "vi"))
                .andExpect(jsonPath("$.experiences.length()").value(0));
    }

    @Test
    @DisplayName("an unpublished hotel's experiences are unreachable")
    void unpublishedStaysPrivate() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "Experience Draft Hotel");
        mockMvc.perform(create(propertyId, partner, body("Rooftop at dusk", 1)))
                .andExpect(status().isCreated());

        // The property stays DRAFT. Authoring an experience is not publishing
        // one, and the detail carries the same publication predicate as the page.
        mockMvc.perform(get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                        .param("locale", "en"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a hotel with none returns an empty array, not a missing key")
    void publishedWithNoneIsAnEmptyArray() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "Experience Empty Hotel");
        fixtures.openProperty(propertyId);

        // A published hotel that has not written one yet is a legitimate state:
        // the gate runs at submit, not continuously.
        mockMvc.perform(get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.experiences").isArray())
                .andExpect(jsonPath("$.experiences.length()").value(0));
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("x-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("experience-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private UUID property(Partner partner) {
        return fixtures.createProperties(partner.partnerId, 1).getFirst();
    }

    private static AuthorizationScope scopeOf(Partner partner) {
        return AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
    }

    private static String route(UUID propertyId) {
        return "/api/v1/admin/properties/" + propertyId + "/experiences";
    }

    private static String completeness(UUID propertyId) {
        return "/api/v1/admin/properties/" + propertyId + "/completeness";
    }

    private static String body(String title, int sortOrder) {
        return """
                {"sortOrder": %d, "translations": {"en": {"title": "%s"}}}
                """.formatted(sortOrder, title);
    }

    private static MockHttpServletRequestBuilder create(UUID propertyId, Partner partner, String body) {
        return post(route(propertyId)).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder update(UUID propertyId, String experienceId,
                                                        Partner partner, String body) {
        return patch(route(propertyId) + "/" + experienceId).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private String created(UUID propertyId, Partner partner, String body) throws Exception {
        return mockMvc.perform(create(propertyId, partner, body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String idOf(String body) {
        int start = body.indexOf("\"id\":\"") + 6;
        return body.substring(start, body.indexOf('"', start));
    }
}
