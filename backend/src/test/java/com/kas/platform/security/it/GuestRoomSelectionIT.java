package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>The three responses one room card is made of</h1>
 *
 * <p>STEP J's guest room selection renders a single card per room from
 * <strong>three separate public responses</strong>:
 *
 * <ul>
 *   <li>{@code GET /public/properties/{slug}/room-types} — what the room
 *       <em>is</em>: beds, occupancy, area, smoking, the Partner's sentence.</li>
 *   <li>{@code GET /public/availability/properties/{slug}} — whether it is free
 *       for the chosen dates, and the lowest nightly rate across them.</li>
 *   <li>{@code GET /public/properties/{slug}/room-types/{slug}/gallery} — its
 *       own photographs.</li>
 * </ul>
 *
 * <p>The card joins them <strong>by room-type slug</strong>. That join is the one
 * new contract assumption STEP J introduces, and nothing else tests it: if the
 * three responses ever disagreed about a slug, a guest would see a room
 * described as one thing, priced as another and illustrated with a third — or,
 * more likely, silently lose its facts and photographs while still being
 * offered a price.
 *
 * <p>Everything runs inside the test transaction and is rolled back. No property
 * in {@code kas_web_dev} is published, created or moved by this file — the eight
 * seed properties are still {@code DRAFT} afterwards.
 *
 * <p>No price here is a KAS price: base rates are config B6 and remain OPEN
 * (doc 56 §9). The figures are synthetic fixtures.
 */
class GuestRoomSelectionIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "room-selection-password-7714";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(20);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);

    /** A synthetic fixture rate. Not a KAS rate — config B6 is OPEN. */
    private static final long TEST_RATE_MINOR = 1_000_000L;

    @Test
    @DisplayName("the room description, its availability and its gallery agree on one slug")
    void theThreeResponsesJoinOnRoomTypeSlug() throws Exception {
        Fixture f = bookable();

        // 1. What the room is. STEP I widened this response; STEP J's card reads
        //    every one of these fields.
        mockMvc.perform(get(roomTypes(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].slug").value(f.roomTypeSlug))
                .andExpect(jsonPath("$[0].maxAdults").value(2))
                .andExpect(jsonPath("$[0].maxOccupancy").value(2))
                // NOT NULL, so the card can state both smoking states as facts.
                .andExpect(jsonPath("$[0].smoking").exists())
                .andExpect(jsonPath("$[0].beds").isArray())
                .andExpect(jsonPath("$[0].beds[0].bedType").value("TEST_BED"))
                .andExpect(jsonPath("$[0].beds[0].bedCount").value(1))
                // Internal identifiers stay off the public surface — doc 58 §9.
                .andExpect(jsonPath("$[0].id").doesNotExist())
                .andExpect(jsonPath("$[0].basePriceMinor").doesNotExist());

        // 2. Whether it is free, under the SAME slug — this is the join.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roomTypeSlug").value(f.roomTypeSlug))
                .andExpect(jsonPath("$[0].availableForWholeStay").doesNotExist())
                .andExpect(jsonPath("$[0].maxQuantitySelectable").doesNotExist())
                .andExpect(jsonPath("$[0].nightlyFrom.exponent").value(0));

        // 3. Its photographs, addressed by that same slug.
        mockMvc.perform(get(gallery(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].url").exists())
                // A room gallery is ROOM_TYPE-owned media; the asset id is internal.
                .andExpect(jsonPath("$[0].id").doesNotExist());
    }

    @Test
    @DisplayName("a room type with no photographs answers 200 with an empty gallery")
    void aRoomWithNoPhotographsIsNotAnError() throws Exception {
        Fixture f = bookableWithoutMedia();

        // The card renders no gallery at all for this — deliberately, because a
        // grey placeholder on a booking page reads as a fault, and a stock
        // bedroom would be somebody else's hospitality. It must not be a failure
        // that costs the guest the room's facts and price.
        mockMvc.perform(get(gallery(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get(availability(f)))
                .andExpect(jsonPath("$[0].roomTypeSlug").value(f.roomTypeSlug));
    }

    @Test
    @DisplayName("the hotel gallery and the room gallery never share a photograph")
    void propertyAndRoomMediaDoNotMix() throws Exception {
        Fixture f = bookable();
        // Each owner gets its own published photograph. `media_link.owner_type`
        // is the only thing keeping them apart, and the two guest components
        // rely entirely on that separation.
        fixtures.addPropertyPhotograph(f.partnerId, f.propertyId);

        String roomUrl = firstUrl(gallery(f));
        String propertyUrl = firstUrl(
                "/api/v1/public/properties/" + f.slug + "/gallery?locale=en");

        org.assertj.core.api.Assertions.assertThat(roomUrl)
                .as("a lobby photograph must never illustrate a bedroom")
                .isNotEqualTo(propertyUrl);
    }

    @Test
    @DisplayName("an unpublished room type is absent from all three responses at once")
    void anUnpublishedRoomIsAbsentEverywhere() throws Exception {
        Fixture f = bookable();
        fixtures.unpublishRoomType(f.roomTypeId);

        // If the three ever disagreed, a guest could be offered a price for a
        // room the hotel is no longer describing — or the reverse.
        mockMvc.perform(get(roomTypes(f))).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(availability(f))).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(gallery(f))).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("availability still takes no guest, adult, child or room parameter")
    void availabilityAcceptsNoOccupancyParameters() throws Exception {
        Fixture f = bookable();

        // STEP J's search bar collects adults and rooms. They go to the QUOTE,
        // which enforces capacity itself (config B11). They must never be sent
        // here and must never appear to filter: `fail-on-unknown-properties` does
        // not apply to query parameters, so an invented one would be silently
        // ignored and the UI would imply a narrowing that never happened
        // (OQ-151). This asserts the response is identical either way.
        String withOccupancy = availability(f) + "&adults=9&children=4&rooms=3";

        String plain = mockMvc.perform(get(availability(f)))
                .andReturn().getResponse().getContentAsString();
        String withParams = mockMvc.perform(get(withOccupancy))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        org.assertj.core.api.Assertions.assertThat(withParams)
                .as("occupancy parameters are not on this contract and change nothing")
                .isEqualTo(plain);
    }

    // ------------------------------------------------------------------ fixtures

    private record Fixture(UUID partnerId, UUID propertyId, UUID roomTypeId,
                           String roomTypeSlug, String slug) {
    }

    private Fixture bookable() throws Exception {
        Fixture f = bookableWithoutMedia();
        fixtures.addRoomPhotograph(f.partnerId, f.roomTypeId);
        return f;
    }

    private Fixture bookableWithoutMedia() throws Exception {
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        UUID partnerId = fixtures.createPartner("roomsel");
        UUID admin = fixtures.createUser("roomsel-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);

        String roomTypeSlug = "test-room-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomTypeId = fixtures.addRoomType(propertyId, roomTypeSlug);
        fixtures.publishRoomType(roomTypeId);
        fixtures.setBasePrice(roomTypeId, TEST_RATE_MINOR);
        fixtures.addBedConfiguration(roomTypeId);

        for (LocalDate date = CHECK_IN; !date.isAfter(CHECK_OUT); date = date.plusDays(1)) {
            fixtures.setInventory(roomTypeId, date, 5, 0, 0, 0);
        }

        return new Fixture(partnerId, propertyId, roomTypeId, roomTypeSlug,
                fixtures.slugOf(propertyId));
    }

    private String firstUrl(String path) throws Exception {
        String body = mockMvc.perform(get(path)).andReturn().getResponse().getContentAsString();
        return body.replaceAll("^.*?\"url\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }

    private String roomTypes(Fixture f) {
        return "/api/v1/public/properties/" + f.slug + "/room-types?locale=en";
    }

    private String gallery(Fixture f) {
        return "/api/v1/public/properties/" + f.slug
                + "/room-types/" + f.roomTypeSlug + "/gallery?locale=en";
    }

    private String availability(Fixture f) {
        return "/api/v1/public/request-pricing/properties/" + f.slug
                + "?checkIn=" + CHECK_IN + "&checkOut=" + CHECK_OUT;
    }
}
