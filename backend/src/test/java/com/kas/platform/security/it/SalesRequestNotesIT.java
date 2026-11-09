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
 * Internal notes — doc 58 §5, <em>"Internal. No guest surface exists"</em>.
 *
 * <h2>What these tests guard</h2>
 *
 * A note is free text an agent types about a guest, stored in a table V14 calls
 * <em>"INTERNAL. NEVER guest-visible."</em> So the assertions that matter are
 * that it stays inside the owning partner, that the author is the session rather
 * than anything the caller sent, and that writing one moves nothing else in the
 * system.
 */
class SalesRequestNotesIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "notes-password-2286";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(101);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 550_000L;
    private static final int TOTAL_ROOMS = 4;

    private static final String QUEUE = "/api/v1/admin/sales/requests";

    // ------------------------------------------------------------ read/write

    @Test
    @DisplayName("a partner can write a note and read it back")
    void writeThenRead() throws Exception {
        Hotel hotel = hotel("basic");
        String reference = submit(hotel);

        addNote(hotel, reference, "Guest asked about a late checkout.")
                .andExpect(status().isNoContent());

        notes(hotel, reference)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].body").value("Guest asked about a late checkout."))
                .andExpect(jsonPath("$[0].createdAt").exists());
    }

    @Test
    @DisplayName("a request with no notes is an empty list, not an error")
    void emptyIsSuccess() throws Exception {
        Hotel hotel = hotel("empty");
        String reference = submit(hotel);

        notes(hotel, reference)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("several notes are all kept, newest first")
    void manyNotesNewestFirst() throws Exception {
        Hotel hotel = hotel("many");
        String reference = submit(hotel);

        addNote(hotel, reference, "First").andExpect(status().isNoContent());
        addNote(hotel, reference, "Second").andExpect(status().isNoContent());
        addNote(hotel, reference, "Third").andExpect(status().isNoContent());

        // V14's own index is (reservation_id, created_at DESC) — the order the
        // table was built to be read in, and what a notes panel is read for.
        notes(hotel, reference)
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].body").value("Third"))
                .andExpect(jsonPath("$[1].body").value("Second"))
                .andExpect(jsonPath("$[2].body").value("First"));
    }

    @Test
    @DisplayName("the order is the same on every read")
    void orderingIsDeterministic() throws Exception {
        Hotel hotel = hotel("stable");
        String reference = submit(hotel);
        for (String body : new String[] {"a", "b", "c", "d"}) {
            addNote(hotel, reference, body).andExpect(status().isNoContent());
        }

        String first = notes(hotel, reference).andReturn().getResponse().getContentAsString();
        String second = notes(hotel, reference).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
    }

    @Test
    @DisplayName("a note can be written after the request reaches a terminal state")
    void notesSurviveTerminalStates() throws Exception {
        Hotel hotel = hotel("terminal");
        String reference = submit(hotel);
        decline(hotel, reference).andExpect(status().isNoContent());

        // Doc 54 freezes salesStatus, not the team's ability to write down what
        // happened afterwards. A note is not a transition.
        addNote(hotel, reference, "Guest called back after we declined.")
                .andExpect(status().isNoContent());
        notes(hotel, reference).andExpect(jsonPath("$.length()").value(1));
    }

    // --------------------------------------------------------------- authorship

    @Test
    @DisplayName("no author identity is returned, and none can be supplied")
    void authorshipIsStoredButNotDisclosed() throws Exception {
        Hotel hotel = hotel("author");
        String reference = submit(hotel);
        addNote(hotel, reference, "Written by the session, not the body.")
                .andExpect(status().isNoContent());

        String body = notes(hotel, reference).andReturn().getResponse().getContentAsString();

        // app_user has no name column and doc 134 §5 leaves staff-identity
        // disclosure open. The row records an admin_id; the response says nothing.
        assertThat(body).doesNotContain("adminId").doesNotContain("author")
                .doesNotContain(hotel.adminId.toString())
                .doesNotContain(fixtures.emailOf(hotel.adminId));

        // And the author is the session: the row carries this admin's id even
        // though the request body could not name anyone.
        assertThat(fixtures.noteAdminId(reference)).isEqualTo(hotel.adminId.toString());
    }

    @Test
    @DisplayName("a caller cannot name an author, a timestamp or another reservation")
    void undocumentedFieldsAreRefused() throws Exception {
        Hotel hotel = hotel("spoof");
        String reference = submit(hotel);
        Hotel other = hotel("victim");
        String otherReference = submit(other);

        for (String extra : new String[] {
                "\"adminId\":\"" + UUID.randomUUID() + "\"",
                "\"createdAt\":\"2020-01-01T00:00:00Z\"",
                "\"reservationId\":\"" + UUID.randomUUID() + "\"",
                "\"partnerId\":\"" + UUID.randomUUID() + "\"",
        }) {
            mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                            .with(csrf()).cookie(sessionFor(hotel))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"body\":\"note\"," + extra + "}"))
                    .andExpect(status().isBadRequest());
        }

        // fail-on-unknown-properties refuses them outright, so nothing was
        // written here or anywhere else.
        assertThat(fixtures.noteCountFor(reference)).isZero();
        assertThat(fixtures.noteCountFor(otherReference)).isZero();
    }

    // ---------------------------------------------------------------- guards

    @Test
    @DisplayName("a blank note is refused — the table's own CHECK, caught at the edge")
    void blankIsRefused() throws Exception {
        Hotel hotel = hotel("blank");
        String reference = submit(hotel);

        for (String blank : new String[] {"", "   ", "\\t"}) {
            mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                            .with(csrf()).cookie(sessionFor(hotel))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"body\":\"" + blank + "\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        assertThat(fixtures.noteCountFor(reference)).isZero();
    }

    @Test
    @DisplayName("an oversized note is refused rather than truncated")
    void oversizedIsRefused() throws Exception {
        Hotel hotel = hotel("long");
        String reference = submit(hotel);

        mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                        .with(csrf()).cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + "x".repeat(4001) + "\"}"))
                .andExpect(status().isBadRequest());

        // Silently truncating would lose what the agent wrote.
        assertThat(fixtures.noteCountFor(reference)).isZero();

        addNote(hotel, reference, "y".repeat(4000)).andExpect(status().isNoContent());
        assertThat(fixtures.noteCountFor(reference)).isEqualTo(1);
    }

    @Test
    @DisplayName("PARTNER A cannot read or write PARTNER B's notes")
    void crossPartnerIsRefused() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String theirReference = submit(theirs);
        addNote(theirs, theirReference, "Their private note.")
                .andExpect(status().isNoContent());

        notes(mine, theirReference).andExpect(status().isNotFound());
        addNote(mine, theirReference, "Injected.").andExpect(status().isNotFound());

        // Their note is untouched and still theirs alone.
        assertThat(fixtures.noteCountFor(theirReference)).isEqualTo(1);
        notes(theirs, theirReference)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].body").value("Their private note."));
    }

    @Test
    @DisplayName("an unknown reference is 404 for both verbs")
    void unknownReferenceIsNotFound() throws Exception {
        Hotel hotel = hotel("unknown");

        notes(hotel, "KAS-999999-XXXX").andExpect(status().isNotFound());
        addNote(hotel, "KAS-999999-XXXX", "note").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("notes need a session, and writing needs the CSRF token")
    void authenticationAndCsrfAreRequired() throws Exception {
        Hotel hotel = hotel("guard");
        String reference = submit(hotel);

        mockMvc.perform(get(QUEUE + "/" + reference + "/notes"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"note\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                        .cookie(sessionFor(hotel))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"note\"}"))
                .andExpect(status().isForbidden());

        assertThat(fixtures.noteCountFor(reference)).isZero();
    }

    // ------------------------------------------------------------- isolation

    @Test
    @DisplayName("writing a note moves nothing else in the system")
    void aNoteChangesNothingElse() throws Exception {
        Hotel hotel = hotel("inert");
        String reference = submit(hotel);
        check(hotel, reference).andExpect(status().isNoContent());

        int committedBefore = fixtures.directCommitted(hotel.roomTypeId, CHECK_IN);
        long holdsBefore = fixtures.activeHoldCountFor(reference);
        long historyBefore = fixtures.statusHistoryCountFor(reference, "SALES");

        addNote(hotel, reference, "Just writing something down.")
                .andExpect(status().isNoContent());

        // A note is informational. It is not a transition, a contact, or a
        // message to anyone.
        assertThat(fixtures.reservationText(reference, "sales_status"))
                .isEqualTo("AVAILABILITY_CHECK");
        assertThat(fixtures.directCommitted(hotel.roomTypeId, CHECK_IN)).isEqualTo(committedBefore);
        assertThat(fixtures.activeHoldCountFor(reference)).isEqualTo(holdsBefore);
        assertThat(fixtures.statusHistoryCountFor(reference, "SALES")).isEqualTo(historyBefore);
        assertThat(fixtures.contactLogCountFor(reference)).isZero();
        assertThat(fixtures.emailLogCount()).isZero();
    }

    @Test
    @DisplayName("a note never reaches the guest's own request receipt")
    void notesAreNotGuestVisible() throws Exception {
        Hotel hotel = hotel("private");
        String reference = submit(hotel);
        addNote(hotel, reference, "SECRET_INTERNAL_MARKER").andExpect(status().isNoContent());

        // Doc 21 §604, CONFIRMED: "The public customer must never see internal
        // notes." V14 keeps them in a separate table from reservation_message
        // precisely so no flag can flip one guest-facing.
        String receipt = mockMvc.perform(
                        get("/api/v1/public/reservations/requests/" + reference + "/sent"))
                .andReturn().getResponse().getContentAsString();

        assertThat(receipt).doesNotContain("SECRET_INTERNAL_MARKER");
    }

    // --------------------------------------------------------------- helpers

    private record Hotel(UUID partnerId, String slug, UUID roomTypeId, String roomTypeSlug,
                         UUID adminId) {
    }

    private Hotel hotel(String label) {
        UUID partner = fixtures.createPartner("nt-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "NOTES_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String roomTypeSlug = "nt-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        UUID admin = fixtures.createUser("nt-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partner);

        return new Hotel(partner, fixtures.slugOf(property), roomType, roomTypeSlug, admin);
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions notes(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(get(QUEUE + "/" + reference + "/notes").cookie(sessionFor(hotel)));
    }

    private ResultActions addNote(Hotel hotel, String reference, String body) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/notes")
                .with(csrf())
                .cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"" + body.replace("\"", "\\\"") + "\"}"));
    }

    private ResultActions check(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/availability-check")
                .with(csrf()).cookie(sessionFor(hotel)));
    }

    private ResultActions decline(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(post(QUEUE + "/" + reference + "/decline")
                .with(csrf()).cookie(sessionFor(hotel))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Not available.\"}"));
    }

    private String submit(Hotel hotel) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Notes Guest","email":"notes@example.com",
                          "phone":"+84900000777","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, hotel.roomTypeSlug);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "nt-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }
}
