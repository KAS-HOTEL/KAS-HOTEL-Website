package com.kas.platform.security.it;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** "Quy tắc đặc biệt" and bulk calendar prices (pricing redesign, 2026-11-08). */
class SpecialRateIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "special-rate-password-5527";
    /** A Monday a month out, so the week below is Mon..Sun. */
    private static final LocalDate FROM = LocalDate.now().plusDays(30).with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    private static final LocalDate TO = FROM.plusDays(6);
    private static final long BASE = 1_000_000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    private record Fixture(UUID propertyId, UUID roomA, UUID roomB, Cookie[] session) {
    }

    private Fixture fixture() throws Exception {
        UUID partnerId = fixtures.createPartner("special");
        UUID user = fixtures.createUser("special-admin", PASSWORD);
        fixtures.grantPartnerOperations(user, partnerId);
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        UUID a = fixtures.addRoomType(propertyId, "sp-a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID b = fixtures.addRoomType(propertyId, "sp-b-" + UUID.randomUUID().toString().substring(0, 6));
        fixtures.setBasePrice(a, BASE);
        fixtures.setBasePrice(b, BASE);
        return new Fixture(propertyId, a, b, login(fixtures.emailOf(user), PASSWORD));
    }

    @Test
    @DisplayName("a holiday sets a fixed price per room type; a room left out keeps its base price")
    void holidayPricesPerRoom() throws Exception {
        Fixture f = fixture();
        String id = create(f, """
                {"kind":"HOLIDAY","name":"Lễ thử","dateFrom":"%s","dateTo":"%s",
                 "prices":[{"roomTypeId":"%s","priceMinor":1500000}]}
                """.formatted(FROM.plusDays(1), FROM.plusDays(2), f.roomA()));

        assertThat(price(f, f.roomA(), FROM)).isEqualTo(BASE);
        assertThat(price(f, f.roomA(), FROM.plusDays(1))).isEqualTo(1_500_000L);
        assertThat(price(f, f.roomB(), FROM.plusDays(1))).isEqualTo(BASE);

        mockMvc.perform(get("/api/v1/admin/special-rates?propertyId=" + f.propertyId()).cookie(f.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].kind").value("HOLIDAY"))
                .andExpect(jsonPath("$[0].prices[0].priceMinor").value(1500000))
                .andExpect(jsonPath("$[0].ruleIds.length()").value(1));
    }

    @Test
    @DisplayName("a holiday beats a weekly pattern; edit, pause and delete take effect")
    void holidayBeatsWeeklyAndLifecycle() throws Exception {
        Fixture f = fixture();
        // Weekly: Saturday (6) and Sunday (0).
        create(f, """
                {"kind":"WEEKLY","name":"Cuối tuần","daysOfWeek":[6,0],
                 "prices":[{"roomTypeId":"%s","priceMinor":1200000}]}
                """.formatted(f.roomA()));
        LocalDate saturday = FROM.plusDays(5);
        assertThat(price(f, f.roomA(), saturday)).isEqualTo(1_200_000L);
        assertThat(price(f, f.roomA(), FROM)).isEqualTo(BASE);

        String holiday = create(f, """
                {"kind":"HOLIDAY","name":"Lễ cuối tuần","dateFrom":"%s","dateTo":"%s",
                 "prices":[{"roomTypeId":"%s","priceMinor":1800000}]}
                """.formatted(saturday, saturday, f.roomA()));
        assertThat(price(f, f.roomA(), saturday)).isEqualTo(1_800_000L);

        mockMvc.perform(put("/api/v1/admin/special-rates/" + holiday).with(csrf()).cookie(f.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"kind":"HOLIDAY","name":"Lễ cuối tuần","dateFrom":"%s","dateTo":"%s",
                                 "prices":[{"roomTypeId":"%s","priceMinor":1900000}]}
                                """.formatted(saturday, saturday, f.roomA())))
                .andExpect(status().isOk());
        assertThat(price(f, f.roomA(), saturday)).isEqualTo(1_900_000L);

        mockMvc.perform(patch("/api/v1/admin/special-rates/" + holiday + "/active?active=false")
                        .with(csrf()).cookie(f.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        assertThat(price(f, f.roomA(), saturday)).isEqualTo(1_200_000L);

        mockMvc.perform(delete("/api/v1/admin/special-rates/" + holiday).with(csrf()).cookie(f.session()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/admin/special-rates?propertyId=" + f.propertyId()).cookie(f.session()))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("bulk calendar prices beat rules and can be removed again")
    void bulkDayPrices() throws Exception {
        Fixture f = fixture();
        String cells = """
                [{"roomTypeId":"%1$s","date":"%3$s"},{"roomTypeId":"%2$s","date":"%3$s"},
                 {"roomTypeId":"%1$s","date":"%4$s"}]
                """.formatted(f.roomA(), f.roomB(), FROM, FROM.plusDays(1));
        mockMvc.perform(put("/api/v1/admin/special-rates/day-prices").with(csrf()).cookie(f.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cells\":" + cells + ",\"amountMinor\":2000000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cells").value(3));
        assertThat(price(f, f.roomA(), FROM)).isEqualTo(2_000_000L);
        assertThat(price(f, f.roomB(), FROM)).isEqualTo(2_000_000L);
        assertThat(price(f, f.roomB(), FROM.plusDays(1))).isEqualTo(BASE);

        mockMvc.perform(put("/api/v1/admin/special-rates/day-prices").with(csrf()).cookie(f.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cells\":" + cells + ",\"amountMinor\":null}"))
                .andExpect(status().isOk());
        assertThat(price(f, f.roomA(), FROM)).isEqualTo(BASE);
    }

    @Test
    @DisplayName("an invalid rule is refused and names the problem; another partner's hotel is a 404")
    void validationAndScope() throws Exception {
        Fixture f = fixture();
        mockMvc.perform(post("/api/v1/admin/special-rates?propertyId=" + f.propertyId()).with(csrf()).cookie(f.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"SEASON\",\"name\":\"Mùa\",\"prices\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        Fixture other = fixture();
        mockMvc.perform(get("/api/v1/admin/special-rates?propertyId=" + other.propertyId()).cookie(f.session()))
                .andExpect(status().isNotFound());
    }

    private String create(Fixture f, String body) throws Exception {
        String response = mockMvc.perform(post("/api/v1/admin/special-rates?propertyId=" + f.propertyId())
                        .with(csrf()).cookie(f.session())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JSON.readTree(response).get("id").asText();
    }

    private long price(Fixture f, UUID roomTypeId, LocalDate date) throws Exception {
        String body = mockMvc.perform(get("/api/v1/admin/rates/grid?propertyId=" + f.propertyId()
                        + "&from=" + FROM + "&to=" + TO).cookie(f.session()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int index = (int) ChronoUnit.DAYS.between(FROM, date);
        for (JsonNode row : JSON.readTree(body).get("rows")) {
            if (roomTypeId.toString().equals(row.get("roomTypeId").asText())) {
                return row.get("cells").get(index).get("amountMinor").asLong();
            }
        }
        throw new AssertionError("room type not in grid");
    }
}
