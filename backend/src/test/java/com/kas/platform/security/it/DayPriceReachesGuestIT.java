package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>A price the Partner typed is the price the guest is quoted</h1>
 *
 * <p>The bug this file exists to prevent, found in STEP L by following one real
 * edit through to the customer site:
 *
 * <blockquote>A Partner set a nightly price on the calendar. It saved, it
 * persisted, the operator grid showed it. The guest was shown <strong>no room at
 * all</strong> — because {@code AvailabilityService} resolved rates from
 * {@code rate_rule} and the base price only, never {@code rate_day}, and a room
 * type the guest path cannot price is dropped from availability
 * entirely.</blockquote>
 *
 * <p>Two surfaces reading one table and disagreeing about what it meant. The
 * operator saw a priced, sellable night; the guest saw a hotel with no rooms.
 * Nothing failed, nothing logged, and the only way to notice was to walk the
 * whole path with real data.
 *
 * <p>Doc 56's ladder is <strong>{@code rate_day} &gt; {@code rate_rule} &gt;
 * base</strong>, and {@code RateAuthoringService.grid} has applied it since V29.
 * These tests assert the guest path applies the same one — on the availability
 * list and on the quote, which must never disagree with each other either.
 *
 * <p>Everything runs inside the test transaction and is rolled back.
 */
class DayPriceReachesGuestIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "day-price-guest-password-4402";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(20);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(1);

    /** A synthetic fixture rate. Not a KAS rate — config B6 is OPEN (doc 56 §9). */
    private static final long DAY_PRICE = 1_650_000L;
    private static final long BASE_PRICE = 900_000L;

    @Test
    @DisplayName("a day price alone makes a room sellable, with no rule and no base rate")
    void aDayPriceIsEnoughToBeQuoted() throws Exception {
        Fixture f = bookableRoomWithNoPriceAtAll();

        // Nothing prices this room yet, so the guest is shown nothing. This is
        // the correct half of the old behaviour, and it stays.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        setDayPrice(f, DAY_PRICE);

        // The room is now sellable, priced at exactly what was typed.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roomTypeSlug").value(f.roomTypeSlug))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(DAY_PRICE))
                // VND is zero-decimal — doc 56 §6.
                .andExpect(jsonPath("$[0].nightlyFrom.exponent").value(0));
    }

    @Test
    @DisplayName("a day price outranks the base rate for that date")
    void theDayPriceWins() throws Exception {
        Fixture f = bookableRoomWithNoPriceAtAll();
        fixtures.setBasePrice(f.roomTypeId, BASE_PRICE);

        mockMvc.perform(get(availability(f)))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(BASE_PRICE));

        setDayPrice(f, DAY_PRICE);

        // Doc 56's ladder: a date beats a range, and a range beats the fallback.
        mockMvc.perform(get(availability(f)))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(DAY_PRICE));
    }

    @Test
    @DisplayName("the quote agrees with the availability list it came from")
    void theQuoteAgrees() throws Exception {
        Fixture f = bookableRoomWithNoPriceAtAll();
        setDayPrice(f, DAY_PRICE);

        // A guest who picks a room from the list and prices it must not be shown
        // a different number — or, worse, told the stay cannot be priced.
        mockMvc.perform(post("/api/v1/public/request-pricing/quote")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                                 "adults":1,"children":0,"childAges":[],
                                 "lines":[{"roomTypeSlug":"%s","quantity":1}]}
                                """.formatted(f.slug, CHECK_IN, CHECK_OUT, f.roomTypeSlug)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].nightlyFrom.amountMinor").value(DAY_PRICE))
                // One night, one room — so the subtotal is the night's price.
                .andExpect(jsonPath("$.lines[0].subtotal.amountMinor").value(DAY_PRICE))
                .andExpect(jsonPath("$.total.amountMinor").value(Vat.with(DAY_PRICE)));
    }

    @Test
    @DisplayName("clearing the day price falls back rather than leaving a hole")
    void clearingFallsBack() throws Exception {
        Fixture f = bookableRoomWithNoPriceAtAll();
        fixtures.setBasePrice(f.roomTypeId, BASE_PRICE);
        setDayPrice(f, DAY_PRICE);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/admin/rates/day/" + f.roomTypeId + "/" + CHECK_IN)
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        // Absence means "whatever the standing price says", not "no price".
        mockMvc.perform(get(availability(f)))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(BASE_PRICE));
    }

    @Test
    @DisplayName("a day price on a room type that is not published stays invisible")
    void publicationStillGates() throws Exception {
        Fixture f = bookableRoomWithNoPriceAtAll();
        setDayPrice(f, DAY_PRICE);
        fixtures.unpublishRoomType(f.roomTypeId);

        // The publication gate applies to a day price exactly as it does to a
        // rule — a price is never quoted for something that is not sellable.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ------------------------------------------------------------------ fixtures

    private record Fixture(UUID propertyId, UUID roomTypeId, String roomTypeSlug,
                           String slug, Cookie[] session) {
    }

    /**
     * An OPEN property with a PUBLISHED room type and inventory, and **no price
     * of any kind** — so the only thing under test is what prices it.
     */
    private Fixture bookableRoomWithNoPriceAtAll() throws Exception {
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        UUID partnerId = fixtures.createPartner("dayprice");
        UUID admin = fixtures.createUser("dayprice-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);

        String roomTypeSlug = "dayprice-room-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomTypeId = fixtures.addRoomType(propertyId, roomTypeSlug);
        fixtures.publishRoomType(roomTypeId);

        for (LocalDate date = CHECK_IN; date.isBefore(CHECK_OUT); date = date.plusDays(1)) {
            fixtures.setInventory(roomTypeId, date, 5, 0, 0, 0);
        }

        return new Fixture(propertyId, roomTypeId, roomTypeSlug,
                fixtures.slugOf(propertyId), session);
    }

    /** Through the real operator route the calendar's day editor calls. */
    private void setDayPrice(Fixture f, long amountMinor) throws Exception {
        mockMvc.perform(put("/api/v1/admin/rates/day/" + f.roomTypeId + "/" + CHECK_IN)
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + amountMinor + "}"))
                .andExpect(status().isOk());
    }

    private String availability(Fixture f) {
        return "/api/v1/public/request-pricing/properties/" + f.slug
                + "?checkIn=" + CHECK_IN + "&checkOut=" + CHECK_OUT;
    }
}
