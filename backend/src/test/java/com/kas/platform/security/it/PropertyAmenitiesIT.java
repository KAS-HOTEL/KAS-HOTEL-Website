package com.kas.platform.security.it;

import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.39 — {@code PATCH /admin/properties/{id}/amenities}.
 *
 * <p>{@code property_amenity} has existed since V4, doc 58 §3.1 puts amenities on
 * the guest property detail, and Step 16A.31 shipped the guest page that renders
 * them — but <strong>nothing wrote them</strong>.
 * {@code PropertyRepository.replaceAmenities} was written for exactly this and had
 * no caller, so the only way to give a hotel an amenity was an {@code INSERT}.
 *
 * <p>The shape is the room-type route's, not a new one: a bare list of catalogue
 * codes, {@code property.manage}, the existing {@code PropertyAdminView} back. The
 * room-type service already told us this route had to exist — it refuses a
 * {@code PROPERTY_FACILITY} amenity with <em>"belongs to the property, not to a
 * room type"</em>, and until now there was nowhere for it to belong.
 */
class PropertyAmenitiesIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "amenity-author-password-4471";

    /** {@code SecurityFixtures.createProperties} inserts properties at version 1. */
    private static final int FIXTURE_VERSION = 1;

    private static final String WIFI = "wifi-free";
    private static final String PARKING = "parking";
    private static final String LIFT = "lift-access";

    @Autowired
    private PropertyRepository properties;

    // ------------------------------------------------------------------ writing

    @Test
    @DisplayName("a partner assigns amenities and reads them straight back")
    void assignsAmenities() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\", \"%s\"]".formatted(WIFI, PARKING)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes.length()").value(2))
                .andExpect(jsonPath("$.amenityCodes[0]").value(WIFI))
                .andExpect(jsonPath("$.amenityCodes[1]").value(PARKING));
    }

    @Test
    @DisplayName("what the write accepts, the read returns — the OQ-132 lesson")
    void readsBackWhatItWrote() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\"]".formatted(LIFT)))
                .andExpect(status().isOk());

        // A client that cannot read what it just wrote cannot show a Partner
        // their own draft — doc 101 §2.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes[0]").value(LIFT));
    }

    @Test
    @DisplayName("the caller's order is the stored order")
    void preservesTheCallersOrder() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner,
                        "[\"%s\", \"%s\", \"%s\"]".formatted(PARKING, LIFT, WIFI)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes[0]").value(PARKING))
                .andExpect(jsonPath("$.amenityCodes[1]").value(LIFT))
                .andExpect(jsonPath("$.amenityCodes[2]").value(WIFI));
    }

    @Test
    @DisplayName("the whole selection is replaced, not merged")
    void replacesRatherThanMerges() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\", \"%s\"]".formatted(WIFI, PARKING)))
                .andExpect(status().isOk());

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\"]".formatted(PARKING)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes.length()").value(1))
                .andExpect(jsonPath("$.amenityCodes[0]").value(PARKING));
    }

    @Test
    @DisplayName("an empty list clears the selection")
    void clearsTheSelection() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\"]".formatted(WIFI)))
                .andExpect(status().isOk());

        // Replace-not-merge is the only way a Partner can remove an amenity they
        // added by mistake, so the empty case has to work.
        mockMvc.perform(setAmenities(propertyId, partner, "[]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes.length()").value(0));

        assertThat(properties.findAmenityCodes(List.of(propertyId), scopeOf(partner))).isEmpty();
    }

    @Test
    @DisplayName("a repeated code is stored once")
    void deduplicates() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner,
                        "[\"%s\", \"%s\"]".formatted(WIFI, WIFI)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes.length()").value(1));
    }

    // ------------------------------------------------------------------ refusals

    @Test
    @DisplayName("an unknown code is refused, and every bad one is named at once")
    void refusesUnknownCodes() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        // All of them, not just the first: a Partner fixing a list should learn
        // about every bad code in one round trip.
        mockMvc.perform(setAmenities(propertyId, partner,
                        "[\"%s\", \"not-a-code\", \"also-not-a-code\"]".formatted(WIFI)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.length()").value(2))
                .andExpect(jsonPath("$.details[0].field").value("amenityCodes"))
                .andExpect(jsonPath("$.details[0].code").value("UNKNOWN_AMENITY"));
    }

    @Test
    @DisplayName("a refused write changes nothing")
    void refusalIsAtomic() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\"]".formatted(WIFI)))
                .andExpect(status().isOk());

        mockMvc.perform(setAmenities(propertyId, partner, "[\"%s\", \"nope\"]".formatted(PARKING)))
                .andExpect(status().isBadRequest());

        // The delete and the inserts are one transaction, so a rejected code
        // cannot leave the property with no amenities at all.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.amenityCodes.length()").value(1))
                .andExpect(jsonPath("$.amenityCodes[0]").value(WIFI));
    }

    @Test
    @DisplayName("another partner's property is 404, never 403")
    void crossPartnerIsNotFound() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();
        UUID theirProperty = property(theirs);

        // Doc 85 §6.3 — a reference is an identifier, never a credential.
        mockMvc.perform(setAmenities(theirProperty, mine, "[\"%s\"]".formatted(WIFI)))
                .andExpect(status().isNotFound());

        assertThat(properties.findAmenityCodes(List.of(theirProperty), scopeOf(theirs))).isEmpty();
    }

    @Test
    @DisplayName("scope is checked before the codes, so a bad code cannot probe")
    void scopeIsCheckedFirst() throws Exception {
        Partner mine = partnerAccount();
        Partner theirs = partnerAccount();

        // An out-of-scope property with an invalid body must answer 404, not 400.
        // A 400 would confirm the property exists and is reachable enough to
        // validate against.
        mockMvc.perform(setAmenities(property(theirs), mine, "[\"not-a-code\"]"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an unknown property is 404")
    void unknownPropertyIsNotFound() throws Exception {
        Partner partner = partnerAccount();

        mockMvc.perform(setAmenities(UUID.randomUUID(), partner, "[\"%s\"]".formatted(WIFI)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an anonymous caller cannot assign amenities")
    void requiresASession() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = property(partner);

        mockMvc.perform(patch("/api/v1/admin/properties/" + propertyId + "/amenities")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"%s\"]".formatted(WIFI)))
                .andExpect(status().isUnauthorized());

        assertThat(properties.findAmenityCodes(List.of(propertyId), scopeOf(partner))).isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("amenity-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private UUID property(Partner partner) {
        return fixtures.createProperties(partner.partnerId, 1).getFirst();
    }

    private static AuthorizationScope scopeOf(Partner partner) {
        return AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
    }

    private static MockHttpServletRequestBuilder setAmenities(UUID propertyId, Partner partner,
                                                              String body) {
        return patch("/api/v1/admin/properties/" + propertyId + "/amenities")
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }
}
