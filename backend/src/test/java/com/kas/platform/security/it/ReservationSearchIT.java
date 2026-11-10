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
 * The reservation workspace — doc 58 §6, {@code GET /admin/ops/reservations}.
 *
 * <h2>What these tests are really guarding</h2>
 *
 * A search box is the most dangerous read in an application: it invites a caller
 * to ask "show me the rows matching this", and a predicate applied in the wrong
 * order — or instead of the scope rather than beside it — would answer honestly
 * about somebody else's bookings. Worse, a <em>count</em> can leak what a list
 * does not: a total computed over a wider population reports that other
 * partners' reservations exist without ever displaying one.
 *
 * <p>So the cross-partner cases below are not ceremony. Every filter, the text
 * term, the page metadata and the direct detail read are each checked against
 * another partner's data.
 */
class ReservationSearchIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "reservation-search-4417";
    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(120);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 900_000L;
    private static final int TOTAL_ROOMS = 9;

    private static final String SEARCH = "/api/v1/admin/ops/reservations";
    private static final String SALES = "/api/v1/admin/sales/requests";

    // ------------------------------------------------------------ the basics

    @Test
    @DisplayName("own-scope reservations are returned, newest first")
    void ownReservationsAreVisible() throws Exception {
        Hotel hotel = hotel("own");
        String older = submit(hotel);
        fixtures.backdateCreatedAt(older, 3);
        String newer = submit(hotel);

        // created_at DESC — a lookup shows the most recent booking first, unlike
        // the sales queue, which is oldest-first because it is a worklist.
        assertThat(references(search(hotel, ""))).containsExactly(newer, older);
        search(hotel, "").andExpect(jsonPath("$.total").value(2));
    }

    @Test
    @DisplayName("an empty parameter is treated as absent, not as an empty match")
    void blankParametersAreAbsent() throws Exception {
        Hotel hotel = hotel("blank");
        String reference = submit(hotel);

        assertThat(references(search(hotel,
                "&q=&stayStatus=&channelType=&property=&roomType=")))
                .containsExactly(reference);
    }

    // --------------------------------------------------------- text search

    @Test
    @DisplayName("an exact booking reference finds exactly one reservation")
    void findsByExactReference() throws Exception {
        Hotel hotel = hotel("exact");
        String wanted = submit(hotel);
        submit(hotel);

        assertThat(references(search(hotel, "&q=" + wanted))).containsExactly(wanted);
        search(hotel, "&q=" + wanted).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    @DisplayName("a partial reference matches — an operator reads the last four characters aloud")
    void findsByPartialReference() throws Exception {
        Hotel hotel = hotel("partial");
        String reference = submit(hotel);

        String tail = reference.substring(reference.length() - 4);
        assertThat(references(search(hotel, "&q=" + tail))).contains(reference);
        // And case does not matter: the reference is upper-case, the operator's
        // typing may not be.
        assertThat(references(search(hotel, "&q=" + tail.toLowerCase())))
                .contains(reference);
    }

    @Test
    @DisplayName("a guest's name finds their reservation, including a partial and a diacritic")
    void findsByGuestName() throws Exception {
        Hotel hotel = hotel("name");
        String wanted = submit(hotel);
        String other = submit(hotel);
        fixtures.setGuest(wanted, "Nguyễn Văn An", "an@example.invalid", "0901234567");
        fixtures.setGuest(other, "Trần Thị Bình", "binh@example.invalid", "0987654321");

        assertThat(references(search(hotel, "&q=Nguyễn"))).containsExactly(wanted);
        assertThat(references(search(hotel, "&q=Văn An"))).containsExactly(wanted);
        assertThat(references(search(hotel, "&q=Trần"))).containsExactly(other);
    }

    @Test
    @DisplayName("a phone number finds the reservation")
    void findsByPhone() throws Exception {
        Hotel hotel = hotel("phone");
        String wanted = submit(hotel);
        submit(hotel);
        fixtures.setGuest(wanted, "Phone Guest", "phone@example.invalid", "0901234567");

        assertThat(references(search(hotel, "&q=0901234567"))).containsExactly(wanted);
        // A partial, because an operator reads a number back in fragments.
        assertThat(references(search(hotel, "&q=1234567"))).containsExactly(wanted);
    }

    @Test
    @DisplayName("an email address finds the reservation, case-insensitively")
    void findsByEmail() throws Exception {
        Hotel hotel = hotel("email");
        String wanted = submit(hotel);
        submit(hotel);
        fixtures.setGuest(wanted, "Email Guest", "Cuong.Le@example.invalid", "0912000333");

        assertThat(references(search(hotel, "&q=cuong.le@example.invalid")))
                .containsExactly(wanted);
        assertThat(references(search(hotel, "&q=CUONG.LE"))).containsExactly(wanted);
    }

    @Test
    @DisplayName("a LIKE wildcard is searched for literally, not honoured")
    void wildcardsAreLiteral() throws Exception {
        Hotel hotel = hotel("wildcard");
        submit(hotel);
        submit(hotel);

        // Without escaping, "%" would match every reservation in scope — a search
        // box that had silently stopped filtering.
        assertThat(references(search(hotel, "&q=%25"))).isEmpty();
        assertThat(references(search(hotel, "&q=_"))).isEmpty();
        search(hotel, "&q=%25").andExpect(jsonPath("$.total").value(0));
    }

    @Test
    @DisplayName("a term matching nothing is an empty page, not an error")
    void unmatchedTermIsEmpty() throws Exception {
        Hotel hotel = hotel("nomatch");
        submit(hotel);

        search(hotel, "&q=KAS-000000-ZZZZ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.total").value(0));
    }

    // ----------------------------------------------------------- the filters

    @Test
    @DisplayName("property narrows to one hotel, by slug and never by id")
    void filtersByProperty() throws Exception {
        Partner partner = partner("prop");
        Hotel one = hotelFor(partner, "propa");
        Hotel two = hotelFor(partner, "propb");
        String a = submit(one);
        String b = submit(two);

        assertThat(references(search(one, "&property=" + one.slug))).containsExactly(a);
        assertThat(references(search(one, "&property=" + two.slug))).containsExactly(b);
        assertThat(references(search(one, ""))).containsExactlyInAnyOrder(a, b);
    }

    @Test
    @DisplayName("an unknown property slug is an empty page, not an error or an oracle")
    void unknownPropertyIsEmpty() throws Exception {
        Hotel hotel = hotel("nosuchprop");
        submit(hotel);

        assertThat(references(search(hotel, "&property=does-not-exist-anywhere"))).isEmpty();
    }

    @Test
    @DisplayName("stayStatus selects the operational lifecycle — and a NULL one is not a status")
    void filtersByStayStatus() throws Exception {
        Hotel hotel = hotel("stay");
        String unconfirmed = submit(hotel);
        String confirmed = submit(hotel);
        fixtures.setStayStatus(confirmed, "CONFIRMED");
        String checkedIn = submit(hotel);
        fixtures.setStayStatus(checkedIn, "CHECKED_IN");

        assertThat(references(search(hotel, "&stayStatus=CONFIRMED")))
                .containsExactly(confirmed);
        assertThat(references(search(hotel, "&stayStatus=CHECKED_IN")))
                .containsExactly(checkedIn);
        // A request with no stay status yet is in neither: V12 makes stay_status
        // NULL until the stay is confirmed, and NULL matches no enum value.
        assertThat(references(search(hotel, "&stayStatus=NO_SHOW"))).isEmpty();
        assertThat(references(search(hotel, "")))
                .containsExactlyInAnyOrder(unconfirmed, confirmed, checkedIn);
    }

    @Test
    @DisplayName("stayStatus accepts a group of states, for the console's four filters")
    void filtersBySeveralStayStatuses() throws Exception {
        // The console offers four operational groups over the seven states V1:54
        // has — "khách đã tới" is CHECKED_IN, CHECKED_OUT and COMPLETED. A single
        // value could not express that, so the existing parameter takes a list.
        Hotel hotel = hotel("staygroup");
        String unconfirmed = submit(hotel);
        String confirmed = submit(hotel);
        fixtures.setStayStatus(confirmed, "CONFIRMED");
        String ready = submit(hotel);
        fixtures.setStayStatus(ready, "CHECK_IN_READY");
        String checkedIn = submit(hotel);
        fixtures.setStayStatus(checkedIn, "CHECKED_IN");
        String completed = submit(hotel);
        fixtures.setStayStatus(completed, "COMPLETED");
        String cancelled = submit(hotel);
        fixtures.setStayStatus(cancelled, "CANCELLED");

        // "Đã đặt"
        assertThat(references(search(hotel, "&stayStatus=CONFIRMED,CHECK_IN_READY")))
                .containsExactlyInAnyOrder(confirmed, ready);
        // "Khách đã tới"
        assertThat(references(search(hotel, "&stayStatus=CHECKED_IN,CHECKED_OUT,COMPLETED")))
                .containsExactlyInAnyOrder(checkedIn, completed);
        // "Đã hủy" — a one-element list is the same query the old `=` produced.
        assertThat(references(search(hotel, "&stayStatus=CANCELLED")))
                .containsExactly(cancelled);

        // The unconfirmed request is in none of them. V12 makes stay_status NULL
        // until the stay is confirmed, and NULL matches no enum value — which is
        // why the console leaves it out of every group and shows it under "Tất
        // cả" alone.
        assertThat(references(search(hotel, "&stayStatus=CONFIRMED,CHECK_IN_READY,"
                + "CHECKED_IN,CHECKED_OUT,COMPLETED,CANCELLED,NO_SHOW")))
                .doesNotContain(unconfirmed);
        assertThat(references(search(hotel, ""))).contains(unconfirmed);
    }

    @Test
    @DisplayName("one bad value in a group is refused, naming the parameter that carried it")
    void rejectsAnUnknownStatusInsideAGroup() throws Exception {
        Hotel hotel = hotel("staybad");
        submit(hotel);

        // A group must not be a way to smuggle an unvalidated value past the
        // check that a single one has always faced.
        mockMvc.perform(get(SEARCH).param("stayStatus", "CONFIRMED,NOT_A_STATUS")
                        .cookie(sessionFor(hotel)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("stayStatus"));
    }

    @Test
    @DisplayName("punctuation with no values in it is no filter, not a filter matching nothing")
    void emptyGroupIsNoFilter() throws Exception {
        Hotel hotel = hotel("stayempty");
        String only = submit(hotel);

        assertThat(references(search(hotel, "&stayStatus=,,"))).containsExactly(only);
    }

    @Test
    @DisplayName("channelType selects the real column — DIRECT and OTA both reachable")
    void filtersByChannel() throws Exception {
        Hotel hotel = hotel("channel");
        String direct = submit(hotel);
        String ota = recordOta(hotel, "ota-channel");

        assertThat(references(search(hotel, "&channelType=DIRECT"))).containsExactly(direct);
        assertThat(references(search(hotel, "&channelType=OTA"))).containsExactly(ota);
        assertThat(references(search(hotel, ""))).containsExactlyInAnyOrder(direct, ota);
    }

    @Test
    @DisplayName("check-in bounds narrow the stay, inclusively at both ends")
    void filtersByCheckIn() throws Exception {
        Hotel hotel = hotel("checkin");
        String reference = submit(hotel);

        assertThat(references(search(hotel, "&checkInFrom=" + CHECK_IN)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&checkInTo=" + CHECK_IN)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&checkInFrom=" + CHECK_IN.plusDays(1)))).isEmpty();
        assertThat(references(search(hotel, "&checkInTo=" + CHECK_IN.minusDays(1)))).isEmpty();
    }

    @Test
    @DisplayName("check-out bounds narrow the stay independently of check-in")
    void filtersByCheckOut() throws Exception {
        Hotel hotel = hotel("checkout");
        String reference = submit(hotel);

        assertThat(references(search(hotel, "&checkOutFrom=" + CHECK_OUT)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&checkOutTo=" + CHECK_OUT)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&checkOutTo=" + CHECK_OUT.minusDays(1)))).isEmpty();
    }

    @Test
    @DisplayName("the booking-date filter is over created_at, the one timestamp every channel has")
    void filtersByBookingDate() throws Exception {
        Hotel hotel = hotel("booked");
        String old = submit(hotel);
        fixtures.backdateCreatedAt(old, 10);
        String today = submit(hotel);

        LocalDate now = LocalDate.now();
        assertThat(references(search(hotel, "&bookedFrom=" + now))).containsExactly(today);
        assertThat(references(search(hotel, "&bookedTo=" + now.minusDays(1))))
                .containsExactly(old);
        // The upper bound includes the whole of its own day, not midnight on it.
        assertThat(references(search(hotel, "&bookedFrom=" + now + "&bookedTo=" + now)))
                .containsExactly(today);
    }

    @Test
    @DisplayName("a range whose end precedes its start is refused, not silently empty")
    void invertedRangeIsRefused() throws Exception {
        Hotel hotel = hotel("inverted");
        submit(hotel);

        // An empty list would read as "no reservations match" and send the
        // operator looking for a booking that is really there.
        search(hotel, "&checkInFrom=" + CHECK_IN + "&checkInTo=" + CHECK_IN.minusDays(1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("checkInTo"));
    }

    @Test
    @DisplayName("roomType matches a reservation's lines without duplicating it")
    void filtersByRoomType() throws Exception {
        Hotel hotel = hotel("roomtype");
        String reference = submitTwoRoomTypes(hotel);

        // The reservation has two lines and must appear once under either slug.
        assertThat(references(search(hotel, "&roomType=" + hotel.roomTypeSlug)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&roomType=" + hotel.secondRoomTypeSlug)))
                .containsExactly(reference);
        assertThat(references(search(hotel, "&roomType=no-such-room"))).isEmpty();
    }

    @Test
    @DisplayName("a multi-line reservation is returned once, and counted once")
    void multiLineReservationIsNotDuplicated() throws Exception {
        Hotel hotel = hotel("multiline");
        String reference = submitTwoRoomTypes(hotel);

        // An EXISTS rather than a join to reservation_line. A join would return
        // this reservation twice and make the page total wrong.
        assertThat(references(search(hotel, ""))).containsExactly(reference);
        search(hotel, "").andExpect(jsonPath("$.total").value(1));
        // Three rooms across two lines — summed, once.
        search(hotel, "").andExpect(jsonPath("$.items[0].rooms").value(3));
    }

    @Test
    @DisplayName("filters combine with AND, not OR")
    void filtersCombine() throws Exception {
        Hotel hotel = hotel("combo");
        String reference = submit(hotel);
        fixtures.setStayStatus(reference, "CONFIRMED");
        fixtures.setGuest(reference, "Combo Guest", "combo@example.invalid", "0900000111");

        assertThat(references(search(hotel,
                "&q=Combo&stayStatus=CONFIRMED&channelType=DIRECT&property=" + hotel.slug)))
                .containsExactly(reference);
        // One clause that matches nothing empties the result, which is what AND means.
        assertThat(references(search(hotel, "&q=Combo&stayStatus=NO_SHOW"))).isEmpty();
    }

    // -------------------------------------------------------------- paging

    @Test
    @DisplayName("pages partition the result — every reservation appears exactly once")
    void paginates() throws Exception {
        Hotel hotel = hotel("page");
        for (int i = 0; i < 5; i++) {
            String reference = submit(hotel);
            fixtures.backdateCreatedAt(reference, 5 - i);
        }

        List<String> all = references(search(hotel, "&size=50"));
        assertThat(all).hasSize(5);

        List<String> first = references(search(hotel, "&page=0&size=2"));
        List<String> second = references(search(hotel, "&page=1&size=2"));
        List<String> third = references(search(hotel, "&page=2&size=2"));

        assertThat(first).hasSize(2);
        assertThat(second).hasSize(2);
        assertThat(third).hasSize(1);
        assertThat(concat(first, second, third)).containsExactlyElementsOf(all);

        // The total describes the whole result, not the page.
        search(hotel, "&page=1&size=2")
                .andExpect(jsonPath("$.total").value(5))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(2));
    }

    @Test
    @DisplayName("a page past the end is empty, and still reports the true total")
    void pagePastTheEndIsEmpty() throws Exception {
        Hotel hotel = hotel("beyond");
        submit(hotel);

        search(hotel, "&page=9&size=20")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    @DisplayName("nonsense paging is clamped, not refused — and size is capped")
    void pagingIsClamped() throws Exception {
        Hotel hotel = hotel("clamp");
        submit(hotel);

        search(hotel, "&page=-4&size=0")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20));
        // An unbounded size would make the pagination decorative.
        search(hotel, "&size=100000").andExpect(jsonPath("$.size").value(100));
    }

    @Test
    @DisplayName("ordering is total, so a page boundary cannot drop or repeat a row")
    void orderingIsStable() throws Exception {
        Hotel hotel = hotel("stable");
        // Submitted in one burst: created_at may well be identical, which is
        // exactly the case the reference tie-break exists for.
        for (int i = 0; i < 4; i++) {
            submit(hotel);
        }

        List<String> once = references(search(hotel, "&size=50"));
        List<String> again = references(search(hotel, "&size=50"));
        assertThat(again).containsExactlyElementsOf(once);

        List<String> paged = concat(
                references(search(hotel, "&page=0&size=2")),
                references(search(hotel, "&page=1&size=2")),
                List.of());
        assertThat(paged).containsExactlyElementsOf(once);
    }

    // ---------------------------------------------------------- the detail

    @Test
    @DisplayName("the detail carries every real line, the authoritative money and the guest")
    void detailIsComplete() throws Exception {
        Hotel hotel = hotel("detail");
        String reference = submitTwoRoomTypes(hotel);
        fixtures.setGuest(reference, "Detail Guest", "detail@example.invalid", "0900000222");

        long expected = RATE * 2 * 3;
        detail(hotel, reference)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.reference").value(reference))
                .andExpect(jsonPath("$.summary.channelType").value("DIRECT"))
                .andExpect(jsonPath("$.summary.nights").value(2))
                .andExpect(jsonPath("$.summary.rooms").value(3))
                // Two lines, never collapsed into one invented room.
                .andExpect(jsonPath("$.lines.length()").value(2))
                .andExpect(jsonPath("$.amounts.subtotal.amountMinor").value(expected))
                .andExpect(jsonPath("$.amounts.total.amountMinor").value(Vat.with(expected)))
                .andExpect(jsonPath("$.guest.fullName").value("Detail Guest"))
                .andExpect(jsonPath("$.guest.phone").value("0900000222"))
                // Both lifecycles are recorded, and each says which it is.
                .andExpect(jsonPath("$.timeline[0].field").value("SALES"));
    }

    @Test
    @DisplayName("the detail exposes no payment block — V15's table has no read path")
    void detailInventsNoPayment() throws Exception {
        Hotel hotel = hotel("nopay");
        String reference = submit(hotel);

        String body = detail(hotel, reference).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("payment").doesNotContain("paymentStatus")
                .doesNotContain("commission").doesNotContain("payout");
    }

    @Test
    @DisplayName("the detail exposes no internal identifier or snapshot")
    void detailExposesNoInternals() throws Exception {
        Hotel hotel = hotel("internals");
        String reference = submit(hotel);

        String body = detail(hotel, reference).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("priceSnapshot").doesNotContain("propertyId")
                .doesNotContain("partnerId").doesNotContain("reservationId")
                .doesNotContain("salesOwnerId").doesNotContain("idempotency");
    }

    // ------------------------------------------------- the two workspaces

    @Test
    @DisplayName("an OTA reservation is readable here and absent from the DIRECT sales API")
    void otaIsSeparateFromTheSalesQueue() throws Exception {
        Hotel hotel = hotel("otasplit");
        String ota = recordOta(hotel, "ota-split");

        // Doc 58 §6 — full detail, any channel.
        detail(hotel, ota)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.channelType").value("OTA"))
                .andExpect(jsonPath("$.summary.stayStatus").value("CONFIRMED"))
                .andExpect(jsonPath("$.summary.otaReference").value("ota-split"));

        // Doc 58 §5 — an OTA reservation is not addressable through the sales API,
        // so none of its DIRECT sales actions can ever be aimed at one.
        mockMvc.perform(get(SALES + "/" + ota).cookie(sessionFor(hotel)))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(SALES + "/" + ota + "/win").with(csrf()).cookie(sessionFor(hotel)))
                .andExpect(status().isNotFound());
        assertThat(references(mockMvc.perform(get(SALES + "?locale=en").cookie(sessionFor(hotel)))))
                .doesNotContain(ota);
    }

    @Test
    @DisplayName("this workspace reports no salesStatus — the two lifecycles stay apart")
    void searchCarriesNoSalesStatus() throws Exception {
        Hotel hotel = hotel("nosales");
        submit(hotel);

        String body = search(hotel, "").andReturn().getResponse().getContentAsString();
        // sales_status is DIRECT-only and NULL for every OTA row. A single
        // "status" column over both would be the conflation doc 53 forbids.
        assertThat(body).doesNotContain("salesStatus").doesNotContain("REQUESTED");
    }

    // ------------------------------------------------------------ security

    @Test
    @DisplayName("another partner's reservation cannot be listed, found, counted or opened")
    void crossPartnerIsInvisible() throws Exception {
        Hotel mine = hotel("mine");
        Hotel theirs = hotel("theirs");
        String myReference = submit(mine);
        String theirReference = submit(theirs);
        fixtures.setGuest(theirReference, "Secret Guest", "secret@example.invalid", "0999888777");

        // Not in the list.
        assertThat(references(search(mine, "")))
                .containsExactly(myReference)
                .doesNotContain(theirReference);
        // Not findable by their own reference, name, phone or email.
        assertThat(references(search(mine, "&q=" + theirReference))).isEmpty();
        assertThat(references(search(mine, "&q=Secret"))).isEmpty();
        assertThat(references(search(mine, "&q=0999888777"))).isEmpty();
        assertThat(references(search(mine, "&q=secret@example.invalid"))).isEmpty();
        // Not reachable by naming their property or room type.
        assertThat(references(search(mine, "&property=" + theirs.slug))).isEmpty();
        assertThat(references(search(mine, "&roomType=" + theirs.roomTypeSlug))).isEmpty();
        // 404, never 403 — a 403 would confirm the reference exists.
        detail(mine, theirReference).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the total counts only what the caller may see")
    void countDoesNotLeak() throws Exception {
        Hotel mine = hotel("counta");
        Hotel theirs = hotel("countb");
        submit(mine);
        for (int i = 0; i < 3; i++) {
            submit(theirs);
        }

        // A count taken over a wider predicate than the list would report that
        // other partners' reservations exist without ever showing one.
        search(mine, "").andExpect(jsonPath("$.total").value(1));
        search(mine, "&q=KAS").andExpect(jsonPath("$.total").value(1));
        search(mine, "&channelType=DIRECT").andExpect(jsonPath("$.total").value(1));
        search(theirs, "").andExpect(jsonPath("$.total").value(3));
    }

    @Test
    @DisplayName("no filter can be used to page through another partner's reservations")
    void pagingCannotEscapeTheScope() throws Exception {
        Hotel mine = hotel("pagea");
        Hotel theirs = hotel("pageb");
        String myReference = submit(mine);
        for (int i = 0; i < 4; i++) {
            submit(theirs);
        }

        // Every page of my own search is mine, and the pages past my single row
        // are empty rather than a window onto somebody else's.
        assertThat(references(search(mine, "&page=0&size=50"))).containsExactly(myReference);
        assertThat(references(search(mine, "&page=1&size=1"))).isEmpty();
        assertThat(references(search(mine, "&page=2&size=1"))).isEmpty();
    }

    @Test
    @DisplayName("a SQL fragment in a filter is a bound value, not a query")
    void injectionAttemptIsJustAValue() throws Exception {
        Hotel hotel = hotel("inject");
        String reference = submit(hotel);

        assertThat(references(search(hotel, "&property=' OR '1'='1"))).isEmpty();
        assertThat(references(search(hotel, "&roomType=' OR '1'='1"))).isEmpty();
        assertThat(references(search(hotel, "&q=' OR '1'='1"))).isEmpty();
        assertThat(references(search(hotel, ""))).containsExactly(reference);
    }

    @Test
    @DisplayName("an unknown enum value is a 400 naming the parameter, never a 500")
    void unknownValuesAreRefused() throws Exception {
        Hotel hotel = hotel("badenum");
        submit(hotel);

        search(hotel, "&stayStatus=NOT_A_STATUS")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("stayStatus"));
        search(hotel, "&channelType=CARRIER_PIGEON")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("channelType"));
        // A sales status is not a stay status. Offering one here would be the
        // merged taxonomy this workspace exists to avoid.
        search(hotel, "&stayStatus=REQUESTED")
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("both routes need a session")
    void anonymousIsRefused() throws Exception {
        Hotel hotel = hotel("anon");
        String reference = submit(hotel);

        mockMvc.perform(get(SEARCH)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(SEARCH + "/" + reference)).andExpect(status().isUnauthorized());
    }

    // --------------------------------------------------------------- helpers

    private record Partner(UUID id, UUID adminId) {
    }

    private record Hotel(UUID partnerId, UUID propertyId, String slug,
                         UUID roomTypeId, String roomTypeSlug,
                         UUID secondRoomTypeId, String secondRoomTypeSlug,
                         UUID adminId) {
    }

    private Partner partner(String label) {
        UUID id = fixtures.createPartner("rs-" + label);
        UUID admin = fixtures.createUser("rs-" + label + "-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, id);
        return new Partner(id, admin);
    }

    private Hotel hotel(String label) {
        return hotelFor(partner(label), label);
    }

    private Hotel hotelFor(Partner partner, String label) {
        UUID property = fixtures.createProperties(partner.id, 1).get(0);
        fixtures.setPropertyNames(property, "SEARCH_HOTEL_" + label.toUpperCase());
        fixtures.openProperty(property);

        String unique = UUID.randomUUID().toString().substring(0, 8);
        String firstSlug = "rs-" + label + "-a-" + unique;
        String secondSlug = "rs-" + label + "-b-" + unique;
        UUID first = room(property, firstSlug);
        UUID second = room(property, secondSlug);

        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        return new Hotel(partner.id, property, fixtures.slugOf(property),
                first, firstSlug, second, secondSlug, partner.adminId);
    }

    private UUID room(UUID property, String slug) {
        UUID roomType = fixtures.addRoomType(property, slug);
        fixtures.publishRoomType(roomType);
        fixtures.setBasePrice(roomType, RATE);
        for (LocalDate d = CHECK_IN; !d.isAfter(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(roomType, d, TOTAL_ROOMS, 0, 0, 0);
        }
        return roomType;
    }

    private Cookie[] sessionFor(Hotel hotel) throws Exception {
        return login(fixtures.emailOf(hotel.adminId), PASSWORD);
    }

    private ResultActions search(Hotel hotel, String query) throws Exception {
        return mockMvc.perform(get(SEARCH + "?locale=en" + query).cookie(sessionFor(hotel)));
    }

    private ResultActions detail(Hotel hotel, String reference) throws Exception {
        return mockMvc.perform(get(SEARCH + "/" + reference).cookie(sessionFor(hotel)));
    }

    /**
     * The references in the order the response returned them.
     *
     * <p>Matches {@code "reference":"} exactly, so the {@code otaReference} field
     * beside it is not mistaken for one.
     */
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

    private static List<String> concat(List<String> a, List<String> b, List<String> c) {
        List<String> all = new java.util.ArrayList<>(a);
        all.addAll(b);
        all.addAll(c);
        return all;
    }

    /** One room type, one room — the ordinary case. */
    private String submit(Hotel hotel) throws Exception {
        return submitLines(hotel,
                "{\"roomTypeSlug\":\"" + hotel.roomTypeSlug + "\",\"quantity\":1}");
    }

    /** Two room types, three rooms — doc 53's multi-line reservation. */
    private String submitTwoRoomTypes(Hotel hotel) throws Exception {
        return submitLines(hotel,
                "{\"roomTypeSlug\":\"" + hotel.roomTypeSlug + "\",\"quantity\":2},"
                + "{\"roomTypeSlug\":\"" + hotel.secondRoomTypeSlug + "\",\"quantity\":1}");
    }

    /** Through the real public endpoint — no reservation here is written by hand. */
    private String submitLines(Hotel hotel, String lines) throws Exception {
        String body = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[%s],
                 "guest":{"fullName":"Search Guest","email":"search@example.invalid",
                          "phone":"+84900000777","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(hotel.slug, CHECK_IN, CHECK_OUT, lines);

        String response = mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", "rs-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        int from = response.indexOf("\"reference\":\"") + 13;
        return response.substring(from, response.indexOf('"', from));
    }

    /**
     * An OTA reservation, written by the fixture because doc 58 §7's recording
     * route does not exist. See {@code SecurityFixtures#recordOtaReservation}.
     */
    private String recordOta(Hotel hotel, String otaReference) {
        return fixtures.recordOtaReservation(
                hotel.propertyId, hotel.roomTypeId, "BOOKING_COM",
                "KAS-OTA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                otaReference, CHECK_IN, CHECK_OUT,
                "OTA Guest", "ota@example.invalid", "0900000888", RATE * 2);
    }
}
