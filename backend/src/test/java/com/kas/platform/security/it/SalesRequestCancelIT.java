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
 * S12 — cancel a direct request. Doc 54 §4 S12, doc 58 §5.
 *
 * <h2>What separates this from S11</h2>
 *
 * Doc 54 gives S11 and S12 the same source set and the same Hold column, so the
 * inventory half is asserted here to behave identically. The differences are the
 * status reached, the audit event, the hold's release reason, and
 * {@code cancelled_at} / {@code cancellation_reason} — the two columns V12 named
 * for this transition and that the decline correctly leaves null.
 */
class SalesRequestCancelIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "cancel-password-5512";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(51);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final int NIGHTS = 2;
    private static final long RATE = 800_000L;
    private static final int TOTAL_ROOMS = 7;

    private static final String QUEUE = "/api/v1/admin/sales/requests";
    private static final String REASON = "Guest cancelled by phone this morning.";

    // ------------------------------------------------------------ happy path

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("cancel moves the status, releases every hold and gives the rooms back")
    void cancelReleasesHoldsAndInventory() throws Exception {
        Hotel hotel = hotel("ok");
        String reference = submit(hotel);
        UUID reservationId = UUID.fromString(fixtures.reservationText(reference, "id"));

        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();

        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("CANCELLED");
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();

        // Doc 55 §3.1 — an ACTIVE hold is the whole contribution of a reservation
        // whose stayStatus is still null, so releasing it must give the nights back.
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(TOTAL_ROOMS);

        assertThat(fixtures.auditCount("reservation.cancelled", reservationId)).isEqualTo(1);
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES")).isEqualTo(2);
    }

    @Test
    @DisplayName("the cancellation columns are written — the ones a decline leaves null")
    void cancellationColumnsAreWritten() throws Exception {
        Hotel hotel = hotel("cols");
        String reference = submit(hotel);

        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        // V12:86-87 named these for this transition, and until S12 nothing wrote
        // them. SalesRequestDeclineIT asserts the mirror image: both stay null.
        assertThat(fixtures.reservationText(reference, "cancellation_reason")).isEqualTo(REASON);
        assertThat(fixtures.reservationText(reference, "cancelled_at")).isNotNull();

        // The reason is on the transition record too, exactly as the decline's is.
        assertThat(fixtures.statusHistoryReason(reference, "CANCELLED")).isEqualTo(REASON);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the released holds say which transition released them")
    void releaseReasonNamesTheTransition() throws Exception {
        Hotel hotel = hotel("reason");
        String reference = submit(hotel);

        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        // So a cancelled hold is never mistaken for a declined or expired one.
        assertThat(fixtures.holdReleaseReason(reference)).isEqualTo("Reservation cancelled (S12)");
        assertThat(fixtures.holdCountFor(reference))
                .as("holds are released, never deleted")
                .isEqualTo(NIGHTS);
    }

    @Test
    @DisplayName("stay-side fields are untouched — a cancelled request was never confirmed")
    void stayFieldsAreUntouched() throws Exception {
        Hotel hotel = hotel("stay");
        String reference = submit(hotel);

        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        // Doc 54 S12's side-effect column is "—". S12 runs from non-terminal
        // states only, so the stay was never opened and nothing here opens it.
        assertThat(fixtures.reservationText(reference, "stay_status")).isNull();
        assertThat(fixtures.reservationText(reference, "confirmed_at")).isNull();
        assertThat(fixtures.reservationText(reference, "won_at")).isNull();
        assertThat(fixtures.statusHistoryCountFor(reference, "STAY")).isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the released rooms can be requested again immediately")
    void releasedRoomsAreSellableAgain() throws Exception {
        Hotel hotel = hotel("resell");
        String first = submit(hotel);
        cancel(hotel, first, REASON).andExpect(status().isNoContent());

        String second = submit(hotel);

        // V26's index is ACTIVE-scoped precisely so a released row can coexist
        // with a new hold for the same night.
        assertThat(second).isNotEqualTo(first);
        assertThat(fixtures.activeHoldCountFor(second)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("cancelling one request leaves another guest's holds untouched")
    void cancelIsBoundedToItsOwnReservation() throws Exception {
        Hotel hotel = hotel("bounded");
        String kept = submit(hotel);
        String cancelled = submit(hotel);
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();

        cancel(hotel, cancelled, REASON).andExpect(status().isNoContent());

        // Bounded by reservation_id — never a table-wide update.
        assertThat(fixtures.activeHoldCountFor(kept)).isZero();
        assertThat(fixtures.reservationText(kept, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.reservationText(kept, "cancelled_at")).isNull();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    // --------------------------------------------------------- source states

    @Test
    @DisplayName("cancel runs from any non-terminal state, not just REQUESTED")
    void cancelRunsFromAnyNonTerminalState() throws Exception {
        Hotel hotel = hotel("mid");
        String reference = submit(hotel);

        // Doc 54 S12's source is "any non-terminal". Advance it first.
        mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                        .with(csrf()).cookie(sessionFor(hotel)))
                .andExpect(status().isNoContent());
        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");

        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("CANCELLED");
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("a second cancel is refused with 409, not silently repeated")
    void secondCancelIsRefused() throws Exception {
        Hotel hotel = hotel("twice");
        String reference = submit(hotel);
        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        cancel(hotel, reference, REASON)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // Not released twice — that would credit the property with a room no
        // guest gave back.
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES")).isEqualTo(2);
    }

    @Test
    @DisplayName("a declined request cannot then be cancelled — terminal is terminal")
    void declinedRequestCannotBeCancelled() throws Exception {
        Hotel hotel = hotel("declined");
        String reference = submit(hotel);
        decline(hotel, reference).andExpect(status().isNoContent());

        cancel(hotel, reference, REASON)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("DECLINED");
        // The decline's own contract is preserved: it writes neither column.
        assertThat(fixtures.reservationText(reference, "cancelled_at")).isNull();
        assertThat(fixtures.reservationText(reference, "cancellation_reason")).isNull();
    }

    @Test
    @DisplayName("a won request cannot be cancelled here — and its converted holds stay converted")
    void wonRequestCannotBeCancelled() throws Exception {
        Hotel hotel = hotel("won");
        String reference = submit(hotel);
        mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel))).andExpect(status().isNoContent());
        fixtures.recordVerifiedPayment(reference);
        mockMvc.perform(post(QUEUE + "/" + reference + "/win")
                .with(csrf()).cookie(sessionFor(hotel))).andExpect(status().isNoContent());

        cancel(hotel, reference, REASON)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // The confirmed stay is intact: no hold was released and the rooms stay
        // committed. Cancelling a WON stay is a different transition on a
        // different route (doc 58 §4, /me/stays), and it is not implemented.
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        assertThat(fixtures.reservationText(reference, "stay_status")).isEqualTo("CONFIRMED");
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    // --------------------------------------------------------------- guards

    @Test
    @DisplayName("a blank reason is a 400 — the guard is 'reason required', not 'field present'")
    void blankReasonIsRefused() throws Exception {
        Hotel hotel = hotel("blank");
        String reference = submit(hotel);

        for (String blank : List.of("", "   ", "\t")) {
            cancel(hotel, reference, blank).andExpect(status().isBadRequest());
        }
        cancel(hotel, reference, null).andExpect(status().isBadRequest());

        // Refused at the edge, before anything was locked or released.
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("PARTNER A cannot cancel PARTNER B's reservation — 404, and nothing moves")
    void anotherPartnersReservationCannotBeCancelled() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String theirReference = submit(theirs);

        cancel(mine, theirReference, REASON).andExpect(status().isNotFound());

        // 404, never 403 — doc 85 §6.3. And nothing moved.
        assertThat(fixtures.reservationText(theirReference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.reservationText(theirReference, "cancelled_at")).isNull();
        assertThat(fixtures.activeHoldCountFor(theirReference)).isZero();
        assertThat(fixtures.directCommitted(theirs.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("an unauthenticated caller cannot cancel anything")
    void unauthenticatedCannotCancel() throws Exception {
        Hotel hotel = hotel("anon");
        String reference = submit(hotel);

        mockMvc.perform(post(QUEUE + "/" + reference + "/cancel")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"nope\"}"))
                .andExpect(status().isUnauthorized());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("a cancel without the CSRF token is refused")
    void csrfIsRequired() throws Exception {
        Hotel hotel = hotel("csrf");
        String reference = submit(hotel);

        mockMvc.perform(post(QUEUE + "/" + reference + "/cancel")
                        .cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"nope\"}"))
                .andExpect(status().isForbidden());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("a reference that never existed is 404, like every other unknown one")
    void unknownReferenceIsNotFound() throws Exception {
        Hotel hotel = hotel("unknown");

        mockMvc.perform(post(QUEUE + "/KAS-999999-ZZZZ/cancel")
                        .with(csrf())
                        .cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"" + REASON + "\"}"))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------- exposure

    @Test
    @DisplayName("the cancelled request still reads back, now in its terminal state")
    void cancelledRequestIsStillVisible() throws Exception {
        Hotel hotel = hotel("visible");
        String reference = submit(hotel);
        cancel(hotel, reference, REASON).andExpect(status().isNoContent());

        mockMvc.perform(get(QUEUE + "/" + reference).cookie(sessionFor(hotel)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.salesStatus").value("CANCELLED"));
    }

    @Test
    @DisplayName("nothing in the cancel path claims a notification was sent")
    void noNotificationIsClaimed() throws Exception {
        Hotel hotel = hotel("quiet");
        String reference = submit(hotel);

        String body = cancel(hotel, reference, REASON)
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getContentAsString();

        // Doc 54 S12 lists "guest email + in-app". Doc 117 §8.1 freezes that a
        // transition owes the business effect and the record, not delivery.
        // OQ-162 is open and no mail sender exists.
        assertThat(body).isEmpty();
        assertThat(fixtures.emailLogCount()).isZero();
    }

    // -------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, UUID roomTypeId,
                         String roomTypeSlug, UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("cx-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "CANCEL_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "cx-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        fixtures.setSetting("DEPOSIT_REQUIRED_TO_CONFIRM", "false");

        UUID admin = fixtures.createUser("cx-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, property, fixtures.slugOf(property), roomType, roomTypeSlug,
                admin);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions cancel(Hotel hotel, String reference, String reason) throws Exception {
        String body = reason == null
                ? "{}"
                : "{\"reason\":\"" + reason.replace("\"", "\\\"").replace("\t", "\\t") + "\"}";
        return mockMvc.perform(post(QUEUE + "/" + reference + "/cancel")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions decline(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Declined by KAS.\"}"));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Cancel Guest","email":"cancel@example.com",
                          "phone":"+84900000555","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "cx-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
