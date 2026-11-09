package com.kas.platform.security.it;

import com.kas.platform.security.CustomerEmailVerificationService;
import com.kas.platform.shared.EmailOutboxCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CustomerEmailVerificationIT extends SecurityIntegrationTest {
    @Autowired JdbcClient jdbc;
    @Autowired CustomerEmailVerificationService verifications;
    @Autowired EmailOutboxCipher outboxCipher;
    @Autowired ObjectMapper json;
    private String email;
    private static final String PASSWORD="test-email-verification-456!";
    @BeforeEach void register() throws Exception {
        email="verification-"+UUID.randomUUID()+"@example.invalid";
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Synthetic Member\",\"email\":\""+email+"\",\"phone\":\"0900000000\",\"password\":\""+PASSWORD+"\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isCreated()).andExpect(header().doesNotExist("Set-Cookie"));
    }
    /** This account's welcome mail only: the shared test database also holds mail from manual website runs. */
    private long welcomeMails() {
        return jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key = 'member-welcome-' || (SELECT id FROM app_user WHERE email=:email)::text")
                .param("email",email).query(Long.class).single();
    }
    @Test void duplicateEmailReturnsAnExplicitConflict() throws Exception {
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Another Member\",\"email\":\""+email+"\",\"phone\":\"0900000001\",\"password\":\""+PASSWORD+"\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACCOUNT_ALREADY_EXISTS"));
    }
    @Test void blocksLoginUntilOneUseCodeIsVerifiedThenWelcomesTheMember() throws Exception {
        mockMvc.perform(post("/api/v1/public/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+email+"\",\"password\":\""+PASSWORD+"\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.details[0].code").value("EMAIL_NOT_VERIFIED"));
        String code=deliveredCode();
        mockMvc.perform(get("/api/v1/public/auth/verify-email").param("code",code)).andExpect(status().is4xxClientError());
        assertThat(jdbc.sql("SELECT email_verified_at IS NULL FROM app_user WHERE email=:email").param("email",email).query(Boolean.class).single()).isTrue();
        assertThat(welcomeMails()).isZero();
        verifyCode(email,code).andExpect(status().isNoContent());
        assertThat(welcomeMails()).isEqualTo(1);
        Cookie[] session=login(email,PASSWORD);
        mockMvc.perform(get("/api/v1/me/profile").cookie(session)).andExpect(status().isOk());
        verifyCode(email,code).andExpect(status().isBadRequest());
    }
    @Test void expiredCodeDoesNotVerifyAndResendHasCooldownAndGenericResponse() throws Exception {
        String code=deliveredCode();
        jdbc.sql("UPDATE customer_email_verification_token SET expires_at=now()-interval '1 minute' WHERE user_id=(SELECT id FROM app_user WHERE email=:email)").param("email",email).update();
        verifyCode(email,code).andExpect(status().isBadRequest());
        for(String recipient:new String[]{email,"unknown@example.invalid"}){
            mockMvc.perform(post("/api/v1/public/auth/resend-verification").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\""+recipient+"\"}")).andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.message").value("If an unverified account matches, a verification email will be sent."));
        }
        assertThat(jdbc.sql("SELECT count(*) FROM customer_email_verification_token WHERE user_id=(SELECT id FROM app_user WHERE email=:email)").param("email",email).query(Long.class).single()).isEqualTo(1);
    }
    @Test void verificationCodeLocksAfterFiveWrongAttempts() throws Exception {
        String correct=deliveredCode();
        for (int i=0;i<5;i++) verifyCode(email,"000000".equals(correct)?"000001":"000000").andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT failed_attempts FROM customer_email_verification_token WHERE user_id=(SELECT id FROM app_user WHERE email=:email)")
                .param("email",email).query(Integer.class).single()).isEqualTo(5);
        verifyCode(email,correct).andExpect(status().isBadRequest());
    }
    @Test void emailCaseDoesNotChangeTheCode() throws Exception {
        verifyCode(email.toUpperCase(java.util.Locale.ROOT),deliveredCode()).andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT email_verified_at IS NOT NULL FROM app_user WHERE email=:email").param("email",email).query(Boolean.class).single()).isTrue();
    }
    @Test void aResentCodeReplacesTheOldOne() throws Exception {
        String first=deliveredCode();
        jdbc.sql("UPDATE customer_email_verification_token SET created_at=now()-interval '2 minutes' WHERE user_id=(SELECT id FROM app_user WHERE email=:email)").param("email",email).update();
        jdbc.sql("UPDATE email_delivery_outbox SET status='SENT', payload_nonce=NULL, payload_ciphertext=NULL WHERE event_key LIKE 'member-email-verification-%'").update();
        mockMvc.perform(post("/api/v1/public/auth/resend-verification").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+email+"\"}")).andExpect(status().isAccepted());
        String second=deliveredCode();
        assertThat(jdbc.sql("SELECT count(*) FROM customer_email_verification_token WHERE user_id=(SELECT id FROM app_user WHERE email=:email) AND invalidated_at IS NULL").param("email",email).query(Long.class).single()).isEqualTo(1);
        if(!first.equals(second)) verifyCode(email,first).andExpect(status().isBadRequest());
        verifyCode(email,second).andExpect(status().isNoContent());
    }
    @Test void oldSessionsCannotBypassEmailVerification() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        jdbc.sql("UPDATE app_user SET email_verified_at=NULL WHERE email=:email").param("email",email).update();
        mockMvc.perform(get("/api/v1/me/profile").cookie(session)).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/public/auth/refresh").cookie(session).with(csrf())).andExpect(status().isForbidden());
    }
    @Test void myStaysReturnsActualRoomSnapshotGuestCountsAndMoney() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        UUID partner=fixtures.createPartner("live-stay");
        UUID property=fixtures.createProperties(partner,1).getFirst();
        String ref="TEST-"+UUID.randomUUID().toString().substring(0,8);
        fixtures.insertRawReservation(property,ref);
        jdbc.sql("UPDATE reservation SET customer_id=(SELECT id FROM customer WHERE email=:email),adults=4,children=2,children_ages=ARRAY[4,8]::smallint[],check_in='2027-01-01',check_out='2027-01-04',total_minor=2400000,subtotal_minor=2400000 WHERE reference=:ref")
                .param("email",email).param("ref",ref).update();
        UUID room=jdbc.sql("INSERT INTO room_type(property_id,slug,status,max_adults,max_children,max_occupancy) VALUES(:property,'live-room','PUBLISHED',4,2,6) RETURNING id")
                .param("property",property).query(UUID.class).single();
        jdbc.sql("INSERT INTO reservation_line(reservation_id,room_type_id,quantity,room_type_name_snapshot,line_total_minor) VALUES((SELECT id FROM reservation WHERE reference=:ref),:room,2,'Actual Room',2400000)")
                .param("ref",ref).param("room",room).update();
        mockMvc.perform(get("/api/v1/me/stays").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].reference").value(ref))
                .andExpect(jsonPath("$[0].adults").value(4)).andExpect(jsonPath("$[0].children").value(2))
                .andExpect(jsonPath("$[0].rooms").value(2)).andExpect(jsonPath("$[0].nights").value(3))
                .andExpect(jsonPath("$[0].roomName").value("Actual Room × 2"))
                .andExpect(jsonPath("$[0].totalMinor").value(2400000))
                .andExpect(jsonPath("$[0].salesStatus").value("REQUESTED"));
        mockMvc.perform(get("/api/v1/me/stays")).andExpect(status().isUnauthorized());
    }
    /** QA-003: a customer is refused at the console boundary, before request binding can answer 400. */
    @Test void customerIsRefusedOnTheConsoleSurfaceBeforeValidation() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        mockMvc.perform(get("/api/v1/admin/rates/base").cookie(session))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/admin/customers").cookie(session)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/admin/rates/base")).andExpect(status().isUnauthorized());
    }
    /** QA 2026-11-05: the customer cancel endpoint answered 500 (enum column compared with a varchar parameter). */
    @Test void customerCancelsOwnRequestedStayInsideTheFreeWindow() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        UUID partner=fixtures.createPartner("cancel-stay");
        UUID property=fixtures.createProperties(partner,1).getFirst();
        jdbc.sql("UPDATE property SET check_in_time='14:00' WHERE id=:property").param("property",property).update();
        String ref="TEST-"+UUID.randomUUID().toString().substring(0,8);
        fixtures.insertRawReservation(property,ref);
        jdbc.sql("UPDATE reservation SET customer_id=(SELECT id FROM customer WHERE email=:email),check_in=current_date+30,check_out=current_date+32 WHERE reference=:ref")
                .param("email",email).param("ref",ref).update();
        mockMvc.perform(post("/api/v1/me/stays/"+ref+"/cancel").cookie(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelled").value(true));
        assertThat(jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference=:ref").param("ref",ref).query(String.class).single()).isEqualTo("CANCELLED");
        assertThat(jdbc.sql("SELECT count(*) FROM reservation_status_history h JOIN reservation r ON r.id=h.reservation_id WHERE r.reference=:ref AND h.from_status='REQUESTED' AND h.to_status='CANCELLED'")
                .param("ref",ref).query(Long.class).single()).isEqualTo(1);
        mockMvc.perform(post("/api/v1/me/stays/"+ref+"/cancel").cookie(session).with(csrf()))
                .andExpect(status().isConflict());
    }
    /** Owner rule 2026-11-07: a paid booking is not cancelled on the spot (no automated refund). */
    @Test void paidBookingInsideTheFreeWindowBecomesARequestNotACancellation() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        UUID partner=fixtures.createPartner("cancel-paid");
        UUID property=fixtures.createProperties(partner,1).getFirst();
        jdbc.sql("UPDATE property SET check_in_time='14:00' WHERE id=:property").param("property",property).update();
        String ref="TEST-"+UUID.randomUUID().toString().substring(0,8);
        fixtures.insertRawReservation(property,ref);
        jdbc.sql("UPDATE reservation SET customer_id=(SELECT id FROM customer WHERE email=:email),check_in=current_date+30,check_out=current_date+32, sales_status='WON', stay_status='CONFIRMED' WHERE reference=:ref")
                .param("email",email).param("ref",ref).update();
        jdbc.sql("INSERT INTO payment (reservation_id, method, amount_minor, currency, status, received_at) SELECT id, 'BANK_TRANSFER', 1000000, currency, 'VERIFIED', now() FROM reservation WHERE reference=:ref")
                .param("ref",ref).update();
        mockMvc.perform(post("/api/v1/me/stays/"+ref+"/cancel").cookie(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelled").value(false));
        assertThat(jdbc.sql("SELECT sales_status::text || '/' || stay_status::text FROM reservation WHERE reference=:ref").param("ref",ref).query(String.class).single())
                .isEqualTo("WON/CONFIRMED");
        assertThat(jdbc.sql("SELECT count(*) FROM reservation_cancellation_request cr JOIN reservation r ON r.id=cr.reservation_id WHERE r.reference=:ref")
                .param("ref",ref).query(Long.class).single()).isEqualTo(1);
    }
    @Test void profilePhotoIsStoredWithTheAccountAndVersionedOnEveryChange() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        byte[] jpeg={(byte)0xFF,(byte)0xD8,(byte)0xFF,(byte)0xE0,0,0x10,'J','F','I','F',0,1,(byte)0xFF,(byte)0xD9};
        String dataUrl="data:image/jpeg;base64,"+java.util.Base64.getEncoder().encodeToString(jpeg);
        mockMvc.perform(get("/api/v1/me/profile").cookie(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        mockMvc.perform(put("/api/v1/me/profile/avatar").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\""+dataUrl+"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").value("/api/v1/me/profile/avatar?v=1"));
        mockMvc.perform(get("/api/v1/me/profile/avatar").cookie(session)).andExpect(status().isOk())
                .andExpect(header().string("Content-Type","image/jpeg"))
                .andExpect(content().bytes(jpeg));
        mockMvc.perform(put("/api/v1/me/profile/avatar").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\""+dataUrl+"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").value("/api/v1/me/profile/avatar?v=2"));
        // The declared type must match the file's own signature.
        String fake="data:image/png;base64,"+java.util.Base64.getEncoder().encodeToString("not an image".getBytes());
        mockMvc.perform(put("/api/v1/me/profile/avatar").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\""+fake+"\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/me/profile").cookie(session)).andExpect(jsonPath("$.avatarUrl").value("/api/v1/me/profile/avatar?v=2"));
        mockMvc.perform(get("/api/v1/me/profile/avatar")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/v1/me/profile/avatar").cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
        mockMvc.perform(get("/api/v1/me/profile/avatar").cookie(session)).andExpect(status().isNotFound());
    }
    @Test void savedHotelsBelongToTheAccountAreIdempotentAndNewestFirst() throws Exception {
        verifyCode(email,deliveredCode()).andExpect(status().isNoContent());
        Cookie[] session=login(email,PASSWORD);
        UUID partner=fixtures.createPartner("favourites");
        java.util.List<UUID> props=fixtures.createProperties(partner,3);
        java.util.List<String> slugs=props.stream().map(id->jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id",id).query(String.class).single()).toList();
        jdbc.sql("UPDATE property SET lifecycle_state='OPEN' WHERE id IN (:a,:b)").param("a",props.get(0)).param("b",props.get(1)).update();
        jdbc.sql("UPDATE property SET lifecycle_state='DRAFT' WHERE id=:c").param("c",props.get(2)).update();

        mockMvc.perform(get("/api/v1/me/favorites").cookie(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.propertySlugs.length()").value(0));
        mockMvc.perform(put("/api/v1/me/favorites/"+slugs.get(0)).cookie(session).with(csrf())).andExpect(status().isOk());
        jdbc.sql("UPDATE customer_favorite_property SET created_at=now()-interval '1 hour'").update();
        // Saving twice keeps one row; the newest save comes first.
        mockMvc.perform(put("/api/v1/me/favorites/"+slugs.get(1)).cookie(session).with(csrf())).andExpect(status().isOk());
        mockMvc.perform(put("/api/v1/me/favorites/"+slugs.get(1)).cookie(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertySlugs[0]").value(slugs.get(1)))
                .andExpect(jsonPath("$.propertySlugs[1]").value(slugs.get(0)))
                .andExpect(jsonPath("$.propertySlugs.length()").value(2));
        // A hotel the site does not show, or that does not exist, cannot be saved.
        mockMvc.perform(put("/api/v1/me/favorites/"+slugs.get(2)).cookie(session).with(csrf())).andExpect(status().isNotFound());
        mockMvc.perform(put("/api/v1/me/favorites/no-such-hotel").cookie(session).with(csrf())).andExpect(status().isNotFound());
        // Removing is idempotent too.
        mockMvc.perform(delete("/api/v1/me/favorites/"+slugs.get(1)).cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.propertySlugs.length()").value(1));
        mockMvc.perform(delete("/api/v1/me/favorites/"+slugs.get(1)).cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.propertySlugs[0]").value(slugs.get(0)));
        // Another account sees none of it; a signed-out caller is refused.
        String other="favourites-"+UUID.randomUUID()+"@example.invalid";
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Other Member\",\"email\":\""+other+"\",\"phone\":\"0900000001\",\"password\":\""+PASSWORD+"\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isCreated());
        // Verified directly: both codes were queued in this one test transaction.
        jdbc.sql("UPDATE app_user SET email_verified_at=now() WHERE email=:email").param("email",other).update();
        mockMvc.perform(get("/api/v1/me/favorites").cookie(login(other,PASSWORD)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.propertySlugs.length()").value(0));
        mockMvc.perform(get("/api/v1/me/favorites")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/v1/me/favorites/"+slugs.get(0)).with(csrf())).andExpect(status().isUnauthorized());
    }
    private org.springframework.test.web.servlet.ResultActions verifyCode(String email, String code) throws Exception {
        return mockMvc.perform(post("/api/v1/public/auth/verify-email").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\",\"code\":\""+code+"\"}"));
    }
    private String deliveredCode() throws Exception {
        var row = jdbc.sql("SELECT payload_nonce, payload_ciphertext FROM email_delivery_outbox WHERE event_key LIKE 'member-email-verification-%' AND status='PENDING' ORDER BY created_at DESC LIMIT 1")
                .query((rs, n) -> new byte[][]{rs.getBytes("payload_nonce"), rs.getBytes("payload_ciphertext")}).single();
        var payload = json.readTree(outboxCipher.decrypt(row[0], row[1]));
        assertThat(payload.path("kind").asText()).isEqualTo("TEMPLATE");
        assertThat(payload.path("templateKey").asText()).isEqualTo("MEMBER_EMAIL_VERIFICATION");
        assertThat(payload.path("params").path("expiresInMinutes").asText()).isEqualTo("30");
        String code=payload.path("params").path("code").asText();
        assertThat(code).matches("\\d{6}");
        return code;
    }
}
