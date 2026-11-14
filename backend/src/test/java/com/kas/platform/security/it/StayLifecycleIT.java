package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.StayAutoTransitionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Owner 2026-11-14: check-out only after check-in; a stay nobody checks out is checked out at
 * check-out time + 2 h; one never checked in by check-out time becomes NO_SHOW (no refund) and
 * only the real-times form finishes it. Rolled back; the background job is off here.
 */
@TestPropertySource(properties = "kas.membership.jobs.enabled=false")
class StayLifecycleIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "test-stay-lifecycle-58!";
    private static final ZoneId HOTEL = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired JdbcClient jdbc;
    @Autowired StayAutoTransitionService autoStays;

    private Cookie[] session;
    private UUID propertyId;
    private LocalDate today;

    @BeforeEach
    void prepare() throws Exception {
        UUID partnerId = fixtures.createPartner("stay-lifecycle");
        propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        jdbc.sql("UPDATE property SET check_out_time = TIME '12:00' WHERE id = :id").param("id", propertyId).update();
        UUID actor = fixtures.createUser("stay-lifecycle", PASSWORD);
        fixtures.grantGlobalScope(actor, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(actor), PASSWORD);
        today = LocalDate.now(HOTEL);
    }

    /** A paid stay with the given stay status and dates. */
    private String stay(String stayStatus, LocalDate checkIn, LocalDate checkOut) {
        String reference = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, reference);
        jdbc.sql("""
                UPDATE reservation SET sales_status = 'WON', stay_status = CAST(:stay AS stay_status),
                       check_in = :in, check_out = :out
                 WHERE reference = :ref
                """).param("stay", stayStatus).param("in", checkIn).param("out", checkOut).param("ref", reference).update();
        return reference;
    }

    private String stayStatus(String reference) {
        return jdbc.sql("SELECT stay_status::text FROM reservation WHERE reference = :ref").param("ref", reference)
                .query(String.class).single();
    }

    private String lastReason(String reference) {
        return jdbc.sql("""
                SELECT h.reason FROM reservation_status_history h JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.reference = :ref AND h.field = 'STAY' ORDER BY h.created_at DESC, h.id DESC LIMIT 1
                """).param("ref", reference).query(String.class).single();
    }

    @Test
    @DisplayName("check-out needs a check-in first; the buttons record the real times")
    void checkOutNeedsCheckIn() throws Exception {
        String reference = stay("CONFIRMED", today.minusDays(1), today);
        String base = "/api/v1/admin/ops/reservations/" + reference;
        mockMvc.perform(post(base + "/check-out").cookie(session).with(csrf())).andExpect(status().isConflict());
        mockMvc.perform(post(base + "/check-in").cookie(session).with(csrf())).andExpect(status().isOk());
        mockMvc.perform(post(base + "/check-out").cookie(session).with(csrf())).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT checked_in_at IS NOT NULL AND checked_out_at > checked_in_at FROM reservation WHERE reference = :ref")
                .param("ref", reference).query(Boolean.class).single()).isTrue();
    }

    @Test
    @DisplayName("a stay still checked in 2 hours after check-out time is checked out automatically")
    void autoCheckOutAfterTwoHours() {
        String overdue = stay("CHECKED_IN", today.minusDays(2), today.minusDays(1));
        String notYet = stay("CHECKED_IN", today.minusDays(1), today.plusDays(1));

        assertThat(autoStays.checkOutOverdue()).contains(overdue).doesNotContain(notYet);

        assertThat(stayStatus(overdue)).isEqualTo("CHECKED_OUT");
        assertThat(stayStatus(notYet)).isEqualTo("CHECKED_IN");
        assertThat(lastReason(overdue)).isEqualTo("AUTO_CHECK_OUT");
        OffsetDateTime expected = today.minusDays(1).atTime(14, 0).atZone(HOTEL).toOffsetDateTime();
        assertThat(jdbc.sql("SELECT checked_out_at FROM reservation WHERE reference = :ref").param("ref", overdue)
                .query(OffsetDateTime.class).single().toInstant()).isEqualTo(expected.toInstant());
    }

    @Test
    @DisplayName("a paid stay never checked in by check-out time becomes NO_SHOW at once")
    void autoNoShowAtCheckOutTime() {
        String missed = stay("CONFIRMED", today.minusDays(2), today.minusDays(1));
        String upcoming = stay("CONFIRMED", today, today.plusDays(1));

        assertThat(autoStays.noShowOverdue()).contains(missed).doesNotContain(upcoming);

        assertThat(stayStatus(missed)).isEqualTo("NO_SHOW");
        assertThat(stayStatus(upcoming)).isEqualTo("CONFIRMED");
        assertThat(lastReason(missed)).isEqualTo("AUTO_NO_SHOW");
        assertThat(jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference = :ref").param("ref", missed)
                .query(String.class).single()).as("nothing refunded, the payment stays").isEqualTo("WON");
    }

    @Test
    @DisplayName("only the real-times form turns a no-show into a finished stay; wrong times are refused field by field")
    void completeStayForm() throws Exception {
        String reference = stay("NO_SHOW", today.minusDays(2), today.minusDays(1));
        String url = "/api/v1/admin/ops/reservations/" + reference + "/complete-stay";
        String in = today.minusDays(2) + "T15:10:00+07:00";
        String out = today.minusDays(1) + "T11:20:00+07:00";

        mockMvc.perform(post(url).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checkedInAt\":\"" + out + "\",\"checkedOutAt\":\"" + in + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("BEFORE_CHECK_IN"));
        mockMvc.perform(post(url).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checkedInAt\":\"" + in + "\",\"checkedOutAt\":\"" + today.plusDays(3) + "T11:00:00+07:00\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("IN_THE_FUTURE"));
        assertThat(stayStatus(reference)).isEqualTo("NO_SHOW");

        mockMvc.perform(post(url).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checkedInAt\":\"" + in + "\",\"checkedOutAt\":\"" + out + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stayStatus").value("CHECKED_OUT"));

        assertThat(stayStatus(reference)).isEqualTo("CHECKED_OUT");
        assertThat(jdbc.sql("SELECT checked_in_at FROM reservation WHERE reference = :ref").param("ref", reference)
                .query(OffsetDateTime.class).single().toInstant()).isEqualTo(OffsetDateTime.parse(in).toInstant());
        assertThat(jdbc.sql("""
                SELECT count(*) FROM reservation_status_history h JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.reference = :ref AND h.reason = 'STAY_COMPLETED_BY_FORM'
                """).param("ref", reference).query(Long.class).single()).isEqualTo(2);
        // A finished stay cannot be "completed" again.
        mockMvc.perform(post(url).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checkedInAt\":\"" + in + "\",\"checkedOutAt\":\"" + out + "\"}"))
                .andExpect(status().isConflict());
    }
}
