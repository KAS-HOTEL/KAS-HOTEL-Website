package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.UUID;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Customer list filters (2026-11-07): tier, registration date in the business time zone
 * (Asia/Ho_Chi_Minh), free text, combined, with an exact total in X-Total-Count.
 */
class AdminCustomerFilterIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "customer-filter-test-456!";
    private static final String LIST = "/api/v1/admin/customers";

    @Autowired JdbcClient jdbc;
    private Cookie[] session;
    private String prefix;

    @BeforeEach
    void prepare() throws Exception {
        UUID admin = fixtures.createUser("customer-filter", PASSWORD);
        fixtures.grantGlobalScope(admin, UserRole.SUPER_ADMIN);
        session = login(fixtures.emailOf(admin), PASSWORD);
        prefix = "FLT" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        // Local Vietnam times (UTC+7) on both sides of the 10 March boundaries.
        customer("A", "2026-03-10T00:30:00+07:00", "GOLD");
        customer("B", "2026-03-10T23:59:00+07:00", "CLASSIC");
        customer("C", "2026-03-11T00:00:00+07:00", "GOLD");
        customer("D", "2026-03-09T23:59:00+07:00", "PLATINUM");
    }

    private void customer(String name, String createdAt, String tier) {
        UUID id = jdbc.sql("""
                        INSERT INTO customer(full_name, customer_code, created_at)
                        VALUES (:name, 'KAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
                                CAST(:at AS timestamptz))
                        RETURNING id
                        """)
                .param("name", prefix + "-" + name).param("at", createdAt).query(UUID.class).single();
        UUID membership = jdbc.sql("""
                        INSERT INTO customer_membership(customer_id, status, joined_at)
                        VALUES (:id, 'ACTIVE', now()) RETURNING id
                        """).param("id", id).query(UUID.class).single();
        jdbc.sql("""
                        INSERT INTO customer_membership_tier_history(membership_id, tier_id, effective_from)
                        SELECT :m, t.id, now() FROM membership_tier t WHERE t.code = :tier
                        """).param("m", membership).param("tier", tier).update();
    }

    private String name(String letter) {
        return prefix + "-" + letter;
    }

    @Test
    @DisplayName("one registration day covers 00:00–23:59 Vietnam time, nothing either side")
    void singleDayUsesBusinessTimeZone() throws Exception {
        mockMvc.perform(get(LIST).param("q", prefix).param("registeredFrom", "2026-03-10")
                        .param("registeredTo", "2026-03-10").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "2"))
                .andExpect(jsonPath("$[*].fullName", containsInAnyOrder(name("A"), name("B"))));
    }

    @Test
    @DisplayName("date range, tier and text combine")
    void filtersCombine() throws Exception {
        mockMvc.perform(get(LIST).param("q", prefix).param("tier", "gold")
                        .param("registeredFrom", "2026-03-10").param("registeredTo", "2026-03-11").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "2"))
                .andExpect(jsonPath("$[*].fullName", containsInAnyOrder(name("A"), name("C"))));
        mockMvc.perform(get(LIST).param("q", prefix).param("tier", "PLATINUM").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "1"))
                .andExpect(jsonPath("$[0].fullName").value(name("D")));
        mockMvc.perform(get(LIST).param("q", prefix).param("registeredFrom", "2026-03-11").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "1"))
                .andExpect(jsonPath("$[0].fullName").value(name("C")));
    }

    @Test
    @DisplayName("a start date after the end date is refused")
    void invalidRangeRefused() throws Exception {
        mockMvc.perform(get(LIST).param("registeredFrom", "2026-03-12").param("registeredTo", "2026-03-10").cookie(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("DATE_RANGE_INVALID"));
        mockMvc.perform(get(LIST).param("registeredFrom", "10/03/2026").cookie(session))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("pages are counted from the whole match, newest first")
    void paginationAndTotal() throws Exception {
        mockMvc.perform(get(LIST).param("q", prefix).param("size", "1").param("page", "1").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "4"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].fullName").value(name("B")));
    }

    @Test
    @DisplayName("no match is an empty page with a zero total")
    void noMatch() throws Exception {
        mockMvc.perform(get(LIST).param("q", prefix).param("registeredFrom", "2025-01-01")
                        .param("registeredTo", "2025-01-02").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", "0"))
                .andExpect(jsonPath("$.length()").value(0));
    }
}
