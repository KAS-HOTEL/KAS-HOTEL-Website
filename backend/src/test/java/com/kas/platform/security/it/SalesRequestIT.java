package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import org.springframework.http.MediaType;

/**
 * The direct sales queue — doc 58 §5, {@code GET /admin/sales/requests}.
 *
 * <p>Every reservation these tests read was created by a <strong>real guest
 * submission</strong> through the public endpoint, so the queue is exercised
 * against the same rows S1 actually writes rather than against fixtures shaped
 * to make it pass.
 */
class SalesRequestIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "sales-queue-password-7741";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(25);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 1_200_000L;

    private static final String QUEUE = "/api/v1/admin/sales/requests";

    // ---------------------------------------------------------------- queue

    @Test
    @DisplayName("the queue lists the partner's own request, with the backend's own figures")
    void queueListsOwnRequest() throws Exception {
        Hotel hotel = hotel("own");
        String reference = submit(hotel);

        mockMvc.perform(get(QUEUE).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reference").value(reference))
                // Guest vocabulary is the guest's; this is the sales queue and
                // carries the frozen salesStatus.
                .andExpect(jsonPath("$[0].salesStatus").value("REQUESTED"))
                .andExpect(jsonPath("$[0].propertySlug").value(hotel.slug))
                .andExpect(jsonPath("$[0].nights").value(2))
                .andExpect(jsonPath("$[0].rooms").value(1))
                .andExpect(jsonPath("$[0].adults").value(2))
                .andExpect(jsonPath("$[0].guestName").value("Queue Guest"))
                .andExpect(jsonPath("$[0].total.amountMinor").value(Vat.with(RATE * 2)))
                .andExpect(jsonPath("$[0].total.currency").value("VND"))
                .andExpect(jsonPath("$[0].slaDueAt").exists());
    }

    @Test
    @DisplayName("the queue never carries another partner's request")
    void queueExcludesAnotherPartnersRequest() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String myReference = submit(mine);
        String theirReference = submit(theirs);

        // Doc 85:223 — reservation → property → partner, applied in the SQL.
        mockMvc.perform(get(QUEUE).cookie(sessionFor(mine)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reference").value(myReference));

        mockMvc.perform(get(QUEUE).cookie(sessionFor(theirs)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reference").value(theirReference));
    }

    @Test
    @DisplayName("the queue carries no guest contact detail — only the name it is worked by")
    void queueCarriesNoContactDetail() throws Exception {
        Hotel hotel = hotel("contact");
        submit(hotel);

        String body = mockMvc.perform(get(QUEUE).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Doc 59:148 gates guest data behind customer.view AND requires the access
        // be logged. The queue incurs neither, so it discloses neither.
        assertThat(body).doesNotContain("queue-guest@example.com");
        assertThat(body).doesNotContain("+84900000123");
        assertThat(body).doesNotContain("guestEmail").doesNotContain("guestPhone");
    }

    // ------------------------------------------------------------ isolation

    @Test
    @DisplayName("PARTNER A cannot read PARTNER B's reservation — 404, never 403")
    void otherPartnersReservationIsNotFound() throws Exception {
        Hotel mine = hotel("a");
        Hotel theirs = hotel("b");
        String theirReference = submit(theirs);

        // A 403 would confirm the reference exists. Doc 85 §6.3 and §11 row 7:
        // "a reference is an identifier, never a credential."
        mockMvc.perform(get(QUEUE + "/" + theirReference).cookie(sessionFor(mine)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a guessed reference is the same 404 as another partner's real one")
    void unknownReferenceIsIndistinguishable() throws Exception {
        Hotel mine = hotel("guess");
        Hotel theirs = hotel("real");
        String theirReference = submit(theirs);
        Cookie[] session = sessionFor(mine);

        String invented = mockMvc.perform(get(QUEUE + "/KAS-999999-ZZZZ").cookie(session))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
        String theirs404 = mockMvc.perform(get(QUEUE + "/" + theirReference).cookie(session))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        // Same code, same message. The bodies differ only by correlation id.
        assertThat(codeOf(invented)).isEqualTo(codeOf(theirs404));
    }

    @Test
    @DisplayName("an unauthenticated caller reaches neither the queue nor a request")
    void unauthenticatedIsRefused() throws Exception {
        Hotel hotel = hotel("anon");
        String reference = submit(hotel);

        mockMvc.perform(get(QUEUE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(QUEUE + "/" + reference)).andExpect(status().isUnauthorized());
    }

    // --------------------------------------------------------------- detail

    @Test
    @DisplayName("the detail carries the stay, its lines and the guest — and logs the disclosure")
    void detailCarriesTheWorkspaceAndAuditsGuestAccess() throws Exception {
        Hotel hotel = hotel("detail");
        String reference = submit(hotel);
        UUID reservationId = UUID.fromString(fixtures.reservationText(reference, "id"));

        assertThat(fixtures.auditCount("reservation.guest_contact_viewed", reservationId))
                .isZero();

        mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.reference").value(reference))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.lines[0].quantity").value(1))
                // Both nights share one rate, so doc 125 §9 populates the scalar.
                .andExpect(jsonPath("$.lines[0].nightly.amountMinor").value(RATE))
                .andExpect(jsonPath("$.guest.fullName").value("Queue Guest"))
                .andExpect(jsonPath("$.guest.email").value("queue-guest@example.com"))
                .andExpect(jsonPath("$.guest.phone").value("+84900000123"));

        // Doc 59:148 — "staff access to guest data is logged". Exactly once.
        assertThat(fixtures.auditCount("reservation.guest_contact_viewed", reservationId))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("no internal identifier or credential reaches the partner")
    void detailLeaksNothingInternal() throws Exception {
        Hotel hotel = hotel("leak");
        fixtures.addRateRule("ROOM_TYPE", null, hotel.roomTypeId, "QUEUE_RULE", 10,
                CHECK_IN, CHECK_OUT, null, RATE, null);
        String reference = submit(hotel);

        String body = mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Pricing internals, submission credentials and the partner's own id —
        // none of which is a fact about this booking that an agent needs.
        //
        // This deliberately does NOT assert the whole of doc 58 §9's INTERNAL
        // list. That list marks fields internal to the GUEST, and
        // PublicResponseDenylistTest enforces it against the public packages.
        // Applying it wholesale here was always inconsistent: the same list
        // contains salesStatus, which this response has returned since Step
        // 16A.5. leadSource left for the same reason — doc 69 §4.2 makes it "a
        // first-class column, not a detail" in the partner's own queue.
        assertThat(body)
                .doesNotContain("ruleId")
                .doesNotContain("appliedRuleIds")
                .doesNotContain("QUEUE_RULE")
                .doesNotContain("priceSnapshot")
                .doesNotContain("idempotency")
                .doesNotContain("fingerprint")
                .doesNotContain("partnerId")
                .doesNotContain("sha256:");
        // The reference is the addressable identifier; the surrogate key is not.
        assertThat(body).doesNotContain(fixtures.reservationText(reference, "id"));
    }

    // ------------------------------------------------------------- read-only

    @Test
    @DisplayName("reading the queue and the detail moves no inventory and touches no hold")
    void readsHaveNoInventorySideEffects() throws Exception {
        Hotel hotel = hotel("readonly");
        String reference = submit(hotel);
        Cookie[] session = sessionFor(hotel);

        long holdsBefore = fixtures.holdCountFor(reference);
        long activeBefore = fixtures.activeHoldCountFor(reference);
        int committedBefore = fixtures.directCommitted(hotel.roomTypeId, CHECK_IN);
        int availableBefore = fixtures.availableDirect(hotel.roomTypeId, CHECK_IN);

        mockMvc.perform(get(QUEUE).cookie(session)).andExpect(status().isOk());
        mockMvc.perform(get(QUEUE + "/" + reference).cookie(session)).andExpect(status().isOk());
        mockMvc.perform(get(QUEUE + "/" + reference).cookie(session)).andExpect(status().isOk());

        // A GET that created a hold, released one or moved direct_committed would
        // change what the guest is holding. Reading twice must be identical.
        assertThat(fixtures.holdCountFor(reference)).isEqualTo(holdsBefore);
        assertThat(fixtures.activeHoldCountFor(reference)).isEqualTo(activeBefore);
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isEqualTo(committedBefore);
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(availableBefore);
        // Deliberately not a global reservation count: another test class commits
        // its own rows, and a suite-wide total would make this assertion about
        // them rather than about whether a GET moved anything.
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("the guest endpoint still works unchanged alongside the partner queue")
    void guestSubmissionIsUnaffected() throws Exception {
        Hotel hotel = hotel("coexist");
        String reference = submit(hotel);

        // KAS + two-digit branch + five random digits, since V31. The old
        // KAS-YYMMDD-XXXX shape encoded the day and nothing about the hotel.
        assertThat(reference).matches("^KAS[0-9]{7}$");
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.reservationText(reference, "stay_status")).isNull();
        assertThat(fixtures.reservationText(reference, "customer_id")).isNull();
    }

    // --------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, UUID roomTypeId,
                         String roomTypeSlug, UUID adminId) {
    }

    /** A partner with one OPEN property, one published room type, inventory and a rate. */
    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("sq-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "QUEUE_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "queue-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, 9, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        UUID admin = fixtures.createUser("sq-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, property, fixtures.slugOf(property), roomType, roomTypeSlug,
                admin);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    /** A real guest submission, so the queue reads the rows S1 actually writes. */
    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Queue Guest","email":"queue-guest@example.com",
                          "phone":"+84900000123","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":"Late arrival","discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "sq-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        return between(response, "\"reference\":\"", "\"");
    }

    private static String codeOf(String json) {
        return between(json, "\"code\":\"", "\"");
    }

    private static String between(String source, String start, String end) {
        int from = source.indexOf(start) + start.length();
        return source.substring(from, source.indexOf(end, from));
    }
}
