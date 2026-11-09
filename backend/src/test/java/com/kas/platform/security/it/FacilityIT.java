package com.kas.platform.security.it;

import com.kas.platform.property.FacilityRepository;
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
 * Step 16A.40 — {@code /admin/properties/{id}/facilities} and
 * {@code /public/properties/{slug}/facilities}.
 *
 * <p>Doc 58 §8 froze the admin path with {@code property.manage}, doc 58 §3.1
 * froze the guest route, {@code facility} and {@code facility_translation} have
 * existed since V4 and {@code facility_type} since V1 — and <strong>no Java
 * touched any of it</strong>. Doc 23 §5 is the block's content contract, and this
 * carries exactly the part of it the schema and the frozen documents define:
 * type, per-locale name and description, {@code openToNonResidents}, order.
 */
class FacilityIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "facility-author-password-6620";

    @Autowired
    private FacilityRepository facilities;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("a partner creates a facility and reads it straight back")
    void createsAFacility() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "ROOFTOP",
                         "openToNonResidents": true,
                         "sortOrder": 2,
                         "translations": {
                           "en": {"name": "The Rooftop", "description": "A bar above District 1."},
                           "vi": {"name": "Sân thượng"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("ROOFTOP"))
                .andExpect(jsonPath("$.names.en").value("The Rooftop"))
                .andExpect(jsonPath("$.names.vi").value("Sân thượng"))
                .andExpect(jsonPath("$.descriptions.en").value("A bar above District 1."))
                // A locale with no description contributes no key, so an empty
                // map means "not written" rather than "written as nothing".
                .andExpect(jsonPath("$.descriptions.vi").doesNotExist())
                .andExpect(jsonPath("$.openToNonResidents").value(true))
                .andExpect(jsonPath("$.sortOrder").value(2))
                .andExpect(jsonPath("$.archived").value(false));
    }

    @Test
    @DisplayName("the list returns what was created, in the operator's order")
    void listsInOrder() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, body("GYM", "The Gym", 5)))
                .andExpect(status().isCreated());
        mockMvc.perform(create(propertyId, partner, body("POOL", "The Pool", 1)))
                .andExpect(status().isCreated());

        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].type").value("POOL"))
                .andExpect(jsonPath("$[1].type").value("GYM"));
    }

    @Test
    @DisplayName("an update rewrites the text and keeps what it did not mention")
    void updatesText() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String facilityId = idOf(mockMvc.perform(create(propertyId, partner, """
                        {"type": "SPA",
                         "translations": {"en": {"name": "The Spa", "description": "Quiet."}}}
                        """))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(update(propertyId, facilityId, partner, """
                        {"type": "SPA", "openToNonResidents": false, "sortOrder": 3,
                         "translations": {"en": {"name": "KAS Spa"}}}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.en").value("KAS Spa"))
                // The description was not mentioned, so it survives — the same
                // rule the property editorial writer follows.
                .andExpect(jsonPath("$.descriptions.en").value("Quiet."))
                .andExpect(jsonPath("$.openToNonResidents").value(false))
                .andExpect(jsonPath("$.sortOrder").value(3));
    }

    @Test
    @DisplayName("the type cannot be changed by an update")
    void typeIsNotUpdatable() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String facilityId = idOf(mockMvc.perform(create(propertyId, partner, body("POOL", "The Pool", 0)))
                .andReturn().getResponse().getContentAsString());

        // A block that turned from POOL into MEETING would keep the pool's words
        // while claiming to be something else.
        mockMvc.perform(update(propertyId, facilityId, partner, """
                        {"type": "MEETING", "translations": {"en": {"name": "The Pool"}}}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("POOL"));
    }

    @Test
    @DisplayName("archiving withdraws the facility without deleting the row")
    void archives() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String facilityId = idOf(mockMvc.perform(create(propertyId, partner, body("BAR", "The Bar", 0)))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(delete(route(propertyId) + "/" + facilityId)
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());

        // Still in the console — a Partner needs to see what they withdrew.
        mockMvc.perform(get(route(propertyId)).cookie(partner.session))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].archived").value(true));
    }

    @Test
    @DisplayName("archiving twice is not an error")
    void archiveIsIdempotent() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String facilityId = idOf(mockMvc.perform(create(propertyId, partner, body("LOUNGE", "Lounge", 0)))
                .andReturn().getResponse().getContentAsString());

        String path = route(propertyId) + "/" + facilityId;
        mockMvc.perform(delete(path).with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());
        // A retried click must not become a refusal a Partner has to interpret.
        mockMvc.perform(delete(path).with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());
    }

    // ------------------------------------------------------------------ refusals

    @Test
    @DisplayName("a facility with no name in any locale is refused")
    void refusesAFacilityWithNoName() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // facility_translation.name is NOT NULL, so this would be a block no
        // guest query can return and no console screen can label.
        mockMvc.perform(create(propertyId, partner, """
                        {"type": "GYM", "translations": {}}
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
                        {"type": "GYM", "translations": {"en": {"name": "   "}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("translations.en.name"));
    }

    @Test
    @DisplayName("an unsupported locale is refused")
    void refusesAnUnsupportedLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "GYM", "translations": {"fr": {"name": "Le Gym"}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("UNSUPPORTED_LOCALE"));
    }

    @Test
    @DisplayName("a type outside the frozen enum is refused")
    void refusesAnUnknownType() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "HELIPAD", "translations": {"en": {"name": "Helipad"}}}
                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a refused create leaves no facility behind")
    void refusalIsAtomic() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "GYM", "translations": {"fr": {"name": "Le Gym"}}}
                        """))
                .andExpect(status().isBadRequest());

        assertThat(facilities.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    @Test
    @DisplayName("another partner's property is 404, never 403")
    void crossPartnerCreateIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = property(theirs);

        mockMvc.perform(create(theirProperty, mine, body("GYM", "The Gym", 0)))
                .andExpect(status().isNotFound());

        assertThat(facilities.findByProperty(theirProperty, scopeOf(theirs))).isEmpty();
    }

    @Test
    @DisplayName("another partner's facility cannot be updated or archived")
    void crossPartnerWriteIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = property(theirs);
        String facilityId = idOf(mockMvc.perform(create(theirProperty, theirs, body("GYM", "The Gym", 0)))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(update(theirProperty, facilityId, mine, """
                        {"type": "GYM", "translations": {"en": {"name": "Stolen"}}}
                        """))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete(route(theirProperty) + "/" + facilityId)
                        .with(csrf()).cookie(mine.session))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an anonymous caller cannot create a facility")
    void requiresASession() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(post(route(propertyId)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("GYM", "The Gym", 0)))
                .andExpect(status().isUnauthorized());

        assertThat(facilities.findByProperty(propertyId, scopeOf(partner))).isEmpty();
    }

    // ------------------------------------------------------------------ the guest

    @Test
    @DisplayName("a published property serves its facilities to a guest")
    void servesFacilitiesToGuests() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "RESTAURANT", "openToNonResidents": true,
                         "translations": {"en": {"name": "The Dining Room", "description": "Vietnamese."},
                                          "vi": {"name": "Phòng ăn"}}}
                        """))
                .andExpect(status().isCreated());

        mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].type").value("RESTAURANT"))
                .andExpect(jsonPath("$[0].name").value("The Dining Room"))
                .andExpect(jsonPath("$[0].description").value("Vietnamese."))
                .andExpect(jsonPath("$[0].openToNonResidents").value(true));
    }

    @Test
    @DisplayName("the guest reads it in their own locale")
    void servesTheReadersLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "POOL",
                         "translations": {"en": {"name": "The Pool"}, "vi": {"name": "Hồ bơi"}}}
                        """))
                .andExpect(status().isCreated());

        mockMvc.perform(get(publicRoute(slug)).param("locale", "vi"))
                .andExpect(jsonPath("$[0].name").value("Hồ bơi"));
    }

    @Test
    @DisplayName("a facility with no text in the reader's locale is omitted, not shown as its type")
    void omitsAnUntranslatedFacility() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, """
                        {"type": "GYM", "translations": {"vi": {"name": "Phòng tập"}}}
                        """))
                .andExpect(status().isCreated());

        // Showing "GYM" to an English reader would be the platform writing
        // content the operator did not — the same inner join the amenities use.
        mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an archived facility disappears from the guest page")
    void archivedIsInvisibleToGuests() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);
        String facilityId = idOf(mockMvc.perform(create(propertyId, partner, body("BAR", "The Bar", 0)))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(delete(route(propertyId) + "/" + facilityId)
                        .with(csrf()).cookie(partner.session))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an unpublished property's facilities are unreachable")
    void draftPropertyServesNothing() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, body("GYM", "The Gym", 0)))
                .andExpect(status().isCreated());

        // The property is DRAFT. Its blocks are unreachable for exactly the
        // reason its page is — enforced in SQL, not in the controller.
        mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("the guest route needs no session and leaks no identifier")
    void publicRouteIsAnonymousAndDiscreet() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(create(propertyId, partner, body("TERRACE", "The Terrace", 0)))
                .andExpect(status().isCreated());

        String body = mockMvc.perform(get(publicRoute(slug)).param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Doc 62 §6's rule: internal identifiers stay server-side. Nothing on the
        // public surface addresses a facility by id.
        assertThat(body)
                .doesNotContain("\"id\"", propertyId.toString(), "sortOrder", "archived");
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("f-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("facility-author", PASSWORD);
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
        return "/api/v1/admin/properties/" + propertyId + "/facilities";
    }

    private static String publicRoute(String slug) {
        return "/api/v1/public/properties/" + slug + "/facilities";
    }

    private static String body(String type, String name, int sortOrder) {
        return """
                {"type": "%s", "sortOrder": %d, "translations": {"en": {"name": "%s"}}}
                """.formatted(type, sortOrder, name);
    }

    private static MockHttpServletRequestBuilder create(UUID propertyId, Partner partner, String body) {
        return post(route(propertyId)).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder update(UUID propertyId, String facilityId,
                                                        Partner partner, String body) {
        return patch(route(propertyId) + "/" + facilityId).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String idOf(String body) {
        int start = body.indexOf("\"id\":\"") + 6;
        return body.substring(start, body.indexOf('"', start));
    }
}
