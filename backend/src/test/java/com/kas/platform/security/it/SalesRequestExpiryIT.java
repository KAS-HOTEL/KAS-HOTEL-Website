package com.kas.platform.security.it;

import com.kas.platform.reservation.SalesRequestExpiryService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Overdue direct requests are expired by the backend, and the queue's views and
 * counts follow the stored status.
 */
class SalesRequestExpiryIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "expiry-password-7731";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(83);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final String QUEUE = "/api/v1/admin/sales/requests";

    @Autowired SalesRequestExpiryService expiry;
    @Autowired JdbcClient jdbc;

    @Test
    @DisplayName("an unanswered request past its deadline becomes EXPIRED once, with history and one hotel email")
    void overdueRequestExpiresExactlyOnce() throws Exception {
        Hotel hotel = hotel("once");
        String onTime = submit(hotel);
        String late = submit(hotel);
        fixtures.backdateSlaDueAt(late);

        assertThat(expiry.expireOverdue()).contains(late).doesNotContain(onTime);
        assertThat(statusOf(late)).isEqualTo("EXPIRED");
        assertThat(statusOf(onTime)).isEqualTo("REQUESTED");

        // A second sweep changes nothing and writes nothing more.
        assertThat(expiry.expireOverdue()).doesNotContain(late);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM reservation_status_history h JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.reference = :ref AND h.to_status = 'EXPIRED' AND h.actor_type = 'SYSTEM'
                   AND h.reason = 'SLA_EXPIRED' AND h.from_status = 'REQUESTED'
                """).param("ref", late).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM email_delivery_outbox WHERE event_key = :key")
                .param("key", "sales-request-expired-" + late).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("accepted, cancelled, declined, contacted and deadline-less requests are never expired")
    void onlyUnansweredRequestsExpire() throws Exception {
        Hotel hotel = hotel("guard");
        String checked = submit(hotel);
        check(hotel, checked).andExpect(status().isNoContent());
        fixtures.backdateSlaDueAt(checked);

        List<String> untouched = new java.util.ArrayList<>();
        for (String state : List.of("PAYMENT_PENDING", "WON", "CANCELLED", "DECLINED",
                "CUSTOMER_CONTACTED", "ALTERNATIVE_OFFERED")) {
            String reference = submit(hotel);
            setStatus(reference, state);
            fixtures.backdateSlaDueAt(reference);
            untouched.add(reference);
        }
        String noDeadline = submit(hotel);
        jdbc.sql("UPDATE reservation SET sla_due_at = NULL WHERE reference = :ref").param("ref", noDeadline).update();

        List<String> expired = expiry.expireOverdue();

        assertThat(expired).contains(checked);
        assertThat(statusOf(checked)).isEqualTo("EXPIRED");
        assertThat(expired).doesNotContainAnyElementsOf(untouched).doesNotContain(noDeadline);
        assertThat(statusOf(untouched.get(0))).isEqualTo("PAYMENT_PENDING");
        assertThat(statusOf(untouched.get(2))).isEqualTo("CANCELLED");
        assertThat(statusOf(noDeadline)).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("queue views select by stored status and the counts come from the database, per hotel")
    void viewsAndCountsFollowStatus() throws Exception {
        Partner partner = partner("views");
        Hotel first = hotelFor(partner, "views-a");
        Hotel second = hotelFor(partner, "views-b");
        String awaiting = submit(first);
        String late = submit(first);
        fixtures.backdateSlaDueAt(late);
        expiry.expireOverdue();
        String accepted = submit(first);
        setStatus(accepted, "PAYMENT_PENDING");
        String declined = submit(first);
        setStatus(declined, "DECLINED");
        String elsewhere = submit(second);

        assertThat(references(queue(first, "&queue=awaiting&property=" + first.slug))).containsExactly(awaiting);
        assertThat(references(queue(first, "&queue=expired&property=" + first.slug))).containsExactly(late);
        assertThat(references(queue(first, "&queue=accepted&property=" + first.slug))).containsExactly(accepted);
        assertThat(references(queue(first, "&property=" + first.slug)))
                .containsExactlyInAnyOrder(awaiting, late, accepted, declined);

        Cookie[] session = sessionFor(first);
        mockMvc.perform(get(QUEUE + "/counts").param("property", first.slug).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.all").value(4))
                .andExpect(jsonPath("$.awaiting").value(1))
                .andExpect(jsonPath("$.expired").value(1))
                .andExpect(jsonPath("$.accepted").value(1));
        mockMvc.perform(get(QUEUE + "/counts").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.all").value(5))
                .andExpect(jsonPath("$.awaiting").value(2));
        assertThat(references(queue(first, "&queue=awaiting"))).containsExactlyInAnyOrder(awaiting, elsewhere);

        queue(first, "&queue=breaching").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("the queue pages in its frozen order, and pages add up to the view's count")
    void queuePages() throws Exception {
        Hotel hotel = hotel("pages");
        List<String> submitted = new java.util.ArrayList<>();
        for (int i = 0; i < 5; i++) {
            submitted.add(submit(hotel));
        }
        List<String> all = references(queue(hotel, "&queue=awaiting"));
        assertThat(all).containsExactlyInAnyOrderElementsOf(submitted);

        List<String> first = references(queue(hotel, "&queue=awaiting&page=0&size=2"));
        List<String> second = references(queue(hotel, "&queue=awaiting&page=1&size=2"));
        List<String> third = references(queue(hotel, "&queue=awaiting&page=2&size=2"));
        assertThat(first).containsExactlyElementsOf(all.subList(0, 2));
        assertThat(second).containsExactlyElementsOf(all.subList(2, 4));
        assertThat(third).containsExactlyElementsOf(all.subList(4, 5));
        assertThat(references(queue(hotel, "&queue=awaiting&page=3&size=2"))).isEmpty();

        queue(hotel, "&page=-1").andExpect(status().isBadRequest());
        queue(hotel, "&size=101").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the newest request comes first, oldest on request, and search matches reference or guest")
    void newestFirstAndSearch() throws Exception {
        Hotel hotel = hotel("order");
        String older = submit(hotel);
        String newer = submit(hotel);
        jdbc.sql("UPDATE reservation SET requested_at = now() - interval '2 days' WHERE reference = :ref").param("ref", older).update();
        jdbc.sql("UPDATE reservation SET guest_name = 'Zoë Search_Target' WHERE reference = :ref").param("ref", newer).update();

        assertThat(references(queue(hotel, ""))).containsExactly(newer, older);
        assertThat(references(queue(hotel, "&sort=oldest"))).containsExactly(older, newer);
        assertThat(references(queue(hotel, "&q=search_target"))).containsExactly(newer);
        assertThat(references(queue(hotel, "&q=" + older.substring(older.length() - 6)))).containsExactly(older);
        // % and _ are literal, not wildcards.
        assertThat(references(queue(hotel, "&q=%25"))).isEmpty();
        mockMvc.perform(get(QUEUE + "/counts").param("property", hotel.slug).param("q", "search_target").cookie(sessionFor(hotel)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.all").value(1));
        queue(hotel, "&sort=sideways").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a caller without the sales permission cannot read the counts")
    void countsAreProtected() throws Exception {
        mockMvc.perform(get(QUEUE + "/counts")).andExpect(status().isUnauthorized());
        UUID outsider = fixtures.createUser("expiry-outsider", PASSWORD);
        mockMvc.perform(get(QUEUE + "/counts").cookie(login(fixtures.emailOf(outsider), PASSWORD)))
                .andExpect(status().isForbidden());
    }

    // --------------------------------------------------------------- helpers

    private String statusOf(String reference) {
        return jdbc.sql("SELECT sales_status::text FROM reservation WHERE reference = :ref")
                .param("ref", reference).query(String.class).single();
    }

    private void setStatus(String reference, String state) {
        jdbc.sql("UPDATE reservation SET sales_status = CAST(:s AS sales_status) WHERE reference = :ref")
                .param("s", state).param("ref", reference).update();
    }

    private record Partner(UUID id, UUID adminId) { }

    private record Hotel(UUID partnerId, String slug, UUID roomTypeId, String roomTypeSlug, UUID adminId) { }

    private Partner partner(String label) {
        UUID id = fixtures.createPartner("ex-" + label);
        UUID admin = fixtures.createUser("ex-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, id);
        return new Partner(id, admin);
    }

    private Hotel hotel(String label) {
        return hotelFor(partner(label), label);
    }

    private Hotel hotelFor(Partner partner, String label) {
        UUID property = fixtures.createProperties(partner.id, 1).get(0);
        fixtures.setPropertyNames(property, "EXPIRY_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);
        String roomTypeSlug = "ex-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, 700_000L);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, 20, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        return new Hotel(partner.id, fixtures.slugOf(property), roomType, roomTypeSlug, partner.adminId);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions queue(Hotel hotel, String query) throws Exception {
        return mockMvc.perform(get(QUEUE + "?locale=en" + query).cookie(sessionFor(hotel)));
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private static List<String> references(ResultActions result) throws Exception {
        String body = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> found = new java.util.ArrayList<>();
        int at = 0;
        while ((at = body.indexOf("\"reference\":\"", at)) >= 0) {
            int from = at + 13;
            found.add(body.substring(from, body.indexOf('"', from)));
            at = from;
        }
        return found;
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Expiry Guest","email":"expiry@example.com",
                          "phone":"+84900000556","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);
        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "ex-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
