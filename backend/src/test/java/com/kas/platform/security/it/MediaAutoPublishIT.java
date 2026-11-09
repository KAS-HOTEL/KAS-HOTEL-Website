package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A photo Admin attaches goes on the website at once, with default alt text (owner decision 2026-11-08). */
class MediaAutoPublishIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "auto-publish-password-3391";

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("attaching an uploaded photo publishes it and names it after the hotel and its group")
    void attachPublishes() throws Exception {
        UUID partnerId = fixtures.createPartner("autopub");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "KAS Test Hotel");
        UUID asset = fixtures.createAssetWithStorageKey(partnerId, "m/" + UUID.randomUUID());
        jdbc.sql("UPDATE media_asset SET checksum = 'abc123' WHERE id = :id").param("id", asset).update();

        mockMvc.perform(post("/api/v1/admin/media/" + asset + "/links").with(csrf()).cookie(admin(partnerId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerType\":\"PROPERTY\",\"ownerId\":\"" + propertyId + "\",\"displayOrder\":0}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        assertThat(jdbc.sql("SELECT status::text FROM media_asset WHERE id = :id").param("id", asset)
                .query(String.class).single()).isEqualTo("PUBLISHED");
        assertThat(jdbc.sql("SELECT alt_text FROM media_asset_translation WHERE media_asset_id = :id AND locale = 'vi'")
                .param("id", asset).query(String.class).single()).isEqualTo("KAS Test Hotel – Ngoại thất");
        assertThat(jdbc.sql("SELECT alt_text FROM media_asset_translation WHERE media_asset_id = :id AND locale = 'en'")
                .param("id", asset).query(String.class).single()).isEqualTo("KAS Test Hotel – Exterior");
    }

    @Test
    @DisplayName("an unfinished upload stays a draft")
    void unfinishedUploadStaysDraft() throws Exception {
        UUID partnerId = fixtures.createPartner("autopub2");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        UUID asset = fixtures.createAssetWithStorageKey(partnerId, "m/" + UUID.randomUUID());

        mockMvc.perform(post("/api/v1/admin/media/" + asset + "/links").with(csrf()).cookie(admin(partnerId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerType\":\"PROPERTY\",\"ownerId\":\"" + propertyId + "\",\"displayOrder\":0}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    private Cookie[] admin(UUID partnerId) throws Exception {
        UUID user = fixtures.createUser("autopub-admin", PASSWORD);
        fixtures.grantPartnerScope(user, partnerId);
        return login(fixtures.emailOf(user), PASSWORD);
    }
}
