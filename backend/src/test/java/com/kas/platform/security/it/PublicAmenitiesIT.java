package com.kas.platform.security.it;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.31 — the amenities doc 58 §3.1 says the property detail includes.
 *
 * <p><em>"Property detail — includes facilities, <strong>amenities</strong>,
 * landmarks, gallery, policies"</em>. {@code property_amenity} has existed since
 * V4 and the shared catalogue is seeded by the repeatable migration, but no
 * public response carried a hotel's assignments, so the guest page could not
 * show what a hotel offers.
 *
 * <p>The two rules that matter here are <strong>this hotel's, never the
 * catalogue's</strong> — doc 03 §9's P1 risk is eight hotels reading identically
 * — and <strong>publication</strong>: an unpublished property's amenities are
 * unreachable for the same reason its page is.
 */
class PublicAmenitiesIT extends SecurityIntegrationTest {

    /** Seeded by {@code R__reference_amenities}, which creates codes and no names. */
    private static final String WIFI = "wifi-free";
    private static final String LIFT = "lift-access";
    private static final String PARKING = "parking";

    private final java.util.List<String> namedCodes = new java.util.ArrayList<>();

    @AfterEach
    void removeTestTranslations() {
        namedCodes.forEach(code -> fixtures.removeAmenityTranslation(code, "en"));
        namedCodes.forEach(code -> fixtures.removeAmenityTranslation(code, "vi"));
        namedCodes.clear();
    }

    // ------------------------------------------------------------------ the detail

    @Test
    @DisplayName("the detail carries the amenities this hotel actually offers")
    void detailCarriesAssignedAmenities() throws Exception {
        String slug = publishedProperty();
        UUID propertyId = fixtures.propertyIdOf(slug);
        name(WIFI, "Wi-Fi", "Wi-Fi");
        name(LIFT, "Lift access", "Thang máy");
        fixtures.assignAmenity(propertyId, WIFI, true, 0);
        fixtures.assignAmenity(propertyId, LIFT, false, 1);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.amenities.length()").value(2))
                .andExpect(jsonPath("$.amenities[0].code").value(WIFI))
                .andExpect(jsonPath("$.amenities[0].name").value("Wi-Fi"))
                .andExpect(jsonPath("$.amenities[0].category").value("CONNECTIVITY"))
                .andExpect(jsonPath("$.amenities[0].isHighlight").value(true))
                .andExpect(jsonPath("$.amenities[1].code").value(LIFT));
    }

    @Test
    @DisplayName("a hotel gets its own assignments, never the shared catalogue")
    void doesNotLeakTheCatalogue() throws Exception {
        String mine = publishedProperty();
        String theirs = publishedProperty();
        name(WIFI, "Wi-Fi", "Wi-Fi");
        name(PARKING, "Parking", "Chỗ đỗ xe");
        fixtures.assignAmenity(fixtures.propertyIdOf(mine), WIFI, false, 0);
        fixtures.assignAmenity(fixtures.propertyIdOf(theirs), PARKING, false, 0);

        // Doc 03 §9's P1 risk is eight hotels described identically. Listing the
        // 56-row vocabulary under each would be exactly that.
        mockMvc.perform(get("/api/v1/public/properties/" + mine).param("locale", "en"))
                .andExpect(jsonPath("$.amenities.length()").value(1))
                .andExpect(jsonPath("$.amenities[0].code").value(WIFI));

        mockMvc.perform(get("/api/v1/public/properties/" + theirs).param("locale", "en"))
                .andExpect(jsonPath("$.amenities.length()").value(1))
                .andExpect(jsonPath("$.amenities[0].code").value(PARKING));
    }

    @Test
    @DisplayName("a hotel with no assignments returns an empty list, not an error")
    void emptyIsASuccess() throws Exception {
        String slug = publishedProperty();

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenities").isArray())
                .andExpect(jsonPath("$.amenities.length()").value(0));
    }

