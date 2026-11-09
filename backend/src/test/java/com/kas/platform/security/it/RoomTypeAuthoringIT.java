package com.kas.platform.security.it;

import com.kas.platform.property.RoomTypeRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 8 — authoring room types, and the two defects that had to be fixed first.
 *
 * <h2>OQ-138</h2>
 *
 * <p>{@code RoomTypeRequest} carried a single {@code name}. {@code POST} wrote it
 * to both locales; {@code PATCH} wrote it to {@code en} only. So a Partner could
 * create a room in Vietnamese and then never change that name again — on a
 * platform where doc 25 freezes two locales and doc 52 §3.1 requires both-locale
 * content before publication. {@link #patchChangesTheVietnameseName()} is the
 * regression test for exactly that.
 *
 * <h2>The partial-update defect</h2>
 *
 * <p>{@code PATCH} used to be four separate transactional calls, so a request
 * whose amenities were invalid still committed the attribute change before
 * failing. {@link #arefusedAmenityWritesNothing()} pins the fix.
 */
class RoomTypeAuthoringIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "roomtype-author-password-5512";

    @Autowired
    private RoomTypeRepository roomTypes;

    // ------------------------------------------------------------------ OQ-138

    @Test
    @DisplayName("OQ-138: a PATCH changes the Vietnamese name, and does not silently discard it")
    void patchChangesTheVietnameseName() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"deluxe","maxAdults":2,"maxChildren":0,"maxOccupancy":2,"smoking":false,
                 "translations":{"vi":{"name":"Phòng Deluxe"},"en":{"name":"Deluxe Room"}}}
                """);

        mockMvc.perform(patchRoom(partner, propertyId, roomTypeId, 0, """
                        {"slug":"deluxe","maxAdults":2,"maxChildren":0,"maxOccupancy":2,
                         "smoking":false,
                         "translations":{"vi":{"name":"Phòng Deluxe Đã Đổi Tên"}}}
                        """))
                .andExpect(status().isOk())
                // Before the fix this stayed "Phòng Deluxe" and the edit landed on
                // the English name instead.
                .andExpect(jsonPath("$.translations.vi.name").value("Phòng Deluxe Đã Đổi Tên"))
                // An absent locale means "leave it alone", never "delete it".
                .andExpect(jsonPath("$.translations.en.name").value("Deluxe Room"));
    }

    @Test
    @DisplayName("a create writes exactly the locales supplied, not one string twice")
    void createWritesOnlyWhatWasGiven() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        mockMvc.perform(postRoom(partner, propertyId, """
                        {"slug":"vi-only","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                         "smoking":false,"translations":{"vi":{"name":"Chỉ Tiếng Việt"}}}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.translations.vi.name").value("Chỉ Tiếng Việt"))
                // Copying the Vietnamese name into `en` would look helpful and would
                // make "the English name is missing" impossible to see.
                .andExpect(jsonPath("$.translations.en").doesNotExist());
    }

    @Test
    @DisplayName("both locales, with short descriptions, survive a round trip")
    void bothLocalesRoundTrip() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"suite","maxAdults":2,"maxChildren":2,"maxOccupancy":3,"smoking":false,
                 "translations":{"vi":{"name":"Phòng Suite","shortDescription":"Rộng rãi"},
                                 "en":{"name":"Suite","shortDescription":"Spacious"}}}
                """);

        mockMvc.perform(getRoom(partner, propertyId, roomTypeId))
                .andExpect(jsonPath("$.translations.vi.shortDescription").value("Rộng rãi"))
                .andExpect(jsonPath("$.translations.en.shortDescription").value("Spacious"));
    }

    @Test
    @DisplayName("a create with no translation at all is refused with a field error")
    void createNeedsAtLeastOneName() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // room_type_translation.name is NOT NULL, so a room type with no name
        // cannot exist. Caught here rather than as a constraint violation.
        mockMvc.perform(postRoom(partner, propertyId, """
                        {"slug":"nameless","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                         "smoking":false,"translations":{}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[?(@.field == 'translations')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("an unsupported locale is a field error, not a database failure")
    void unsupportedLocaleIsRejected() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Without this check the key reaches room_type_tr_locale and surfaces as
        // a 500. Doc 25 freezes vi and en.
        mockMvc.perform(postRoom(partner, propertyId, """
                        {"slug":"french","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                         "smoking":false,"translations":{"fr":{"name":"Chambre"}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[?(@.field == 'translations.fr')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("a blank name is refused rather than written")
    void blankNameIsRejected() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // room_type_tr_name_len requires a non-blank name.
        mockMvc.perform(postRoom(partner, propertyId, """
                        {"slug":"blank","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                         "smoking":false,"translations":{"vi":{"name":"   "}}}
                        """))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------- one transaction per PATCH

    @Test
    @DisplayName("a refused amenity leaves the rest of the edit unwritten")
    void arefusedAmenityWritesNothing() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"atomic","maxAdults":2,"maxChildren":0,"maxOccupancy":2,"smoking":false,
                 "translations":{"vi":{"name":"Nguyên Vẹn"}}}
                """);

        mockMvc.perform(patchRoom(partner, propertyId, roomTypeId, 0, """
                        {"slug":"atomic","maxAdults":4,"maxChildren":0,"maxOccupancy":4,
                         "smoking":true,
                         "translations":{"vi":{"name":"Đã Đổi"}},
                         "amenityCodes":["not-a-real-amenity"]}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[?(@.code == 'UNKNOWN_AMENITY')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));

        // The attribute change used to commit before the amenity check ran, so the
        // Partner saw an error and their data had moved anyway.
        mockMvc.perform(getRoom(partner, propertyId, roomTypeId))
                .andExpect(jsonPath("$.maxAdults").value(2))
                .andExpect(jsonPath("$.smoking").value(false))
                .andExpect(jsonPath("$.translations.vi.name").value("Nguyên Vẹn"))
                .andExpect(jsonPath("$.version").value(0));
    }

    // ------------------------------------------------------- locking & isolation

    @Test
    @DisplayName("a stale version is refused, and the winning edit stands")
    void staleVersionIsRefused() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"locked","maxAdults":2,"maxChildren":0,"maxOccupancy":2,"smoking":false,
                 "translations":{"vi":{"name":"Ban Đầu"}}}
                """);

        String edit = """
                {"slug":"locked","maxAdults":2,"maxChildren":0,"maxOccupancy":2,"smoking":false,
                 "translations":{"vi":{"name":"%s"}}}
                """;

        mockMvc.perform(patchRoom(partner, propertyId, roomTypeId, 0, edit.formatted("Người Thứ Nhất")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(patchRoom(partner, propertyId, roomTypeId, 0, edit.formatted("Người Thứ Hai")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mockMvc.perform(getRoom(partner, propertyId, roomTypeId))
                .andExpect(jsonPath("$.translations.vi.name").value("Người Thứ Nhất"));
    }

    @Test
    @DisplayName("another partner's room type is 404 whatever version is guessed, and nothing is written")
    void crossPartnerIsNotFoundBeforeVersion() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirProperty = fixtures.createProperties(partnerB, 1).getFirst();
        UUID theirRoom = fixtures.addRoomType(theirProperty, "their-suite");

        String body = """
                {"slug":"their-suite","maxAdults":2,"maxChildren":0,"maxOccupancy":2,
                 "smoking":true,"translations":{"vi":{"name":"Cướp"}}}
                """;

        // Scope is checked before the version, so a correct guess and a wrong one
        // are indistinguishable. A 409 on either would confirm the room exists,
        // and differing answers would leak its version.
        for (int guessed : new int[] {0, 999}) {
            String response = mockMvc.perform(
                            patchRoom(partnerA, theirProperty, theirRoom, guessed, body))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                    .andReturn().getResponse().getContentAsString();
            assertThat(response).doesNotContain("their-suite").doesNotContain("Cướp");
        }

        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        assertThat(roomTypes.findById(theirRoom, scopeB).orElseThrow().smoking()).isFalse();
        // The fixture wrote TEST_ROOM in both locales; the hijack attempt must not
        // have replaced either of them.
        assertThat(roomTypes.findTranslations(List.of(theirRoom), scopeB).get(theirRoom).get("vi").name())
                .isEqualTo("TEST_ROOM");
    }

    @Test
    @DisplayName("creating under another partner's property is refused")
    void crossPartnerCreateIsRefused() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirProperty = fixtures.createProperties(partnerB, 1).getFirst();

        mockMvc.perform(postRoom(partnerA, theirProperty, """
                        {"slug":"intruder","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                         "smoking":false,"translations":{"vi":{"name":"Xâm Nhập"}}}
                        """))
                .andExpect(status().isNotFound());

        AuthorizationScope scopeB = AuthorizationScope.partner(UUID.randomUUID(), partnerB);
        assertThat(roomTypes.findByProperty(theirProperty, scopeB)).isEmpty();
    }

    @Test
    @DisplayName("the version must be supplied at all")
    void versionIsMandatory() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"needs-version","maxAdults":1,"maxChildren":0,"maxOccupancy":1,
                 "smoking":false,"translations":{"vi":{"name":"Cần Phiên Bản"}}}
                """);

        // It travels as a query parameter here rather than in the body (OQ-139),
        // but a missing one still produces the doc 58 §2.1 field-level shape.
        mockMvc.perform(patch(rooms(propertyId) + "/" + roomTypeId)
                        .with(csrf()).cookie(partner.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slug":"needs-version","maxAdults":1,"maxChildren":0,
                                 "maxOccupancy":1,"smoking":false,
                                 "translations":{"vi":{"name":"x"}}}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[?(@.field == 'version')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    // ------------------------------------------------------------- bed rows

    @Test
    @DisplayName("a bed row is three components; the server assigns its order from the list")
    void bedRowsTakeTheirOrderFromTheList() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // BedConfigurationRequest has bedType, bedCount and isDefault. Position
        // in this array is the order — BedConfigurationRequest.toDomain(int)
        // takes it as a parameter, so the client never states it.
        UUID roomTypeId = created(partner, propertyId, """
                {"slug":"deluxe","maxAdults":2,"maxChildren":0,"maxOccupancy":2,"smoking":false,
                 "translations":{"vi":{"name":"Phòng Deluxe"}},
                 "beds":[{"bedType":"King","bedCount":1,"isDefault":true},
                         {"bedType":"Sofa","bedCount":1,"isDefault":false}]}
                """);

        mockMvc.perform(getRoom(partner, propertyId, roomTypeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beds[0].bedType").value("King"))
                .andExpect(jsonPath("$.beds[0].sortOrder").value(0))
                .andExpect(jsonPath("$.beds[1].bedType").value("Sofa"))
                .andExpect(jsonPath("$.beds[1].sortOrder").value(1));
    }

    @Test
    @DisplayName("a bed row carrying sortOrder is refused — the whole body, not the key")
    void aBedRowWithAnUnknownKeyIsRefused() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // fail-on-unknown-properties is on, so an extra key is not ignored: the
        // request never reaches validation and comes back 400 "The request body
        // could not be read". The Partner form sent exactly this for every bed,
        // which is why room-type creation failed in the running product until
        // Step B. Pinned here so the client cannot quietly reintroduce it.
        mockMvc.perform(postRoom(partner, propertyId, """
                        {"slug":"deluxe","maxAdults":2,"maxChildren":0,"maxOccupancy":2,
                         "smoking":false,"translations":{"vi":{"name":"Phòng Deluxe"}},
                         "beds":[{"bedType":"King","bedCount":1,"isDefault":true,"sortOrder":0}]}
                        """))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("roomtype-author", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static String rooms(UUID propertyId) {
        return "/api/v1/admin/properties/" + propertyId + "/room-types";
    }

    private MockHttpServletRequestBuilder postRoom(Partner partner, UUID propertyId, String body) {
        return post(rooms(propertyId)).with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private MockHttpServletRequestBuilder patchRoom(Partner partner, UUID propertyId,
                                                    UUID roomTypeId, int version, String body) {
        return patch(rooms(propertyId) + "/" + roomTypeId + "?version=" + version)
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private MockHttpServletRequestBuilder getRoom(Partner partner, UUID propertyId, UUID roomTypeId) {
        return get(rooms(propertyId) + "/" + roomTypeId).cookie(partner.session);
    }

    private UUID created(Partner partner, UUID propertyId, String body) throws Exception {
        String response = mockMvc.perform(postRoom(partner, propertyId, body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(response.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
