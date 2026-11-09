package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step A.1 — the editorial text reaches the guest.
 *
 * <p>{@code PropertyEditorialIT} proves the Partner can write a signature line
 * and both short descriptions, and that the admin read returns them. This proves
 * the other half, which until now did not hold: that a guest can read them.
 *
 * <p>The gap was structural rather than a missing column. The public detail was
 * composed from the <em>portfolio</em> row — slug, name, city, district,
 * flagship, lifecycle — so it could only ever carry the list's fields, even
 * though {@code signature_line} and {@code short_description} sit in the same
 * {@code property_translation} row the join already reads for {@code name}.
 * Doc 23 §3.2 places both on guest surfaces and doc 52 §3.1 makes them publish
 * invariants, so a hotel had to write them before it could open and then no
 * guest could ever see them.
 */
class PublicPropertyContentIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "public-content-reader-password-4417";

    /** {@code SecurityFixtures.createProperties} inserts properties at version 1. */
    private static final int FIXTURE_VERSION = 1;

    private static final String SIGNATURE_EN = "The rooftop hour above District 1";
    private static final String SIGNATURE_VI = "Giờ vàng trên sân thượng Quận 1";
    private static final String SHORT_EN = "A boutique hotel in District 1, with a rooftop over the river.";
    private static final String SHORT_VI = "Khách sạn boutique giữa Quận 1, sân thượng nhìn ra sông.";

    @Test
    @DisplayName("a published property returns its signature line and short description")
    void publishedPropertyCarriesEditorialText() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = authored(partner);
        fixtures.openProperty(propertyId);

        mockMvc.perform(get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLine").value(SIGNATURE_EN))
                .andExpect(jsonPath("$.shortDescription").value(SHORT_EN));
    }

    @Test
    @DisplayName("each locale gets its own text, resolved the way the name already is")
    void resolvesPerLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = authored(partner);
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        // Same `?locale=` parameter and the same inner join on
        // property_translation that has always chosen `name`. No new resolution
        // mechanism, and no falling back to the other locale.
        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLine").value(SIGNATURE_VI))
                .andExpect(jsonPath("$.shortDescription").value(SHORT_VI));

        mockMvc.perform(get("/api/v1/public/properties/" + slug).param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLine").value(SIGNATURE_EN));
    }

    @Test
    @DisplayName("an unwritten locale reports null rather than borrowing the other one")
    void unwrittenTextIsNull() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // English name only, so the English translation row exists with both
        // editorial columns still NULL.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "signatureLines": {"vi": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1, SIGNATURE_VI)))
                .andExpect(status().isOk());
        fixtures.openProperty(propertyId);

        // Null, not the Vietnamese line: a guest reading English must not be
        // shown Vietnamese marketing copy, and an invented fallback would be
        // content this application did not author.
        mockMvc.perform(get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLine").doesNotExist())
                .andExpect(jsonPath("$.shortDescription").doesNotExist())
                // The rest of the response is unaffected by the absence.
                .andExpect(jsonPath("$.name").value("Test Hotel"));
    }

    @Test
    @DisplayName("a draft property stays unreachable, editorial text and all")
    void draftRemainsExcluded() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = authored(partner);

        // Authored but never opened. The publication predicate is unchanged, so
        // this is a 404 exactly as it was before the two fields were added.
        mockMvc.perform(get("/api/v1/public/properties/" + fixtures.slugOf(propertyId))
                        .param("locale", "en"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the portfolio list is not widened by the detail's editorial text")
    void listShapeIsUnchanged() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = authored(partner);
        fixtures.openProperty(propertyId);

        // Doc 23 §3.2 puts shortDescription on cards, not in the list payload,
        // and the list mapper is shared. This pins that the repair reached the
        // detail only.
        mockMvc.perform(get("/api/v1/public/properties").param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + fixtures.slugOf(propertyId) + "')].signatureLine")
                        .isEmpty())
                .andExpect(jsonPath("$[?(@.slug=='" + fixtures.slugOf(propertyId) + "')].shortDescription")
                        .isEmpty());
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("public-content-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    /** A property with both names set — editorial text attaches to a translation row. */
    private UUID named(Partner partner) throws Exception {
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "names": {"vi": "Khách sạn Thử", "en": "Test Hotel"}}
                        """.formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());
        return propertyId;
    }

    /** Named, then given a signature line and short description in both locales. */
    private UUID authored(Partner partner) throws Exception {
        UUID propertyId = named(partner);
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "signatureLines": {"vi": "%s", "en": "%s"},
                         "shortDescriptions": {"vi": "%s", "en": "%s"}}
                        """.formatted(FIXTURE_VERSION + 1,
                        SIGNATURE_VI, SIGNATURE_EN, SHORT_VI, SHORT_EN)))
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
