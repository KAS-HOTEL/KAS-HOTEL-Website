package com.kas.platform.security.it;

import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.property.RoomTypeTranslation;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 7 — what the room-type read surface returns, and what it refuses to.
 *
 * <p>OQ-137: {@code POST} and {@code PATCH} on this route both accept a
 * {@code name} and a {@code shortDescription}, and {@code GET} returned neither —
 * the same write-without-read asymmetry OQ-132 closed for properties. These tests
 * pin the answer and the isolation that has to survive it: a room type now has a
 * name, so a leak would disclose something a Partner actually recognises.
 */
class RoomTypeReadIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "roomtype-reader-password-8823";

    @Autowired
    private RoomTypeRepository roomTypes;

    @Test
    @DisplayName("the list returns the translations the create endpoint wrote")
    void listCarriesTranslations() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = fixtures.addRoomType(propertyId, "deluxe-king");

        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
        roomTypes.setTranslation(roomTypeId, "vi", "Phòng Deluxe Giường King", "Rộng rãi", null, scope);
        roomTypes.setTranslation(roomTypeId, "en", "Deluxe King Room", "Spacious", null, scope);

        mockMvc.perform(get(roomTypesOf(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].slug").value("deluxe-king"))
                .andExpect(jsonPath("$[0].translations.vi.name").value("Phòng Deluxe Giường King"))
                .andExpect(jsonPath("$[0].translations.en.name").value("Deluxe King Room"))
                .andExpect(jsonPath("$[0].translations.en.shortDescription").value("Spacious"));
    }

    @Test
    @DisplayName("translations are per locale, so a missing one is visible as missing")
    void partialTranslationsAreHonest() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = fixtures.addRoomType(propertyId, "standard-twin");

        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
        roomTypes.setTranslation(roomTypeId, "vi", "Phòng Đôi Tiêu Chuẩn", null, null, scope);
        fixtures.removeRoomTypeTranslation(roomTypeId, "en");

        // "the English name is not set yet" is a fact the Partner needs, and a
        // server-resolved single string cannot carry it.
        mockMvc.perform(get(roomTypesOf(propertyId) + "/" + roomTypeId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.translations.vi.name").value("Phòng Đôi Tiêu Chuẩn"))
                .andExpect(jsonPath("$.translations.en").doesNotExist())
                .andExpect(jsonPath("$.translations.length()").value(1));
    }

    @Test
    @DisplayName("a room type with no translation returns an empty map, not a missing key")
    void translationsAreAlwaysPresent() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = fixtures.addRoomType(propertyId, "untranslated");
        fixtures.removeRoomTypeTranslation(roomTypeId, "en");
        fixtures.removeRoomTypeTranslation(roomTypeId, "vi");

        mockMvc.perform(get(roomTypesOf(propertyId) + "/" + roomTypeId).cookie(partner.session))
                .andExpect(jsonPath("$.translations").isMap())
                .andExpect(jsonPath("$.translations.length()").value(0));
    }

    @Test
    @DisplayName("a property with no room types is an empty list, not an error")
    void emptyIsAnEmptyList() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Every one of the eight seed properties is in this state today, so it is
        // the normal case rather than an edge one.
        mockMvc.perform(get(roomTypesOf(propertyId)).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("another partner's room type is 404, and its name never reaches the caller")
    void crossPartnerRoomTypeIsNotFound() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirProperty = fixtures.createProperties(partnerB, 1).getFirst();
        UUID theirRoomType = fixtures.addRoomType(theirProperty, "their-suite");

        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        roomTypes.setTranslation(theirRoomType, "vi", "Phòng Của Đối Tác Khác", null, null, scopeB);

        String body = mockMvc.perform(
                        get(roomTypesOf(theirProperty) + "/" + theirRoomType).cookie(partnerA.session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andReturn().getResponse().getContentAsString();

        // Now that a room type has a name, a leak would disclose something a
        // person recognises rather than an opaque slug.
        assertThat(body).doesNotContain("Phòng Của Đối Tác Khác").doesNotContain("their-suite");
    }

    @Test
    @DisplayName("another partner's property lists as empty, disclosing nothing")
    void crossPartnerListIsEmpty() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirProperty = fixtures.createProperties(partnerB, 1).getFirst();
        fixtures.addRoomType(theirProperty, "their-suite");

        // An empty list is indistinguishable from a property that genuinely has
        // no rooms — which is exactly as much as the caller should learn.
        mockMvc.perform(get(roomTypesOf(theirProperty)).cookie(partnerA.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("the translation lookup is scoped at the repository, not only above it")
    void translationLookupIsScoped() {
        UUID partnerA = fixtures.createPartner("a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID mineProperty = fixtures.createProperties(partnerA, 1).getFirst();
        UUID theirProperty = fixtures.createProperties(partnerB, 1).getFirst();
        UUID mine = fixtures.addRoomType(mineProperty, "mine");
        UUID theirs = fixtures.addRoomType(theirProperty, "theirs");

        AuthorizationScope scopeA = AuthorizationScope.partner(UUID.randomUUID(), partnerA);
        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        roomTypes.setTranslation(mine, "vi", "Của Tôi", null, null, scopeA);
        roomTypes.setTranslation(theirs, "vi", "Của Họ", null, null, scopeB);

        // Both ids asked for at once with Partner A's scope. A batch lookup that
        // trusted its argument list would leak here and the controller above it
        // would never know.
        Map<UUID, Map<String, RoomTypeTranslation>> found =
                roomTypes.findTranslations(List.of(mine, theirs), scopeA);

        assertThat(found).containsOnlyKeys(mine);
        assertThat(found.get(mine).get("vi").name()).isEqualTo("Của Tôi");
    }

    @Test
    @DisplayName("an empty id list asks the database nothing")
    void emptyLookupIsNotAQuery() {
        UUID partner = fixtures.createPartner("e-" + UUID.randomUUID().toString().substring(0, 6));
        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner);

        // A property with no room types must not build an `IN ()` clause, which
        // is a syntax error in PostgreSQL.
        assertThat(roomTypes.findTranslations(List.of(), scope)).isEmpty();
    }

    @Test
    @DisplayName("the read surface exposes no price and no physical room identity")
    void readSurfaceStaysWithinItsRemit() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = fixtures.addRoomType(propertyId, "suite");
        fixtures.setBasePrice(roomTypeId, 1_500_000L);

        String body = mockMvc.perform(
                        get(roomTypesOf(propertyId) + "/" + roomTypeId).cookie(partner.session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Doc 52 §3.2 keeps price off this record — it is commercial data owned by
        // pricing. Doc 52 §6 excludes PhysicalRoom from V1 entirely, so no field
        // here can carry a room number.
        assertThat(body)
                .doesNotContain("basePrice").doesNotContain("1500000")
                .doesNotContain("roomNumber").doesNotContain("floor")
                .doesNotContain("propertyId").doesNotContain("partnerId");
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("roomtype-reader", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static String roomTypesOf(UUID propertyId) {
        return "/api/v1/admin/properties/" + propertyId + "/room-types";
    }
}
