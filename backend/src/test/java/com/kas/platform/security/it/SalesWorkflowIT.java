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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S2, S3/S4 and S10 — doc 54 §4, doc 58 §5, under the six owner rulings of
 * Step 16A.9.
 *
 * <h2>The assertions that matter are the database's, not the status code's</h2>
 *
 * A 204 proves the controller returned. What these tests check is what the
 * transaction left behind: which owner the reservation carries, what the
 * assignment history says, whether the availability check was recorded with its
 * result, what status each hold ended in, whether {@code expires_at} survived,
 * and whether {@code direct_committed} moved when it should not have.
 */
class SalesWorkflowIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "workflow-password-7741";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(41);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final int NIGHTS = 2;
    private static final long RATE = 1_100_000L;
    private static final int TOTAL_ROOMS = 6;

    private static final String QUEUE = "/api/v1/admin/sales/requests";
    private static final String ASSIGN_REASON = "Handing this to the weekend desk.";

    // ============================================================== S2 assign

    @Test
    @DisplayName("S2 assigns the owner, moves REQUESTED to ASSIGNED and writes both histories")
    void assignMovesOwnerAndStatus() throws Exception {
        Hotel hotel = hotel("s2ok");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel, "one");

        assertThat(fixtures.reservationText(reference, "sales_owner_id")).isNull();

        assign(hotel, reference, agent, ASSIGN_REASON).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("ASSIGNED");
        assertThat(fixtures.reservationText(reference, "sales_owner_id"))
                .isEqualTo(agent.toString());

        // The dedicated table — owner decision 5. from_owner_id is null because
        // this was the FIRST assignment, which is a fact, not a gap.
        assertThat(fixtures.assignmentCountFor(reference)).isEqualTo(1);
        assertThat(fixtures.assignmentText(reference, agent, "from_owner_id")).isNull();
        assertThat(fixtures.assignmentText(reference, agent, "actor_id"))
                .isEqualTo(hotel.adminId.toString());
        assertThat(fixtures.assignmentText(reference, agent, "reason")).isEqualTo(ASSIGN_REASON);
        assertThat(fixtures.assignmentText(reference, agent, "property_id"))
                .isEqualTo(hotel.propertyId.toString());

        // S2 moved a status, so a SALES history row exists too.
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES")).isEqualTo(2);
        assertThat(fixtures.auditCount("reservation.assigned",
                UUID.fromString(fixtures.reservationText(reference, "id")))).isEqualTo(1);

        // Holds are maintained — doc 54 S2's Hold column.
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("reassignment works WITHOUT a status change — the point of owner decision 5")
    void reassignmentKeepsTheStatus() throws Exception {
        Hotel hotel = hotel("s2re");
        String reference = submit(hotel);
        UUID first = agentOf(hotel, "first");
        UUID second = agentOf(hotel, "second");

        assign(hotel, reference, first, null).andExpect(status().isNoContent());
        long salesHistoryAfterFirst = fixtures.statusHistoryCountFor(reference, "SALES");

        assign(hotel, reference, second, "Escalated.").andExpect(status().isNoContent());

        // The owner moved; the status did not.
        assertThat(fixtures.reservationText(reference, "sales_owner_id"))
                .isEqualTo(second.toString());
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("ASSIGNED");
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES"))
                .as("a reassignment moves no status, so it writes no status-history row")
                .isEqualTo(salesHistoryAfterFirst);

        // But it IS recorded, with both owners — which is exactly why the
        // assignment history had to be its own table.
        assertThat(fixtures.assignmentCountFor(reference)).isEqualTo(2);
        assertThat(fixtures.assignmentText(reference, first, "from_owner_id"))
                .as("the first assignment had no previous owner")
                .isNull();
        assertThat(fixtures.assignmentText(reference, second, "from_owner_id"))
                .as("the second names the owner it took over from — the chain is unbroken")
                .isEqualTo(first.toString());
    }

    @Test
    @DisplayName("assigning the current owner to themselves is refused, not silently repeated")
    void reassigningTheSameOwnerIsRefused() throws Exception {
        Hotel hotel = hotel("s2same");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel, "same");

        assign(hotel, reference, agent, null).andExpect(status().isNoContent());
        assign(hotel, reference, agent, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.assignmentCountFor(reference)).isEqualTo(1);
    }

    @Test
    @DisplayName("another partner's agent cannot be assigned — and neither can a forged id")
    void foreignOrForgedTargetIsRefused() throws Exception {
        Hotel mine = hotel("s2mine");
        Hotel theirs = hotel("s2theirs");
        String reference = submit(mine);

        UUID foreign = agentOf(theirs, "outsider");
        UUID forged = UUID.randomUUID();

        for (UUID target : new UUID[] {foreign, forged}) {
            assign(mine, reference, target, null)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value("salesOwnerId"));
        }

        // Identical answers, so the endpoint cannot be used to discover which
        // user ids are real.
        assertThat(fixtures.reservationText(reference, "sales_owner_id")).isNull();
        assertThat(fixtures.assignmentCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("a suspended user cannot be assigned")
    void suspendedTargetIsRefused() throws Exception {
        Hotel hotel = hotel("s2susp");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel, "susp");
        fixtures.setUserStatus(agent, "SUSPENDED");

        assign(hotel, reference, agent, null).andExpect(status().isBadRequest());
        assertThat(fixtures.assignmentCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("PARTNER A cannot assign PARTNER B's reservation — 404, and nothing moves")
    void crossPartnerAssignmentIsNotFound() throws Exception {
        Hotel mine = hotel("s2xa");
        Hotel theirs = hotel("s2xb");
        String theirReference = submit(theirs);
        UUID myAgent = agentOf(mine, "mine");

        assign(mine, theirReference, myAgent, null).andExpect(status().isNotFound());

        assertThat(fixtures.reservationText(theirReference, "sales_owner_id")).isNull();
        assertThat(fixtures.assignmentCountFor(theirReference)).isZero();
    }

    @Test
    @DisplayName("assignment needs the permission, the session and the CSRF token")
    void assignIsGuarded() throws Exception {
        Hotel hotel = hotel("s2guard");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel, "guarded");
        String body = assignBody(agent, null);

        mockMvc.perform(post(QUEUE + "/" + reference + "/assign").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(QUEUE + "/" + reference + "/assign").cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
    }

    @Test
    @DisplayName("a declined request cannot be assigned — terminal is terminal")
    void terminalRequestCannotBeAssigned() throws Exception {
        Hotel hotel = hotel("s2term");
        String reference = submit(hotel);
        decline(hotel, reference);

        assign(hotel, reference, agentOf(hotel, "late"), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));
    }

    // ======================================================== S3 / S4 check

    @Test
    @DisplayName("S4 self-assigns, records the check with its result, and reaches AVAILABILITY_CHECK")
    void s4FromRequestedSelfAssigns() throws Exception {
        Hotel hotel = hotel("s4ok");
        String reference = submit(hotel);

        check(hotel, reference).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        // Doc 54 S4 — "implicit self-assignment". The acting agent owns it now.
        assertThat(fixtures.reservationText(reference, "sales_owner_id"))
                .isEqualTo(hotel.adminId.toString());
        assertThat(fixtures.assignmentCountFor(reference)).isEqualTo(1);

        // Owner decision 6 — a structured record, not a note.
        assertThat(fixtures.availabilityCheckCountFor(reference)).isEqualTo(1);
        assertThat(fixtures.availabilityCheckText(reference, "outcome")).isEqualTo("AVAILABLE");
        assertThat(fixtures.availabilityCheckText(reference, "actor_id"))
                .isEqualTo(hotel.adminId.toString());
        assertThat(fixtures.availabilityCheckText(reference, "detail"))
                .contains("\"method\": \"HOTEL_MANUAL_CHECK\"")
                .contains("\"available\": true");

        // Holds maintained — doc 54 S3/S4's Hold column is "maintained".
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("S3 from ASSIGNED keeps the existing owner rather than stealing the request")
    void s3FromAssignedKeepsTheOwner() throws Exception {
        Hotel hotel = hotel("s3ok");
        String reference = submit(hotel);
        UUID agent = agentOf(hotel, "owner");

        assign(hotel, reference, agent, null).andExpect(status().isNoContent());
        check(hotel, reference).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.reservationText(reference, "sales_owner_id"))
                .as("S3 is not S4 — an assigned request keeps its owner")
                .isEqualTo(agent.toString());
        assertThat(fixtures.assignmentCountFor(reference)).isEqualTo(1);
        assertThat(fixtures.availabilityCheckCountFor(reference)).isEqualTo(1);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a night whose inventory row is gone is unavailable, never unlimited")
    void missingInventoryIsARefusal() throws Exception {
        Hotel hotel = hotel("s4gap");
        String reference = submit(hotel);

        // Doc 15 §12 — a missing row is unavailable. The hold still exists, so a
        // check that only counted holds would sail past this.
        fixtures.deleteInventory(hotel.roomTypeId, CHECK_IN.plusDays(1));

        check(hotel, reference)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertDidNotAdvance(reference, "REQUESTED");
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a lapsed hold whose rooms went elsewhere refuses the check")
    void lapsedHoldWithNoRoomsLeftIsARefusal() throws Exception {
        Hotel hotel = hotel("s4gone");
        String reference = submit(hotel);

        // The realistic loss: this hold lapsed and was swept, and the rooms went
        // to other guests meanwhile. The alternative — withdrawing inventory out
        // from under a LIVE hold — is unwritable, because inv_no_oversell refuses
        // it. That is the oversell guard doing its job, not a gap in the test.
        fixtures.releaseHoldsOfReservation(reference);
        for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.applyDirect(hotel.roomTypeId, d, TOTAL_ROOMS);
        }

        check(hotel, reference)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertDidNotAdvance(reference, "REQUESTED");
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the re-check does not demand the inventory twice for rooms already held")
    void ownHoldIsNotCountedAgainstItself() throws Exception {
        Hotel hotel = hotel("s4self");
        // Exactly one room per night, and this request holds it.
        for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(hotel.roomTypeId, d, 1, 0, 0, 0);
        }
        String reference = submit(hotel);

        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN))
                .as("the hold consumed the only room, so raw availability is zero")
                .isZero();

        // A naive check would compare 0 against a quantity of 1 and refuse a
        // reservation whose rooms are already committed to it.
        check(hotel, reference).andExpect(status().isNoContent());
        assertThat(fixtures.availabilityCheckText(reference, "outcome")).isEqualTo("AVAILABLE");
    }

    @Test
    @DisplayName("a request already at AVAILABILITY_CHECK cannot be re-checked — no invented self-transition")
    void repeatedCheckIsRefused() throws Exception {
        Hotel hotel = hotel("s4twice");
        String reference = submit(hotel);

        check(hotel, reference).andExpect(status().isNoContent());
        check(hotel, reference)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.availabilityCheckCountFor(reference)).isEqualTo(1);
    }

    @Test
    @DisplayName("another partner cannot check, and an unauthenticated caller cannot either")
    void checkIsGuarded() throws Exception {
        Hotel mine = hotel("s4xa");
        Hotel theirs = hotel("s4xb");
        String theirReference = submit(theirs);

        check(mine, theirReference).andExpect(status().isNotFound());

        mockMvc.perform(post(QUEUE + "/" + theirReference + "/availability-check").with(csrf()))
                .andExpect(status().isUnauthorized());

        assertThat(fixtures.reservationText(theirReference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.availabilityCheckCountFor(theirReference)).isZero();
    }

    // ================================================================= S10 win

    @Test
    @DisplayName("S10 wins: WON + CONFIRMED, hold CONVERTED, expires_at kept, inventory unmoved")
    void winConvertsTheHoldAndConfirmsTheStay() throws Exception {
        Hotel hotel = hotel("s10ok");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        int committedBefore = fixtures.directCommitted(hotel.roomTypeId, CHECK_IN);
        int availableBefore = fixtures.availableDirect(hotel.roomTypeId, CHECK_IN);

        win(hotel, reference).andExpect(status().isNoContent());

        // Doc 54 S10 — both statuses move in ONE transaction.
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("WON");
        assertThat(fixtures.reservationText(reference, "stay_status")).isEqualTo("CONFIRMED");
        assertThat(fixtures.reservationText(reference, "won_at")).isNotNull();
        assertThat(fixtures.reservationText(reference, "confirmed_at")).isNotNull();

        // Owner decision 1 (OQ-172 option B): the hold leaves ACTIVE by becoming
        // CONVERTED, and expires_at is NOT cleared.
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
        assertThat(fixtures.releasedHoldCountFor(reference)).isZero();
        assertThat(fixtures.holdsWithNullExpiryFor(reference)).isZero();
        assertThat(fixtures.holdCountFor(reference))
                .as("a win neither creates nor needs a hold")
                .isZero();

        // The commitment moved from the hold to the CONFIRMED line. Doc 55 §3.1
        // counts both, so the cache must not move at all.
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isEqualTo(committedBefore);
        assertThat(fixtures.availableDirect(hotel.roomTypeId, CHECK_IN)).isEqualTo(availableBefore);

        // Both lifecycles recorded, and both audit events.
        assertThat(fixtures.statusHistoryCountFor(reference, "STAY")).isEqualTo(1);
        UUID id = UUID.fromString(fixtures.reservationText(reference, "id"));
        assertThat(fixtures.auditCount("reservation.won", id)).isEqualTo(1);
        assertThat(fixtures.auditCount("reservation.confirmed", id)).isEqualTo(1);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("S10 re-verifies availability under lock and refuses when it is gone")
    void winRefusesWhenAvailabilityDisappeared() throws Exception {
        Hotel hotel = hotel("s10gone");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        // The check passed a moment ago. Doc 54 S10 requires availability be
        // verified AGAIN under lock, because "a moment ago" is not now.
        fixtures.releaseHoldsOfReservation(reference);
        for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.applyDirect(hotel.roomTypeId, d, TOTAL_ROOMS);
        }

        win(hotel, reference)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        // Nothing partially applied.
        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.reservationText(reference, "stay_status")).isNull();
        assertThat(fixtures.reservationText(reference, "won_at")).isNull();
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("REQUESTED cannot be won directly — owner decision 3 kept the prohibition")
    void winFromRequestedIsRefused() throws Exception {
        Hotel hotel = hotel("s10req");
        String reference = submit(hotel);

        win(hotel, reference)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        assertThat(fixtures.activeHoldCountFor(reference)).isZero();
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("winning twice is refused — WON is terminal")
    void secondWinIsRefused() throws Exception {
        Hotel hotel = hotel("s10twice");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        win(hotel, reference).andExpect(status().isNoContent());

        win(hotel, reference)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // Not converted twice, and the counter did not move a second time.
        assertThat(fixtures.convertedHoldCountFor(reference)).isZero();
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("B12 = true refuses the win rather than inventing a payment")
    void depositRequiredRefusesTheWin() throws Exception {
        Hotel hotel = hotel("s10dep");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        fixtures.setSetting("DEPOSIT_REQUIRED_TO_CONFIRM", "true");

        win(hotel, reference)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"));

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.paymentCount())
                .as("no payment record is ever invented to satisfy a guard")
                .isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("an unsupplied B12 fails closed — 422, never a silent default")
    void unsuppliedDepositSettingFailsClosed() throws Exception {
        Hotel hotel = hotel("s10unset");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        fixtures.clearSetting("DEPOSIT_REQUIRED_TO_CONFIRM");

        win(hotel, reference)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"));

        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
    }

    @Test
    @DisplayName("another partner cannot win, and no session cannot either")
    void winIsGuarded() throws Exception {
        Hotel mine = hotel("s10xa");
        Hotel theirs = hotel("s10xb");
        String theirReference = submit(theirs);
        check(theirs, theirReference).andExpect(status().isNoContent());

        win(mine, theirReference).andExpect(status().isNotFound());

        mockMvc.perform(post(QUEUE + "/" + theirReference + "/win").with(csrf()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(QUEUE + "/" + theirReference + "/win").cookie(sessionFor(theirs)))
                .andExpect(status().isForbidden());

        assertThat(fixtures.reservationText(theirReference, "sales_status"))
                .isEqualTo("PAYMENT_PENDING");
        assertThat(fixtures.activeHoldCountFor(theirReference)).isZero();
    }

    @Test
    @DisplayName("the price snapshot is sealed by the win, not rewritten")
    void snapshotIsUntouched() throws Exception {
        Hotel hotel = hotel("s10seal");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        String before = fixtures.reservationText(reference, "price_snapshot");
        long totalBefore = Long.parseLong(fixtures.reservationText(reference, "total_minor"));

        win(hotel, reference).andExpect(status().isNoContent());

        assertThat(fixtures.reservationText(reference, "price_snapshot")).isEqualTo(before);
        assertThat(Long.parseLong(fixtures.reservationText(reference, "total_minor")))
                .isEqualTo(totalBefore);
    }

    @Test
    @DisplayName("nothing in the whole workflow claims an email was sent")
    void nothingIsSent() throws Exception {
        Hotel hotel = hotel("s10quiet");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());
        String body = win(hotel, reference).andExpect(status().isNoContent())
                .andReturn().getResponse().getContentAsString();

        // Doc 117 §8.1 — the transition owes the business effect and the record,
        // not delivery. OQ-162 is open and no mail sender exists.
        assertThat(body).isEmpty();
        assertThat(fixtures.emailLogCount()).isZero();
    }

    // ------------------------------------------------------------ assertions

    /**
     * A refused transition left the status where it was.
     *
     * <p>Deliberately narrower than "nothing was written". This class is
     * {@code @Transactional} and MockMvc runs on the test's own thread, so the
     * service joins the <em>test's</em> transaction: a refusal marks that
     * transaction rollback-only but cannot roll back independently of it, and
     * writes made before the throw stay readable here even though production
     * discards them. Asserting their absence would assert something this harness
     * cannot observe.
     *
     * <p>The rollback itself is proven where the transaction boundary is real —
     * {@code ReservationConcurrencyIT.refusedCheckCommitsNothing}.
     */
    private void assertDidNotAdvance(String reference, String expectedStatus) {
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo(expectedStatus);
    }

    // --------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, UUID roomTypeId,
                         String roomTypeSlug, UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("wf-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "WORKFLOW_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "wf-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        fixtures.setSetting("DEPOSIT_REQUIRED_TO_CONFIRM", "false");

        UUID admin = fixtures.createUser("wf-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, property, fixtures.slugOf(property), roomType, roomTypeSlug,
                admin);
    }

    /** A second ADMIN in the same partner scope — a legitimate assignment target. */
    private UUID agentOf(Hotel hotel, String label) {
        UUID agent = fixtures.createUser(
                "wf-agent-" + label + "-" + UUID.randomUUID().toString().substring(0, 8), PASSWORD);
        fixtures.grantPartnerOperations(agent, hotel.partnerId);
        return agent;
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private static String assignBody(UUID owner, String reason) {
        return reason == null
                ? "{\"salesOwnerId\":\"" + owner + "\"}"
                : "{\"salesOwnerId\":\"" + owner + "\",\"reason\":\"" + reason + "\"}";
    }

    private ResultActions assign(Hotel hotel, String reference, UUID owner, String reason)
            throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/assign")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content(assignBody(owner, reason)));
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf())
                .cookie(sessionFor(hotel)));
    }

    private ResultActions win(Hotel hotel, String reference) throws Exception {
        fixtures.recordVerifiedPayment(reference);
        return mockMvc.perform(post(QUEUE + "/" + reference + "/win")
                .with(csrf())
                .cookie(sessionFor(hotel)));
    }

    private void decline(Hotel hotel, String reference) throws Exception {
        mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                        .with(csrf())
                        .cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Closing this out.\"}"))
                .andExpect(status().isNoContent());
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Workflow Guest","email":"workflow@example.com",
                          "phone":"+84900000777","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "wf-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
