package com.kas.platform.security.it;

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
 * Step 16A.34 — {@code GET /public/reservations/requests/{reference}/sent}.
 *
 * <p>Doc 58 §3 froze the route as <em>"Confirmation screen data"</em> and nothing
 * served it, so a guest's receipt lived only in the browser that submitted it: a
 * reload lost the reference. The receipt was already persisted — S1 stores the
 * exact {@code 201} body in {@code reservation_request_idempotency}, and that
 * table already indexes {@code reservation_id} — so this reads it back by
 * reference rather than rebuilding it.
 *
 * <p>Reading back the stored body is the point. A receipt rebuilt today could
 * differ from the one the guest was shown, and a confirmation screen that
 * quietly changes is worse than one that cannot be reopened.
 */
class RequestReceiptIT extends SecurityIntegrationTest {

    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(30);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 1_850_000L;

    // ------------------------------------------------------------------ the receipt

    @Test
    @DisplayName("the receipt is the body the 201 returned, field for field")
    void returnsTheStoredReceipt() throws Exception {
        Fixture f = property();
        String created = submit(f).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String reference = referenceOf(created);

        String recovered = mockMvc.perform(get(sentRoute(reference)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Not "equivalent" — identical. The stored snapshot is what is served.
        assertThat(recovered).isEqualTo(created);
    }

    @Test
    @DisplayName("it carries the frozen receipt fields and nothing else")
    void carriesTheFrozenFields() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f).andReturn().getResponse().getContentAsString());

        mockMvc.perform(get(sentRoute(reference)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reference").value(reference))
                // Doc 58 §3.3's literal — "the literal the guest is shown, never
                // a lifecycle value".
                .andExpect(jsonPath("$.status").value("REQUEST_RECEIVED"))
                .andExpect(jsonPath("$.responsePromise").exists())
                .andExpect(jsonPath("$.trackingUrlIssued").value(false))
                .andExpect(jsonPath("$.estimatedTotal.amountMinor").value(Vat.with(RATE * 2)))
                .andExpect(jsonPath("$.estimatedTotal.currency").value("VND"))
                .andExpect(jsonPath("$.estimateDisclaimer").exists());
    }

    @Test
    @DisplayName("it discloses no guest detail, no identifier and no partner data")
    void leaksNothing() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f).andReturn().getResponse().getContentAsString());

        String body = mockMvc.perform(get(sentRoute(reference)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // The route takes a bare reference and no token, so what it returns must
        // be safe to hand anyone holding one. The guest's own contact details are
        // in the request; they are not in the receipt.
        assertThat(body)
                .doesNotContain("Nguyen", "guest@", "+84", "guestName", "guestEmail",
                        "guestPhone", "specialRequests")
                .doesNotContain("reservationId", "propertyId", "partnerId", "id\":",
                        "idempotency", "priceSnapshot", "fingerprint")
                .doesNotContain("salesStatus", "stayStatus", "salesOwner");
    }

    @Test
    @DisplayName("the status stays the guest's literal as the request is worked")
    void reportsNoLifecycleProgress() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f).andReturn().getResponse().getContentAsString());

        // A guessable reference must not become a way to learn whether a booking
        // was won or declined. The receipt is what was sent, not where it got to.
        fixtures.setSalesStatus(reference, "WON");

        mockMvc.perform(get(sentRoute(reference)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REQUEST_RECEIVED"))
                .andExpect(jsonPath("$.reference").value(reference));
    }

    // ------------------------------------------------------------------ not found

    @Test
    @DisplayName("a reference that was never issued a receipt is 404")
    void unknownReferenceIsNotFound() throws Exception {
        mockMvc.perform(get(sentRoute("KAS-260101-ZZZZ")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("a malformed reference is the same 404, not a different answer")
    void malformedReferenceIsNotFound() throws Exception {
        // Doc 85 §6.3 — a reference is an identifier, never a credential. "No
        // such request" and "not a request at all" must be indistinguishable.
        mockMvc.perform(get(sentRoute("not-a-reference"))).andExpect(status().isNotFound());
        mockMvc.perform(get(sentRoute("KAS-000000-0000"))).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the route needs no session and creates nothing")
    void isPublicAndReadOnly() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f).andReturn().getResponse().getContentAsString());
        long before = fixtures.reservationCount();

        // No cookie, no CSRF token — a guest reopening a link has neither.
        mockMvc.perform(get(sentRoute(reference))).andExpect(status().isOk());

        assertThat(fixtures.reservationCount()).isEqualTo(before);
    }

    @Test
    @DisplayName("submission is unchanged — the receipt still arrives with the 201")
    void submissionStillWorks() throws Exception {
        Fixture f = property();

        submit(f).andExpect(status().isCreated())
                .andExpect(jsonPath("$.reference").exists())
                .andExpect(jsonPath("$.status").value("REQUEST_RECEIVED"));

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.idempotencyCount()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(String propertySlug, String roomTypeSlug) {
    }

    private Fixture property() {
        UUID partnerId = fixtures.createPartner("receipt");
        UUID propertyId = fixtures.createProperties(partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);

        String roomTypeSlug = "deluxe-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomTypeId = fixtures.addRoomType(propertyId, roomTypeSlug);
        fixtures.publishRoomType(roomTypeId);
        fixtures.setBasePrice(roomTypeId, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomTypeId, d, 9, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");
        return new Fixture(fixtures.slugOf(propertyId), roomTypeSlug);
    }

    private static String sentRoute(String reference) {
        return "/api/v1/public/reservations/requests/" + reference + "/sent";
    }

    private ResultActions submit(Fixture f) throws Exception {
        String payload = """
                {"propertySlug":"%s",
                 "checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Nguyen Van An","email":"guest@example.invalid",
                          "phone":"+84901234567","country":"VN",
                          "preferredChannel":"ZALO","bestTimeToContact":null},
                 "specialRequests":"A high floor, please.",
                 "discoveryChannel":"TIKTOK","offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3",
                 "marketingConsent":false,"locale":"en"}
                """.formatted(f.propertySlug, CHECK_IN, CHECK_OUT, f.roomTypeSlug);

        return mockMvc.perform(post("/api/v1/public/reservations/requests")
                .with(csrf())
                .header("Idempotency-Key", "receipt-" + UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload));
    }

    private static String referenceOf(String body) {
        int start = body.indexOf("\"reference\":\"") + 13;
        return body.substring(start, body.indexOf('"', start));
    }
}
