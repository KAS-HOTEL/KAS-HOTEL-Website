package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.reservation.ReservationEmailActionTokenService;
import com.kas.platform.shared.EmailOutboxService;
import com.kas.platform.shared.EmailOutboxRepository;
import com.kas.platform.media.SiteImageSlotRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Duration;
import java.time.LocalDate;
import java.util.UUID;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** HTTP, permission, persistence and publication regression tests on kas_web_test; rolled back. */
class AdminOperationsIT extends SecurityIntegrationTest {
    @Autowired JdbcClient jdbc;
    @Autowired ReservationEmailActionTokenService tokens;
    @Autowired com.kas.platform.reservation.ReservationEmailActionService actions;
    @Autowired EmailOutboxService emailOutbox;
    @Autowired EmailOutboxRepository emailOutboxRepository;
    @Autowired SiteImageSlotRepository siteImageSlots;
    @MockitoBean BookingNotificationService notifications;
    private Cookie[] session;
    private Cookie[] adminSession;
    private UUID propertyId;
    private UUID actorId;
    private UUID adminActorId;
    private String reference;
    private UUID reservationId;
    private static final String PASSWORD = "test-admin-operations-274!";
    private static final String SALES = "/api/v1/admin/sales/requests/";

    @BeforeEach void prepare() throws Exception {
        UUID partnerId = fixtures.createPartner("admin-operations");
        propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        actorId = fixtures.createUser("admin-operations", PASSWORD);
        fixtures.grantGlobalScope(actorId, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(actorId), PASSWORD);
        adminActorId = fixtures.createUser("admin-operations-hotels", PASSWORD);
        fixtures.grantGlobalScope(adminActorId, UserRole.ADMIN);
        adminSession = login(fixtures.emailOf(adminActorId), PASSWORD);
        reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, reference);
        jdbc.sql("UPDATE reservation SET guest_email='guest@example.invalid', total_minor=1500000, subtotal_minor=1500000 WHERE reference=:ref")
                .param("ref", reference).update();
        reservationId = jdbc.sql("SELECT id FROM reservation WHERE reference=:ref").param("ref", reference).query(UUID.class).single();
        jdbc.sql("UPDATE property SET email='hotel@example.invalid' WHERE id=:id")
                .param("id", propertyId).update();
        jdbc.sql("UPDATE payment_account SET qr_url='https://images.example.invalid/qr.png'").update();
    }

    @Test void approvalAndBankVerificationAreSeparateAndCannotRepeat() throws Exception {
        tokens.issue(reservationId, "REVIEW", "hotel@example.invalid", Duration.ofDays(1));
        mockMvc.perform(post(SALES + reference + "/confirm-payment").cookie(session).with(csrf())).andExpect(status().isConflict());
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(salesStatus()).isEqualTo("PAYMENT_PENDING");
        assertThat(jdbc.sql("SELECT count(*) FROM reservation_email_action_token WHERE reservation_id=:id AND action='REVIEW' AND invalidated_at IS NOT NULL")
                .param("id", reservationId).query(Long.class).single()).isEqualTo(1);
        mockMvc.perform(post(SALES + reference + "/confirm-payment").cookie(session).with(csrf())).andExpect(status().isNoContent());
        mockMvc.perform(post(SALES + reference + "/confirm-payment").cookie(session).with(csrf())).andExpect(status().isConflict());
        assertThat(salesStatus()).isEqualTo("WON");
        assertThat(jdbc.sql("SELECT stay_status::text FROM reservation WHERE id=:id").param("id", reservationId).query(String.class).single()).isEqualTo("CONFIRMED");
        assertThat(jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id=:id AND status='VERIFIED'").param("id", reservationId).query(Long.class).single()).isEqualTo(1);
    }

    @Test void missingQrRefusesApprovalWithoutMovingTheRequest() throws Exception {
        jdbc.sql("UPDATE payment_account SET qr_url=NULL").update();
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CONFIG_MISSING"));
        assertThat(salesStatus()).isEqualTo("REQUESTED");
    }

    @Test void alternativeIsAnOfferAndDoesNotConfirmTheStay() throws Exception {
        jdbc.sql("UPDATE property SET lifecycle_state='OPEN' WHERE id=:id").param("id", propertyId).update();
        jdbc.sql("INSERT INTO room_type(property_id,slug,status,max_adults,max_children,max_occupancy) VALUES(:id,'test-room','PUBLISHED',2,0,2)")
                .param("id", propertyId).update();
        String slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", propertyId).query(String.class).single();
        mockMvc.perform(post(SALES + reference + "/propose-alternative").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"propertySlug":"%s","roomTypeSlug":"test-room","checkIn":"%s","checkOut":"%s","quantity":1,"totalMinor":1400000,"message":"Alternative fixture"}
                """.formatted(slug, LocalDate.now().plusDays(200), LocalDate.now().plusDays(202))))
                .andExpect(status().isNoContent());
        assertThat(salesStatus()).isEqualTo("ALTERNATIVE_OFFERED");
        assertThat(jdbc.sql("SELECT count(*) FROM reservation_alternative_offer WHERE reservation_id=:id AND status='SENT'")
                .param("id", reservationId).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id=:id").param("id", reservationId).query(Long.class).single()).isZero();
        // Owner decision 2026-11-07: no guest accept / reject step and no replacement request.
        assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE rebooked_from_reservation_id=:id")
                .param("id", reservationId).query(Long.class).single()).isZero();
        assertThat(jdbc.sql("""
                SELECT count(*) FROM reservation_email_action_token
                 WHERE reservation_id=:id AND action IN ('GUEST_ACCEPT_ALTERNATIVE','GUEST_REJECT_ALTERNATIVE')
                """).param("id", reservationId).query(Long.class).single()).isZero();
    }

    private void proposeAlternative() throws Exception {
        jdbc.sql("UPDATE property SET lifecycle_state='OPEN' WHERE id=:id").param("id", propertyId).update();
        jdbc.sql("INSERT INTO room_type(property_id,slug,status,max_adults,max_children,max_occupancy) VALUES(:id,'test-room','PUBLISHED',2,0,2)")
                .param("id", propertyId).update();
        String slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", propertyId).query(String.class).single();
        mockMvc.perform(post(SALES + reference + "/propose-alternative").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"propertySlug":"%s","roomTypeSlug":"test-room","checkIn":"%s","checkOut":"%s","quantity":1,"totalMinor":1400000,"message":"Alternative fixture"}
                """.formatted(slug, LocalDate.now().plusDays(200), LocalDate.now().plusDays(202))))
                .andExpect(status().isNoContent());
    }

    @Test void alternativeOfferedIsTerminalNoFurtherTransitions() throws Exception {
        proposeAlternative();
        for (String action : new String[]{"decline", "cancel"}) {
            mockMvc.perform(post(SALES + reference + "/" + action).cookie(session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"after an alternative\"}"))
                    .andExpect(status().isConflict());
        }
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(session).with(csrf()))
                .andExpect(status().isConflict());
        mockMvc.perform(post(SALES + reference + "/propose-alternative").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"propertySlug":"x","roomTypeSlug":"test-room","checkIn":"%s","checkOut":"%s","quantity":1,"totalMinor":1,"message":""}
                """.formatted(LocalDate.now().plusDays(200), LocalDate.now().plusDays(202))))
                .andExpect(status().is4xxClientError());
        assertThat(salesStatus()).isEqualTo("ALTERNATIVE_OFFERED");
    }

    @Test void alternativeOfferedHasItsOwnQueueTabAndIsNeverOpenOrOverdue() throws Exception {
        // Its deadline has passed, which must not make it overdue: it was answered.
        jdbc.sql("UPDATE reservation SET sla_due_at = now() - interval '2 days' WHERE id=:id").param("id", reservationId).update();
        proposeAlternative();
        String slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", propertyId).query(String.class).single();
        mockMvc.perform(get(SALES + "counts").param("property", slug).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alternative").value(1))
                .andExpect(jsonPath("$.awaiting").value(0))
                .andExpect(jsonPath("$.expired").value(0))
                .andExpect(jsonPath("$.all").value(1));
        mockMvc.perform(get(SALES.substring(0, SALES.length() - 1)).param("property", slug).param("queue", "alternative").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].reference").value(reference));
        mockMvc.perform(get(SALES.substring(0, SALES.length() - 1)).param("property", slug).param("queue", "awaiting").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(SALES.substring(0, SALES.length() - 1)).param("property", slug).param("slaState", "breached").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(SALES.substring(0, SALES.length() - 1)).param("property", slug).cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].reference").value(reference));
    }

    @Test void alternativeHandsTheProposalToTheGuestEmailOnce() throws Exception {
        // The email content and its queue state are covered with the real service in
        // BookingEmailLanguageIT; here the notification service is a mock.
        proposeAlternative();
        org.mockito.Mockito.verify(notifications, org.mockito.Mockito.times(1)).alternativeOffered(org.mockito.ArgumentMatchers.any());
    }

    @Test void declineAndCancelStayDistinctAndCancelRecordsWhoAsked() throws Exception {
        mockMvc.perform(post(SALES + reference + "/cancel").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Guest changed plans\",\"requestedBy\":\"GUEST\"}"))
                .andExpect(status().isNoContent());
        assertThat(salesStatus()).isEqualTo("CANCELLED");
        assertThat(jdbc.sql("SELECT note FROM reservation_status_history WHERE reservation_id=:id AND to_status='CANCELLED'")
                .param("id", reservationId).query(String.class).single()).contains("request of guest");
        mockMvc.perform(post(SALES + reference + "/cancel").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"x\",\"requestedBy\":\"SOMEONE\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void cancelWaitsForAPaymentCheckWhenTheGuestReportedATransfer() throws Exception {
        String token = tokens.issue(reservationId, "GUEST_MARK_PAID", "guest@example.invalid", Duration.ofDays(1));
        jdbc.sql("UPDATE reservation_email_action_token SET used_at=now() WHERE reservation_id=:id AND action='GUEST_MARK_PAID'")
                .param("id", reservationId).update();
        assertThat(token).isNotBlank();
        mockMvc.perform(post(SALES + reference + "/cancel").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"No longer needed\",\"requestedBy\":\"KAS\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.details[0].code").value("PAYMENT_REPORTED_CHECK_FIRST"));
        assertThat(salesStatus()).isEqualTo("REQUESTED");
        mockMvc.perform(post(SALES + reference + "/cancel").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"No longer needed\",\"requestedBy\":\"KAS\",\"paymentChecked\":true}"))
                .andExpect(status().isNoContent());
        assertThat(salesStatus()).isEqualTo("CANCELLED");
    }

    @Test void retiredAcceptAndRejectLinksChangeNothing() throws Exception {
        proposeAlternative();
        String token = tokens.issue(reservationId, "GUEST_ACCEPT_ALTERNATIVE", "guest@example.invalid", Duration.ofDays(1));
        for (String path : new String[]{"accept-alternative", "reject-alternative"}) {
            mockMvc.perform(post("/api/v1/public/reservation-actions/" + token + "/" + path).with(csrf()))
                    .andExpect(status().isOk())
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("new booking request")));
        }
        assertThat(salesStatus()).isEqualTo("ALTERNATIVE_OFFERED");
        assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE rebooked_from_reservation_id=:id")
                .param("id", reservationId).query(Long.class).single()).isZero();
    }

    @Test void staffWithoutOperationalPermissionCannotActOnRequests() throws Exception {
        UUID other = fixtures.createPartner("other-operations");
        UUID staff = fixtures.createUser("other-operations", PASSWORD);
        fixtures.grantPartnerScope(staff, other);
        Cookie[] foreign = login(fixtures.emailOf(staff), PASSWORD);
        mockMvc.perform(post(SALES + reference + "/approve-payment").cookie(foreign).with(csrf())).andExpect(status().isForbidden());
        mockMvc.perform(post(SALES + reference + "/approve-payment").with(csrf())).andExpect(status().isUnauthorized());
        assertThat(salesStatus()).isEqualTo("REQUESTED");
    }

    @Test void optionalFiltersAndCancellationQueueAreReachable() throws Exception {
        for (String route : new String[]{"/api/v1/admin/vouchers", "/api/v1/admin/customers",
                "/api/v1/admin/ops/reservations/cancellation-requests"}) {
            mockMvc.perform(get(route).cookie(session)).andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/v1/admin/reviews").cookie(session)).andExpect(status().isOk());
        // Guest reviews moved from ADMIN to SUPER_ADMIN (2026-11-08).
        mockMvc.perform(get("/api/v1/admin/reviews").cookie(adminSession)).andExpect(status().isForbidden());
    }

    @Test void stayTransitionsAreDateGatedAndRecordHistory() throws Exception {
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        jdbc.sql("UPDATE reservation SET check_in=:yesterday, check_out=:today, stay_status='CONFIRMED' WHERE id=:id")
                .param("yesterday", today.minusDays(1)).param("today", today)
                .param("id", reservationId).update();
        String base = "/api/v1/admin/ops/reservations/" + reference;
        mockMvc.perform(post(base + "/check-in").cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stayStatus").value("CHECKED_IN"));
        mockMvc.perform(post(base + "/check-in").cookie(session).with(csrf()))
                .andExpect(status().isConflict());
        mockMvc.perform(post(base + "/check-out").cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stayStatus").value("CHECKED_OUT"));
        assertThat(jdbc.sql("SELECT field::text FROM reservation_status_history WHERE reservation_id=:id ORDER BY created_at")
                .param("id", reservationId).query(String.class).list()).containsExactly("STAY", "STAY");
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_id=:id AND action IN ('stay.checked_in','stay.checked_out')")
                .param("id", reservationId).query(Long.class).single()).isEqualTo(2);
    }

    @Test void checkInBeforeArrivalDateIsRejected() throws Exception {
        LocalDate tomorrow = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(1);
        jdbc.sql("UPDATE reservation SET check_in=:tomorrow, check_out=:after, stay_status='CONFIRMED' WHERE id=:id")
                .param("tomorrow", tomorrow).param("after", tomorrow.plusDays(1))
                .param("id", reservationId).update();
        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference + "/check-in")
                        .cookie(session).with(csrf()))
                .andExpect(status().isConflict());
        assertThat(jdbc.sql("SELECT stay_status::text FROM reservation WHERE id=:id")
                .param("id", reservationId).query(String.class).single()).isEqualTo("CONFIRMED");
    }

    @Test void noShowRequiresConfiguredCutoffBeforeChangingStatus() throws Exception {
        jdbc.sql("UPDATE reservation SET check_in=:today, check_out=:tomorrow, stay_status='CHECK_IN_READY' WHERE id=:id")
                .param("today", LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")))
                .param("tomorrow", LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(1))
                .param("id", reservationId).update();
        fixtures.clearSetting("NO_SHOW_CUTOFF");
        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference + "/no-show")
                        .cookie(session).with(csrf()))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CONFIG_MISSING"));
        assertThat(jdbc.sql("SELECT stay_status::text FROM reservation WHERE id=:id")
                .param("id", reservationId).query(String.class).single()).isEqualTo("CHECK_IN_READY");
    }

    @Test void aConfirmedStayCanBecomeNoShowOnceThePropertyDateHasPassed() throws Exception {
        LocalDate yesterday = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).minusDays(1);
        jdbc.sql("UPDATE reservation SET check_in=:checkIn, check_out=:checkOut, stay_status='CONFIRMED' WHERE id=:id")
                .param("checkIn", yesterday).param("checkOut", yesterday.plusDays(2))
                .param("id", reservationId).update();
        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference + "/no-show")
                        .cookie(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stayStatus").value("NO_SHOW"));
    }

    @Test void configuredNoShowCutoffMatchesTheApprovedLocalTime() {
        assertThat(fixtures.settingValue("NO_SHOW_CUTOFF")).isEqualTo("23:59");
    }

    @Test void emailDeliveryStateIsVisibleSeparatelyFromBookingDecision() throws Exception {
        String eventKey = "admin-status-" + reference;
        assertThat(emailOutbox.templateForReservation(reference, eventKey, "MEMBER_WELCOME", "VN",
                "guest@example.invalid", "Synthetic Guest", Map.of("firstName", "Synthetic"))).isTrue();
        assertThat(emailOutbox.templateForReservation(reference, eventKey, "MEMBER_WELCOME", "VN",
                "guest@example.invalid", "Synthetic Guest", Map.of("firstName", "Synthetic"))).isFalse();

        mockMvc.perform(get(SALES + reference + "/email-deliveries").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventKey").value(eventKey))
                .andExpect(jsonPath("$[0].status").value("PENDING"))
                .andExpect(jsonPath("$[0].attempts").value(0));
        assertThat(salesStatus()).isEqualTo("REQUESTED");
    }

    @Test void aHeldEmailKeepsItsPayloadAndGetsItsAttemptBack() {
        String eventKey = "admin-held-" + reference;
        emailOutbox.templateForReservation(reference, eventKey, "MEMBER_WELCOME", "VN",
                "guest@example.invalid", "Synthetic Guest", Map.of("firstName", "Synthetic"));
        var claimed = emailOutboxRepository.claim(100, 8).stream()
                .filter(item -> eventKey.equals(item.eventKey())).findFirst().orElseThrow();
        assertThat(claimed.createdAt()).isNotNull();

        emailOutboxRepository.defer(claimed.id(), java.time.OffsetDateTime.now().plusMinutes(15), "RECIPIENT_NOT_ALLOWED");

        assertThat(jdbc.sql("""
                SELECT status || ':' || attempts || ':' || last_error_code || ':' || (payload_ciphertext IS NOT NULL)
                  FROM email_delivery_outbox WHERE event_key=:key
                """).param("key", eventKey).query(String.class).single())
                .isEqualTo("RETRY:0:RECIPIENT_NOT_ALLOWED:true");
    }

    @Test void outboxRecoversAClaimedEventAndStopsAfterTheAttemptLimit() {
        String eventKey = "admin-lease-" + reference;
        emailOutbox.templateForReservation(reference, eventKey, "MEMBER_WELCOME", "VN",
                "guest@example.invalid", "Synthetic Guest", Map.of("firstName", "Synthetic"));

        var firstClaim = emailOutboxRepository.claim(20, 2).stream()
                .filter(item -> eventKey.equals(item.eventKey())).findFirst().orElseThrow();
        assertThat(firstClaim.attempts()).isEqualTo(1);
        jdbc.sql("UPDATE email_delivery_outbox SET locked_at=now()-interval '3 minutes' WHERE event_key=:key")
                .param("key", eventKey).update();
        var replayed = emailOutboxRepository.claim(20, 2).stream()
                .filter(item -> eventKey.equals(item.eventKey())).findFirst().orElseThrow();
        assertThat(replayed.attempts()).isEqualTo(2);

        jdbc.sql("UPDATE email_delivery_outbox SET locked_at=now()-interval '3 minutes' WHERE event_key=:key")
                .param("key", eventKey).update();
        emailOutboxRepository.claim(20, 2);
        assertThat(jdbc.sql("SELECT status FROM email_delivery_outbox WHERE event_key=:key")
                .param("key", eventKey).query(String.class).single()).isEqualTo("FAILED");
        assertThat(jdbc.sql("SELECT payload_ciphertext IS NULL FROM email_delivery_outbox WHERE event_key=:key")
                .param("key", eventKey).query(Boolean.class).single()).isTrue();
    }

    @Test void siteImageSlotAuditUsesTheAssignedRoleAndRejectsAStaleWrite() throws Exception {
        var before = siteImageSlots.findAll().getFirst();
        String nextReference = "https://example.invalid/slot-review.webp";

        mockMvc.perform(patch("/api/v1/admin/site-image-slots/" + before.key()).cookie(adminSession).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"imageReference\":\"" + nextReference + "\",\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentReference").value(nextReference))
                .andExpect(jsonPath("$.enabled").value(false));

        assertThat(jdbc.sql("SELECT actor_role::text FROM audit_log WHERE action='site_image_slot.updated' AND actor_id=:actor ORDER BY created_at DESC LIMIT 1")
                .param("actor", adminActorId).query(String.class).single()).isEqualTo("ADMIN");
        assertThat(siteImageSlots.updateIfCurrent(before.key(), before.currentReference(), before.enabled(),
                "https://example.invalid/stale.webp", before.enabled(), actorId)).isEmpty();
        assertThat(siteImageSlots.findByKey(before.key()).orElseThrow().currentReference()).isEqualTo(nextReference);
    }

    @Test void moderationRecordsRejectionReasonAndRejectsASecondDecision() throws Exception {
        UUID customer = jdbc.sql("INSERT INTO customer(full_name,customer_code) VALUES('TEST_REVIEWER','KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) RETURNING id").query(UUID.class).single();
        jdbc.sql("UPDATE reservation SET customer_id=:customer, sales_status='WON', stay_status='COMPLETED' WHERE id=:id")
                .param("customer", customer).param("id", reservationId).update();
        UUID review = jdbc.sql("INSERT INTO review(reservation_id,customer_id,property_id,overall,body,language,stay_month) VALUES(:reservation,:customer,:property,4,'Synthetic review','vi','2026-10-01') RETURNING id")
                .param("reservation", reservationId).param("customer", customer).param("property", propertyId).query(UUID.class).single();
        String route = "/api/v1/admin/reviews/" + review + "/moderation";
        mockMvc.perform(patch(route).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"REJECT\",\"reason\":\"SPAM\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        assertThat(jdbc.sql("SELECT rejection_reason FROM review WHERE id=:id").param("id", review).query(String.class).single()).isEqualTo("SPAM");
        mockMvc.perform(patch(route).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"APPROVE\",\"reason\":\"Checked\"}"))
                .andExpect(status().isConflict());
    }

    @Test void staffCanQuoteACancellationFeeThroughTheSecuredRoute() throws Exception {
        UUID customer = jdbc.sql("INSERT INTO customer(full_name,customer_code) VALUES('TEST_CANCELLATION','KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) RETURNING id").query(UUID.class).single();
        UUID request = jdbc.sql("INSERT INTO reservation_cancellation_request(reservation_id,customer_id) VALUES(:reservation,:customer) RETURNING id")
                .param("reservation", reservationId).param("customer", customer).query(UUID.class).single();
        String route = "/api/v1/admin/ops/reservations/cancellation-requests/" + reference + "/" + request + "/fee";
        mockMvc.perform(post(route).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"feeMinor\":250000,\"note\":\"Hotel quote\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("QUOTED"))
                .andExpect(jsonPath("$.feeMinor").value(250000));
        mockMvc.perform(post(route).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"feeMinor\":250000,\"note\":\"Duplicate\"}"))
                .andExpect(status().isConflict());
    }

    @Test void tripRatingKeepsTheLatestQuarterWhenAnOlderQuarterIsEdited() throws Exception {
        String route = "/api/v1/admin/properties/" + propertyId + "/trip-rating";
        mockMvc.perform(put(route).cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"quarterStart\":\"2026-10-02\",\"rating\":9.2,\"reviewCount\":20,\"sourceUrl\":\"https://trip.example.invalid/hotel\",\"observedOn\":\"2026-10-24\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put(route).cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"quarterStart\":\"2026-10-01\",\"rating\":9.2,\"reviewCount\":20,\"sourceUrl\":\"https://trip.example.invalid/hotel\",\"observedOn\":\"2026-10-24\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(put(route).cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"quarterStart\":\"2026-07-01\",\"rating\":8.0,\"reviewCount\":10,\"sourceUrl\":\"https://trip.example.invalid/hotel\",\"observedOn\":\"2026-07-24\"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT trip_com_rating FROM property WHERE id=:id").param("id", propertyId).query(java.math.BigDecimal.class).single())
                .isEqualByComparingTo("9.2");
    }

    @Test void percentageCancellationQuoteUsesServerTotalAndRoundsHalfUp() throws Exception {
        UUID request = cancellationRequest();
        jdbc.sql("UPDATE reservation SET total_minor=10005 WHERE id=:id").param("id", reservationId).update();
        mockMvc.perform(get("/api/v1/admin/ops/reservations/cancellation-requests").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].totalMinor").value(10005));
        mockMvc.perform(post(cancellationFeeRoute(request)).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"percentage\":10,\"note\":\"Ten percent\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.feeMinor").value(1001))
                .andExpect(jsonPath("$.cancelled").value(false));
        assertThat(salesStatus()).isEqualTo("REQUESTED");
        assertThat(jdbc.sql("SELECT fee_amount_minor FROM reservation_cancellation_request WHERE id=:id")
                .param("id", request).query(Long.class).single()).isEqualTo(1001);
    }

    @Test void cancellationQuoteRejectsAmbiguousMissingAndInvalidPercentages() throws Exception {
        UUID request = cancellationRequest();
        for (String body : new String[]{"{}", "{\"feeMinor\":0,\"percentage\":10}",
                "{\"percentage\":-1}", "{\"percentage\":100.01}", "{\"percentage\":0.001}", "{\"feeMinor\":-1}",
                "{\"feeMinor\":1.5}", "{\"feeMinor\":9223372036854775808}"}) {
            mockMvc.perform(post(cancellationFeeRoute(request)).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(body)).andExpect(status().isBadRequest());
        }
        assertThat(jdbc.sql("SELECT status::text FROM reservation_cancellation_request WHERE id=:id")
                .param("id", request).query(String.class).single()).isEqualTo("PENDING_HOTEL_FEE");
    }

    @Test void percentageCancellationQuoteSupportsZeroAndFullFee() throws Exception {
        for (int percent : new int[]{0, 100}) {
            UUID request = cancellationRequest();
            mockMvc.perform(post(cancellationFeeRoute(request)).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"percentage\":" + percent + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.feeMinor").value(percent == 0 ? 0 : 1500000));
            jdbc.sql("DELETE FROM reservation_cancellation_request WHERE id=:id").param("id", request).update();
        }
    }

    private UUID cancellationRequest() {
        UUID customer = jdbc.sql("INSERT INTO customer(full_name,customer_code) VALUES('TEST_FEE','KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) RETURNING id").query(UUID.class).single();
        return jdbc.sql("INSERT INTO reservation_cancellation_request(reservation_id,customer_id) VALUES(:reservation,:customer) RETURNING id")
                .param("reservation", reservationId).param("customer", customer).query(UUID.class).single();
    }

    private String cancellationFeeRoute(UUID request) {
        return "/api/v1/admin/ops/reservations/cancellation-requests/" + reference + "/" + request + "/fee";
    }

    @Test void voucherAppliesToTheChosenHotelsOrToEvery() throws Exception {
        String slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", propertyId).query(String.class).single();
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hotel only\",\"type\":\"PERCENTAGE\",\"valuePercent\":5,\"currency\":\"VND\",\"status\":\"DRAFT\",\"propertySlugs\":[\"" + slug + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.properties.length()").value(1))
                .andExpect(jsonPath("$.properties[0].slug").value(slug));
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Every hotel\",\"type\":\"PERCENTAGE\",\"valuePercent\":5,\"currency\":\"VND\",\"status\":\"DRAFT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.properties.length()").value(0));
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ghost\",\"type\":\"PERCENTAGE\",\"valuePercent\":5,\"currency\":\"VND\",\"status\":\"DRAFT\",\"propertySlugs\":[\"no-such-hotel\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test void voucherListShowsExpiredAndUsedUpWhateverTheStoredStatus() throws Exception {
        String tag = "TEST_VSTATE_" + UUID.randomUUID().toString().substring(0, 8);
        java.time.LocalDate today = java.time.LocalDate.now(com.kas.platform.shared.TimeConfiguration.PROPERTY_ZONE);
        String body = "{\"name\":\"%s\",\"type\":\"PERCENTAGE\",\"valuePercent\":10,\"currency\":\"VND\",\"status\":\"ACTIVE\",\"usageLimitTotal\":1,\"validFrom\":\"%s\",\"validTo\":\"%s\"}";
        String expired = com.jayway.jsonpath.JsonPath.read(mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(tag + "_EXP", today.minusDays(3), today.minusDays(1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.displayStatus").value("EXPIRED"))
                .andReturn().getResponse().getContentAsString(), "$.id");
        String lastDay = com.jayway.jsonpath.JsonPath.read(mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(tag + "_TODAY", today.minusDays(1), today)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayStatus").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.sql("UPDATE voucher SET used_count = 1 WHERE id = :id").param("id", UUID.fromString(lastDay)).update();
        mockMvc.perform(get("/api/v1/admin/vouchers").param("q", tag).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.id=='" + expired + "')].displayStatus").value("EXPIRED"))
                .andExpect(jsonPath("$[?(@.id=='" + lastDay + "')].displayStatus").value("USED_UP"))
                .andExpect(jsonPath("$[?(@.id=='" + lastDay + "')].status").value("ACTIVE"));
        // The status filter matches what staff see: neither voucher is "active" any more.
        mockMvc.perform(get("/api/v1/admin/vouchers").param("q", tag).param("status", "ACTIVE").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/v1/admin/vouchers").param("q", tag).param("status", "USED_UP").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(lastDay));
        mockMvc.perform(get("/api/v1/admin/vouchers").param("q", tag).param("status", "EXPIRED").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(expired));
    }

    @Test void customerListShowsCodeAccountStatusAndPhoto() throws Exception {
        String name = "TEST_LIST_" + UUID.randomUUID().toString().substring(0, 8);
        UUID guest = jdbc.sql("INSERT INTO customer(full_name,customer_code) VALUES(:name,'KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) RETURNING id")
                .param("name", name).query(UUID.class).single();
        jdbc.sql("INSERT INTO customer_avatar(customer_id,content_type,image) VALUES(:id,'image/png',decode('89504e470d0a1a0a00','hex'))")
                .param("id", guest).update();
        mockMvc.perform(get("/api/v1/admin/customers").param("q", name).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].customerCode").value(org.hamcrest.Matchers.startsWith("KAS-")))
                .andExpect(jsonPath("$[0].accountStatus").value("NO_ACCOUNT"))
                .andExpect(jsonPath("$[0].avatarUrl").value("/api/v1/admin/customers/" + guest + "/avatar?v=1"));
        mockMvc.perform(get("/api/v1/admin/customers/" + guest + "/avatar").cookie(session))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));
    }

    @Test void customerListFiltersByAccountStatusAsShown() throws Exception {
        String name = "TEST_STATUS_" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("INSERT INTO customer(full_name,customer_code) VALUES(:name,'KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)))")
                .param("name", name).update();
        mockMvc.perform(get("/api/v1/admin/customers").param("q", name).param("status", "NO_ACCOUNT").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(header().string("X-Total-Count", "1"));
        mockMvc.perform(get("/api/v1/admin/customers").param("q", name).param("status", "ACTIVE").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0))
                .andExpect(header().string("X-Total-Count", "0"));
        mockMvc.perform(get("/api/v1/admin/customers").param("status", "WHATEVER").cookie(session))
                .andExpect(status().isBadRequest());
    }

    @Test void voucherAndCustomerErrorsUseTheDocumentedHttpStatus() throws Exception {
        mockMvc.perform(get("/api/v1/admin/customers/" + UUID.randomUUID()).cookie(session)).andExpect(status().isNotFound());
        String request = "{\"name\":\"Fixture voucher\",\"type\":\"PERCENTAGE\",\"valuePercent\":10,\"currency\":\"VND\",\"status\":\"DRAFT\"}";
        // The server generates the code: two identical requests make two vouchers with distinct codes.
        String first = mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(org.hamcrest.Matchers.matchesPattern("KAS-[A-HJKMNP-Z2-9]{8}")))
                .andReturn().getResponse().getContentAsString();
        String second = mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(com.jayway.jsonpath.JsonPath.<String>read(first, "$.code"))
                .isNotEqualTo(com.jayway.jsonpath.JsonPath.<String>read(second, "$.code"));
        // A code typed by staff is no longer accepted, and neither is the removed "value add" type.
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"MYCODE\",\"name\":\"X\",\"type\":\"PERCENTAGE\",\"valuePercent\":10,\"currency\":\"VND\",\"status\":\"DRAFT\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/v1/admin/vouchers").cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"type\":\"VALUE_ADD\",\"valueAddDescription\":\"Late checkout\",\"currency\":\"VND\",\"status\":\"DRAFT\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void globalAdminCanAuthorSharedPoliciesWithExplicitHotelContext() throws Exception {
        mockMvc.perform(post("/api/v1/admin/policies").param("contextPropertyId", propertyId.toString())
                .cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"BOOKING\",\"effectiveFrom\":\"2026-01-01\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.scope").value("SHARED"));
        mockMvc.perform(get("/api/v1/admin/policies").param("contextPropertyId", propertyId.toString()).cookie(adminSession))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].type").value("BOOKING"));
    }

    @Test void externalImagesKeepPublicationGatesAndServeTheirUrlWithoutR2() throws Exception {
        String request = """
                {"url":"https://images.example.invalid/hotel.jpg","mimeType":"image/jpeg","category":"EXTERIOR",
                 "ownerType":"PROPERTY","ownerId":"%s","displayOrder":0,"altTextVi":"Khach san","altTextEn":"Hotel"}
                """.formatted(propertyId);
        mockMvc.perform(post("/api/v1/admin/media/external").cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.url").value("https://images.example.invalid/hotel.jpg"));
        String slug = jdbc.sql("SELECT slug FROM property WHERE id=:id").param("id", propertyId).query(String.class).single();
        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/gallery")).andExpect(jsonPath("$.length()").value(0));
        jdbc.sql("UPDATE property SET lifecycle_state='OPEN' WHERE id=:id").param("id", propertyId).update();
        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/gallery").param("locale", "vi"))
                .andExpect(jsonPath("$[0].url").value("https://images.example.invalid/hotel.jpg"))
                .andExpect(jsonPath("$[0].alt").value("Khach san"));
        mockMvc.perform(post("/api/v1/admin/media/external").cookie(adminSession).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(request.replace("https://", "http://"))).andExpect(status().isBadRequest());
    }

    private String salesStatus() {
        return jdbc.sql("SELECT sales_status::text FROM reservation WHERE id=:id").param("id", reservationId).query(String.class).single();
    }
}
