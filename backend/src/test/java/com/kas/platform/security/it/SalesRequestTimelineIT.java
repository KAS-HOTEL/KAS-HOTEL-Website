package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The request's transition history, read back — {@code reservation_status_history}.
 *
 * <h2>What is worth testing here</h2>
 *
 * Six steps have written to this table and nothing has ever read it. So the
 * assertions that matter are that every transition <em>actually appears</em>,
 * in the order it happened, carrying what it recorded — and that reading it
 * discloses no actor identity and changes nothing.
 */
class SalesRequestTimelineIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "timeline-password-4417";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(91);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 600_000L;
    private static final int TOTAL_ROOMS = 4;

    private static final String QUEUE = "/api/v1/admin/sales/requests";

    // ------------------------------------------------------------- content

    @Test
    @DisplayName("a new request already has its opening entry")
    void s1IsRecorded() throws Exception {
        Hotel hotel = hotel("s1");
        String reference = submit(hotel);

        detail(hotel, reference)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeline.length()").value(1))
                .andExpect(jsonPath("$.timeline[0].field").value("SALES"))
                .andExpect(jsonPath("$.timeline[0].toStatus").value("REQUESTED"))
                // A request did not come from somewhere; it began.
                .andExpect(jsonPath("$.timeline[0].fromStatus").doesNotExist())
                .andExpect(jsonPath("$.timeline[0].at").exists());
    }

    @Test
    @DisplayName("the whole lifecycle appears, in the order it happened")
    void theFullLifecycleIsRecorded() throws Exception {
        Hotel hotel = hotel("full");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel);

        assign(hotel, reference, agent).andExpect(status().isNoContent());
        check(hotel, reference).andExpect(status().isNoContent());
        contact(hotel, reference).andExpect(status().isNoContent());
        win(hotel, reference).andExpect(status().isNoContent());

        // S1, S2, S3, S5, then S10's two rows — sales WON and stay CONFIRMED,
        // written in one transaction, which is why they share an instant.
        detail(hotel, reference)
                .andExpect(jsonPath("$.timeline.length()").value(6))
                .andExpect(jsonPath("$.timeline[0].toStatus").value("REQUESTED"))
                .andExpect(jsonPath("$.timeline[1].toStatus").value("ASSIGNED"))
                .andExpect(jsonPath("$.timeline[1].fromStatus").value("REQUESTED"))
                .andExpect(jsonPath("$.timeline[2].toStatus").value("AVAILABILITY_CHECK"))
                .andExpect(jsonPath("$.timeline[3].toStatus").value("CUSTOMER_CONTACTED"))
                .andExpect(jsonPath("$.timeline[4].field").value("SALES"))
                .andExpect(jsonPath("$.timeline[4].toStatus").value("WON"))
                .andExpect(jsonPath("$.timeline[5].field").value("STAY"))
                .andExpect(jsonPath("$.timeline[5].toStatus").value("CONFIRMED"));
    }

    @Test
    @DisplayName("a decline records its reason; a check records none")
    void reasonIsPresentOnlyWhereItWasGiven() throws Exception {
        Hotel hotel = hotel("reason");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        decline(hotel, reference, "Group booking that weekend.")
                .andExpect(status().isNoContent());

        detail(hotel, reference)
                .andExpect(jsonPath("$.timeline[1].toStatus").value("AVAILABILITY_CHECK"))
                // Doc 54 S3 has no reason guard, so the column is null and stays null.
                .andExpect(jsonPath("$.timeline[1].reason").doesNotExist())
                .andExpect(jsonPath("$.timeline[2].toStatus").value("DECLINED"))
                .andExpect(jsonPath("$.timeline[2].reason")
                        .value("Group booking that weekend."))
                .andExpect(jsonPath("$.timeline[2].note").exists());
    }

    @Test
    @DisplayName("a cancel is distinguishable from a decline in the record")
    void cancelAndDeclineAreDistinct() throws Exception {
        Hotel hotel = hotel("cancel");
        String reference = submit(hotel);
        cancel(hotel, reference, "Guest changed plans.").andExpect(status().isNoContent());

        detail(hotel, reference)
                .andExpect(jsonPath("$.timeline[1].toStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.timeline[1].reason").value("Guest changed plans."));
    }

    @Test
    @DisplayName("an agent's transition is recorded as ADMIN")
    void agentTransitionsAreAdmin() throws Exception {
        Hotel hotel = hotel("admin");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        detail(hotel, reference)
                .andExpect(jsonPath("$.timeline[1].actorType").value("ADMIN"));
    }

    // -------------------------------------------------------------- privacy

    @Test
    @DisplayName("the timeline never carries an actor id, an email or any internal identifier")
    void noActorIdentityIsDisclosed() throws Exception {
        Hotel hotel = hotel("privacy");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel);
        assign(hotel, reference, agent).andExpect(status().isNoContent());

        String body = detail(hotel, reference)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // app_user has no name column and its only human-readable identifier is an
        // email address. No frozen document permits disclosing staff identity
        // between colleagues, so the timeline reports actorType and stops.
        assertThat(body).doesNotContain("actorId").doesNotContain(agent.toString())
                .doesNotContain(hotel.adminId.toString())
                .doesNotContain(fixtures.emailOf(agent))
                .doesNotContain("reservationId").doesNotContain("salesOwnerId");
    }

    // -------------------------------------------------------------- security

    @Test
    @DisplayName("another partner's history is unreachable — the detail 404 covers it")
    void crossPartnerHistoryIsUnreachable() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String theirReference = submit(theirs);
        check(theirs, theirReference).andExpect(status().isNoContent());

        // There is no separate history route, so the ownership boundary is the
        // one the detail read already enforces.
        mockMvc.perform(get(QUEUE + "/" + theirReference).cookie(sessionFor(mine)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an unknown reference is 404 and an unauthenticated read is 401")
    void unknownAndUnauthenticatedAreRefused() throws Exception {
        Hotel hotel = hotel("guard");

        mockMvc.perform(get(QUEUE + "/KAS-777777-ZZZZ").cookie(sessionFor(hotel)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(QUEUE + "/KAS-777777-ZZZZ"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("reading the timeline mutates nothing")
    void readingChangesNothing() throws Exception {
        Hotel hotel = hotel("readonly");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        long historyBefore = fixtures.statusHistoryCountFor(reference, "SALES");
        int committedBefore = fixtures.directCommitted(hotel.roomTypeId, CHECK_IN);
        long holdsBefore = fixtures.activeHoldCountFor(reference);

        detail(hotel, reference).andExpect(status().isOk());
        detail(hotel, reference).andExpect(status().isOk());

        // No new history row, no inventory movement, no hold touched. Reading a
        // record is not an event in it.
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES")).isEqualTo(historyBefore);
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isEqualTo(committedBefore);
        assertThat(fixtures.activeHoldCountFor(reference)).isEqualTo(holdsBefore);
    }

    @Test
    @DisplayName("the order is stable across repeated reads")
    void orderingIsStable() throws Exception {
        Hotel hotel = hotel("stable");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        win(hotel, reference).andExpect(status().isNoContent());

        // S10's two rows share created_at exactly — now() is the transaction
        // timestamp — so the id tiebreak is what makes this repeatable.
        String first = detail(hotel, reference).andReturn().getResponse().getContentAsString();
        String second = detail(hotel, reference).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
    }

    // -------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, String slug, UUID roomTypeId, String roomTypeSlug,
                         UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("tl-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "TIMELINE_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "tl-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        fixtures.setSetting("DEPOSIT_REQUIRED_TO_CONFIRM", "false");

        UUID admin = fixtures.createUser("tl-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, fixtures.slugOf(property), roomType, roomTypeSlug, admin);
    }

    private UUID agentOf(Hotel hotel) {
        UUID agent = fixtures.createUser(
                "tl-agent-" + UUID.randomUUID().toString().substring(0, 8), PASSWORD);
        fixtures.grantPartnerOperations(agent, hotel.partnerId);
        return agent;
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions detail(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)));
    }

    private ResultActions assign(Hotel hotel, String reference, UUID owner) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/assign")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"salesOwnerId\":\"" + owner + "\"}"));
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private ResultActions contact(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/contact")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"channel\":\"PHONE\",\"direction\":\"OUTBOUND\"}"));
    }

    private ResultActions win(Hotel hotel, String reference) throws Exception {
        fixtures.recordVerifiedPayment(reference);
        return mockMvc.perform(post(QUEUE + "/" + reference + "/win")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private ResultActions decline(Hotel hotel, String reference, String reason) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + reason + "\"}"));
    }

    private ResultActions cancel(Hotel hotel, String reference, String reason) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/cancel")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + reason + "\"}"));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Timeline Guest","email":"timeline@example.com",
                          "phone":"+84900000666","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "tl-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
