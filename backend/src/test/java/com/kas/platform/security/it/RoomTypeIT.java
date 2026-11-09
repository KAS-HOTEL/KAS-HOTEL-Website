package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 7.5B — room type configuration, over HTTP, against PostgreSQL.
 *
 * <p>Covers N rooms per property, Partner-authored names, the controlled amenity
 * catalogue, property-vs-room amenity separation, bed configurations, the
 * lifecycle, optimistic locking, cross-partner isolation and public safety.
 */
class RoomTypeIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "room-type-password-6621";

    // ------------------------------------------------------------------ N rooms

    @Test
    @DisplayName("a property supports any number of room types")
    void nRoomTypesPerProperty() throws Exception {
        Fixture f = partnerWithProperty();

        for (int i = 1; i <= 5; i++) {
            createRoom(f, "room-" + i, "Room " + i);
        }

        mockMvc.perform(get(rooms(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    @Test
    @DisplayName("room names are Partner-authored free text, not an enum")
    void roomNamesAreFreeText() throws Exception {
        Fixture f = partnerWithProperty();

        // Nothing constrains these to a Standard/Superior/Deluxe vocabulary.
        for (String name : new String[]{
                "Deluxe King with Balcony", "Phòng Superior", "The Attic", "2-Bedroom Family"}) {
            mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body("slug-" + UUID.randomUUID().toString().substring(0, 8),
                                    name, "[]", "[]")))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("DRAFT"));
        }
    }

    @Test
    @DisplayName("a duplicate slug within one property is rejected")
    void duplicateSlugIsRejected() throws Exception {
        Fixture f = partnerWithProperty();
        createRoom(f, "deluxe-king", "Deluxe King");

        // room_type_slug_unique (property_id, slug) is the guard.
        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("deluxe-king", "Deluxe King Again", "[]", "[]")))
                .andExpect(status().is5xxServerError());
    }

    // ---------------------------------------------------------------- amenities

    @Test
    @DisplayName("room amenities come from the controlled catalog")
    void amenitiesComeFromCatalog() throws Exception {
        Fixture f = partnerWithProperty();

        String id = createRoom(f, "deluxe", "Deluxe",
                "[]", "[\"air-conditioning\",\"private-bathroom\",\"smart-tv\"]");

        mockMvc.perform(get(rooms(f) + "/" + id).cookie(f.session))
                .andExpect(jsonPath("$.amenityCodes.length()").value(3));
    }

    @Test
    @DisplayName("an amenity code outside the catalog is refused and named")
    void unknownAmenityIsRefused() throws Exception {
        Fixture f = partnerWithProperty();

        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("bad", "Bad", "[]", "[\"heated-floor-massage-chair\"]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].code").value("UNKNOWN_AMENITY"))
                // named, so the Partner can act on it rather than guess
                .andExpect(jsonPath("$.details[0].message")
                        .value(org.hamcrest.Matchers.containsString("heated-floor-massage-chair")));
    }

    @Test
    @DisplayName("a property-level facility cannot be attached to a room type")
    void propertyAmenityIsRefusedOnARoom() throws Exception {
        Fixture f = partnerWithProperty();

        // 'parking' is category PROPERTY_FACILITY. The database does not prevent
        // this — only an FK to amenity exists — so the rule is enforced here.
        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("x", "X", "[]", "[\"parking\",\"lift\"]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("PROPERTY_LEVEL_AMENITY"));
    }

    @Test
    @DisplayName("amenities can be replaced wholesale")
    void amenitiesCanBeReplaced() throws Exception {
        Fixture f = partnerWithProperty();
        String id = createRoom(f, "deluxe", "Deluxe", "[]", "[\"air-conditioning\"]");

        mockMvc.perform(patch(rooms(f) + "/" + id + "/amenities").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"bathtub\",\"minibar\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenityCodes.length()").value(2));
    }

    // ---------------------------------------------------------------------- beds

    @Test
    @DisplayName("a room type may carry several bed configurations")
    void bedConfigurationsArePersisted() throws Exception {
        Fixture f = partnerWithProperty();

        String beds = "[{\"bedType\":\"King\",\"bedCount\":1,\"isDefault\":true},"
                + "{\"bedType\":\"Twin\",\"bedCount\":2,\"isDefault\":false}]";
        String id = createRoom(f, "twin-or-king", "Twin or King", beds, "[]");

        mockMvc.perform(get(rooms(f) + "/" + id).cookie(f.session))
                .andExpect(jsonPath("$.beds.length()").value(2))
                .andExpect(jsonPath("$.beds[0].bedType").value("King"))
                .andExpect(jsonPath("$.beds[0].isDefault").value(true));
    }

    @Test
    @DisplayName("a bed count below one is rejected at the boundary")
    void invalidBedCountIsRejected() throws Exception {
        Fixture f = partnerWithProperty();

        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("bad-bed", "Bad Bed",
                                "[{\"bedType\":\"King\",\"bedCount\":0,\"isDefault\":true}]", "[]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    // ----------------------------------------------------------------- occupancy

    @Test
    @DisplayName("occupancy beyond adults plus children is rejected")
    void occupancyMustFit() throws Exception {
        Fixture f = partnerWithProperty();

        // room_type_occupancy_fit: max_occupancy <= max_adults + max_children
        String payload = """
                {"slug":"bad-occ","translations":{"vi":{"name":"Bad"}},"maxAdults":2,"maxChildren":0,
                 "maxOccupancy":5,"smoking":false,"beds":[],"amenityCodes":[]}
                """;
        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().is5xxServerError());
    }

    @Test
    @DisplayName("an unfrozen view type is rejected at the boundary")
    void invalidViewTypeIsRejected() throws Exception {
        Fixture f = partnerWithProperty();

        // GARDEN is not in the frozen view_type enum and was not invented.
        String payload = """
                {"slug":"garden","translations":{"vi":{"name":"Garden"}},"maxAdults":2,"maxChildren":0,
                 "maxOccupancy":2,"viewType":"GARDEN","smoking":false,
                 "beds":[],"amenityCodes":[]}
                """;
        mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    // ----------------------------------------------------------------- lifecycle

    @Test
    @DisplayName("a Partner may withdraw a room type but never publish one")
    void partnerCannotPublish() throws Exception {
        Fixture f = partnerWithProperty();
        String id = createRoom(f, "deluxe", "Deluxe");

        // Publishing would add content to a live property without review.
        mockMvc.perform(patch(rooms(f) + "/" + id + "/status?status=PUBLISHED")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        mockMvc.perform(patch(rooms(f) + "/" + id + "/status?status=ARCHIVED")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
    }

    @Test
    @DisplayName("archived is terminal")
    void archivedIsTerminal() throws Exception {
        Fixture f = partnerWithProperty();
        String id = createRoom(f, "deluxe", "Deluxe");

        mockMvc.perform(patch(rooms(f) + "/" + id + "/status?status=ARCHIVED")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        mockMvc.perform(patch(rooms(f) + "/" + id + "/status?status=UNLISTED")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isConflict());
    }

    // --------------------------------------------------------------- concurrency

    @Test
    @DisplayName("a stale version loses the update rather than overwriting it")
    void optimisticLockingRejectsStaleUpdate() throws Exception {
        Fixture f = partnerWithProperty();
        String id = createRoom(f, "deluxe", "Deluxe");

        // Two editors both read version 0. The first write wins.
        mockMvc.perform(patch(rooms(f) + "/" + id + "?version=0").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("deluxe", "Deluxe Updated", "[]", "[]")))
                .andExpect(status().isOk());

        mockMvc.perform(patch(rooms(f) + "/" + id + "?version=0").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("deluxe", "Deluxe Clobbered", "[]", "[]")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    // ----------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot read or mutate another Partner's room types")
    void crossPartnerIsolation() throws Exception {
        Fixture a = partnerWithProperty();
        Fixture b = partnerWithProperty();
        String bRoom = createRoom(b, "b-room", "B Room");

        // A's session, B's property and room. 404 everywhere — never 403.
        mockMvc.perform(get(rooms(b)).cookie(a.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(rooms(b) + "/" + bRoom).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(rooms(b) + "/" + bRoom + "?version=0").with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("b-room", "hijacked", "[]", "[]")))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(rooms(b) + "/" + bRoom + "/status?status=ARCHIVED")
                        .with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(rooms(b)).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("intruder", "Intruder", "[]", "[]")))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ public safety

    @Test
    @DisplayName("a DRAFT room type on a published property is not publicly visible")
    void draftRoomIsNotPublic() throws Exception {
        Fixture f = partnerWithProperty();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        createRoom(f, "unreviewed", "Unreviewed Room");

        // Publish the property through the real workflow.
        String submission = mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID submissionId = UUID.fromString(
                submission.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        String slug = fixtures.slugOf(f.propertyId);

        // Approval published the rooms that existed at approval time. A room added
        // afterwards stays DRAFT, so it cannot appear without another review.
        createRoom(f, "added-after-approval", "Added After Approval");

        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/room-types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='added-after-approval')]").isEmpty());
    }

    @Test
    @DisplayName("the public room response exposes nothing internal")
    void publicRoomResponseIsClean() throws Exception {
        Fixture f = partnerWithProperty();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);

        String submission = mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                        .with(csrf()).cookie(f.session))
                .andReturn().getResponse().getContentAsString();
        UUID submissionId = UUID.fromString(
                submission.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        String body = mockMvc.perform(get("/api/v1/public/properties/"
                        + fixtures.slugOf(f.propertyId) + "/room-types"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("partnerId")
                .doesNotContain("roomNumber")
                .doesNotContain("\"id\"")
                .doesNotContain("total")
                .doesNotContain("status");
    }

    // -------------------------------------------------------------------- helpers

    @Test
    @DisplayName("room types can be reordered within their hotel, and the list follows the order")
    void reorderRoomTypes() throws Exception {
        Fixture f = partnerWithProperty();
        String first = createRoom(f, "test-a-room", "TEST_A");
        String second = createRoom(f, "test-b-room", "TEST_B");

        mockMvc.perform(patch(rooms(f) + "/" + second + "/order?sortOrder=0").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sortOrder").value(0));
        mockMvc.perform(patch(rooms(f) + "/" + first + "/order?sortOrder=1").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        mockMvc.perform(get(rooms(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(second))
                .andExpect(jsonPath("$[1].id").value(first));

        mockMvc.perform(patch(rooms(f) + "/" + first + "/order?sortOrder=-1").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest());

        Fixture other = partnerWithProperty();
        mockMvc.perform(patch(rooms(f) + "/" + first + "/order?sortOrder=0").with(csrf()).cookie(other.session))
                .andExpect(status().isNotFound());
    }

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partnerWithProperty() throws Exception {
        UUID partnerId = fixtures.createPartner("rooms");
        UUID admin = fixtures.createUser("partner-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    private String rooms(Fixture f) {
        return "/api/v1/admin/properties/" + f.propertyId + "/room-types";
    }

    private String createRoom(Fixture f, String slug, String name) throws Exception {
        return createRoom(f, slug, name, "[]", "[]");
    }

    private String createRoom(Fixture f, String slug, String name, String beds, String amenities)
            throws Exception {
        String response = mockMvc.perform(post(rooms(f)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(slug, name, beds, amenities)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return response.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }

    /**
     * A valid request body.
     *
     * <p>Both locales, because {@code RoomTypeRequest} is per-locale since OQ-138.
     * The tests that care about one locale build their own body.
     */
    private static String body(String slug, String name, String beds, String amenities) {
        return """
                {"slug":"%s",
                 "translations":{"vi":{"name":"%s"},"en":{"name":"%s"}},
                 "maxAdults":2,"maxChildren":1,"maxOccupancy":3,
                 "smoking":false,"beds":%s,"amenityCodes":%s}
                """.formatted(slug, name, name, beds, amenities);
    }
}
