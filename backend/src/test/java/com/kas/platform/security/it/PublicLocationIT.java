package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.44 — {@code GET /public/locations}.
 *
 * <p>Doc 58 §3.1 froze the route as <em>"Map data — all properties"</em> with no
 * notes, and nothing served it. Doc 19 §2 renders it as {@code /locations},
 * <em>"Map-led discovery"</em>. The fields are the ones already frozen elsewhere:
 * {@code slug} is how every public surface addresses a property, {@code name} is
 * locale-resolved as on the portfolio list, and doc 23 §3.3 lists
 * {@code coordinates — lat/lng} beside {@code district} among a property's
 * location fields.
 *
 * <p><strong>Coordinates are nullable and unsupplied.</strong> V23 leaves them out
 * deliberately — <em>"Inventing them would be manufacturing production data for
 * eight real hotels"</em> — so these tests write coordinates onto their own
 * fixtures and assert that a property without them still appears, with
 * {@code null} rather than a substituted city centre.
 */
class PublicLocationIT extends SecurityIntegrationTest {

    private static final String ROUTE = "/api/v1/public/locations";

    // ------------------------------------------------------------------ the route

    @Test
    @DisplayName("the route exists and needs no session")
    void isPublic() throws Exception {
        // No cookie, no CSRF token: a guest opening a map has neither.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a published property is a point on the map")
    void carriesTheFrozenShape() throws Exception {
        UUID propertyId = published("District 1");
        fixtures.setCoordinates(propertyId, new BigDecimal("10.776889"), new BigDecimal("106.700806"));
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].name").value("TEST_PROPERTY"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].district").value("District 1"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].latitude").value(10.776889))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].longitude").value(106.700806));
    }

    @Test
    @DisplayName("a property with no coordinates is still listed, with nulls")
    void keepsUnplacedProperties() throws Exception {
        UUID propertyId = published("District 1");
        String slug = fixtures.slugOf(propertyId);

        // Doc 58 says "all properties". Filtering out the unplaced ones would
        // make an empty map indistinguishable from a hotel with no pin yet, and
        // substituting a city centre would be a lie about where a hotel is.
        //
        // Asserted against *this* property's entry rather than the whole
        // response. The original searched the entire body for "10.7", which held
        // only while no real property was ever publicly visible — the moment one
        // was published with genuine Ho Chi Minh City coordinates, a test about
        // one unplaced hotel started failing because of a different, correctly
        // placed one. The claim was always about this property.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].latitude").doesNotExist())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].longitude").doesNotExist());
    }

    @Test
    @DisplayName("it reads the name in the guest's locale")
    void servesTheReadersLocale() throws Exception {
        UUID propertyId = published("District 1");
        fixtures.setPropertyName(propertyId, "vi", "Khách sạn Thử");
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(get(ROUTE).param("locale", "vi"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].name").value("Khách sạn Thử"));
    }

    @Test
    @DisplayName("locale defaults to en rather than to a business setting")
    void defaultsToEnglish() throws Exception {
        UUID propertyId = published("District 1");
        String slug = fixtures.slugOf(propertyId);

        // Doc 51 A11 is unresolved; an explicit fallback is honest about that.
        mockMvc.perform(get(ROUTE))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].name").value("TEST_PROPERTY"));
    }

    // ------------------------------------------------------------------ visibility

    @Test
    @DisplayName("a DRAFT property is not on the map")
    void excludesDraft() throws Exception {
        UUID partnerId = fixtures.createPartner("loc-" + suffix());
        UUID draftId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(draftId, "TEST_PROPERTY");
        fixtures.setCoordinates(draftId, new BigDecimal("10.5"), new BigDecimal("106.5"));
        String draftSlug = fixtures.slugOf(draftId);

        // An unpublished hotel's address is exactly the sort of thing a map
        // endpoint could leak, so the predicate lives in the SQL rather than in
        // a controller check that could be forgotten.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + draftSlug + "')]").doesNotExist());
    }

    @Test
    @DisplayName("a CLOSED property is not on the map")
    void excludesClosed() throws Exception {
        UUID propertyId = published("District 1");
        String slug = fixtures.slugOf(propertyId);
        fixtures.setLifecycleState(propertyId, "CLOSED");

        // Doc 03 §8 — CLOSED is not one of the three publicly visible states.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").doesNotExist());
    }

    @Test
    @DisplayName("COMING_SOON and TEMPORARILY_CLOSED are on the map")
    void includesTheOtherVisibleStates() throws Exception {
        UUID comingSoon = published("District 1");
        fixtures.setLifecycleState(comingSoon, "COMING_SOON");
        UUID temporarilyClosed = published("District 1");
        fixtures.setLifecycleState(temporarilyClosed, "TEMPORARILY_CLOSED");

        // Doc 03 §8 lists both as visible; a guest looking at a map should see a
        // hotel that is opening, and the page it links to says which.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(jsonPath("$[?(@.slug=='" + fixtures.slugOf(comingSoon) + "')]").exists())
                .andExpect(jsonPath("$[?(@.slug=='" + fixtures.slugOf(temporarilyClosed) + "')]").exists());
    }

    @Test
    @DisplayName("a property with no name in the reader's locale is omitted")
    void omitsAnUntranslatedProperty() throws Exception {
        UUID partnerId = fixtures.createPartner("loc-" + suffix());
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyName(propertyId, "vi", "Chỉ tiếng Việt");
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        // The same inner join the portfolio list uses: a marker labelled with a
        // slug would be the platform writing content the operator did not.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").doesNotExist());
        mockMvc.perform(get(ROUTE).param("locale", "vi"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());
    }

    // ------------------------------------------------------------------ discretion

    @Test
    @DisplayName("it leaks no identifier, partner or lifecycle internals")
    void carriesNothingOperational() throws Exception {
        UUID propertyId = published("District 1");
        fixtures.setCoordinates(propertyId, new BigDecimal("10.5"), new BigDecimal("106.5"));

        String body = mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // A map answers "where". The portfolio list and the property page
        // already answer "whether", so nothing operational travels here.
        assertThat(body)
                .doesNotContain("\"id\"", "partnerId", "propertyId", "sortOrder", "version",
                        "lifecycleState", "isFlagship", "phone", "createdAt");
    }

    @Test
    @DisplayName("the slug it returns is the slug the hotel page is addressed by")
    void slugIsTheGuestIdentifier() throws Exception {
        UUID propertyId = published("District 1");
        String slug = fixtures.slugOf(propertyId);

        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());

        // A marker has to lead somewhere, and this is the address it leads to.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ helpers

    private static String suffix() {
        return UUID.randomUUID().toString().substring(0, 6);
    }

    private UUID published(String district) {
        UUID partnerId = fixtures.createPartner("loc-" + suffix());
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.setDistrict(propertyId, district);
        fixtures.openProperty(propertyId);
        return propertyId;
    }
}
