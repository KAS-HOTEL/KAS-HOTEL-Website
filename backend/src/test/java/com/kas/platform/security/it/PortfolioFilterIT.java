package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.42 — the frozen filters on {@code GET /public/properties}.
 *
 * <p>Doc 58 §3.1: <em>"The 8 properties — Filters: district, character, amenity,
 * collection. Excludes DRAFT/CLOSED"</em>.
 *
 * <p><strong>Two of the four are implemented, and the other two deliberately are
 * not.</strong> {@code district} and {@code amenity} are backed by data a Partner
 * authors. {@code collection} exists only as a column V3 describes as
 * <em>"OQ-009 unresolved … not an invented enum"</em> that nothing writes, and
 * {@code character} has no column at all — doc 18 §5 makes it the alternative
 * that appears only if OQ-009 rejects collections. Accepting either would promise
 * a narrowing the platform cannot perform.
 */
class PortfolioFilterIT extends SecurityIntegrationTest {

    private static final String ROUTE = "/api/v1/public/properties";
    private static final String WIFI = "wifi-free";
    private static final String PARKING = "parking";

    // ------------------------------------------------------------------ district

    @Test
    @DisplayName("the district filter narrows to that district")
    void filtersByDistrict() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String one = published(partnerId, "District 1");
        String seven = published(partnerId, "District 7");

        mockMvc.perform(get(ROUTE).param("locale", "en").param("district", "District 1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + one + "')]").exists())
                .andExpect(jsonPath("$[?(@.slug=='" + seven + "')]").doesNotExist());
    }

    @Test
    @DisplayName("a district nobody is in is an empty list, not an error")
    void unmatchedDistrictIsEmpty() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        published(partnerId, "District 1");

        // "No hotel in District 12" is an answer, not a failure.
        mockMvc.perform(get(ROUTE).param("locale", "en").param("district", "District 12"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an empty district parameter means unfiltered, not 'match nothing'")
    void blankDistrictIsUnfiltered() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String slug = published(partnerId, "District 1");

        // A form that submits every field sends `?district=` for an unselected
        // dropdown, and that must not empty the page the guest had not filtered.
        mockMvc.perform(get(ROUTE).param("locale", "en").param("district", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());
    }

    @Test
    @DisplayName("the match is exact, not a prefix")
    void districtMatchIsExact() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String slug = published(partnerId, "District 1");

        // Doc 58 names the filter and defines no matching semantics, so a prefix
        // match would be a rule this repository invented — and "District 1"
        // would then also return "District 10".
        mockMvc.perform(get(ROUTE).param("locale", "en").param("district", "District"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").doesNotExist());
    }

    // ------------------------------------------------------------------ amenity

    @Test
    @DisplayName("the amenity filter narrows to hotels that actually have it")
    void filtersByAmenity() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String withWifi = published(partnerId, "District 1");
        String without = published(partnerId, "District 1");
        fixtures.assignAmenity(fixtures.propertyIdOf(withWifi), WIFI, false, 0);

        mockMvc.perform(get(ROUTE).param("locale", "en").param("amenity", WIFI))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + withWifi + "')]").exists())
                .andExpect(jsonPath("$[?(@.slug=='" + without + "')]").doesNotExist());
    }

    @Test
    @DisplayName("an unknown amenity code is an empty list, not an error")
    void unknownAmenityIsEmpty() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        published(partnerId, "District 1");

        mockMvc.perform(get(ROUTE).param("locale", "en").param("amenity", "not-a-code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("the two filters combine")
    void filtersCombine() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String target = published(partnerId, "District 1");
        String wrongDistrict = published(partnerId, "District 7");
        String noAmenity = published(partnerId, "District 1");

        fixtures.assignAmenity(fixtures.propertyIdOf(target), WIFI, false, 0);
        fixtures.assignAmenity(fixtures.propertyIdOf(wrongDistrict), WIFI, false, 0);

        mockMvc.perform(get(ROUTE).param("locale", "en")
                        .param("district", "District 1").param("amenity", WIFI))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + target + "')]").exists())
                .andExpect(jsonPath("$[?(@.slug=='" + wrongDistrict + "')]").doesNotExist())
                .andExpect(jsonPath("$[?(@.slug=='" + noAmenity + "')]").doesNotExist());
    }

    @Test
    @DisplayName("a hotel with several amenities matches any one of them")
    void matchesAnyAssignedAmenity() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String slug = published(partnerId, "District 1");
        UUID id = fixtures.propertyIdOf(slug);
        fixtures.assignAmenity(id, WIFI, false, 0);
        fixtures.assignAmenity(id, PARKING, false, 1);

        mockMvc.perform(get(ROUTE).param("locale", "en").param("amenity", PARKING))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());
    }

    // ------------------------------------------------------------------ boundaries

    @Test
    @DisplayName("filtering never reaches past the publication predicate")
    void filtersDoNotBypassPublication() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        UUID draftId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(draftId, "TEST_PROPERTY");
        fixtures.setDistrict(draftId, "District 1");
        fixtures.assignAmenity(draftId, WIFI, false, 0);
        String draftSlug = fixtures.slugOf(draftId);

        // The property stays DRAFT. A filter is a narrowing of what is already
        // public, never a way to reach something that is not.
        mockMvc.perform(get(ROUTE).param("locale", "en").param("district", "District 1"))
                .andExpect(jsonPath("$[?(@.slug=='" + draftSlug + "')]").doesNotExist());
        mockMvc.perform(get(ROUTE).param("locale", "en").param("amenity", WIFI))
                .andExpect(jsonPath("$[?(@.slug=='" + draftSlug + "')]").doesNotExist());
    }

    @Test
    @DisplayName("the response shape is unchanged by filtering")
    void shapeIsUnchanged() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String slug = published(partnerId, "District 1");

        String body = mockMvc.perform(get(ROUTE).param("locale", "en")
                        .param("district", "District 1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].district").exists())
                .andReturn().getResponse().getContentAsString();

        // Doc 58 §9 — the list is the public shape and filtering must not widen
        // it. No identifier, no partner, no internal state.
        assertThat(body).doesNotContain("\"id\"", "partnerId", "sortOrder", "version");
    }

    @Test
    @DisplayName("the two unbacked filters are ignored rather than honoured")
    void unbackedFiltersAreIgnored() throws Exception {
        UUID partnerId = fixtures.createPartner("pf-" + suffix());
        String slug = published(partnerId, "District 1");

        // `collection` has no writer and `character` has no column. Accepting
        // either would promise a narrowing the platform cannot perform, so the
        // parameters are simply not bound — the list comes back unnarrowed.
        mockMvc.perform(get(ROUTE).param("locale", "en")
                        .param("collection", "houses").param("character", "quiet"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());
    }

    // ------------------------------------------------------------------ helpers

    private static String suffix() {
        return UUID.randomUUID().toString().substring(0, 6);
    }

    /** A published property in a given district, named so the list can return it. */
    private String published(UUID partnerId, String district) {
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.setDistrict(propertyId, district);
        fixtures.openProperty(propertyId);
        return fixtures.slugOf(propertyId);
    }
}
