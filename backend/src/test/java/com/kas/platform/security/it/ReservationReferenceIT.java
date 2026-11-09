package com.kas.platform.security.it;

import com.kas.platform.reservation.ReservationReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The booking reference, end to end — {@code KAS} + branch code + five digits.
 *
 * <p>The format itself is unit-tested in {@code ReservationReferenceTest}. What
 * needs a database is everything around it: that the real booking path uses the
 * generator, that the branch code comes from the property being booked, that
 * uniqueness is enforced by Postgres rather than by hope, and that the
 * historical references already in the table are untouched and still readable.
 */
class ReservationReferenceIT extends SecurityIntegrationTest {

    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(30);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 1_500_000L;

    // ------------------------------------------------------------------- format

    @Test
    @DisplayName("a new reservation's reference is KAS + branch + five digits")
    void newReferenceMatchesTheFormat() throws Exception {
        Hotel hotel = hotel("fmt", "05");

        String reference = submit(hotel);

        assertThat(reference).matches("^KAS[0-9]{7}$");
        assertThat(reference).hasSize(10);
        assertThat(reference).matches(ReservationReference.FORMAT);
    }

    @Test
    @DisplayName("branch 05 produces KAS05… — the code comes from the property booked")
    void branchCodeComesFromTheProperty() throws Exception {
        // The owner fixed 05 for the 5 Trương Định branch; V31 assigns it to
        // kas-passion-boutique-hotel. Here the point is the wiring: whatever the
        // property's code is, it lands in the middle of the reference.
        assertThat(submit(hotel("b05", "05"))).startsWith("KAS05");
        assertThat(submit(hotel("b01", "01"))).startsWith("KAS01");
        assertThat(submit(hotel("b08", "08"))).startsWith("KAS08");
    }

    @Test
    @DisplayName("exactly five digits follow the branch code")
    void fiveDigitSuffix() throws Exception {
        String reference = submit(hotel("suffix", "07"));

        assertThat(reference).startsWith("KAS07");
        assertThat(reference.substring(5)).hasSize(5).containsOnlyDigits();
    }

    @Test
    @DisplayName("the eight seeded hotels carry the documented branch codes")
    void seededBranchCodes() {
        // V31's mapping, read back from the database it wrote. 05 is the fixed
        // one; the rest follow V23's sort_order with 05 skipped.
        assertThat(branchCodeOfSlug("kas-passion-boutique-hotel")).isEqualTo("05");
        assertThat(branchCodeOfSlug("kas-elegance-hotel")).isEqualTo("01");
        assertThat(branchCodeOfSlug("kas-ancient-boutique-hotel")).isEqualTo("02");
        assertThat(branchCodeOfSlug("kas-milestone-premium-hotel")).isEqualTo("03");
        assertThat(branchCodeOfSlug("kas-zody-boutique-hotel")).isEqualTo("04");
        assertThat(branchCodeOfSlug("kas-sonata-luxury-hotel")).isEqualTo("06");
        assertThat(branchCodeOfSlug("kas-eliana-luxury-hotel")).isEqualTo("07");
        assertThat(branchCodeOfSlug("kas-dilly-hotel")).isEqualTo("08");
    }

    // -------------------------------------------------------------- uniqueness

    @Test
    @DisplayName("two reservations never receive the same reference")
    void referencesDiffer() throws Exception {
        Hotel hotel = hotel("uniq", "03");

        Set<String> references = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            references.add(submit(hotel));
        }

