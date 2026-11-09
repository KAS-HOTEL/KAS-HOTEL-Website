package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The guest quote — doc 58 §3.2's request, doc 58 §11.2's response.
 *
 * <p>The two things this file exists to prove are that the quote <strong>creates nothing</strong>
 * and that it <strong>refuses rather than guesses</strong> wherever a config is OPEN.
 *
 * <p><strong>No amount here is a KAS rate.</strong> Base rates are config B6 and remain OPEN
 * (doc 56 §9); every figure is a synthetic fixture created and discarded by the test.
 */
class QuoteIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "quote-password-6620";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(20);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);

    /** Synthetic fixture rates. Not KAS rates. */
    private static final long RATE_A = 1_000_000L;
    private static final long RATE_B = 2_500_000L;

    // ------------------------------------------------------------ the happy path

    @Test
    @DisplayName("one room type, quantity one, is priced across every night of the stay")
    void singleRoomSingleQuantity() throws Exception {
        Fixture f = property(1);

        quote(f, 2, line(f.slugs.get(0), 1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertySlug").value(f.propertySlug))
                .andExpect(jsonPath("$.nights").value(2))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.lines[0].quantity").value(1))
                .andExpect(jsonPath("$.lines[0].nightlyFrom.amountMinor").value(RATE_A))
                // Doc 56 §3.2 — Σ over nights × quantity. Two nights, one room.
                .andExpect(jsonPath("$.lines[0].subtotal.amountMinor").value(RATE_A * 2))
                .andExpect(jsonPath("$.roomsSubtotal.amountMinor").value(RATE_A * 2))
                .andExpect(jsonPath("$.total.amountMinor").value(RATE_A * 2))
                .andExpect(jsonPath("$.currency").value("VND"))
                // VND is zero-decimal — doc 56 §6.
                .andExpect(jsonPath("$.total.exponent").value(0))
                .andExpect(jsonPath("$.estimate").value(true));
    }

    @Test
    @DisplayName("quantity multiplies the line, and the check-out night is not charged")
    void quantityMultipliesAndCheckOutNightIsFree() throws Exception {
        Fixture f = property(1);

        quote(f, 4, line(f.slugs.get(0), 3))
                .andExpect(status().isOk())
                // 3 rooms x 2 nights. The third night — check-out — is not occupied and not
                // charged, doc 55 §2.
                .andExpect(jsonPath("$.lines[0].subtotal.amountMinor").value(RATE_A * 2 * 3))
                .andExpect(jsonPath("$.total.amountMinor").value(RATE_A * 2 * 3));
    }

    @Test
    @DisplayName("multiple room types with different quantities are summed, line by line")
    void multipleRoomTypesAndQuantities() throws Exception {
        Fixture f = property(2);
        fixtures.setBasePrice(f.roomTypeIds.get(1), RATE_B);

        long expected = RATE_A * 2 * 2 + RATE_B * 2 * 1;

        quote(f, 5, line(f.slugs.get(0), 2), line(f.slugs.get(1), 1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines.length()").value(2))
                .andExpect(jsonPath("$.lines[0].subtotal.amountMinor").value(RATE_A * 2 * 2))
                .andExpect(jsonPath("$.lines[1].subtotal.amountMinor").value(RATE_B * 2 * 1))
                .andExpect(jsonPath("$.roomsSubtotal.amountMinor").value(expected))
                .andExpect(jsonPath("$.total.amountMinor").value(expected));
    }

    @Test
    @DisplayName("nightlyFrom is the lowest night, while the subtotal sums every night")
    void nightlyFromIsLowestWhileSubtotalSumsAll() throws Exception {
        Fixture f = property(1);
        LocalDate secondNight = CHECK_IN.plusDays(1);
        // A cheaper rule on the second night only.
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeIds.get(0), "TEST_CHEAP", 5,
                secondNight, secondNight, null, 400_000L, null);

        quote(f, 2, line(f.slugs.get(0), 1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].nightlyFrom.amountMinor").value(400_000L))
                // Doc 58 §11.2.1 — the subtotal is real arithmetic, not nightlyFrom x nights.
                .andExpect(jsonPath("$.lines[0].subtotal.amountMinor").value(RATE_A + 400_000L));
    }

    // ---------------------------------------------------- it creates nothing

    @Test
    @DisplayName("a quote writes no reservation, no request, no snapshot and no hold")
    void quoteCreatesNothing() throws Exception {
        Fixture f = property(1);

        long reservationsBefore = fixtures.countRows("reservation");
        long holdsBefore = fixtures.countRows("inventory_hold");
        // Before/after, like the two above it. This one asserted isZero(), which
        // is a statement about the whole database rather than about the quote —
        // true only while kas_web_dev held no reservation lines, and false the
        // moment it holds a real booking.
        long linesBefore = fixtures.countRows("reservation_line");

        quote(f, 2, line(f.slugs.get(0), 1)).andExpect(status().isOk());

        // Doc 58 §11.2.2 — the snapshot belongs to salesStatus = REQUESTED, not to a quote.
        assertThat(fixtures.countRows("reservation")).isEqualTo(reservationsBefore);
        assertThat(fixtures.countRows("inventory_hold")).isEqualTo(holdsBefore);
        assertThat(fixtures.countRows("reservation_line")).isEqualTo(linesBefore);
    }

    @Test
    @DisplayName("a quote needs no session — no cookie, no permission")
    void quoteNeedsNoSession() throws Exception {
        Fixture f = property(1);

        // No session cookie at all: doc 58 §3 — "Unauthenticated." The CSRF token below is not
        // authentication; the application applies CSRF to every mutating method, public or not,
        // and nothing about this endpoint weakens that posture.
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a POST without the CSRF token is refused, exactly like every other mutation")
    void quoteStillRequiresCsrf() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("the response carries no rule, no inventory internal and no database id")
    void responseExposesNothingInternal() throws Exception {
        Fixture f = property(1);

        String json = quote(f, 2, line(f.slugs.get(0), 1))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andReturn().getResponse().getContentAsString();

        for (String denied : List.of("ruleId", "appliedRuleIds", "priority", "specificity",
                "partnerId", "roomTypeId", "propertyId", "total\":{\"amountMinor\":null",
                "occupied", "reserved", "maintenance", "otherBlocks", "bufferTarget",
                "directCommitted", "otaCommitted", "inventoryDayId", "availableDirect",
                "lifecycleState", "tax", "serviceCharge")) {
            assertThat(json).doesNotContain(denied);
        }
        // No raw database identifier either. The guest's own propertySlug is excluded from the
        // scan: doc 58 §11.2.1 requires it echoed back, and this fixture happens to build slugs
        // from a uuid — that is the test's doing, not the response's.
        String withoutEchoedSlug = json.replace(f.propertySlug, "");
        assertThat(withoutEchoedSlug).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    // ------------------------------------------------- V1 refusals: B10, B11, B23

    @Test
    @DisplayName("a request with children is refused — config B10 is OPEN")
    void childrenAreRefused() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 1, List.of(6), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"))
                .andExpect(jsonPath("$.details[0].code").value("CHILD_PRICING_UNSUPPORTED"));
    }

    @Test
    @DisplayName("child ages alone are refused too, with children reported as zero")
    void childAgesAloneAreRefused() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(4), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("CHILD_PRICING_UNSUPPORTED"));
    }

    @Test
    @DisplayName("children are refused before capacity is even considered")
    void childrenAreRefusedBeforeCapacity() throws Exception {
        Fixture f = property(1);

        // Also wildly over capacity. B10 must answer first — an unanswerable child question is not
        // improved by an unanswerable extra-bed question.
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 50, 3, List.of(2, 4, 6), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("CHILD_PRICING_UNSUPPORTED"));
    }

    @Test
    @DisplayName("exactly the rooms' capacity is accepted; one guest more is refused")
    void capacityBoundary() throws Exception {
        Fixture f = property(1);
        int capacity = fixtures.maxOccupancyOf(f.roomTypeIds.get(0));

        quote(f, capacity, line(f.slugs.get(0), 1)).andExpect(status().isOk());

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, capacity + 1, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("OCCUPANCY_EXCEEDED"))
                .andExpect(jsonPath("$.details[0].code").value("OVER_CAPACITY"));
    }

    @Test
    @DisplayName("capacity is the sum across the requested rooms, not one room's")
    void capacityIsAggregate() throws Exception {
        Fixture f = property(1);
        int capacity = fixtures.maxOccupancyOf(f.roomTypeIds.get(0));

        // Two rooms hold twice as many. Never clamped, never split — just enough room.
        quote(f, capacity * 2, line(f.slugs.get(0), 2)).andExpect(status().isOk());

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, capacity * 2 + 1, 0, List.of(), null,
                                line(f.slugs.get(0), 2))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("OCCUPANCY_EXCEEDED"));
    }

    @Test
    @DisplayName("an offer code is refused, never silently ignored — config B23 is OPEN")
    void offerCodeIsRefused() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), "TET2027", line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"))
                .andExpect(jsonPath("$.details[0].code").value("VOUCHER_UNSUPPORTED"));
    }

    // ---------------------------------------------------------- atomic refusals

    @Test
    @DisplayName("one unpriced line refuses the whole quote, never a partial one")
    void oneUnpricedLineRefusesEverything() throws Exception {
        Fixture f = property(2);
        fixtures.setBasePrice(f.roomTypeIds.get(1), RATE_B);
        fixtures.clearBasePrice(f.roomTypeIds.get(1));

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null,
                                line(f.slugs.get(0), 1), line(f.slugs.get(1), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"))
                // The first line was priceable. Nothing partial is returned.
                .andExpect(jsonPath("$.lines").doesNotExist())
                .andExpect(jsonPath("$.total").doesNotExist());
    }

    @Test
    @DisplayName("no base price and no winning rule is a refusal, never a price of zero")
    void unpricedIsRefusedNotZero() throws Exception {
        Fixture f = property(1);
        fixtures.clearBasePrice(f.roomTypeIds.get(0));

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("NOT_PRICED"));
    }

    @Test
    @DisplayName("requested quantity does not depend on website stock")
    void requestedQuantityIsNotComparedToStock() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 99))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a price quote needs no stock rows")
    void missingInventoryNightRefuses() throws Exception {
        Fixture f = property(1);

        // Doc 15 §12 — fail closed. The whole-stay figure drops to zero inside the SQL.
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unpublished room type, a foreign one and an unknown one are one answer")
    void notBookableRoomTypesAreIndistinguishable() throws Exception {
        Fixture f = property(2);
        fixtures.unpublishRoomType(f.roomTypeIds.get(1));

        // Unpublished.
        expectNotBookable(f, f.slugs.get(1));
        // A room type of a different property.
        Fixture other = property(1);
        expectNotBookable(f, other.slugs.get(0));
        // A slug that never existed.
        expectNotBookable(f, "no-such-room-type");
    }

    @Test
    @DisplayName("two rate rules of equal rank refuse the quote rather than picking one")
    void tieRefusesTheQuote() throws Exception {
        Fixture f = property(1);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeIds.get(0), "TEST_A", 5,
                null, null, null, 1_500_000L, null);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeIds.get(0), "TEST_B", 5,
                null, null, null, 1_600_000L, null);

        // Doc 56 §3.1 — a tie is a configuration error, not a coin flip.
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("RATE_RULE_TIE"));
    }

    // -------------------------------------------------------------- malformed

    @Test
    @DisplayName("zero quantity, empty lines and a duplicated room type are all rejected")
    void malformedLineSets() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 0))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), -1))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"propertySlug\":\"%s\",\"checkIn\":\"%s\",\"checkOut\":\"%s\","
                                + "\"adults\":2,\"children\":0,\"lines\":[]}")
                                .formatted(f.propertySlug, CHECK_IN, CHECK_OUT)))
                .andExpect(status().isBadRequest());

        // One line per room type — two would double-count against inventory.
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null,
                                line(f.slugs.get(0), 1), line(f.slugs.get(0), 1))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("DUPLICATE_ROOM_TYPE"));
    }

    @Test
    @DisplayName("an inverted range and a check-in in the past are both refused")
    void unusableStays() throws Exception {
        Fixture f = property(1);

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"propertySlug\":\"%s\",\"checkIn\":\"%s\",\"checkOut\":\"%s\","
                                + "\"adults\":2,\"children\":0,\"lines\":[{\"roomTypeSlug\":\"%s\","
                                + "\"quantity\":1}]}")
                                .formatted(f.propertySlug, CHECK_OUT, CHECK_IN, f.slugs.get(0))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"propertySlug\":\"%s\",\"checkIn\":\"%s\",\"checkOut\":\"%s\","
                                + "\"adults\":2,\"children\":0,\"lines\":[{\"roomTypeSlug\":\"%s\","
                                + "\"quantity\":1}]}")
                                .formatted(f.propertySlug, LocalDate.now().minusDays(1), CHECK_OUT,
                                        f.slugs.get(0))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a property that is not OPEN discloses nothing, exactly as availability does not")
    void closedPropertyDisclosesNothing() throws Exception {
        Fixture f = property(1);
        fixtures.setLifecycleState(f.propertyId, "COMING_SOON");

        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(f.slugs.get(0), 1))))
                .andExpect(status().isUnprocessableEntity())
                // Identical to an unknown room type — the quote is not an existence oracle.
                .andExpect(jsonPath("$.details[0].code").value("NOT_BOOKABLE"));
    }

    // ------------------------------------------------------------------ helpers

    private static final String QUOTE = "/api/v1/public/request-pricing/quote";

    private record Fixture(UUID propertyId, String propertySlug, List<UUID> roomTypeIds,
                           List<String> slugs) {
    }

    private Fixture property(int roomTypes) throws Exception {
        UUID partnerId = fixtures.createPartner("quote");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);

        List<UUID> ids = new java.util.ArrayList<>();
        List<String> slugs = new java.util.ArrayList<>();
        for (int i = 0; i < roomTypes; i++) {
            String slug = "test-room-" + UUID.randomUUID().toString().substring(0, 8);
            UUID roomTypeId = fixtures.addRoomType(propertyId, slug);
            fixtures.publishRoomType(roomTypeId);
            fixtures.setBasePrice(roomTypeId, RATE_A);
            ids.add(roomTypeId);
            slugs.add(slug);
        }
        return new Fixture(propertyId, fixtures.slugOf(propertyId), List.copyOf(ids),
                List.copyOf(slugs));
    }

    private ResultActions quote(Fixture f, int adults, String... lines) throws Exception {
        return mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(f, adults, 0, List.of(), null, lines)));
    }

    private void expectNotBookable(Fixture f, String roomTypeSlug) throws Exception {
        mockMvc.perform(post(QUOTE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 0, List.of(), null, line(roomTypeSlug, 1))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("NOT_BOOKABLE"));
    }

    private static String line(String roomTypeSlug, int quantity) {
        return "{\"roomTypeSlug\":\"%s\",\"quantity\":%d}".formatted(roomTypeSlug, quantity);
    }

    private static String body(Fixture f, int adults, int children, List<Integer> childAges,
                               String offerCode, String... lines) {
        String ages = childAges.stream().map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
        String offer = offerCode == null ? "null" : "\"" + offerCode + "\"";
        return ("{\"propertySlug\":\"%s\",\"checkIn\":\"%s\",\"checkOut\":\"%s\",\"adults\":%d,"
                + "\"children\":%d,\"childAges\":%s,\"offerCode\":%s,\"lines\":[%s]}")
                .formatted(f.propertySlug, CHECK_IN, CHECK_OUT, adults, children, ages, offer,
                        String.join(",", lines));
    }
}
