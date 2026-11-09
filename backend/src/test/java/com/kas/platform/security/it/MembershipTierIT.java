package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.customer.MembershipTierService;
import com.kas.platform.reservation.CheckoutRequestService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Membership tier review (owner decisions 2026-11-09; V59). */
class MembershipTierIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "tier-review-password-8841";
    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired private JdbcClient jdbc;
    @Autowired private MembershipTierService tiers;
    @Autowired private CheckoutRequestService checkouts;

    private record Member(UUID userId, UUID customerId, UUID membershipId, String email) { }

    private UUID property;

    // ------------------------------------------------------------------ which bookings count

    @Test
    @DisplayName("only website bookings by a signed-in member count, once each, when checked out")
    void onlyQualifyingBookingsCount() {
        Member m = member("count");
        LocalDate today = LocalDate.now(VN);
        UUID good = stay(m, "WEBSITE", true, today, 3);
        UUID phone = stay(m, "PHONE", true, today, 1);
        UUID guest = stay(m, "WEBSITE", false, today, 1);
        UUID cancelled = stay(m, "WEBSITE", true, today, 1);
        jdbc.sql("UPDATE reservation SET stay_status = 'CANCELLED' WHERE id = :id").param("id", cancelled).update();

        assertThat(checkedOut(good)).isTrue();
        assertThat(checkedOut(good)).isTrue();        // counting twice is still one booking
        assertThat(checkedOut(phone)).isFalse();
        assertThat(checkedOut(guest)).isFalse();
        assertThat(tiers.recordCheckout(cancelled, null)).isFalse();

        assertThat(count(m)).isEqualTo(1);
    }

    @Test
    @DisplayName("15 bookings in a quarter make Gold, 30 make Platinum, with an email each time")
    void upgradesAtThresholds() {
        Member m = member("upgrade");
        LocalDate today = LocalDate.now(VN);
        for (int i = 0; i < 14; i++) checkedOut(stay(m, "WEBSITE", true, today, 1));
        assertThat(tier(m)).isEqualTo("CLASSIC");

        checkedOut(stay(m, "WEBSITE", true, today, 1));
        assertThat(tier(m)).isEqualTo("GOLD");
        assertThat(emails(m)).isEqualTo(1);

        for (int i = 0; i < 15; i++) checkedOut(stay(m, "WEBSITE", true, today, 1));
        assertThat(tier(m)).isEqualTo("PLATINUM");
        assertThat(emails(m)).isEqualTo(2);
    }

    @Test
    @DisplayName("the booking that reaches the threshold keeps the tier recorded when it was booked")
    void thresholdBookingKeepsBookingTier() {
        Member m = member("snapshot");
        LocalDate today = LocalDate.now(VN);
        UUID last = null;
        for (int i = 0; i < 15; i++) checkedOut(last = stay(m, "WEBSITE", true, today, 1));
        assertThat(tier(m)).isEqualTo("GOLD");
        assertThat(jdbc.sql("SELECT tier_code_snapshot FROM reservation_loyalty_snapshot WHERE reservation_id = :id")
                .param("id", last).query(String.class).single()).isEqualTo("CLASSIC");
    }

    // ------------------------------------------------------------------ check-out flow

    @Test
    @DisplayName("guest requests check-out; SUPER_ADMIN confirms over HTTP and the booking counts")
    void guestRequestThenSuperAdminConfirms() throws Exception {
        Member m = member("flow");
        UUID stay = stay(m, "WEBSITE", true, LocalDate.now(VN), 1);
        String reference = reference(stay);
        jdbc.sql("UPDATE reservation SET stay_status = 'CHECKED_IN' WHERE id = :id").param("id", stay).update();

        Cookie[] guest = login(m.email(), PASSWORD);
        mockMvc.perform(post("/api/v1/me/stays/" + reference + "/check-out-request").with(csrf()).cookie(guest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("GUEST"));
        // A guest cannot confirm their own check-out.
        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference + "/check-out").with(csrf()).cookie(guest))
                .andExpect(status().isForbidden());

        Cookie[] superAdmin = superAdmin();
        mockMvc.perform(get("/api/v1/admin/ops/reservations/checkout-requests").cookie(superAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.reference == '" + reference + "')].source").value("GUEST"));
        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference + "/check-out").with(csrf()).cookie(superAdmin))
                .andExpect(status().isOk());
        assertThat(count(m)).isEqualTo(1);

        mockMvc.perform(get("/api/v1/me/membership").cookie(guest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tierCode").value("CLASSIC"))
                .andExpect(jsonPath("$.qualifyingBookings").value(1))
                .andExpect(jsonPath("$.nextTierCode").value("GOLD"))
                .andExpect(jsonPath("$.bookingsToNextTier").value(14));
    }

    @Test
    @DisplayName("after the check-out time the request is filed automatically")
    void automaticRequestAfterCheckoutTime() {
        Member m = member("auto");
        UUID stay = stay(m, "WEBSITE", true, LocalDate.now(VN).minusDays(1), 1);
        jdbc.sql("UPDATE reservation SET stay_status = 'CHECKED_IN' WHERE id = :id").param("id", stay).update();

        assertThat(checkouts.requestOverdue()).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.sql("SELECT checkout_request_source FROM reservation WHERE id = :id").param("id", stay)
                .query(String.class).single()).isEqualTo("AUTO");
    }

    @Test
    @DisplayName("undoing a check-out drops the count and lowers the tier at once, without an email")
    void undoLowersTierImmediately() throws Exception {
        Member m = member("undo");
        LocalDate today = LocalDate.now(VN);
        UUID last = null;
        for (int i = 0; i < 15; i++) checkedOut(last = stay(m, "WEBSITE", true, today, 1));
        assertThat(tier(m)).isEqualTo("GOLD");
        int emailsBefore = emails(m);

        mockMvc.perform(post("/api/v1/admin/ops/reservations/" + reference(last) + "/undo-check-out")
                        .with(csrf()).cookie(superAdmin()))
                .andExpect(status().isOk());

        assertThat(count(m)).isEqualTo(14);
        assertThat(tier(m)).isEqualTo("CLASSIC");
        assertThat(emails(m)).isEqualTo(emailsBefore);
    }

    // ------------------------------------------------------------------ quarter review

    @Test
    @DisplayName("the start-of-quarter review follows last quarter's count, never below Classic, and runs once")
    void quarterReview() {
        LocalDate lastQuarter = LocalDate.now(VN).withDayOfMonth(1).minusMonths(3);
        Member gold = member("qgold");
        for (int i = 0; i < 16; i++) checkedOut(stay(gold, "WEBSITE", true, lastQuarter, 1));
        Member none = member("qnone");
        setTier(none, "GOLD");

        tiers.reviewCurrentQuarter();
        assertThat(tier(gold)).isEqualTo("GOLD");
        assertThat(tier(none)).isEqualTo("CLASSIC");

        int emails = emails(gold);
        tiers.reviewCurrentQuarter();
        assertThat(emails(gold)).isEqualTo(emails);
        assertThat(tier(gold)).isEqualTo("GOLD");
    }

    // ------------------------------------------------------------------ fixtures

    private Member member(String tag) {
        if (property == null) {
            property = fixtures.createProperties(fixtures.createPartner("tier"), 1).get(0);
        }
        UUID user = fixtures.createUser("tier-" + tag, PASSWORD);
        fixtures.grantOwnScope(user);
        String email = fixtures.emailOf(user);
        UUID customer = jdbc.sql("""
                        INSERT INTO customer (user_id, customer_code, full_name, email, locale, country)
                        VALUES (:u, 'KAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), 'Tier Guest', :e, 'en', 'VN')
                        RETURNING id
                        """).param("u", user).param("e", email).query(UUID.class).single();
        UUID membership = jdbc.sql("INSERT INTO customer_membership (customer_id, enrollment_source) VALUES (:c, 'TEST') RETURNING id")
                .param("c", customer).query(UUID.class).single();
        jdbc.sql("""
                        INSERT INTO customer_membership_tier_history (membership_id, tier_id, effective_from, change_reason)
                        SELECT :m, id, now() - interval '400 days', 'test' FROM membership_tier WHERE code = 'CLASSIC'
                        """).param("m", membership).update();
        return new Member(user, customer, membership, email);
    }

    /** A stay of the member checking out on {@code checkOut}; the snapshot as the website writes it. */
    private UUID stay(Member m, String leadSource, boolean signedIn, LocalDate checkOut, int nights) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO reservation (id, reference, property_id, customer_id, distribution_channel_id, channel_type,
                                                 lead_source, sales_status, stay_status, check_in, check_out, adults, children,
                                                 guest_name, guest_email, currency)
                        SELECT :id, :ref, :p, :c, dc.id, 'DIRECT', CAST(:lead AS lead_source), 'WON', 'CHECKED_IN',
                               :in, :out, 1, 0, 'Tier Guest', :email, 'VND'
                          FROM distribution_channel dc WHERE dc.channel_type = 'DIRECT' LIMIT 1
                        """)
                .param("id", id).param("ref", "KT" + id.toString().substring(0, 10).toUpperCase())
                .param("p", property).param("c", m.customerId()).param("lead", leadSource)
                .param("in", checkOut.minusDays(nights)).param("out", checkOut).param("email", m.email())
                .update();
        jdbc.sql("""
                        INSERT INTO reservation_loyalty_snapshot
                            (reservation_id, customer_membership_id, tier_id, tier_code_snapshot, currency, member_eligible_at_booking)
                        SELECT :r, :m, h.tier_id, t.code, 'VND', :eligible
                          FROM customer_membership_tier_history h JOIN membership_tier t ON t.id = h.tier_id
                         WHERE h.membership_id = :m AND h.effective_to IS NULL
                        """)
                .param("r", id).param("m", m.membershipId()).param("eligible", signedIn).update();
        return id;
    }

    /** Marks the stay checked out and runs what the check-out transaction runs. */
    private boolean checkedOut(UUID reservation) {
        jdbc.sql("UPDATE reservation SET stay_status = 'CHECKED_OUT' WHERE id = :id").param("id", reservation).update();
        return tiers.recordCheckout(reservation, null);
    }

    private Cookie[] superAdmin() throws Exception {
        UUID user = fixtures.createUser("tier-super", PASSWORD);
        fixtures.grantGlobalScope(user, UserRole.SUPER_ADMIN);
        return login(fixtures.emailOf(user), PASSWORD);
    }

    private void setTier(Member m, String code) {
        jdbc.sql("UPDATE customer_membership_tier_history SET effective_to = now() WHERE membership_id = :m AND effective_to IS NULL")
                .param("m", m.membershipId()).update();
        jdbc.sql("""
                        INSERT INTO customer_membership_tier_history (membership_id, tier_id, effective_from, change_reason)
                        SELECT :m, id, now() + interval '1 millisecond', 'test' FROM membership_tier WHERE code = :code
                        """).param("m", m.membershipId()).param("code", code).update();
    }

    private String reference(UUID reservation) {
        return jdbc.sql("SELECT reference FROM reservation WHERE id = :id").param("id", reservation).query(String.class).single();
    }

    private String tier(Member m) {
        return jdbc.sql("""
                        SELECT t.code FROM customer_membership_tier_history h JOIN membership_tier t ON t.id = h.tier_id
                         WHERE h.membership_id = :m AND h.effective_to IS NULL
                        """).param("m", m.membershipId()).query(String.class).single();
    }

    private int count(Member m) {
        return jdbc.sql("SELECT count(*) FROM membership_qualifying_booking WHERE membership_id = :m AND reversed_at IS NULL")
                .param("m", m.membershipId()).query(Integer.class).single();
    }

    private int emails(Member m) {
        return jdbc.sql("""
                        SELECT count(*) FROM email_delivery_outbox o
                         WHERE o.event_key IN (SELECT 'member-tier-' || h.id FROM customer_membership_tier_history h
                                                WHERE h.membership_id = :m)
                        """).param("m", m.membershipId()).query(Integer.class).single();
    }
}
