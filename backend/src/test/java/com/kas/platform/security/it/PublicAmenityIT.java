package com.kas.platform.security.it;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.43 — {@code GET /public/amenities}.
 *
 * <p>Doc 58 §3.1 froze the route as <em>"Amenity taxonomy"</em> with no notes,
 * and nothing served it. Doc 58 §3.1 also gives the portfolio an {@code amenity}
 * filter that takes a <strong>code</strong>, so without this route the only
 * possible guest control was a dropdown of raw codes.
 *
 * <p><strong>The catalogue has 56 codes and no approved words.</strong> The
 * wording is config A9 / OQ-031, {@code amenity_translation} has no rows, and the
 * translation join is inner — so the honest answer today is an empty list. These
 * tests write labels, assert the behaviour, and remove them again, exactly as
 * {@code PublicAmenitiesIT} does for the property detail.
 */
class PublicAmenityIT extends SecurityIntegrationTest {

    /** These tests assert an exact public list, which published hotels would add to. */
    @org.junit.jupiter.api.BeforeEach
    void requireNoPublishedHotels() {
        org.junit.jupiter.api.Assumptions.assumeTrue(fixtures.noPublishedSeedProperties(),
                "kas_web_test holds published hotels for manual website testing");
    }

    private static final String ROUTE = "/api/v1/public/amenities";

    private static final String WIFI = "wifi-free";
    private static final String PARKING = "parking";
    private static final String LIFT = "lift-access";

    private final List<String> namedCodes = new ArrayList<>();

    @AfterEach
    void removeTestTranslations() {
        namedCodes.forEach(code -> fixtures.removeAmenityTranslation(code, "en"));
        namedCodes.forEach(code -> fixtures.removeAmenityTranslation(code, "vi"));
        namedCodes.clear();
    }

    // ------------------------------------------------------------------ the route

    @Test
    @DisplayName("the route exists, is anonymous, and needs no session")
    void isPublic() throws Exception {
        // No cookie, no CSRF token: a guest browsing the portfolio has neither.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unnamed catalogue is an empty list, not an error")
    void unnamedCatalogueIsEmpty() throws Exception {
        // The database holds 56 codes and zero translations. "The vocabulary
        // exists, the approved words do not" is an answer, not a failure.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("a named amenity carries its code, its word and its category")
    void carriesTheFrozenShape() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value(WIFI))
                .andExpect(jsonPath("$[0].name").value("Free Wi-Fi"))
                .andExpect(jsonPath("$[0].category").value("CONNECTIVITY"));
    }

    @Test
    @DisplayName("it reads in the guest's locale")
    void servesTheReadersLocale() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        mockMvc.perform(get(ROUTE).param("locale", "vi"))
                .andExpect(jsonPath("$[0].name").value("Wi-Fi miễn phí"));
    }

    @Test
    @DisplayName("locale defaults to en rather than to a business setting")
    void defaultsToEnglish() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        // Doc 51 A11 is unresolved; an explicit fallback is honest about that.
        mockMvc.perform(get(ROUTE))
                .andExpect(jsonPath("$[0].name").value("Free Wi-Fi"));
    }

    @Test
    @DisplayName("an amenity with no word in the reader's locale is omitted")
    void omitsAnUntranslatedAmenity() throws Exception {
        nameOne(WIFI, "vi", "Wi-Fi miễn phí");

        // Showing `wifi-free` to an English reader would be the platform writing
        // a label nobody approved — the same inner join the property detail uses.
        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(ROUTE).param("locale", "vi"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("it never falls back to the code")
    void neverFallsBackToTheCode() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        String body = mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andReturn().getResponse().getContentAsString();

        // The one named amenity appears; the other 55 do not appear at all —
        // not as codes, not as blanks, not title-cased.
        assertThat(body).contains("Free Wi-Fi").doesNotContain(PARKING, LIFT);
    }

    // ------------------------------------------------------------------ ordering

    @Test
    @DisplayName("it is ordered by category, then the catalogue's own order")
    void ordersByCategoryThenCatalogue() throws Exception {
        // ACCESSIBILITY sorts before CONNECTIVITY, which sorts before
        // PROPERTY_FACILITY — the same order the admin catalogue uses, so an
        // operator and a guest see the vocabulary arranged identically.
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");
        name(PARKING, "Parking", "Chỗ đỗ xe");
        name(LIFT, "Lift access", "Thang máy");

        mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].category").value("ACCESSIBILITY"))
                .andExpect(jsonPath("$[1].category").value("CONNECTIVITY"))
                .andExpect(jsonPath("$[2].category").value("PROPERTY_FACILITY"));
    }

    // ------------------------------------------------------------------ boundaries

    @Test
    @DisplayName("an archived amenity is not part of the vocabulary")
    void excludesArchived() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");
        fixtures.archiveAmenity(WIFI);
        try {
            mockMvc.perform(get(ROUTE).param("locale", "en"))
                    .andExpect(jsonPath("$.length()").value(0));
        } finally {
            fixtures.restoreAmenity(WIFI);
        }
    }

    @Test
    @DisplayName("it exposes no identifier, ordering or operator flag")
    void carriesNothingOperational() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        String body = mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // `isHighlight` is absent deliberately: the catalogue column and
        // `property_amenity.is_highlight` are different facts wearing one name.
        assertThat(body)
                .doesNotContain("\"id\"", "sortOrder", "isHighlight", "icon", "archivedAt");
    }

    @Test
    @DisplayName("the codes it returns are the codes the portfolio filter accepts")
    void codesAreCompatibleWithThePortfolioFilter() throws Exception {
        name(WIFI, "Free Wi-Fi", "Wi-Fi miễn phí");

        String code = mockMvc.perform(get(ROUTE).param("locale", "en"))
                .andReturn().getResponse().getContentAsString();
        assertThat(code).contains("\"code\":\"" + WIFI + "\"");

        // The whole point of the route: what a guest picks here is what
        // `GET /public/properties?amenity=` takes. An unknown code would be an
        // empty portfolio, so the two vocabularies have to be the same one.
        mockMvc.perform(get("/api/v1/public/properties")
                        .param("locale", "en").param("amenity", WIFI))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ helpers

    private void name(String code, String english, String vietnamese) {
        nameOne(code, "en", english);
        nameOne(code, "vi", vietnamese);
    }

    private void nameOne(String code, String locale, String name) {
        fixtures.nameAmenity(code, locale, name);
        if (!namedCodes.contains(code)) {
            namedCodes.add(code);
        }
    }
}
