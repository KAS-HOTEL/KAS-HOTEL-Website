package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Deleting a hotel draft — ADMIN only, never-published drafts only (owner decision 2026-11-08). */
class PropertyDeletionIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "delete-draft-password-4417";

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("an admin deletes a draft with its room types and gallery placements")
    void adminDeletesDraft() throws Exception {
        UUID partnerId = fixtures.createPartner("deldraft");
        Cookie[] admin = admin(partnerId);
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        UUID roomId = fixtures.addRoomType(propertyId, "draft-room");
        fixtures.addPropertyPhotograph(partnerId, propertyId);
        fixtures.addRoomPhotograph(partnerId, roomId);

        mockMvc.perform(delete(url(propertyId)).with(csrf()).cookie(admin))
                .andExpect(status().isNoContent());

        assertThat(count("SELECT count(*) FROM property WHERE id = :id", propertyId)).isZero();
        assertThat(count("SELECT count(*) FROM room_type WHERE id = :id", roomId)).isZero();
        assertThat(count("SELECT count(*) FROM media_link WHERE owner_id = :id", propertyId)).isZero();
        assertThat(count("SELECT count(*) FROM media_link WHERE owner_id = :id", roomId)).isZero();
        assertThat(fixtures.auditCount("property.deleted", propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a published hotel cannot be deleted")
    void publishedHotelIsRefused() throws Exception {
        UUID partnerId = fixtures.createPartner("delopen");
        Cookie[] admin = admin(partnerId);
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        jdbc.sql("UPDATE property SET lifecycle_state = 'OPEN', published_at = now() WHERE id = :id")
                .param("id", propertyId).update();

        mockMvc.perform(delete(url(propertyId)).with(csrf()).cookie(admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.details[0].code").value("NOT_DRAFT"));
        assertThat(count("SELECT count(*) FROM property WHERE id = :id", propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a draft with booking history cannot be deleted")
    void draftWithReservationIsRefused() throws Exception {
        UUID partnerId = fixtures.createPartner("delhist");
        Cookie[] admin = admin(partnerId);
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.insertRawReservation(propertyId, "KAS-DEL-" + UUID.randomUUID().toString().substring(0, 6));

        mockMvc.perform(delete(url(propertyId)).with(csrf()).cookie(admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.details[0].code").value("HAS_HISTORY"));
        assertThat(count("SELECT count(*) FROM property WHERE id = :id", propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("super admin may not delete a hotel; another partner's hotel is a 404")
    void onlyTheOwningAdmin() throws Exception {
        UUID partnerId = fixtures.createPartner("delscope");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);

        UUID superUser = fixtures.createUser("del-super", PASSWORD);
        fixtures.grantGlobalScope(superUser, UserRole.SUPER_ADMIN);
        mockMvc.perform(delete(url(propertyId)).with(csrf()).cookie(login(fixtures.emailOf(superUser), PASSWORD)))
                .andExpect(status().isForbidden());

        Cookie[] stranger = admin(fixtures.createPartner("delother"));
        mockMvc.perform(delete(url(propertyId)).with(csrf()).cookie(stranger))
                .andExpect(status().isNotFound());
        assertThat(count("SELECT count(*) FROM property WHERE id = :id", propertyId)).isEqualTo(1);
    }

    private Cookie[] admin(UUID partnerId) throws Exception {
        UUID user = fixtures.createUser("del-admin", PASSWORD);
        fixtures.grantPartnerScope(user, partnerId);
        return login(fixtures.emailOf(user), PASSWORD);
    }

    private static String url(UUID propertyId) {
        return "/api/v1/admin/properties/" + propertyId;
    }

    private long count(String sql, UUID id) {
        return jdbc.sql(sql).param("id", id).query(Long.class).single();
    }
}
