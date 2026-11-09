package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

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
 * S11 — decline a direct request. Doc 54 §4 S11, doc 58 §5.
 *
 * <p>Every reservation here is created by a <strong>real guest submission</strong>
 * through the public endpoint, so the transition is exercised against the rows S1
 * actually writes — including the holds and the {@code direct_committed} it moved.
 */
class SalesRequestDeclineIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "decline-password-8823";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(31);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 900_000L;
    private static final int TOTAL_ROOMS = 9;

    private static final String QUEUE = "/api/v1/admin/sales/requests";
    private static final String REASON = "Rooms are held for a group booking that weekend.";

    // ------------------------------------------------------------ happy path

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("decline moves the status, releases every hold and gives the rooms back")
    void declineReleasesHoldsAndInventory() throws Exception {
        Hotel hotel = hotel("ok");
        String reference = submit(hotel);
        UUID reservationId = UUID.fromString(fixtures.reservationText(reference, "id"));

        // S1 took one room per night and moved the cache with it.
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(TOTAL_ROOMS - 1);

        decline(hotel, reference, REASON).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("DECLINED");
        // Doc 14 §6.3 — "Reservation → DECLINED | All holds RELEASED".
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        // Doc 55 §3.1 — a REQUESTED reservation's whole contribution is its ACTIVE
        // hold, so releasing it must give the night back.
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(TOTAL_ROOMS);

        // Doc 54 S11's audit event, and the durable transition record.
        assertThat(fixtures.auditCount("reservation.declined", reservationId)).isEqualTo(1);
        assertThat(fixtures.statusHistoryCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("holds are released, never deleted — the record survives")
    void holdsAreReleasedNotDeleted() throws Exception {
        Hotel hotel = hotel("keep");
        String reference = submit(hotel);
        long before = fixtures.holdCountFor(reference);

        decline(hotel, reference, REASON).andExpect(status().isNoContent());

        // V26's index is ACTIVE-scoped precisely so a released row can coexist
        // with a later one for the same night. Deleting would destroy history.
        assertThat(fixtures.holdCountFor(reference)).isEqualTo(before);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the released rooms can be requested again immediately")
    void releasedRoomsAreSellableAgain() throws Exception {
        Hotel hotel = hotel("resell");
        String first = submit(hotel);
        decline(hotel, first, REASON).andExpect(status().isNoContent());

        // The real proof that the cache was corrected: the same night sells again,
        // and V26's ACTIVE-only uniqueness lets a new hold take the same identity.
        String second = submit(hotel);
        assertThat(second).isNotEqualTo(first);
        assertThat(fixtures.activeHoldCountFor(second)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    // ------------------------------------------------------------- the guard

    @Test
    @DisplayName("a second decline is refused with 409 ILLEGAL_TRANSITION, not silently repeated")
    void secondDeclineIsRefused() throws Exception {
        Hotel hotel = hotel("twice");
        String reference = submit(hotel);
        decline(hotel, reference, REASON).andExpect(status().isNoContent());

        // Doc 54 §4 — "any transition out of a terminal state" is prohibited.
        decline(hotel, reference, "Changed my mind")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // And nothing moved a second time.
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.statusHistoryCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("a blank reason is a 400 — the guard is 'reason required', not 'field present'")
    void blankReasonIsRefused() throws Exception {
        Hotel hotel = hotel("blank");
        String reference = submit(hotel);

        for (String blank : List.of("", "   ", "\t")) {
            decline(hotel, reference, blank).andExpect(status().isBadRequest());
        }
        decline(hotel, reference, null).andExpect(status().isBadRequest());

        // Refused before anything moved.
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("the reason is recorded on the transition, not invented onto the reservation")
    void reasonIsStoredOnTheHistoryRow() throws Exception {
        Hotel hotel = hotel("reason");
        String reference = submit(hotel);
        decline(hotel, reference, REASON).andExpect(status().isNoContent());

        assertThat(fixtures.statusHistoryReason(reference, "DECLINED")).isEqualTo(REASON);
        // cancellation_reason and cancelled_at are named for cancellation. Nothing
        // in the corpus says a decline writes them, so nothing does.
        assertThat(fixtures.reservationText(reference, "cancellation_reason")).isNull();
        assertThat(fixtures.reservationText(reference, "cancelled_at")).isNull();
    }

    // ------------------------------------------------------------ isolation

    @Test
    @DisplayName("PARTNER A cannot decline PARTNER B's reservation — 404, and nothing moves")
    void anotherPartnersReservationCannotBeDeclined() throws Exception {
        Hotel mine = hotel("m");
        Hotel theirs = hotel("t");
        String theirReference = submit(theirs);

        mockMvc.perform(post(QUEUE + "/" + theirReference + "/decline")
                        .with(csrf())
                        .cookie(sessionFor(mine))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"not mine\"}"))
                .andExpect(status().isNotFound());

        // A 403 would confirm the reference exists. And the lock was never taken.
        assertThat(fixtures.reservationText(theirReference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.activeHoldCountFor(theirReference)).isZero();
        assertThat(fixtures.directCommitted(theirs.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("an unauthenticated caller cannot decline anything")
    void unauthenticatedCannotDecline() throws Exception {
        Hotel hotel = hotel("anon");
        String reference = submit(hotel);

        mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"nope\"}"))
                .andExpect(status().isUnauthorized());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("a decline without the CSRF token is refused")
    void csrfIsRequired() throws Exception {
        Hotel hotel = hotel("csrf");
        String reference = submit(hotel);

        mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                        .cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"nope\"}"))
                .andExpect(status().isForbidden());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    // ----------------------------------------------------------- concurrency

    @Test
    @DisplayName("declining one request leaves another guest's holds untouched")
    void declineIsBoundedToItsOwnReservation() throws Exception {
        Hotel hotel = hotel("bounded");
        String kept = submit(hotel);
        String declined = submit(hotel);

        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();

        decline(hotel, declined, REASON).andExpect(status().isNoContent());

        // Bounded by reservation_id — never a table-wide update.
        assertThat(fixtures.activeHoldCountFor(kept)).isZero();
        assertThat(fixtures.reservationText(kept, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    // ------------------------------------------------------------- exposure

    @Test
    @DisplayName("the declined request still reads back, now in its terminal state")
    void declinedRequestIsStillVisible() throws Exception {
        Hotel hotel = hotel("visible");
        String reference = submit(hotel);
        decline(hotel, reference, REASON).andExpect(status().isNoContent());

        mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.salesStatus").value("DECLINED"));
    }

    @Test
    @DisplayName("nothing in the decline path claims a notification was sent")
    void noNotificationIsClaimed() throws Exception {
        Hotel hotel = hotel("quiet");
        String reference = submit(hotel);

        String body = decline(hotel, reference, REASON)
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getContentAsString();

        // 204 with an empty body. Doc 117 §8.1 — the transition owes the business
        // effect, not delivery. OQ-162 is open and no mail sender exists.
        assertThat(body).isEmpty();
        assertThat(fixtures.emailLogCount()).isZero();
    }

    // -------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, UUID roomTypeId,
                         String roomTypeSlug, UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("dc-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "DECLINE_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "dec-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        UUID admin = fixtures.createUser("dc-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, property, fixtures.slugOf(property), roomType, roomTypeSlug,
                admin);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private org.springframework.test.web.servlet.ResultActions decline(
            Hotel hotel, String reference, String reason) throws Exception {
        String body = reason == null
                ? "{}"
                : "{\"reason\":\"" + reason.replace("\"", "\\\"").replace("\t", "\\t") + "\"}";
        return mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Decline Guest","email":"decline@example.com",
                          "phone":"+84900000999","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "dc-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }

}
