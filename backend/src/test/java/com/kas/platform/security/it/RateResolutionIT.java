package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Doc 56 §3.1 rate resolution, proven end to end through the price a guest is
 * quoted.
 *
 * <p>Asserting through {@code nightlyFrom} rather than against the resolver in
 * isolation is deliberate: the winner rule, the candidate predicate and the
 * publication filter all have to agree for the number to come out right, and it
 * is the guest-facing number that matters.
 *
 * <p>Every amount here is a synthetic fixture. Base rates are config B6 and
 * remain OPEN (doc 56 §9); no KAS rate exists to test against.
 */
class RateResolutionIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "rate-password-8823";

    private static final long BASE = 1_000_000L;
    private static final long PROPERTY_RULE = 2_000_000L;
    private static final long ROOM_TYPE_RULE = 3_000_000L;
    private static final long DATED_RULE = 4_000_000L;

    /** A Monday well inside the horizon, so day-of-week rules are predictable. */
    private static final LocalDate CHECK_IN =
            LocalDate.now().plusDays(20).with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(1);

    // --------------------------------------------------------------- the layers

    @Test
    @DisplayName("with no rule, the base price wins — doc 56 §3 Layer 0")
    void basePriceIsTheFallback() throws Exception {
        Fixture f = bookable();

        expectNightlyFrom(f, BASE);
    }

    @Test
    @DisplayName("a property-scope rule beats the base price")
    void propertyRuleBeatsBase() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("PROPERTY", f.propertyId, null, "TEST_PROPERTY_RULE", 0,
                null, null, null, PROPERTY_RULE, null);

        expectNightlyFrom(f, PROPERTY_RULE);
    }

    @Test
    @DisplayName("a room-type rule beats a property rule of equal priority — specificity")
    void roomTypeRuleBeatsPropertyRule() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("PROPERTY", f.propertyId, null, "TEST_PROPERTY_RULE", 0,
                null, null, null, PROPERTY_RULE, null);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_ROOM_RULE", 0,
                null, null, null, ROOM_TYPE_RULE, null);

        // Doc 56 §3.1's ladder: room-type ▸ property. Same priority, so
        // specificity decides.
        expectNightlyFrom(f, ROOM_TYPE_RULE);
    }

    @Test
    @DisplayName("a dated room-type rule beats an undated one")
    void datedRuleBeatsUndated() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_ROOM_RULE", 0,
                null, null, null, ROOM_TYPE_RULE, null);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_SEASON_RULE", 0,
                CHECK_IN.minusDays(5), CHECK_IN.plusDays(5), null, DATED_RULE, null);

        expectNightlyFrom(f, DATED_RULE);
    }

    @Test
    @DisplayName("priority outranks specificity — doc 56 §3.1 sorts on priority first")
    void priorityOutranksSpecificity() throws Exception {
        Fixture f = bookable();
        // The room-type rule is more specific but lower priority.
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_ROOM_RULE", 0,
                null, null, null, ROOM_TYPE_RULE, null);
        fixtures.addRateRule("PROPERTY", f.propertyId, null, "TEST_OVERRIDE", 10,
                null, null, null, PROPERTY_RULE, null);

        expectNightlyFrom(f, PROPERTY_RULE);
    }

    // ------------------------------------------------------------ applicability

    @Test
    @DisplayName("a rule outside its date range does not apply")
    void ruleOutsideItsDateRangeDoesNotApply() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_PAST_SEASON", 5,
                CHECK_IN.minusDays(60), CHECK_IN.minusDays(30), null, DATED_RULE, null);

        expectNightlyFrom(f, BASE);
    }

    @Test
    @DisplayName("a day-of-week rule applies only on its days")
    void dayOfWeekRuleAppliesOnlyOnItsDays() throws Exception {
        Fixture f = bookable();
        // CHECK_IN is a Monday; PostgreSQL dow for Monday is 1, Sunday 0.
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_WEEKEND", 0,
                null, null, "{0,6}", DATED_RULE, null);

        expectNightlyFrom(f, BASE);

        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_MONDAY", 0,
                CHECK_IN, CHECK_IN, "{1}", ROOM_TYPE_RULE, null);

        expectNightlyFrom(f, ROOM_TYPE_RULE);
    }

    @Test
    @DisplayName("a rule that is not ACTIVE does not apply")
    void inactiveRuleDoesNotApply() throws Exception {
        Fixture f = bookable();
        UUID ruleId = fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_ROOM_RULE", 0,
                null, null, null, ROOM_TYPE_RULE, null);

        expectNightlyFrom(f, ROOM_TYPE_RULE);

        // Doc 56 §5.3: rules are archived, never deleted, so a snapshot's ruleId
        // always resolves — but an archived rule must stop applying.
        fixtures.setRateRuleStatus(ruleId, "ARCHIVED");
        expectNightlyFrom(f, BASE);

        fixtures.setRateRuleStatus(ruleId, "PAUSED");
        expectNightlyFrom(f, BASE);
    }

    @Test
    @DisplayName("another property's rule never reaches this room type")
    void anotherPropertysRuleDoesNotApply() throws Exception {
        Fixture f = bookable();
        Fixture other = bookable();
        fixtures.addRateRule("PROPERTY", other.propertyId, null, "TEST_OTHER_RULE", 99,
                null, null, null, PROPERTY_RULE, null);

        expectNightlyFrom(f, BASE);
    }

    // ------------------------------------------------------------- adjustments

    @Test
    @DisplayName("an adjustment percentage is applied to the base price")
    void adjustmentAppliesToBase() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_UPLIFT", 0,
                null, null, null, null, new BigDecimal("25.000"));

        // Doc 56 §3.1: base * (1 + pct/100) = 1,000,000 * 1.25.
        expectNightlyFrom(f, 1_250_000L);
    }

    @Test
    @DisplayName("an adjustment with no base price to adjust yields no price at all")
    void adjustmentWithoutBaseYieldsNothing() throws Exception {
        Fixture f = bookable();
        fixtures.clearBasePrice(f.roomTypeId);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_UPLIFT", 0,
                null, null, null, null, new BigDecimal("25.000"));

        // Never "25% of nothing". An unpriced room type is not sellable, so it is
        // omitted entirely — brief §28.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // -------------------------------------------------------------------- ties

    @Test
    @DisplayName("two equally applicable rules are a configuration error, not a coin flip")
    void tiedRulesAreRefused() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_RULE_A", 5,
                null, null, null, ROOM_TYPE_RULE, null);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_RULE_B", 5,
                null, null, null, DATED_RULE, null);

        // Doc 56 §3.1: "Ties on (priority, specificity) are a configuration
        // error, not a coin flip." Picking one silently would make the price
        // depend on PostgreSQL's row order.
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("RATE_RULE_TIE"));
    }

    @Test
    @DisplayName("a tie broken by priority resolves cleanly")
    void tieBrokenByPriorityResolves() throws Exception {
        Fixture f = bookable();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_RULE_A", 5,
                null, null, null, ROOM_TYPE_RULE, null);
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_RULE_B", 6,
                null, null, null, DATED_RULE, null);

        expectNightlyFrom(f, DATED_RULE);
    }

    // ---------------------------------------------------------- multi-night min

    @Test
    @DisplayName("nightlyFrom is the lowest night of the stay")
    void nightlyFromIsTheLowestNight() throws Exception {
        Fixture f = bookable();
        LocalDate secondNight = CHECK_IN.plusDays(1);
        fixtures.setInventory(f.roomTypeId, secondNight, 5, 0, 0, 0);

        // A cheaper rule on the second night only.
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "TEST_CHEAP_NIGHT", 5,
                secondNight, secondNight, null, 500_000L, null);

        mockMvc.perform(get("/api/v1/public/request-pricing/properties/" + f.slug
                        + "?checkIn=" + CHECK_IN + "&checkOut=" + secondNight.plusDays(1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(500_000L));
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, UUID roomTypeId, String slug) {
    }

    private Fixture bookable() throws Exception {
        UUID partnerId = fixtures.createPartner("rate");
        UUID admin = fixtures.createUser("rate-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        fixtures.openProperty(propertyId);

        UUID roomTypeId = fixtures.addRoomType(propertyId,
                "test-room-" + UUID.randomUUID().toString().substring(0, 8));
        fixtures.publishRoomType(roomTypeId);
        fixtures.setBasePrice(roomTypeId, BASE);

        for (LocalDate date = CHECK_IN; !date.isAfter(CHECK_OUT); date = date.plusDays(1)) {
            fixtures.setInventory(roomTypeId, date, 5, 0, 0, 0);
        }
        fixtures.setSetting("MAX_ROOMS_PER_REQUEST", "5");

        return new Fixture(partnerId, propertyId, roomTypeId, fixtures.slugOf(propertyId));
    }

    private void expectNightlyFrom(Fixture f, long amountMinor) throws Exception {
        mockMvc.perform(get(availability(f)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(amountMinor));
    }

    private String availability(Fixture f) {
        return "/api/v1/public/request-pricing/properties/" + f.slug
                + "?checkIn=" + CHECK_IN + "&checkOut=" + CHECK_OUT;
    }
}
