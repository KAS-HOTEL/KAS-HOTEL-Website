package com.kas.platform.security.it;

import com.kas.platform.property.LandmarkRepository;
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
 * Step 16A.41 — {@code /admin/properties/{id}/landmarks}, and landmarks on the
 * guest property detail.
 *
 * <p>Doc 58 §3.1 names landmarks on the detail —
 * <em>"includes facilities, amenities, landmarks, gallery, policies"</em> — doc
 * 23 §3.3 freezes the shape as
 * {@code { name (localised), type, distanceMetres, walkingMinutes }}, and
 * {@code property_landmark} has existed since V3 with <strong>nothing reaching
 * it</strong>.
 *
 * <p>Doc 03 §5.2 asks for <strong>verified</strong> walking distances, which is
 * why both measures are optional and neither is derived from the other.
 */
class LandmarkIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "landmark-author-password-3390";

    @Autowired
    private LandmarkRepository landmarks;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("a partner adds a landmark and reads it straight back")
    void createsALandmark() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "MARKET",
                         "distanceMetres": 500,
                         "walkingMinutes": 6,
                         "sortOrder": 1,
                         "translations": {
                           "en": {"name": "Ben Thanh Market", "description": "The city's oldest market."},
                           "vi": {"name": "Chợ Bến Thành"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("MARKET"))
                .andExpect(jsonPath("$.names.en").value("Ben Thanh Market"))
                .andExpect(jsonPath("$.names.vi").value("Chợ Bến Thành"))
                .andExpect(jsonPath("$.descriptions.en").value("The city's oldest market."))
                // A locale with no description contributes no key.
                .andExpect(jsonPath("$.descriptions.vi").doesNotExist())
                .andExpect(jsonPath("$.distanceMetres").value(500))
                .andExpect(jsonPath("$.walkingMinutes").value(6))
                .andExpect(jsonPath("$.sortOrder").value(1));
    }

    @Test
    @DisplayName("the list returns them in the operator's order, not by distance")
    void listsInTheOperatorsOrder() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, body("Far Museum", 2000, 25, 0)))
                .andExpect(status().isCreated());
        mockMvc.perform(create(propertyId, partner, body("Near Cafe", 100, 2, 1)))
                .andExpect(status().isCreated());

        // Which landmark matters most is an editorial judgement doc 03 §5.2
        // leaves to the hotel, so nothing re-sorts by distance.
        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].names.en").value("Far Museum"))
                .andExpect(jsonPath("$[1].names.en").value("Near Cafe"));
    }

    @Test
    @DisplayName("a landmark may be named with no measurements at all")
    void measurementsAreOptional() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // Doc 03 §5.2 wants verified distances. An unmeasured landmark is honest;
        // a guessed one is not.
        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"name": "The riverfront"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distanceMetres").doesNotExist())
                .andExpect(jsonPath("$.walkingMinutes").doesNotExist())
                .andExpect(jsonPath("$.type").doesNotExist());
    }

    @Test
    @DisplayName("one measurement is never derived from the other")
    void oneMeasurementDoesNotImplyTheOther() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // 500 metres does not become "6 minutes": that would be the platform
        // making a claim the hotel did not.
        mockMvc.perform(create(propertyId, partner, """
                        {"distanceMetres": 500, "translations": {"en": {"name": "The park"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distanceMetres").value(500))
                .andExpect(jsonPath("$.walkingMinutes").doesNotExist());
    }

    @Test
    @DisplayName("an update rewrites the measurements and keeps text it did not mention")
    void updatesLandmark() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(mockMvc.perform(create(propertyId, partner, """
                        {"distanceMetres": 500,
                         "translations": {"en": {"name": "The park", "description": "Shaded."}}}
                        """)).andReturn().getResponse().getContentAsString());

        mockMvc.perform(update(propertyId, id, partner, """
                        {"distanceMetres": 450, "walkingMinutes": 5,
                         "translations": {"en": {"name": "Tao Dan Park"}}}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.en").value("Tao Dan Park"))
                // The description was not mentioned, so it survives.
                .andExpect(jsonPath("$.descriptions.en").value("Shaded."))
                .andExpect(jsonPath("$.distanceMetres").value(450))
                .andExpect(jsonPath("$.walkingMinutes").value(5));
    }

    @Test
    @DisplayName("deleting removes the landmark and its translations")
    void deletesLandmark() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String id = idOf(mockMvc.perform(create(propertyId, partner, body("The park", 500, 6, 0)))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(delete(route(propertyId) + "/" + id)
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());

        // A real delete, not an archive: the table has no archived_at, and a
        // wrong claim about the neighbourhood should stop being made.
        assertThat(landmarks.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    // ------------------------------------------------------------------ refusals

    @Test
    @DisplayName("a landmark with no name in any locale is refused")
    void refusesANamelessLandmark() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"distanceMetres": 500, "translations": {}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("translations"));
    }

    @Test
    @DisplayName("a blank name is refused by field, not by the database")
    void refusesABlankName() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"vi": {"name": "  "}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("translations.vi.name"));
    }

    @Test
    @DisplayName("a negative measurement is a field error, not a 500")
    void refusesNegativeMeasurements() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // property_landmark_dist_nonneg and _walk_nonneg would otherwise reject
        // these at the database and surface as a 500.
        mockMvc.perform(create(propertyId, partner, """
                        {"distanceMetres": -1, "walkingMinutes": -2,
                         "translations": {"en": {"name": "Nowhere"}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(2))
                .andExpect(jsonPath("$.details[0].code").value("OUT_OF_RANGE"));
    }

    @Test
    @DisplayName("an unsupported locale is refused")
    void refusesAnUnsupportedLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"fr": {"name": "Le marché"}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("UNSUPPORTED_LOCALE"));
    }

    @Test
    @DisplayName("a refused create leaves no landmark behind")
    void refusalIsAtomic() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"fr": {"name": "Le marché"}}}
                        """))
                .andExpect(status().isBadRequest());

        assertThat(landmarks.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    @Test
    @DisplayName("another partner's property is 404, never 403")
    void crossPartnerCreateIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = property(theirs);

        mockMvc.perform(create(theirProperty, mine, body("The park", 500, 6, 0)))
                .andExpect(status().isNotFound());

        assertThat(landmarks.findByProperty(theirProperty, scopeOf(theirs))).isEmpty();
    }

    @Test
    @DisplayName("another partner's landmark cannot be updated or deleted")
    void crossPartnerWriteIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = property(theirs);
        String id = idOf(mockMvc.perform(create(theirProperty, theirs, body("The park", 500, 6, 0)))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(update(theirProperty, id, mine, """
                        {"translations": {"en": {"name": "Stolen"}}}
                        """))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete(route(theirProperty) + "/" + id)
                        .with(csrf()).cookie(mine.session))
                .andExpect(status().isNotFound());

        assertThat(landmarks.findByProperty(theirProperty, scopeOf(theirs))).hasSize(1);
    }

    @Test
    @DisplayName("an anonymous caller cannot add a landmark")
    void requiresASession() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(post(route(propertyId)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("The park", 500, 6, 0)))
                .andExpect(status().isUnauthorized());

        assertThat(landmarks.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    // ------------------------------------------------------------------ the guest

    @Test
    @DisplayName("a published property carries its landmarks on the detail")
    void detailCarriesLandmarks() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "MARKET", "distanceMetres": 500, "walkingMinutes": 6,
                         "translations": {"en": {"name": "Ben Thanh Market", "description": "Oldest market."},
                                          "vi": {"name": "Chợ Bến Thành"}}}
                        """))
                .andExpect(status().isCreated());

        // Doc 58 §3.1 puts landmarks on the detail; they have no route of their own.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.landmarks.length()").value(1))
                .andExpect(jsonPath("$.landmarks[0].name").value("Ben Thanh Market"))
                .andExpect(jsonPath("$.landmarks[0].description").value("Oldest market."))
                .andExpect(jsonPath("$.landmarks[0].type").value("MARKET"))
                .andExpect(jsonPath("$.landmarks[0].distanceMetres").value(500))
                .andExpect(jsonPath("$.landmarks[0].walkingMinutes").value(6));
    }

    @Test
    @DisplayName("the guest reads it in their own locale")
    void detailServesTheReadersLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"translations": {"en": {"name": "Ben Thanh Market"},
                                          "vi": {"name": "Chợ Bến Thành"}}}
                        """))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "vi"))
                .andExpect(jsonPath("$.landmarks[0].name").value("Chợ Bến Thành"));
    }

    @Test
    @DisplayName("a landmark with no text in the reader's locale is omitted")
    void omitsAnUntranslatedLandmark() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"distanceMetres": 500, "translations": {"vi": {"name": "Chợ Bến Thành"}}}
                        """))
                .andExpect(status().isCreated());

        // Showing a bare distance to an English reader would be the platform
        // writing content the operator did not — the same inner join the
        // amenities use.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.landmarks.length()").value(0));
    }

    @Test
    @DisplayName("an unpublished property's landmarks are unreachable")
    void draftPropertyExposesNothing() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, body("The park", 500, 6, 0)))
                .andExpect(status().isCreated());

        // The property is DRAFT, so its detail is a 404 and the landmarks with it.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the detail leaks no landmark identifier or ordering")
    void detailIsDiscreet() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, body("The park", 500, 6, 3)))
                .andExpect(status().isCreated());

        String body = mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Nothing on the public surface addresses a landmark, and echoing
        // sortOrder would invite a client to re-sort and disagree with the
        // operator.
        //
        // Narrowed from "does not contain the property id": the fixture builds
        // the slug out of that id, and the slug is the public identifier this
        // very response is keyed by. The claim being made is about the landmark,
        // so it is asserted against the landmark's own array.
        String landmarks = body.substring(body.indexOf("\"landmarks\""));
        assertThat(landmarks).doesNotContain("sortOrder", "\"id\"", "landmarkId", "propertyId");
    }

    @Test
    @DisplayName("the amenities the detail already carried are untouched")
    void amenitiesStillWork() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        // Step 16A.31 put amenities on this response and 16A.39 made them
        // authorable; adding landmarks must not disturb either.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenities").isArray())
                .andExpect(jsonPath("$.landmarks").isArray())
                .andExpect(jsonPath("$.slug").value(slug));
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("l-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("landmark-author", PASSWORD);
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
        return "/api/v1/admin/properties/" + propertyId + "/landmarks";
    }

    private static String body(String name, int metres, int minutes, int sortOrder) {
        return """
                {"distanceMetres": %d, "walkingMinutes": %d, "sortOrder": %d,
                 "translations": {"en": {"name": "%s"}}}
                """.formatted(metres, minutes, sortOrder, name);
    }

    private static MockHttpServletRequestBuilder create(UUID propertyId, Partner partner, String body) {
        return post(route(propertyId)).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder update(UUID propertyId, String landmarkId,
                                                        Partner partner, String body) {
        return patch(route(propertyId) + "/" + landmarkId).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String idOf(String body) {
        int start = body.indexOf("\"id\":\"") + 6;
        return body.substring(start, body.indexOf('"', start));
    }
}
