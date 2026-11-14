package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.pricing.StayAdjustmentService;
import com.kas.platform.pricing.StayAdjustmentService.Audience;
import com.kas.platform.pricing.StayAdjustmentService.VoucherReason;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Owner 2026-11-14: a voucher can be meant for some member tiers or for chosen customers, and it
 * starts the moment it is created. Rolled back.
 */
class VoucherAudienceIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "test-voucher-audience-36!";
    private static final String VOUCHERS = "/api/v1/admin/vouchers";

    @Autowired JdbcClient jdbc;
    @Autowired StayAdjustmentService adjustments;

    private Cookie[] session;
    private String slug;
    private UUID alice;
    private UUID bob;
    private String aliceCode;
    private final LocalDate checkIn = LocalDate.now().plusDays(30);

    @BeforeEach
    void prepare() throws Exception {
        UUID partner = fixtures.createPartner("voucher-audience");
        UUID property = fixtures.createProperties(partner, 1).getFirst();
        slug = jdbc.sql("SELECT slug FROM property WHERE id = :id").param("id", property).query(String.class).single();
        UUID actor = fixtures.createUser("voucher-audience", PASSWORD);
        fixtures.grantGlobalScope(actor, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(actor), PASSWORD);
        alice = customer("Alice Voucher");
        bob = customer("Bob Voucher");
        aliceCode = jdbc.sql("SELECT customer_code FROM customer WHERE id = :id").param("id", alice).query(String.class).single();
    }

    private UUID customer(String name) {
        return jdbc.sql("""
                INSERT INTO customer (full_name, email, customer_code)
                VALUES (:name, :email, 'KAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
                RETURNING id
                """).param("name", name + " " + UUID.randomUUID().toString().substring(0, 6))
                .param("email", "va-" + UUID.randomUUID().toString().substring(0, 8) + "@example.invalid")
                .query(UUID.class).single();
    }

    private String create(String extra) throws Exception {
        String body = "{\"name\":\"Audience test\",\"type\":\"PERCENTAGE\",\"valuePercent\":10,\"currency\":\"VND\",\"status\":\"ACTIVE\""
                + extra + "}";
        String json = mockMvc.perform(post(VOUCHERS).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.code");
    }

    private StayAdjustmentService.VoucherCheck check(String code, Audience who) {
        return adjustments.checkCode(code, slug, checkIn, checkIn.plusDays(2), List.of(), 2_000_000, "VND", who);
    }

    private List<String> listed(Audience who) {
        return adjustments.vouchersFor(slug, checkIn, checkIn.plusDays(2), List.of(), 2_000_000, "VND", who)
                .stream().map(c -> c.voucher().code()).toList();
    }

    @Test
    @DisplayName("a voucher for chosen customers works and is listed only for them")
    void chosenCustomers() throws Exception {
        String code = create(",\"audience\":\"CUSTOMERS\",\"customerIds\":[\"" + alice + "\"]");

        assertThat(check(code, new Audience(alice, null)).eligible()).isTrue();
        assertThat(check(code, new Audience(bob, null)).reason()).isEqualTo(VoucherReason.NOT_FOR_YOU);
        assertThat(check(code, Audience.NONE).reason()).isEqualTo(VoucherReason.NOT_FOR_YOU);
        assertThat(listed(new Audience(alice, null))).contains(code);
        assertThat(listed(new Audience(bob, null))).doesNotContain(code);
        assertThat(listed(Audience.NONE)).doesNotContain(code);

        mockMvc.perform(get(VOUCHERS).param("q", code).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].audience").value("CUSTOMERS"))
                .andExpect(jsonPath("$[0].customers.length()").value(1))
                .andExpect(jsonPath("$[0].customers[0].customerCode").value(aliceCode))
                .andExpect(jsonPath("$[0].createdAt").isNotEmpty())
                .andExpect(jsonPath("$[0].validFromAt").isNotEmpty());
    }

    @Test
    @DisplayName("a voucher for some tiers works only for members of those tiers")
    void memberTiers() throws Exception {
        UUID tier = jdbc.sql("SELECT id FROM membership_tier WHERE status = 'ACTIVE' ORDER BY sort_order LIMIT 1")
                .query(UUID.class).single();
        UUID other = UUID.randomUUID();
        String code = create(",\"audience\":\"TIERS\",\"tierIds\":[\"" + tier + "\"]");

        assertThat(check(code, new Audience(bob, tier)).eligible()).isTrue();
        assertThat(check(code, new Audience(bob, other)).reason()).isEqualTo(VoucherReason.NOT_FOR_YOU);
        assertThat(check(code, new Audience(bob, null)).reason()).isEqualTo(VoucherReason.NOT_FOR_YOU);
        assertThat(listed(new Audience(bob, tier))).contains(code);
        assertThat(listed(Audience.NONE)).doesNotContain(code);
    }

    @Test
    @DisplayName("a voucher for everyone stays open to guests who are not signed in")
    void everyone() throws Exception {
        String code = create("");
        assertThat(check(code, Audience.NONE).eligible()).isTrue();
        assertThat(listed(Audience.NONE)).contains(code);
    }

    @Test
    @DisplayName("it starts when created and ends at the chosen time; a past end, no tier or no customer is refused")
    void timesAndValidation() throws Exception {
        OffsetDateTime before = OffsetDateTime.now().minusSeconds(5);
        String code = create(",\"validToAt\":\"" + OffsetDateTime.now(ZoneOffset.ofHours(7)).plusDays(3).withNano(0) + "\"");
        OffsetDateTime from = jdbc.sql("SELECT valid_from_at FROM voucher WHERE code = CAST(:c AS citext)").param("c", code)
                .query(OffsetDateTime.class).single();
        assertThat(from).isAfter(before);

        // Past its end time it is over, even on its last valid day.
        jdbc.sql("UPDATE voucher SET valid_from_at = now() - interval '2 days', valid_to_at = now() - interval '1 minute' WHERE code = CAST(:c AS citext)").param("c", code).update();
        assertThat(check(code, Audience.NONE).reason()).isEqualTo(VoucherReason.EXPIRED);

        String base = "{\"name\":\"Bad\",\"type\":\"PERCENTAGE\",\"valuePercent\":10,\"currency\":\"VND\",\"status\":\"ACTIVE\"";
        mockMvc.perform(post(VOUCHERS).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(base + ",\"validToAt\":\"2020-01-01T10:00:00+07:00\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].code").value("IN_THE_PAST"));
        mockMvc.perform(post(VOUCHERS).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(base + ",\"audience\":\"TIERS\",\"tierIds\":[]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("tierIds"));
        mockMvc.perform(post(VOUCHERS).cookie(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(base + ",\"audience\":\"CUSTOMERS\",\"customerIds\":[\"" + UUID.randomUUID() + "\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].code").value("UNKNOWN"));
    }

    @Test
    @DisplayName("staff find customers by code, email or name, and see the active tiers")
    void lookups() throws Exception {
        mockMvc.perform(get(VOUCHERS + "/customers").param("q", aliceCode).cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(alice.toString()));
        mockMvc.perform(get(VOUCHERS + "/customers").param("q", "Bob Voucher").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(bob.toString()));
        mockMvc.perform(get(VOUCHERS + "/tiers").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].code").isNotEmpty());
    }
}