    @Test
    @DisplayName("names resolve per locale")
    void namesFollowTheLocale() throws Exception {
        String slug = publishedProperty();
        name(LIFT, "Lift access", "Thang máy");
        fixtures.assignAmenity(fixtures.propertyIdOf(slug), LIFT, false, 0);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(jsonPath("$.amenities[0].name").value("Lift access"));
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "vi"))
                .andExpect(jsonPath("$.amenities[0].name").value("Thang máy"));
    }

    @Test
    @DisplayName("an amenity with no name in this locale is omitted, never shown as a code")
    void unnamedAmenitiesAreOmitted() throws Exception {
        String slug = publishedProperty();
        // The catalogue is seeded with codes and no names — the repeatable
        // migration says so: "This file creates the words, never the claims."
        // Until A9 supplies them, an unnamed amenity must not reach a guest as
        // `lift-access`. Same inner join findAll and findRoomTypes already use.
        fixtures.assignAmenity(fixtures.propertyIdOf(slug), LIFT, false, 0);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenities.length()").value(0));
    }

    @Test
    @DisplayName("an amenity archived from the catalogue stops appearing")
    void archivedAmenitiesDisappear() throws Exception {
        String slug = publishedProperty();
        name(PARKING, "Parking", "Chỗ đỗ xe");
        fixtures.assignAmenity(fixtures.propertyIdOf(slug), PARKING, false, 0);

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(jsonPath("$.amenities.length()").value(1));

        // Withdrawing a code should take effect without anyone unassigning it
        // hotel by hotel.
        fixtures.archiveAmenity(PARKING);
        try {
            mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                    .andExpect(jsonPath("$.amenities.length()").value(0));
        } finally {
            fixtures.restoreAmenity(PARKING);
        }
    }

    // ------------------------------------------------------------------ publication

    @Test
    @DisplayName("an unpublished hotel's amenities are unreachable, like its page")
    void draftAmenitiesAreNotPublic() throws Exception {
        UUID partnerId = fixtures.createPartner("am-" + UUID.randomUUID().toString().substring(0, 6));
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Nháp");
        name(WIFI, "Wi-Fi", "Wi-Fi");
        fixtures.assignAmenity(propertyId, WIFI, false, 0);
        // Left DRAFT.

        String slug = fixtures.slugOf(propertyId);
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the detail exposes no internal identifier alongside them")
    void leaksNoInternals() throws Exception {
        String slug = publishedProperty();
        name(WIFI, "Wi-Fi", "Wi-Fi");
        fixtures.assignAmenity(fixtures.propertyIdOf(slug), WIFI, false, 0);

        String body = mockMvc.perform(get("/api/v1/public/properties/" + slug)
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // No amenity id, no propertyId, no partnerId, no sort key, no archive
        // timestamp — a guest needs the words and the grouping.
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("amenityId", "propertyId", "partnerId",
                        "sortOrder", "archivedAt", "icon");
    }

    @Test
    @DisplayName("the property list is unchanged — amenities belong to the detail")
    void listIsUnaffected() throws Exception {
        String slug = publishedProperty();
        name(WIFI, "Wi-Fi", "Wi-Fi");
        fixtures.assignAmenity(fixtures.propertyIdOf(slug), WIFI, false, 0);

        // Doc 58 §3.1 draws the line: the list is "The 8 properties"; the detail
        // is what "includes … amenities".
        mockMvc.perform(get("/api/v1/public/properties").param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].amenities").isEmpty());
    }

    // ------------------------------------------------------------------ helpers

    /** A published property with a name in both locales. */
    private String publishedProperty() {
        UUID partnerId = fixtures.createPartner("am-" + UUID.randomUUID().toString().substring(0, 6));
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Tiện Nghi");
        fixtures.setLifecycle(propertyId, "OPEN");
        return fixtures.slugOf(propertyId);
    }

    /** Supplies the catalogue names A9 has not yet provided, for this test only. */
    private void name(String code, String en, String vi) {
        fixtures.nameAmenity(code, "en", en);
        fixtures.nameAmenity(code, "vi", vi);
        namedCodes.add(code);
    }
}
