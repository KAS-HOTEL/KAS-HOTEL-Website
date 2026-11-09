package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Room prices and surcharges belong to SUPER_ADMIN (owner decision, 2026-11-08), and the
 * surcharge API: presets, create/update/delete, conditions, and the public read.
 */
class SurchargeIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "surcharge-password-4412";
    private static final String ROUTE = "/api/v1/admin/surcharges";

    @Test
    @DisplayName("ADMIN can no longer read or write room prices or surcharges")
    void adminIsRefusedPricesAndSurcharges() throws Exception {
        UUID partnerId = fixtures.createPartner("surcharge-admin");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        UUID roomTypeId = fixtures.addRoomType(propertyId, "test-room-" + UUID.randomUUID().toString().substring(0, 8));
        UUID admin = fixtures.createUser("surcharge-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);
        LocalDate day = LocalDate.now().plusDays(20);

        mockMvc.perform(get("/api/v1/admin/rates/grid?propertyId=" + propertyId + "&from=" + day + "&to=" + day)
                .cookie(session)).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/v1/admin/rates/day/" + roomTypeId + "/" + day).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amountMinor\":1000000}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(ROUTE).cookie(session)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("SUPER_ADMIN reads the hotel list and room types it prices")
    void superAdminReadsHotelsAndRoomTypes() throws Exception {
        UUID partnerId = fixtures.createPartner("surcharge-read");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.addRoomType(propertyId, "test-room-" + UUID.randomUUID().toString().substring(0, 8));
        Cookie[] session = superAdmin();

        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(session))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId + "/room-types").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("the common surcharges are seeded as presets, and a preset cannot be deleted")
    void presetsAreSeededAndKept() throws Exception {
        Cookie[] session = superAdmin();

        mockMvc.perform(get(ROUTE + "?scope=GLOBAL").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='EXTRA_ADULT')].amountMinor").value(300000))
                .andExpect(jsonPath("$[?(@.code=='EXTRA_CHILD')].amountMinor").value(150000))
                .andExpect(jsonPath("$[?(@.code=='EARLY_CHECK_IN')].preset").value(true))
                .andExpect(jsonPath("$[?(@.code=='LATE_CHECK_OUT')].calculation").value("PERCENT_OF_ROOM_RATE"));

        String id = idOf(session, "EXTRA_ADULT");
        mockMvc.perform(delete(ROUTE + "/" + id).with(csrf()).cookie(session))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("SUPER_ADMIN creates, updates, switches off and deletes its own surcharge")
    void superAdminManagesASurcharge() throws Exception {
        Cookie[] session = superAdmin();

        String body = mockMvc.perform(post(ROUTE).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_PET","name":"Phụ thu thú cưng","category":"OTHER",
                                 "calculation":"PER_NIGHT","amountMinor":200000,
                                 "daysOfWeek":[6,7],"minNights":1,"conditionNote":"Thú cưng dưới 10kg"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("TEST_PET"))
                .andExpect(jsonPath("$.daysOfWeek[0]").value(6))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString();
        String id = body.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");

        mockMvc.perform(put(ROUTE + "/" + id).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_PET","name":"Phụ thu thú cưng","category":"OTHER",
                                 "calculation":"PERCENT_OF_ROOM_RATE","percent":10,"version":0}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.percent").value(10))
                .andExpect(jsonPath("$.amountMinor").doesNotExist())
                .andExpect(jsonPath("$.version").value(1));

        // A stale version is refused.
        mockMvc.perform(put(ROUTE + "/" + id).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_PET","name":"x","category":"OTHER",
                                 "calculation":"PER_STAY","amountMinor":1,"version":0}
                                """))
                .andExpect(status().isConflict());

        mockMvc.perform(patch(ROUTE + "/" + id + "/status").with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"INACTIVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        mockMvc.perform(delete(ROUTE + "/" + id).with(csrf()).cookie(session))
                .andExpect(status().isOk());
        mockMvc.perform(get(ROUTE + "/" + id).cookie(session)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a surcharge whose value does not match its calculation is refused")
    void inconsistentValueIsRefused() throws Exception {
        Cookie[] session = superAdmin();
        mockMvc.perform(post(ROUTE).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_BAD","name":"x","category":"OTHER",
                                 "calculation":"PERCENT_OF_ROOM_RATE","amountMinor":1000}
                                """))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(ROUTE).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_BAD","name":"x","category":"LATE_CHECK_OUT",
                                 "calculation":"PER_STAY","amountMinor":1000,
                                 "checkOutFrom":"18:00","checkOutTo":"12:00"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the public read shows active surcharges, with a hotel's own replacing the all-hotels one")
    void publicReadAppliesHotelOverride() throws Exception {
        UUID partnerId = fixtures.createPartner("surcharge-public");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        String slug = fixtures.slugOf(propertyId);
        Cookie[] session = superAdmin();

        mockMvc.perform(post(ROUTE).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("""
                                {"propertyId":"%s","code":"EXTRA_ADULT","name":"Phụ thu người lớn",
                                 "category":"EXTRA_ADULT","calculation":"PER_PERSON_PER_NIGHT",
                                 "amountMinor":250000,"aboveStandardOccupancy":true,"minAge":12}
                                """).formatted(propertyId)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/public/surcharges?property=" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='EXTRA_ADULT')].amountMinor").value(250000))
                .andExpect(jsonPath("$[?(@.code=='EARLY_CHECK_IN')]").isEmpty());
        mockMvc.perform(get("/api/v1/public/surcharges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='EXTRA_ADULT')].amountMinor").value(300000));
    }

    private Cookie[] superAdmin() throws Exception {
        UUID user = fixtures.createUser("surcharge-super", PASSWORD);
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        return login(fixtures.emailOf(user), PASSWORD);
    }

    private String idOf(Cookie[] session, String code) throws Exception {
        String json = mockMvc.perform(get(ROUTE + "?scope=GLOBAL").cookie(session))
                .andReturn().getResponse().getContentAsString();
        com.fasterxml.jackson.databind.JsonNode rows = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        for (com.fasterxml.jackson.databind.JsonNode row : rows) {
            if (code.equals(row.get("code").asText())) {
                return row.get("id").asText();
            }
        }
        throw new AssertionError("no surcharge " + code);
    }
}
