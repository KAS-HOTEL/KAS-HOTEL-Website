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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S5 and S6 — log a contact. Doc 54 §4 S5/S6, doc 58 §5.
 *
 * <h2>The two claims worth testing</h2>
 *
 * That the entry is <em>recorded</em> with the fields doc 54 names — a
 * transition that moved the status but wrote no contact would satisfy neither
 * the guard nor the side effect — and that <strong>nothing else moves</strong>.
 * Doc 54's Hold column for both is "maintained", so an implementation that
 * touched inventory would be wrong in a way no status assertion would catch.
 */
class SalesRequestContactIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "contact-password-3390";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(61);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final int NIGHTS = 2;
    private static final long RATE = 950_000L;
    private static final int TOTAL_ROOMS = 5;

    private static final String QUEUE = "/api/v1/admin/sales/requests";

    // ------------------------------------------------------------ happy path

    @Test
    @DisplayName("S5 from AVAILABILITY_CHECK records the contact and moves the status")
    void s5FromAvailabilityCheck() throws Exception {
        Hotel hotel = hotel("s5");
        String reference = submit(hotel);
        UUID reservationId = UUID.fromString(fixtures.reservationText(reference, "id"));
        check(hotel, reference).andExpect(status().isNoContent());

        contact(hotel, reference, "PHONE", "OUTBOUND", "Guest will confirm tonight", "Called at 10am")
                .andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("CUSTOMER_CONTACTED");

        // Doc 54 S5's side effect: "contact recorded: channel, direction, outcome".
        assertThat(fixtures.contactLogCountFor(reference)).isEqualTo(1);
        assertThat(fixtures.contactLogText(reference, "channel")).isEqualTo("PHONE");
        assertThat(fixtures.contactLogText(reference, "direction")).isEqualTo("OUTBOUND");
        assertThat(fixtures.contactLogText(reference, "outcome"))
                .isEqualTo("Guest will confirm tonight");
        assertThat(fixtures.contactLogText(reference, "notes")).isEqualTo("Called at 10am");
        assertThat(fixtures.contactLogText(reference, "admin_id"))
                .isEqualTo(hotel.adminId.toString());
        assertThat(fixtures.contactLogText(reference, "contacted_at")).isNotNull();

        assertThat(fixtures.auditCount("reservation.contacted", reservationId)).isEqualTo(1);
    }

    @Test
    @DisplayName("S6 from ASSIGNED is permitted — doc 54: clarify dates before checking")
    void s6FromAssigned() throws Exception {
        Hotel hotel = hotel("s6");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel);
        assign(hotel, reference, agent).andExpect(status().isNoContent());
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("ASSIGNED");

        contact(hotel, reference, "ZALO", "INBOUND", null, null)
                .andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("CUSTOMER_CONTACTED");
        assertThat(fixtures.contactLogCountFor(reference)).isEqualTo(1);
        // Nullable columns stay null rather than becoming empty strings.
        assertThat(fixtures.contactLogText(reference, "outcome")).isNull();
        assertThat(fixtures.contactLogText(reference, "notes")).isNull();
        // The owner is not disturbed by logging a contact.
        assertThat(fixtures.reservationText(reference, "sales_owner_id")).isEqualTo(agent.toString());
    }

    @Test
    @DisplayName("logging a contact moves no inventory at all — doc 54: holds maintained")
    void inventoryIsUntouched() throws Exception {
        Hotel hotel = hotel("inv");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        int committedBefore = fixtures.directCommitted(hotel.roomTypeId, CHECK_IN);
        int availableBefore = fixtures.availableDirect(hotel.roomTypeId, CHECK_IN);

        contact(hotel, reference, "EMAIL", "OUTBOUND", null, null)
                .andExpect(status().isNoContent());

        // A conversation moves no rooms. Nothing is created, released or converted.
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
        assertThat(fixtures.holdCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isEqualTo(committedBefore);
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(availableBefore);
    }

    @Test
    @DisplayName("every channel and direction the enums allow is accepted")
    void everyChannelAndDirectionIsAccepted() throws Exception {
        for (String channel : List.of("PHONE", "EMAIL", "ZALO", "SMS", "IN_PERSON")) {
            for (String direction : List.of("OUTBOUND", "INBOUND")) {
                Hotel hotel = hotel("ch" + channel.substring(0, 2).toLowerCase()
                        + direction.substring(0, 2).toLowerCase());
                String reference = submit(hotel);
                check(hotel, reference).andExpect(status().isNoContent());

                contact(hotel, reference, channel, direction, null, null)
                        .andExpect(status().isNoContent());

                assertThat(fixtures.contactLogText(reference, "channel")).isEqualTo(channel);
                assertThat(fixtures.contactLogText(reference, "direction")).isEqualTo(direction);
            }
        }
    }

    @Test
    @DisplayName("a contact makes the request winnable — S5 reaches S10's second source state")
    void contactedRequestCanBeWon() throws Exception {
        Hotel hotel = hotel("win");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        contact(hotel, reference, "PHONE", "OUTBOUND", "Guest accepted", null)
                .andExpect(status().isNoContent());

        // Doc 54 S10 lists CUSTOMER_CONTACTED among its source states, and until
        // S5 existed nothing could reach it.
        fixtures.recordVerifiedPayment(reference);
        mockMvc.perform(post(QUEUE + "/" + reference + "/win")
                        .with(csrf()).cookie(sessionFor(hotel)))
                .andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("WON");
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
    }

    // --------------------------------------------------------- source states

    @Test
    @DisplayName("REQUESTED is refused — doc 54 gives no unassigned, unchecked contact transition")
    void requestedIsRefused() throws Exception {
        Hotel hotel = hotel("req");
        String reference = submit(hotel);

        contact(hotel, reference, "PHONE", "OUTBOUND", null, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.contactLogCountFor(reference))
                .as("a refused transition records nothing")
                .isZero();
    }

    @Test
    @DisplayName("a second contact is refused — doc 54 has no CUSTOMER_CONTACTED self-transition")
    void secondContactIsRefused() throws Exception {
        Hotel hotel = hotel("twice");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        contact(hotel, reference, "PHONE", "OUTBOUND", null, null)
                .andExpect(status().isNoContent());

        contact(hotel, reference, "EMAIL", "INBOUND", null, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // Exactly one entry: the refused call wrote nothing.
        assertThat(fixtures.contactLogCountFor(reference)).isEqualTo(1);
        assertThat(fixtures.contactLogText(reference, "channel")).isEqualTo("PHONE");
    }

    @Test
    @DisplayName("a terminal request cannot be contacted")
    void terminalRequestIsRefused() throws Exception {
        Hotel hotel = hotel("term");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                        .with(csrf()).cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Declined.\"}"))
                .andExpect(status().isNoContent());

        contact(hotel, reference, "PHONE", "OUTBOUND", null, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.contactLogCountFor(reference)).isZero();
    }

    // --------------------------------------------------------------- guards

    @Test
    @DisplayName("channel and direction are required, and only the enum values are accepted")
    void invalidChannelOrDirectionIsRefused() throws Exception {
        Hotel hotel = hotel("bad");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        // A value outside the enum is a 400 naming the field, never a 500 from a
        // failed cast in the database.
        contact(hotel, reference, "CARRIER_PIGEON", "OUTBOUND", null, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        contact(hotel, reference, "PHONE", "SIDEWAYS", null, null)
                .andExpect(status().isBadRequest());
        contact(hotel, reference, "", "OUTBOUND", null, null)
                .andExpect(status().isBadRequest());
        contact(hotel, reference, null, "OUTBOUND", null, null)
                .andExpect(status().isBadRequest());
        contact(hotel, reference, "PHONE", null, null, null)
                .andExpect(status().isBadRequest());

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.contactLogCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("an undocumented body field is rejected, not silently ignored")
    void unknownFieldIsRefused() throws Exception {
        Hotel hotel = hotel("extra");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        mockMvc.perform(post(QUEUE + "/" + reference + "/contact")
                        .with(csrf()).cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"channel\":\"PHONE\",\"direction\":\"OUTBOUND\","
                                + "\"contactedAt\":\"2020-01-01T00:00:00Z\"}"))
                .andExpect(status().isBadRequest());

        // contacted_at is the column's own default. A caller cannot backdate a
        // conversation, and fail-on-unknown-properties is why.
        assertThat(fixtures.contactLogCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("PARTNER A cannot log a contact on PARTNER B's reservation — 404, nothing written")
    void anotherPartnersReservationIsNotFound() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String theirReference = submit(theirs);
        check(theirs, theirReference).andExpect(status().isNoContent());

        contact(mine, theirReference, "PHONE", "OUTBOUND", null, null)
                .andExpect(status().isNotFound());

        assertThat(fixtures.reservationText(theirReference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.contactLogCountFor(theirReference)).isZero();
    }

    @Test
    @DisplayName("an unknown reference is 404, like every other unknown one")
    void unknownReferenceIsNotFound() throws Exception {
        Hotel hotel = hotel("unknown");

        mockMvc.perform(post(QUEUE + "/KAS-888888-YYYY/contact")
                        .with(csrf()).cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"channel\":\"PHONE\",\"direction\":\"OUTBOUND\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a contact needs the session and the CSRF token")
    void contactIsGuarded() throws Exception {
        Hotel hotel = hotel("guard");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        String body = "{\"channel\":\"PHONE\",\"direction\":\"OUTBOUND\"}";

        mockMvc.perform(post(QUEUE + "/" + reference + "/contact").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(QUEUE + "/" + reference + "/contact").cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());

        assertThat(fixtures.contactLogCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("nothing in the contact path claims a notification was sent")
    void noNotificationIsClaimed() throws Exception {
        Hotel hotel = hotel("quiet");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        String body = contact(hotel, reference, "PHONE", "OUTBOUND", null, null)
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getContentAsString();

        // Doc 54 S5's notification column is "optional guest email". Doc 117 §8.1
        // freezes that a transition owes the business effect and the record, not
        // delivery. OQ-162 is open and no mail sender exists.
        assertThat(body).isEmpty();
        assertThat(fixtures.emailLogCount()).isZero();
    }

    // -------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, UUID roomTypeId,
                         String roomTypeSlug, UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("ct-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "CONTACT_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "ct-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        fixtures.setSetting("DEPOSIT_REQUIRED_TO_CONFIRM", "false");

        UUID admin = fixtures.createUser("ct-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, property, fixtures.slugOf(property), roomType, roomTypeSlug,
                admin);
    }

    private UUID agentOf(Hotel hotel) {
        UUID agent = fixtures.createUser(
                "ct-agent-" + UUID.randomUUID().toString().substring(0, 8), PASSWORD);
        fixtures.grantPartnerOperations(agent, hotel.partnerId);
        return agent;
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions contact(Hotel hotel, String reference, String channel, String direction,
                                  String outcome, String notes) throws Exception {
        StringBuilder body = new StringBuilder("{");
        body.append(field("channel", channel)).append(',').append(field("direction", direction));
        if (outcome != null) {
            body.append(',').append(field("outcome", outcome));
        }
        if (notes != null) {
            body.append(',').append(field("notes", notes));
        }
        body.append('}');

        return mockMvc.perform(post(QUEUE + "/" + reference + "/contact")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body.toString()));
    }

    private static String field(String name, String value) {
        return value == null
                ? "\"" + name + "\":null"
                : "\"" + name + "\":\"" + value.replace("\"", "\\\"") + "\"";
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private ResultActions assign(Hotel hotel, String reference, UUID owner) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/assign")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"salesOwnerId\":\"" + owner + "\"}"));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Contact Guest","email":"contact@example.com",
                          "phone":"+84900000333","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "ct-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
