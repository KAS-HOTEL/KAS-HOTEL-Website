package com.kas.platform.security.it;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The website lists exactly the hotels the console publishes (GET /public/properties/catalogue). */
class WebsiteCatalogueIT extends SecurityIntegrationTest {
    @Autowired JdbcClient jdbc;
    @Autowired ObjectMapper json;

    private JsonNode catalogue() throws Exception {
        String body = mockMvc.perform(get("/api/v1/public/properties/catalogue").param("locale", "en"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readTree(body);
    }

    private JsonNode find(JsonNode list, String slug) {
        for (JsonNode card : list) if (slug.equals(card.path("slug").asText())) return card;
        return null;
    }

    @Test void aHotelAddedInTheConsoleAppearsAndAClosedOneDisappears() throws Exception {
        UUID partner = fixtures.createPartner("catalogue");
        UUID property = fixtures.createProperties(partner, 1).getFirst();
        fixtures.setPropertyNames(property, "TEST_CATALOGUE_HOTEL");
        fixtures.openProperty(property);
        String slug = fixtures.slugOf(property);
        jdbc.sql("UPDATE property SET address_line='1 Test Street', star_rating=4, trip_com_rating=8.4, trip_com_review_count=12 WHERE id=:id")
                .param("id", property).update();

        JsonNode card = find(catalogue(), slug);
        assertThat(card).as("new published hotel is listed").isNotNull();
        assertThat(card.path("addressLine").asText()).isEqualTo("1 Test Street");
        assertThat(card.path("starRating").asInt()).isEqualTo(4);
        assertThat(card.path("tripRating").decimalValue()).isEqualByComparingTo("8.4");
        assertThat(card.path("tripReviewCount").asInt()).isEqualTo(12);
        assertThat(card.has("frontendKey")).as("a hotel the website never had has no frontend key").isFalse();
        assertThat(card.path("quickSearchTags").isArray()).isTrue();
        assertThat(card.path("tripIntents").isArray()).isTrue();

        jdbc.sql("UPDATE property SET lifecycle_state='CLOSED' WHERE id=:id").param("id", property).update();
        assertThat(find(catalogue(), slug)).as("closed hotel is not listed").isNull();
    }

    @Test void cardsExposeNoInternalFields() throws Exception {
        for (JsonNode card : catalogue()) {
            assertThat(card.has("id")).isFalse();
            assertThat(card.has("partnerId")).isFalse();
            assertThat(card.has("email")).isFalse();
            assertThat(card.has("phone")).isFalse();
            assertThat(card.has("paymentQrUrl")).isFalse();
        }
    }
}
