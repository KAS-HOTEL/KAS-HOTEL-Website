package com.kas.platform.security.it;

import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.45 — coordinates on the existing {@code PATCH /admin/properties/{id}}.
 *
 * <p>{@code property.latitude} and {@code longitude} have existed since V3 with
 * {@code property_lat_range} and {@code property_lng_range}, doc 23 §3.3 lists
 * {@code coordinates — lat/lng} beside {@code address, district, ward}, and Step
 * 16A.27 made those neighbours writable through this route while stopping short of
 * the coordinates. Step 16A.44 shipped {@code GET /public/locations} and found
 * that it could never carry a point.
 *
 * <p><strong>No second write path.</strong> The coordinates join the fields
 * already on the frozen route and inherit its semantics exactly — including the
 * one that surprises: {@code coalesce} means an omitted field keeps its value and
 * <em>nothing on this route can be cleared back to null</em>.
 */
class PropertyCoordinatesIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "coordinate-author-password-7712";

    /** {@code SecurityFixtures.createProperties} inserts properties at version 1. */
    private static final int FIXTURE_VERSION = 1;

    /** Ben Thanh Market, to six decimals — the column is {@code numeric(9,6)}. */
    private static final String LAT = "10.772500";
    private static final String LNG = "106.698000";

    @Autowired
    private PropertyRepository properties;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("the existing route accepts coordinates and reads them straight back")
    void writesAndReadsCoordinates() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s, "longitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT, LNG)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(10.7725))
                .andExpect(jsonPath("$.longitude").value(106.698));

        // Doc 101 §2's OQ-132 lesson: what the write accepts, the read returns.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(10.7725))
                .andExpect(jsonPath("$.longitude").value(106.698));
    }

    @Test
    @DisplayName("a property with no coordinates reports null, never a default")
    void coordinatesStayNull() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // V23 leaves coordinates deliberately unseeded, and nothing substitutes a
        // city centre for a missing point.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").doesNotExist())
                .andExpect(jsonPath("$.longitude").doesNotExist());
    }

    @Test
    @DisplayName("a latitude without a longitude is accepted")
    void oneCoordinateIsEnough() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // No frozen document makes them a mandatory pair, and a Partner mid-draft
        // may genuinely have one. Inventing the pairing rule would be inventing a
        // business rule.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(10.7725))
                .andExpect(jsonPath("$.longitude").doesNotExist());
    }

    @Test
    @DisplayName("an omitted coordinate keeps the stored one — the route's existing rule")
    void omissionKeepsTheStoredValue() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s, "longitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT, LNG)))
                .andExpect(status().isOk());

        // Editing only the phone must not lose the point. This is the `coalesce`
        // that lets a Partner build a draft up over several sessions.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "phone": "+84 28 1234 5678"}
                        """.formatted(FIXTURE_VERSION + 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("+84 28 1234 5678"))
                .andExpect(jsonPath("$.latitude").value(10.7725));
    }

    @Test
    @DisplayName("an explicit null cannot clear a coordinate, exactly like every other field")
    void nullDoesNotClear() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s, "longitude": %s, "city": "Ho Chi Minh City"}
                        """.formatted(FIXTURE_VERSION + 1, LAT, LNG)))
                .andExpect(status().isOk());

        // This is the route's existing semantics, not a coordinate rule: the
        // `coalesce` makes an explicit null indistinguishable from an omission,
        // and `city` behaves identically. Giving coordinates a private way out
        // would be a second write path wearing one method's name.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": null, "longitude": null, "city": null}
                        """.formatted(FIXTURE_VERSION + 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(10.7725))
                .andExpect(jsonPath("$.city").value("Ho Chi Minh City"));
    }

    @Test
    @DisplayName("the boundary values the schema allows are accepted")
    void acceptsTheSchemaBoundaries() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // property_lat_range is BETWEEN -90 AND 90, property_lng_range -180..180.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": -90, "longitude": 180}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(-90))
                .andExpect(jsonPath("$.longitude").value(180));
    }

    // ------------------------------------------------------------------ refusals

    @Test
    @DisplayName("a latitude outside the schema's range is a field error, not a 500")
    void refusesOutOfRangeLatitude() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        // property_lat_range would otherwise reject this at the database and
        // surface as a 500.
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": 91}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("latitude"));
    }

    @Test
    @DisplayName("a longitude outside the schema's range is a field error too")
    void refusesOutOfRangeLongitude() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "longitude": -181}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("longitude"));
    }

    @Test
    @DisplayName("a refused coordinate changes nothing, not even the version")
    void refusalIsAtomic() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": 91, "city": "Ho Chi Minh City"}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isBadRequest());

        // Bean validation refuses the body before the service is reached, so the
        // city in the same request is not applied either. The fixture creates the
        // property with TEST_CITY, so the claim is that it is *unchanged* — not
        // that it is null.
        Property property = properties.findById(propertyId, scopeOf(partner)).orElseThrow();
        assertThat(property.latitude()).isNull();
        assertThat(property.city()).isEqualTo("TEST_CITY");
        assertThat(property.version()).isEqualTo(FIXTURE_VERSION + 1);
    }

    // ------------------------------------------------------------------ unchanged rules

    @Test
    @DisplayName("a stale version still conflicts, and the point is not written")
    void versionConflictStillApplies() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": 0, "latitude": %s}
                        """.formatted(LAT)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        assertThat(properties.findById(propertyId, scopeOf(partner)).orElseThrow().latitude())
                .isNull();
    }

    @Test
    @DisplayName("another partner cannot place a point on someone else's hotel")
    void crossPartnerIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = named(theirs);

        // 404, never 403 — doc 85 §6.3, and the version is checked after scope so
        // a guessed one cannot confirm the property exists.
        mockMvc.perform(patchProperty(theirProperty, mine, """
                        {"version": %d, "latitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT)))
                .andExpect(status().isNotFound());

        assertThat(properties.findById(theirProperty, scopeOf(theirs)).orElseThrow().latitude())
                .isNull();
    }

    @Test
    @DisplayName("an anonymous caller cannot place a point")
    void requiresASession() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patch("/api/v1/admin/properties/" + propertyId)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"version": %d, "latitude": %s}
                                """.formatted(FIXTURE_VERSION + 1, LAT)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the fields Step 16A.27 made writable still behave exactly as before")
    void existingFieldsAreUnaffected() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d,
                         "signatureLines": {"vi": "Một câu riêng"},
                         "shortDescriptions": {"vi": "Mô tả", "en": "Description"},
                         "district": "Quận 1", "ward": "Phường Bến Nghé",
                         "city": "Ho Chi Minh City", "phone": "+84 28 1234 5678"}
                        """.formatted(FIXTURE_VERSION + 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signatureLines.vi").value("Một câu riêng"))
                .andExpect(jsonPath("$.shortDescriptions.en").value("Description"))
                .andExpect(jsonPath("$.district").value("Quận 1"))
                .andExpect(jsonPath("$.ward").value("Phường Bến Nghé"))
                .andExpect(jsonPath("$.phone").value("+84 28 1234 5678"))
                // The new fields are additive: absent, not zero.
                .andExpect(jsonPath("$.latitude").doesNotExist());
    }

    // ------------------------------------------------------------------ the guest map

    @Test
    @DisplayName("a point authored here reaches GET /public/locations once published")
    void authoredPointReachesTheMap() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s, "longitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT, LNG)))
                .andExpect(status().isOk());

        // The fixture's own property, published through the same helper every
        // other public-surface test uses. No seed hotel is touched and no
        // publish rule is weakened.
        fixtures.openProperty(propertyId);
        String slug = fixtures.slugOf(propertyId);

        // This is the whole point of the slice: Step 16A.44's endpoint could not
        // carry a coordinate because nothing could write one.
        mockMvc.perform(get("/api/v1/public/locations").param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].latitude").value(10.7725))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')].longitude").value(106.698));
    }

    @Test
    @DisplayName("an unpublished hotel's point stays off the map")
    void unpublishedPointIsNotOnTheMap() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = named(partner);

        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "latitude": %s, "longitude": %s}
                        """.formatted(FIXTURE_VERSION + 1, LAT, LNG)))
                .andExpect(status().isOk());

        // The property stays DRAFT. Authoring a coordinate is not publishing one,
        // and a hotel's address is exactly what a map endpoint could leak.
        mockMvc.perform(get("/api/v1/public/locations").param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + fixtures.slugOf(propertyId) + "')]")
                        .doesNotExist());
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("c-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("coordinate-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static AuthorizationScope scopeOf(Partner partner) {
        return AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
    }

    /** A property whose names are written, which advances it to version 2. */
    private UUID named(Partner partner) throws Exception {
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        mockMvc.perform(patchProperty(propertyId, partner, """
                        {"version": %d, "names": {"vi": "Khách sạn Thử", "en": "Test Hotel"}}
                        """.formatted(FIXTURE_VERSION)))
                .andExpect(status().isOk());
        return propertyId;
    }

    private static MockHttpServletRequestBuilder patchProperty(UUID propertyId, Partner partner,
                                                               String body) {
        return patch("/api/v1/admin/properties/" + propertyId)
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }
}
