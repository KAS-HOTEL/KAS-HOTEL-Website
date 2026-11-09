package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.reservation.api.ReservationRequestBody;
import com.kas.platform.reservation.api.RequestReceiptView;
import com.kas.platform.shared.EmailOutboxCipher;
import com.kas.platform.shared.Money;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

class BookingEmailLanguageIT extends SecurityIntegrationTest {
    @Autowired JdbcClient jdbc;
    @Autowired EmailOutboxCipher outboxCipher;
    @Autowired ObjectMapper json;
    @Autowired BookingNotificationService notifications;
    @Autowired com.kas.platform.reservation.ReservationEmailActionTokenService actionTokens;
    @Autowired com.kas.platform.shared.EmailOutboxService outbox;
    @Autowired com.kas.platform.security.CustomerPasswordResetService passwordResets;
    private String reference;
    private String slug;
    private Cookie[] session;
    private static final String PAYMENT_ACCOUNT = "/api/v1/admin/payment-account";

    @BeforeEach void prepare() throws Exception {
        UUID partner = fixtures.createPartner("mail-language");
        UUID property = fixtures.createProperties(partner, 1).getFirst();
        UUID user = fixtures.createUser("mail-language", "email-language-test-456!");
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(user), "email-language-test-456!");
        reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(property, reference);
        jdbc.sql("UPDATE property SET email='hotel@example.invalid' WHERE id=:id").param("id", property).update();
        // V51: every hotel is paid into the one shared KAS account.
        jdbc.sql("UPDATE payment_account SET qr_url='https://example.invalid/hotel-qr.png', instructions=NULL, bank_name=NULL, account_holder=NULL, account_number=NULL").update();
        jdbc.sql("UPDATE reservation SET guest_name='Synthetic Guest', guest_email='guest@example.invalid', total_minor=1500000 WHERE reference=:ref").param("ref", reference).update();
        slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", property).query(String.class).single();
    }

    @Test void aHotelWithNoEmailIsVisibleAsAFailedNoticeAndTheGuestMailIsStillQueued() {
        jdbc.sql("UPDATE property SET email=NULL WHERE slug=:slug").param("slug", slug).update();
        notifications.bookingRequestReceived(booking(), receipt(), "en");
        assertThat(event("booking-guest-" + reference).path("recipient").asText()).isEqualTo("guest@example.invalid");
        assertThat(jdbc.sql("SELECT last_error_code FROM email_delivery_outbox WHERE event_key=:key AND status='FAILED'")
                .param("key", "booking-hotel-" + reference).query(String.class).single()).isEqualTo("HOTEL_EMAIL_MISSING");
    }

    @Test void aHotelWithNoEmailFallsBackToTheOperationsMailbox() {
        jdbc.sql("UPDATE property SET email=NULL WHERE slug=:slug").param("slug", slug).update();
        new BookingNotificationService(jdbc, actionTokens, outbox, "https://api.example.invalid",
                "https://site.example.invalid", "ops@example.invalid").bookingRequestReceived(booking(), receipt(), "en");
        assertThat(event("booking-hotel-" + reference).path("recipient").asText()).isEqualTo("ops@example.invalid");
        assertThat(event("booking-hotel-" + reference).path("html").asText()).contains("/api/v1/public/reservation-actions/");
    }

    private ReservationRequestBody booking() {
        return new ReservationRequestBody(slug, LocalDate.now().plusDays(100), LocalDate.now().plusDays(102),
                2, 0, List.of(), List.of(new ReservationRequestBody.Line("room", 1)),
                new ReservationRequestBody.Guest("Synthetic Guest", "guest@example.invalid", "0900000000", "VN", null, null),
                null, null, null, null, false, "en");
    }

    private RequestReceiptView receipt() {
        return new RequestReceiptView(reference, "REQUEST_RECEIVED", "", false, new Money(1500000, "VND", 0), "");
    }

    @ParameterizedTest @CsvSource({"VN,en", "US,vi"})
    void receiptUsesNationalityEvenWhenWebsiteUsesTheOtherLanguage(String country, String locale) {
        var booking = new ReservationRequestBody(slug, LocalDate.now().plusDays(100), LocalDate.now().plusDays(102),
                2, 0, List.of(), List.of(new ReservationRequestBody.Line("room", 1)),
                new ReservationRequestBody.Guest("Synthetic Guest", "guest@example.invalid", "0900000000", country, null, null),
                null, null, null, null, false, locale);
        notifications.bookingRequestReceived(booking, new RequestReceiptView(reference, "REQUEST_RECEIVED", "", false,
                new Money(1500000, "VND", 0), ""), locale);
        assertThat(event("booking-guest-" + reference).path("country").asText()).isEqualTo(country);
        assertThat(event("booking-guest-" + reference).path("templateKey").asText()).isEqualTo("BOOKING_REQUEST_RECEIVED");
    }

    @ParameterizedTest @CsvSource({"VN", "US"})
    void qrAndConfirmedTemplatesKeepNationalityAndAllPaymentVariables(String country) throws Exception {
        jdbc.sql("UPDATE reservation SET guest_country=:country WHERE reference=:ref").param("country", country).param("ref", reference).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/approve-payment").cookie(session).with(csrf())).andExpect(status().isNoContent());
        JsonNode params = event("booking-payment-request-" + reference).path("params");
        assertThat(params.fieldNames()).toIterable().contains("paymentUrl", "accountHolder", "accountNumber", "bankName", "bookingReference", "checkIn", "checkOut", "firstName", "guests", "hotelName", "paymentAmount", "paymentDeadline", "paymentDescription", "qrImageUrl", "roomType", "totalAmount", "transferContent");
        assertThat(params.path("qrImageUrl").asText()).isEqualTo("https://example.invalid/hotel-qr.png");
        assertThat(params.path("paymentDescription").asText()).contains("/api/v1/public/reservation-actions/");
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/confirm-payment").cookie(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(event("booking-confirmed-" + reference).path("templateKey").asText()).isEqualTo("BOOKING_CONFIRMED");
    }

    private Cookie[] adminSession() throws Exception {
        UUID admin = fixtures.createUser("mail-language-admin", "email-language-admin-456!");
        fixtures.grantGlobalScope(admin, UserRole.ADMIN);
        return login(fixtures.emailOf(admin), "email-language-admin-456!");
    }

    /** KAS-014 + V51: the payment email carries the shared KAS bank details, set by SUPER_ADMIN. */
    @Test void paymentEmailUsesTheSharedKasBankAccount() throws Exception {
        mockMvc.perform(put(PAYMENT_ACCOUNT).cookie(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrImageUrl\":\"https://example.invalid/hotel-qr.png\",\"instructions\":\"Ghi mã đặt phòng\","
                                + "\"bankName\":\"Vietcombank\",\"accountHolder\":\"CONG TY KAS\",\"accountNumber\":\"0123456789\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(get(PAYMENT_ACCOUNT).cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bankName").value("Vietcombank"))
                .andExpect(jsonPath("$.accountNumber").value("0123456789"));
        jdbc.sql("UPDATE reservation SET guest_country='VN' WHERE reference=:ref").param("ref", reference).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isNoContent());
        JsonNode params = event("booking-payment-request-" + reference).path("params");
        assertThat(params.path("bankName").asText()).isEqualTo("Vietcombank");
        assertThat(params.path("accountHolder").asText()).isEqualTo("CONG TY KAS");
        assertThat(params.path("accountNumber").asText()).isEqualTo("0123456789");
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action='PAYMENT_ACCOUNT_UPDATED'")
                .query(Long.class).single()).isPositive();
    }

    /** A hotel-scoped ADMIN cannot change where every guest's money goes. */
    @Test void theHotelAdminCannotReadOrChangeThePaymentAccount() throws Exception {
        Cookie[] admin = adminSession();
        mockMvc.perform(get(PAYMENT_ACCOUNT).cookie(admin)).andExpect(status().isForbidden());
        mockMvc.perform(put(PAYMENT_ACCOUNT).cookie(admin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"accountNumber\":\"99999999\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.sql("SELECT count(*) FROM payment_account WHERE account_number IS NOT NULL").query(Long.class).single()).isZero();
    }

    @Test void anInvalidAccountNumberIsRefused() throws Exception {
        mockMvc.perform(put(PAYMENT_ACCOUNT).cookie(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"accountNumber\":\"12<script>\"}"))
                .andExpect(status().isBadRequest());
    }

    /** KAS-022: the transaction reference is stored, and one bank transaction cannot confirm two bookings. */
    @Test void confirmationStoresTheTransactionReferenceAndRefusesItTwice() throws Exception {
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/confirm-payment").cookie(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"transactionReference\":\" FT2611050001 \"}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT external_reference FROM payment p JOIN reservation r ON r.id=p.reservation_id WHERE r.reference=:ref AND p.status='VERIFIED'")
                .param("ref", reference).query(String.class).single()).isEqualTo("FT2611050001");

        String second = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        UUID property = jdbc.sql("SELECT id FROM property WHERE slug=:slug").param("slug", slug).query(UUID.class).single();
        fixtures.insertRawReservation(property, second);
        jdbc.sql("UPDATE reservation SET guest_email='guest2@example.invalid', total_minor=900000 WHERE reference=:ref").param("ref", second).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + second + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + second + "/confirm-payment").cookie(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"transactionReference\":\"FT2611050001\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This transaction reference already confirms another booking."));
        assertThat(jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference=:ref").param("ref", second)
                .query(String.class).single()).isEqualTo("PAYMENT_PENDING");
    }

    @Test void theDatabaseRefusesASecondVerifiedPaymentForOneBooking() {
        UUID reservation = jdbc.sql("SELECT id FROM reservation WHERE reference=:ref").param("ref", reference).query(UUID.class).single();
        String insert = "INSERT INTO payment (reservation_id, method, amount_minor, currency, received_at, status) "
                + "VALUES (:id, 'QR', 1500000, 'VND', now(), 'VERIFIED')";
        jdbc.sql(insert).param("id", reservation).update();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.sql(insert).param("id", reservation).update())
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
    }

    @Test void cancellationEmailIsSentAfterTheActualCancellationOnly() throws Exception {
        jdbc.sql("UPDATE reservation SET guest_country='US' WHERE reference=:ref").param("ref", reference).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/cancel").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"GUEST_CHANGED_PLANS\"}"))
                .andExpect(status().isNoContent());
        assertThat(event("booking-cancelled-" + reference).path("templateKey").asText()).isEqualTo("BOOKING_CANCELLED");
    }

    /** Owner decision 2026-11-07: the suggestion ends the request and points to a NEW request. */
    @Test void alternativeEmailIsQueuedAndPointsTheGuestToANewRequest() throws Exception {
        jdbc.sql("UPDATE property SET lifecycle_state='OPEN' WHERE slug=:slug").param("slug", slug).update();
        jdbc.sql("INSERT INTO room_type(property_id,slug,status,max_adults,max_children,max_occupancy) SELECT id,'alt-room','PUBLISHED',2,0,2 FROM property WHERE slug=:slug")
                .param("slug", slug).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/propose-alternative").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"propertySlug":"%s","roomTypeSlug":"alt-room","checkIn":"%s","checkOut":"%s","quantity":1,"totalMinor":1400000,"message":"Hotel note"}
                """.formatted(slug, java.time.LocalDate.now().plusDays(200), java.time.LocalDate.now().plusDays(202))))
                .andExpect(status().isNoContent());
        JsonNode notice = event("alternative-offer-%");
        assertThat(notice.path("templateKey").asText()).isEqualTo("ALTERNATIVE_STAY_SUGGESTION");
        JsonNode params = notice.path("params");
        assertThat(params.path("availabilityUrl").asText()).endsWith("/hotels.html");
        assertThat(params.path("rejectUrl").asText()).isEqualTo(params.path("availabilityUrl").asText());
        assertThat(params.path("availabilityUrl").asText()).doesNotContain("reservation-actions");
        for (String name : com.kas.platform.shared.EmailTemplates.VARIABLES.get("ALTERNATIVE_STAY_SUGGESTION")) {
            assertThat(params.has(name)).as("param %s", name).isTrue();
        }
        // Queued, never reported as sent here (the dispatcher is off in tests).
        assertThat(jdbc.sql("SELECT status FROM email_delivery_outbox WHERE event_key LIKE 'alternative-offer-%' AND aggregate_reference=:ref")
                .param("ref", reference).query(String.class).single()).isEqualTo("PENDING");
        assertThat(jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference=:ref").param("ref", reference)
                .query(String.class).single()).isEqualTo("ALTERNATIVE_OFFERED");
    }

    @Test void declineTellsTheGuestTheHotelHasNoRoom() throws Exception {
        jdbc.sql("UPDATE reservation SET guest_country='VN' WHERE reference=:ref").param("ref", reference).update();
        mockMvc.perform(post("/api/v1/admin/sales/requests/" + reference + "/decline").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"  Hết phòng trong các ngày đã chọn.  \"}"))
                .andExpect(status().isNoContent());
        JsonNode notice = event("booking-request-rejected-" + reference);
        assertThat(notice.path("templateKey").asText()).isEqualTo("BOOKING_REQUEST_REJECTED");
        assertThat(notice.path("recipient").asText()).isEqualTo("guest@example.invalid");
        JsonNode params = notice.path("params");
        assertThat(params.path("requestId").asText()).isEqualTo(reference);
        assertThat(params.path("hotelName").asText()).isNotBlank();
        assertThat(params.path("reason").asText()).isEqualTo("Hết phòng trong các ngày đã chọn.");
        assertThat(params.path("alternativeUrl").asText()).endsWith("/hotels.html?lang=vi");
        for (String name : com.kas.platform.shared.EmailTemplates.VARIABLES.get("BOOKING_REQUEST_REJECTED")) {
            assertThat(params.has(name)).as("param %s", name).isTrue();
        }
    }

        @Test void registrationPersistsNationalityAndSendsWelcomeByCountry() throws Exception {
        String email = "test-mail-" + UUID.randomUUID() + "@example.invalid";
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Synthetic Member\",\"email\":\"" + email + "\",\"phone\":\"0900000000\",\"password\":\"member-test-456!\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isCreated());
        assertThat(jdbc.sql("SELECT country FROM customer WHERE email=:email").param("email", email).query(String.class).single()).isEqualTo("VN");
        assertThat(jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key LIKE 'member-email-verification-%'").query(Long.class).single()).isGreaterThan(0);
    }

    @Test void resetEmailUsesNationalityAndTheNewPageWhileTokensRemainSingleUse() throws Exception {
        String email = "test-reset-" + UUID.randomUUID() + "@example.invalid";
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Synthetic Member\",\"email\":\"" + email + "\",\"phone\":\"0900000000\",\"password\":\"member-test-456!\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isCreated());
        jdbc.sql("UPDATE app_user SET email_verified_at=now() WHERE email=:email").param("email",email).update();
        login(email,"member-test-456!");
        passwordResets.request(email);
        JsonNode reset = event("customer-password-reset-%");
        assertThat(reset.path("templateKey").asText()).isEqualTo("PASSWORD_RESET");
        assertThat(reset.path("country").asText()).isEqualTo("VN");
        assertThat(reset.path("params").path("expiryMinutes").asText()).isEqualTo("30");
        String html = reset.path("params").path("resetUrl").asText();
        assertThat(html).contains("/vi/account/reset-password?token=");
        var matcher = java.util.regex.Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(html);
        assertThat(matcher.find()).isTrue();
        String token = matcher.group(1);
        mockMvc.perform(post("/api/v1/public/auth/reset-password").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"newPassword\":\"changed-member-789!\"}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT count(*) FROM user_session s JOIN app_user u ON u.id=s.user_id WHERE u.email=:email AND s.revoked_at IS NULL")
                .param("email", email).query(Long.class).single()).isZero();
        mockMvc.perform(post("/api/v1/public/auth/reset-password").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"newPassword\":\"changed-again-789!\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void expiredResetTokenCannotBeUsed() throws Exception {
        UUID user = fixtures.createUser("expired-email-reset", "initial-password-456!");
        jdbc.sql("INSERT INTO customer_password_reset_token(user_id,token_hash,expires_at) VALUES(:user,:hash,now()-interval '1 minute')")
                .param("user", user).param("hash", java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                        .digest("expired-synthetic-token".getBytes(java.nio.charset.StandardCharsets.UTF_8)))).update();
        mockMvc.perform(post("/api/v1/public/auth/reset-password").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"expired-synthetic-token\",\"newPassword\":\"changed-member-789!\"}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT used_at IS NULL FROM customer_password_reset_token WHERE user_id=:user")
                .param("user", user).query(Boolean.class).single()).isTrue();
    }

    @Test void passwordResetRequestsHaveCooldownAndKeepTheSamePublicResponse() throws Exception {
        String email = "test-reset-limit-" + UUID.randomUUID() + "@example.invalid";
        mockMvc.perform(post("/api/v1/public/auth/customer-register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Synthetic Member\",\"email\":\"" + email + "\",\"phone\":\"0900000000\",\"password\":\"member-test-456!\",\"locale\":\"en\",\"country\":\"VN\"}"))
                .andExpect(status().isCreated());
        jdbc.sql("UPDATE app_user SET email_verified_at=now() WHERE email=:email").param("email", email).update();

        String request = "{\"email\":\"" + email + "\"}";
        long queuedBefore = jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key LIKE 'customer-password-reset-%'")
                .query(Long.class).single();
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/api/v1/public/auth/forgot-password").with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.message").value("If an active KAS member account matches this email, a reset link will be sent."));
        }
        assertThat(jdbc.sql("SELECT count(*) FROM customer_password_reset_token t JOIN app_user u ON u.id=t.user_id WHERE u.email=:email AND t.used_at IS NULL")
                .param("email", email).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key LIKE 'customer-password-reset-%'")
                .query(Long.class).single()).isEqualTo(queuedBefore + 1);
    }
    private JsonNode event(String eventKey) {
        var row = jdbc.sql("SELECT payload_nonce, payload_ciphertext FROM email_delivery_outbox WHERE event_key LIKE :key ORDER BY created_at DESC LIMIT 1")
                .param("key", eventKey).query((rs, n) -> new byte[][]{rs.getBytes("payload_nonce"), rs.getBytes("payload_ciphertext")}).single();
        try { return json.readTree(outboxCipher.decrypt(row[0], row[1])); }
        catch (java.io.IOException ex) { throw new AssertionError("Outbox payload should be valid JSON", ex); }
    }
}
