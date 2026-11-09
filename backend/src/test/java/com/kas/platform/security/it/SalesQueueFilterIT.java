package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
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
 * The queue's filters — doc 58 §5
 * {@code ?salesStatus,leadSource,owner,slaState,property}.
 *
 * <h2>What these tests are really guarding</h2>
 *
 * A filter is the one kind of read that can quietly become a data leak: it lets
 * a caller ask "show me the rows matching this", and a predicate applied in the
 * wrong order — or instead of the scope — would answer honestly about somebody
 * else's records. So the cross-partner cases here are not ceremony; they are the
 * point.
 */
class SalesQueueFilterIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "filter-password-6614";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(81);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 700_000L;
    private static final int TOTAL_ROOMS = 8;

    private static final String QUEUE = "/api/v1/admin/sales/requests";

    // ------------------------------------------------------------- no filter

    @Test
    @DisplayName("no parameters returns exactly what the route returned before")
    void unfilteredIsUnchanged() throws Exception {
        Hotel hotel = hotel("plain");
        String a = submit(hotel);
        String b = submit(hotel);

        assertThat(references(queue(hotel, ""))).containsExactlyInAnyOrder(a, b);
    }

    @Test
    @DisplayName("an empty parameter is treated as absent, not as an empty match")
    void blankParametersAreAbsent() throws Exception {
        Hotel hotel = hotel("blank");
        String reference = submit(hotel);

        // A form that submits "" for an untouched select must not silently filter
        // the queue down to nothing.
        assertThat(references(queue(hotel, "&salesStatus=&leadSource=&property=&slaState=")))
                .containsExactly(reference);
    }

    // --------------------------------------------------------- salesStatus

    @Test
    @DisplayName("salesStatus selects one lifecycle state and excludes the others")
    void filtersBySalesStatus() throws Exception {
        Hotel hotel = hotel("status");
        String requested = submit(hotel);
        String checked = submit(hotel);
        check(hotel, checked).andExpect(status().isNoContent());

        assertThat(references(queue(hotel, "&salesStatus=REQUESTED")))
                .containsExactly(requested);
        assertThat(references(queue(hotel, "&salesStatus=AVAILABILITY_CHECK")))
                .containsExactly(checked);
        // A state nothing is in is an empty list, not an error.
        assertThat(references(queue(hotel, "&salesStatus=WON"))).isEmpty();
    }

    @Test
    @DisplayName("a terminal state is filterable too — the queue is a record, not just a worklist")
    void filtersByTerminalStatus() throws Exception {
        Hotel hotel = hotel("terminal");
        String live = submit(hotel);
        String declined = submit(hotel);
        decline(hotel, declined).andExpect(status().isNoContent());

        assertThat(references(queue(hotel, "&salesStatus=DECLINED"))).containsExactly(declined);
        assertThat(references(queue(hotel, "&salesStatus=REQUESTED"))).containsExactly(live);
    }

    // ---------------------------------------------------------- leadSource

    @Test
    @DisplayName("leadSource selects the source S1 recorded")
    void filtersByLeadSource() throws Exception {
        Hotel hotel = hotel("lead");
        String reference = submit(hotel);

        // S1 records lead_source = 'WEBSITE' for a guest-submitted request.
        assertThat(references(queue(hotel, "&leadSource=WEBSITE"))).containsExactly(reference);
        assertThat(references(queue(hotel, "&leadSource=WALK_IN"))).isEmpty();
    }

    @Test
    @DisplayName("the queue returns the lead source it filters on — doc 69 §4.2's first-class column")
    void queueExposesLeadSource() throws Exception {
        Hotel hotel = hotel("expose");
        submit(hotel);

        // Until now the queue accepted ?leadSource but returned none, so an agent
        // could filter by something the screen never showed.
        queue(hotel, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].leadSource").value("WEBSITE"));
    }

    @Test
    @DisplayName("lead source is never null on this surface — the channel invariant guarantees it")
    void leadSourceIsAlwaysPresent() throws Exception {
        Hotel hotel = hotel("nonnull");
        submit(hotel);
        submit(hotel);

        // V12's reservation_channel_invariant requires DIRECT to carry one, and
        // doc 58 §5 scopes this API to DIRECT at the data layer.
        queue(hotel, "")
                .andExpect(jsonPath("$[0].leadSource").isNotEmpty())
                .andExpect(jsonPath("$[1].leadSource").isNotEmpty());
    }

    @Test
    @DisplayName("a different lead source is reported as itself, not normalised")
    void otherLeadSourcesAreReportedVerbatim() throws Exception {
        Hotel hotel = hotel("verbatim");
        String reference = submit(hotel);
        fixtures.setLeadSource(reference, "ZALO");

        queue(hotel, "").andExpect(jsonPath("$[0].leadSource").value("ZALO"));
        // And the filter and the field agree on the same value.
        assertThat(references(queue(hotel, "&leadSource=ZALO"))).containsExactly(reference);
        assertThat(references(queue(hotel, "&leadSource=WEBSITE"))).isEmpty();
    }

    @Test
    @DisplayName("the detail workspace carries it too — doc 69 §4.3's Lead source field")
    void detailExposesLeadSource() throws Exception {
        Hotel hotel = hotel("detail");
        String reference = submit(hotel);

        mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.leadSource").value("WEBSITE"));
    }

    @Test
    @DisplayName("another partner's lead source stays out of reach")
    void leadSourceIsScoped() throws Exception {
        Hotel mine = hotel("lsmine");
        Hotel theirs = hotel("lstheirs");
        submit(mine);
        String theirReference = submit(theirs);
        fixtures.setLeadSource(theirReference, "REFERRAL");

        // Their row is absent entirely, so their lead source is too — the same
        // scope predicate, not a second rule about this field.
        String body = queue(mine, "").andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("REFERRAL");
        assertThat(references(queue(mine, "&leadSource=REFERRAL"))).isEmpty();
        mockMvc.perform(get(QUEUE + "/" + theirReference).cookie(sessionFor(mine)))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ property

    @Test
    @DisplayName("property narrows to one hotel, by slug and never by id")
    void filtersByProperty() throws Exception {
        Partner partner = partner("prop");
        Hotel one = hotelFor(partner, "propa");
        Hotel two = hotelFor(partner, "propb");
        String a = submit(one);
        String b = submit(two);

        assertThat(references(queue(one, "&property=" + one.slug))).containsExactly(a);
        assertThat(references(queue(one, "&property=" + two.slug))).containsExactly(b);
        assertThat(references(queue(one, ""))).containsExactlyInAnyOrder(a, b);
    }

    @Test
    @DisplayName("an unknown property slug is an empty list, not an error or an oracle")
    void unknownPropertyIsEmpty() throws Exception {
        Hotel hotel = hotel("nosuch");
        submit(hotel);

        // Refusing it would tell the caller which slugs are real.
        assertThat(references(queue(hotel, "&property=does-not-exist-anywhere"))).isEmpty();
    }

    // ------------------------------------------------------------ slaState

    @Test
    @DisplayName("slaState=breached selects only requests whose promise has passed")
    void filtersByBreachedSla() throws Exception {
        Hotel hotel = hotel("sla");
        String onTime = submit(hotel);
        String late = submit(hotel);
        fixtures.backdateSlaDueAt(late);

        assertThat(references(queue(hotel, "&slaState=breached"))).containsExactly(late);
        assertThat(references(queue(hotel, ""))).containsExactlyInAnyOrder(onTime, late);
    }

    @Test
    @DisplayName("the two SLA bands with no frozen threshold are refused, not guessed at")
    void unfrozenSlaBandsAreRefused() throws Exception {
        Hotel hotel = hotel("slabad");
        submit(hotel);

        // Doc 69 §127 names "within" and "approaching" but freezes no threshold
        // between them. A filter is a stronger commitment than a badge colour, so
        // the server refuses rather than inventing one.
        for (String band : List.of("within", "approaching")) {
            queue(hotel, "&slaState=" + band)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value("slaState"));
        }
    }

    // --------------------------------------------------------- combinations

    @Test
    @DisplayName("filters combine with AND, not OR")
    void filtersCombine() throws Exception {
        Hotel hotel = hotel("combo");
        String requested = submit(hotel);
        String checked = submit(hotel);
        check(hotel, checked).andExpect(status().isNoContent());

        assertThat(references(queue(hotel,
                "&salesStatus=REQUESTED&leadSource=WEBSITE&property=" + hotel.slug)))
                .containsExactly(requested);

        // One clause that matches nothing empties the result, which is what AND means.
        assertThat(references(queue(hotel, "&salesStatus=REQUESTED&leadSource=TIKTOK"))).isEmpty();
    }

    @Test
    @DisplayName("ordering survives filtering — the queue keeps one order whatever the filter")
    void orderingIsPreserved() throws Exception {
        Hotel hotel = hotel("order");
        submit(hotel);
        submit(hotel);
        submit(hotel);

        // A filter must not reorder the queue, because the order is the whole
        // operational point of it. Asserted against the UNFILTERED queue rather
        // than against submission order: the frozen order is
        // `requested_at ASC, reference ASC`, and three submissions this close
        // together can share a requested_at — at which point the reference
        // tie-break decides, correctly, and submission order is not what the
        // contract promises. Comparing the two queues tests what this test is
        // named for and does not depend on clock resolution.
        assertThat(references(queue(hotel, "&salesStatus=REQUESTED")))
                .containsExactlyElementsOf(references(queue(hotel, "")));
    }

    // ------------------------------------------------------------- refusals

    @Test
    @DisplayName("an unknown enum value is a 400 naming the parameter, never a 500")
    void unknownValuesAreRefused() throws Exception {
        Hotel hotel = hotel("bad");
        submit(hotel);

        queue(hotel, "&salesStatus=NOT_A_STATUS")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("salesStatus"));
        queue(hotel, "&leadSource=CARRIER_PIGEON")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("leadSource"));
    }

    @Test
    @DisplayName("a SQL fragment in a filter is a refused value, not a query")
    void injectionAttemptIsJustAnUnknownValue() throws Exception {
        Hotel hotel = hotel("inject");
        String reference = submit(hotel);

        queue(hotel, "&salesStatus=REQUESTED'%20OR%20'1'='1")
                .andExpect(status().isBadRequest());
        // The property slug is not enum-validated, so it reaches the query — as a
        // bound parameter, which is why it matches nothing rather than everything.
        assertThat(references(queue(hotel, "&property=' OR '1'='1"))).isEmpty();
        assertThat(references(queue(hotel, ""))).containsExactly(reference);
    }

    @Test
    @DisplayName("owner is not accepted — doc 134's blocker is not routed around")
    void ownerIsNotAFilter() throws Exception {
        Hotel hotel = hotel("owner");
        String reference = submit(hotel);

        // Spring ignores an unmapped parameter. What matters is that supplying it
        // changes nothing, so no partial owner filtering leaked in.
        assertThat(references(queue(hotel, "&owner=" + UUID.randomUUID())))
                .containsExactly(reference);
    }

    // -------------------------------------------------------------- security

    @Test
    @DisplayName("no filter can reach another partner's request")
    void filtersCannotEscapeTheScope() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String myReference = submit(mine);
        String theirReference = submit(theirs);

        // The scope predicate is ANDed in the same statement, so naming their
        // property by slug narrows my own rows to nothing — it does not widen.
        assertThat(references(queue(mine, "&property=" + theirs.slug))).isEmpty();
        assertThat(references(queue(mine, "&salesStatus=REQUESTED")))
                .containsExactly(myReference)
                .doesNotContain(theirReference);
        assertThat(references(queue(mine, "&leadSource=WEBSITE"))).containsExactly(myReference);
    }

    @Test
    @DisplayName("the filtered queue still needs the permission and a session")
    void filteringIsStillGuarded() throws Exception {
        Hotel hotel = hotel("guard");
        submit(hotel);

        mockMvc.perform(get(QUEUE + "?salesStatus=REQUESTED"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a filtered response carries no more than an unfiltered one")
    void filteringExposesNoExtraFields() throws Exception {
        Hotel hotel = hotel("fields");
        submit(hotel);

        String body = queue(hotel, "&salesStatus=REQUESTED")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Owner and internal ids, which no queue row carries. leadSource is
        // deliberately absent from this list: doc 69 §4.2 makes it a first-class
        // partner column and Step 16A.23 exposes it, so what this asserts is that
        // FILTERING adds nothing — not that the field may never appear.
        assertThat(body).doesNotContain("salesOwnerId").doesNotContain("partnerId")
                .doesNotContain("propertyId")
                .doesNotContain("guest_email");
    }

    // --------------------------------------------------------------- helpers

    private record Partner(UUID id, UUID adminId) {
    }

    private record Hotel(UUID partnerId, String slug, UUID roomTypeId, String roomTypeSlug,
                         UUID adminId) {
    }

    private Partner partner(String label) {
        UUID id = fixtures.createPartner("fq-" + label);
        UUID admin = fixtures.createUser("fq-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, id);
        return new Partner(id, admin);
    }

    private Hotel hotel(String label) {
        return hotelFor(partner(label), label);
    }

    private Hotel hotelFor(Partner partner, String label) {
        UUID property = fixtures.createProperties(partner.id, 1).get(0);
        fixtures.setPropertyNames(property, "FILTER_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "fq-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        return new Hotel(partner.id, fixtures.slugOf(property), roomType, roomTypeSlug,
                partner.adminId);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions queue(Hotel hotel, String query) throws Exception {
        return mockMvc.perform(get(QUEUE + "?locale=en" + query).cookie(sessionFor(hotel)));
    }

    /** The references in the order the queue returned them. */
    private static List<String> references(ResultActions result) throws Exception {
        String body = result.andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<String> found = new java.util.ArrayList<>();
        int at = 0;
        while ((at = body.indexOf("\"reference\":\"", at)) >= 0) {
            int from = at + 13;
            found.add(body.substring(from, body.indexOf('"', from)));
            at = from;
        }
        return found;
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private ResultActions decline(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Filtered out.\"}"));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Filter Guest","email":"filter@example.com",
                          "phone":"+84900000555","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "fq-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