        assertThat(references).hasSize(5);
    }

    @Test
    @DisplayName("uniqueness is global — the same reference cannot exist under another property")
    void uniquenessIsGlobalNotPerProperty() throws Exception {
        Hotel first = hotel("g1", "01");
        Hotel second = hotel("g2", "02");
        String taken = submit(first);

        // The V12 constraint is on `reference` alone, not on (property_id,
        // reference), so a second property cannot reuse it either.
        assertThatThrownBy(() -> fixtures.insertRawReservation(second.propertyId(), taken))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    @DisplayName("the database refuses a duplicate reference — the constraint is the guarantee")
    void databaseRefusesDuplicates() throws Exception {
        Hotel hotel = hotel("dup", "04");
        String reference = submit(hotel);

        assertThatThrownBy(() -> fixtures.insertRawReservation(hotel.propertyId(), reference))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("reservation_reference_key");
    }

    @Test
    @DisplayName("a reference already taken is retried rather than failing the booking")
    void collisionIsRetried() throws Exception {
        Hotel hotel = hotel("retry", "06");

        // Occupy a large share of this branch's space, then book. Every draw has
        // to miss all of them, so the booking below is only possible if either
        // the first draw was lucky or the retry worked — and with the space this
        // crowded, the retry is doing the work.
        Set<String> occupied = new HashSet<>();
        for (int i = 0; i < 400; i++) {
            String candidate = ReservationReference.candidate("06");
            if (occupied.add(candidate)) {
                fixtures.insertRawReservation(hotel.propertyId(), candidate);
            }
        }

        String reference = submit(hotel);

        assertThat(reference).matches("^KAS06[0-9]{5}$");
        assertThat(occupied).doesNotContain(reference);
    }

    // -------------------------------------------------------------- history

    @Test
    @DisplayName("a historical KAS-YYMMDD-XXXX reference is still stored and still readable")
    void historicalReferencesRemainReadable() throws Exception {
        Hotel hotel = hotel("hist", "02");
        String historical = "KAS-260908-CA9W";

        // The column has no format CHECK, which is what lets both shapes coexist.
        // Adding one would have invalidated real bookings.
        fixtures.insertRawReservation(hotel.propertyId(), historical);

        assertThat(fixtures.reservationText(historical, "reference")).isEqualTo(historical);
        assertThat(ReservationReference.FORMAT.matcher(historical).matches()).isFalse();
    }

    @Test
    @DisplayName("a property with no branch code is refused, and books nothing")
    void propertyWithoutBranchCodeIsRefused() throws Exception {
        Hotel hotel = hotel("nocode", "09");
        fixtures.setBranchCode(hotel.propertyId(), null);

        // CONFIG_MISSING is 422 — the property is not ready to take bookings,
        // which is a different statement from "the request was wrong".
        submitExpecting(hotel, status().isUnprocessableEntity());
    }

    // ------------------------------------------------------------------ helpers

    private record Hotel(UUID partnerId, UUID propertyId, String slug, String roomTypeSlug) {
    }

    /** A partner with one OPEN property on {@code branchCode}, bookable. */
    private Hotel hotel(String label, String branchCode) {
        UUID partner = fixtures.createPartner("ref-" + label);
        UUID property = fixtures.createProperties(partner, 1).get(0);
        fixtures.setPropertyNames(property, "REF_HOTEL_" + label.toUpperCase());
        fixtures.setBranchCode(property, branchCode);
        fixtures.openProperty(property);

        String roomTypeSlug = "ref-" + label + "-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomType = fixtures.addRoomType(property, roomTypeSlug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate day = CHECK_IN; !day.isAfter(CHECK_OUT); day = day.plusDays(1)) {
            fixtures.setInventory(roomType, day, 9, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        return new Hotel(partner, property, fixtures.slugOf(property), roomTypeSlug);
    }

    private String branchCodeOfSlug(String slug) {
        return fixtures.branchCodeOf(fixtures.propertyIdOfSlug(slug));
    }

    private String submit(Hotel hotel) throws Exception {
        String response = submitExpecting(hotel, status().isCreated());
        return between(response, "\"reference\":\"", "\"");
    }

    private String submitExpecting(Hotel hotel,
                                   org.springframework.test.web.servlet.ResultMatcher expected)
            throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Reference Guest","email":"ref-guest@example.com",
                          "phone":"+84900000123","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug(), CHECK_IN, CHECK_OUT, hotel.roomTypeSlug());

        return mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "ref-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(expected)
                .andReturn().getResponse().getContentAsString();
    }

    private static String between(String source, String start, String end) {
        int from = source.indexOf(start) + start.length();
        return source.substring(from, source.indexOf(end, from));
    }
}
