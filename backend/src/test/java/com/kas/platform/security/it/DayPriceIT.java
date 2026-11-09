package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Day prices — {@code PUT/DELETE /api/v1/admin/rates/day/{roomTypeId}/{date}}.
 *
 * <p>The rate calendar's cell edit. Every test runs against PostgreSQL inside the
 * rolled-back transaction the base class opens, so {@code kas_web_dev} is left as
 * it was found.
 */
class DayPriceIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "day-price-password-7781";

    private static final LocalDate FROM = LocalDate.now().plusDays(30);
    private static final LocalDate TO = FROM.plusDays(6);
    private static final LocalDate TARGET = FROM.plusDays(2);

    private static final long BASE = 1_000_000L;
    private static final long DAY_PRICE = 1_400_000L;

    private record Fixture(UUID partnerId, UUID propertyId, List<UUID> roomTypeIds,
                           Cookie[] session) {
        UUID roomType() {
            return roomTypeIds.get(0);
        }
    }

    private Fixture partner(int roomTypeCount) throws Exception {
        UUID partnerId = fixtures.createPartner("day-price");
        UUID admin = fixtures.createUser("day-price-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");

        List<UUID> ids = new java.util.ArrayList<>();
        for (int i = 0; i < roomTypeCount; i++) {
            UUID roomTypeId = fixtures.addRoomType(propertyId,
                    "day-room-" + UUID.randomUUID().toString().substring(0, 8));
            fixtures.setBasePrice(roomTypeId, BASE);
            ids.add(roomTypeId);
        }
        return new Fixture(partnerId, propertyId, List.copyOf(ids), session);
    }

    private static String dayRoute(UUID roomTypeId, LocalDate date) {
        return "/api/v1/admin/rates/day/" + roomTypeId + "/" + date;
    }

    private static String gridRoute(Fixture f) {
        return "/api/v1/admin/rates/grid?propertyId=" + f.propertyId + "&from=" + FROM + "&to=" + TO;
    }

    private MvcResult setDay(Fixture f, LocalDate date, long amount) throws Exception {
        return mockMvc.perform(put(dayRoute(f.roomType(), date))
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + amount + "}"))
                .andReturn();
    }

    /** One room type's price on one date, found by id rather than by row position. */
    private static long priceFor(com.fasterxml.jackson.databind.JsonNode rows, UUID roomTypeId,
                                 int dateIndex) {
        for (var row : rows) {
            if (roomTypeId.toString().equals(row.get("roomTypeId").asText())) {
                return row.get("cells").get(dateIndex).get("amountMinor").asLong();
            }
        }
        throw new AssertionError("room type " + roomTypeId + " is not in the grid");
    }

    /** The grid's price for one date, so a test can assert a neighbour is untouched. */
    private long gridPriceOn(Fixture f, LocalDate date) throws Exception {
        String body = mockMvc.perform(get(gridRoute(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        int index = (int) java.time.temporal.ChronoUnit.DAYS.between(FROM, date);
        var rows = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).get("rows");
        return priceFor(rows, f.roomType(), index);
    }

    // ------------------------------------------------------------------ the edit

    @Test
    @DisplayName("a Partner sets the price for one date")
    void partnerSetsOneDatePrice() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(put(dayRoute(f.roomType(), TARGET))
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + DAY_PRICE + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(DAY_PRICE))
                .andExpect(jsonPath("$.date").value(TARGET.toString()))
                .andExpect(jsonPath("$.currency").value("VND"))
                // No rule is behind a day price, and claiming one would make the
                // grid reference a rule the rule list cannot show.
                .andExpect(jsonPath("$.ruleId").doesNotExist())
                .andExpect(jsonPath("$.isDayPrice").value(true));
    }

    @Test
    @DisplayName("saving one date leaves every other date alone")
    void savingOneDateDoesNotTouchNeighbours() throws Exception {
        Fixture f = partner(1);

        setDay(f, TARGET, DAY_PRICE);

        // The whole reason rate_day exists rather than one-day rate rules.
        assertThat(gridPriceOn(f, TARGET)).isEqualTo(DAY_PRICE);
        assertThat(gridPriceOn(f, TARGET.minusDays(1))).isEqualTo(BASE);
        assertThat(gridPriceOn(f, TARGET.plusDays(1))).isEqualTo(BASE);
        assertThat(gridPriceOn(f, FROM)).isEqualTo(BASE);
        assertThat(gridPriceOn(f, TO)).isEqualTo(BASE);
    }

    @Test
    @DisplayName("the price is still there when the grid is read again")
    void thePriceIsPersisted() throws Exception {
        Fixture f = partner(1);
        setDay(f, TARGET, DAY_PRICE);

        // A second read through the ordinary grid endpoint — the same call the
        // calendar makes after a refresh.
        assertThat(gridPriceOn(f, TARGET)).isEqualTo(DAY_PRICE);
    }

    @Test
    @DisplayName("saving the same date twice replaces the price rather than duplicating it")
    void resavingReplaces() throws Exception {
        Fixture f = partner(1);

        setDay(f, TARGET, DAY_PRICE);
        setDay(f, TARGET, 1_750_000L);

        // (room_type_id, date) is the primary key, so there is one answer by
        // construction rather than by a cleanup pass.
        assertThat(gridPriceOn(f, TARGET)).isEqualTo(1_750_000L);
    }

    @Test
    @DisplayName("a day price outranks a rate rule covering the same date")
    void dayPriceBeatsARule() throws Exception {
        Fixture f = partner(1);

        // A range rule across the whole window, activated.
        String ruleBody = mockMvc.perform(post("/api/v1/admin/rate-rules")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\":\"ROOM_TYPE\",\"roomTypeId\":\"" + f.roomType()
                                + "\",\"name\":\"TEST_SEASON\",\"priority\":0,\"dateFrom\":\""
                                + FROM + "\",\"dateTo\":\"" + TO + "\",\"priceMinor\":1200000}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID ruleId = UUID.fromString(
                new com.fasterxml.jackson.databind.ObjectMapper().readTree(ruleBody)
                        .get("id").asText());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/api/v1/admin/rate-rules/" + ruleId + "/status?status=ACTIVE")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        assertThat(gridPriceOn(f, TARGET)).as("the rule applies before any day price")
                .isEqualTo(1_200_000L);

        setDay(f, TARGET, DAY_PRICE);

        // The operator typed a price for that exact square; the more specific
        // answer wins, and the rule still governs every other date.
        assertThat(gridPriceOn(f, TARGET)).isEqualTo(DAY_PRICE);
        assertThat(gridPriceOn(f, TARGET.plusDays(1))).isEqualTo(1_200_000L);
    }

    // ---------------------------------------------------------------- clearing

    @Test
    @DisplayName("clearing a date falls back to the base rate")
    void clearingFallsBackToBase() throws Exception {
        Fixture f = partner(1);
        setDay(f, TARGET, DAY_PRICE);

        mockMvc.perform(delete(dayRoute(f.roomType(), TARGET)).with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(BASE))
                .andExpect(jsonPath("$.isDayPrice").value(false));

        assertThat(gridPriceOn(f, TARGET)).isEqualTo(BASE);
    }

    @Test
    @DisplayName("clearing a date that had no price is not an error")
    void clearingAnUnsetDateIsFine() throws Exception {
        Fixture f = partner(1);

        // The end state is the one asked for either way.
        mockMvc.perform(delete(dayRoute(f.roomType(), TARGET)).with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(BASE));
    }

    // ---------------------------------------------------------------- refusals

    @Test
    @DisplayName("zero is a price, and is kept as one")
    void zeroIsAPrice() throws Exception {
        Fixture f = partner(1);

        // A complimentary night. Distinct from "no day price", which is the
        // absence of the row.
        mockMvc.perform(put(dayRoute(f.roomType(), TARGET))
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(0))
                .andExpect(jsonPath("$.isDayPrice").value(true));
    }

    @Test
    @DisplayName("a negative price is refused")
    void negativePriceIsRefused() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(put(dayRoute(f.roomType(), TARGET))
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("another partner's room type is 404, never 403")
    void crossPartnerIsNotFound() throws Exception {
        Fixture mine = partner(1);
        Fixture theirs = partner(1);

        // Doc 85 §6.3: absent and out-of-scope must be indistinguishable, or the
        // refusal itself confirms the room type exists.
        mockMvc.perform(put(dayRoute(theirs.roomType(), TARGET))
                        .with(csrf()).cookie(mine.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + DAY_PRICE + "}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete(dayRoute(theirs.roomType(), TARGET))
                        .with(csrf()).cookie(mine.session))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an unknown room type is 404")
    void unknownRoomTypeIsNotFound() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(put(dayRoute(UUID.randomUUID(), TARGET))
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + DAY_PRICE + "}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("one room type's day price does not reach another")
    void dayPriceIsPerRoomType() throws Exception {
        Fixture f = partner(2);

        mockMvc.perform(put("/api/v1/admin/rates/day/" + f.roomTypeIds.get(0) + "/" + TARGET)
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":" + DAY_PRICE + "}"))
                .andExpect(status().isOk());

        String body = mockMvc.perform(get(gridRoute(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        var rows = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).get("rows");
        int index = (int) java.time.temporal.ChronoUnit.DAYS.between(FROM, TARGET);

        // The grid orders rows by the repository's own sort, not by the order
        // these fixtures were created in, so each row is found by its id.
        assertThat(priceFor(rows, f.roomTypeIds.get(0), index)).isEqualTo(DAY_PRICE);
        assertThat(priceFor(rows, f.roomTypeIds.get(1), index))
                .as("the second room type keeps its base price")
                .isEqualTo(BASE);
    }
}
