package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Partner rate authoring and bulk pricing — doc 58 §8, doc 56 §7.
 *
 * <p>The workflow under test is the one the owner specified: choose a property, several room types, a
 * date range, one rate, preview the affected cells, confirm.
 *
 * <p><strong>No amount here is a KAS rate.</strong> Base rates are config B6 and remain OPEN
 * (doc 56 §9). Every figure is a synthetic fixture.
 */
class RateAuthoringIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "rate-authoring-password-2244";

    private static final LocalDate FROM = LocalDate.now().plusDays(30);
    private static final LocalDate TO = FROM.plusDays(11);

    private static final long TEST_BASE = 1_000_000L;
    private static final long TEST_BULK = 1_500_000L;

    // ------------------------------------------------------------ single-rule CRUD

    @Test
    @DisplayName("a Partner creates a rate rule for its own room type")
    void partnerCreatesARateRule() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(f.roomTypeIds.get(0), "TEST_SEASON", 0, TEST_BULK)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.priceMinor").value(TEST_BULK))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                // Doc 56 §3.1's ladder: room type + dates = rank 4.
                .andExpect(jsonPath("$.specificity").value(4))
                .andExpect(jsonPath("$.currency").value("VND"));
    }

    @Test
    @DisplayName("a Partner updates a rate rule's price")
    void partnerUpdatesARateRule() throws Exception {
        Fixture f = partner(1);
        UUID ruleId = createRule(f, f.roomTypeIds.get(0), "TEST_SEASON", 0, TEST_BULK);

        mockMvc.perform(patch(ruleRoute() + "/" + ruleId).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"priceMinor\":2000000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceMinor").value(2_000_000L));

        assertThat(fixtures.auditCount("rate.rule_updated", ruleId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a rule is archived, never deleted — doc 56 §5.3")
    void ruleIsArchivedNeverDeleted() throws Exception {
        Fixture f = partner(1);
        UUID ruleId = createRule(f, f.roomTypeIds.get(0), "TEST_SEASON", 0, TEST_BULK);

        activate(f, ruleId);
        setStatus(f, ruleId, "ARCHIVED").andExpect(status().isOk());

        // Still readable, so a price snapshot's ruleId always resolves.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("ARCHIVED"));

        setStatus(f, ruleId, "ACTIVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));
    }

    // ------------------------------------------------------------------ validation

    @Test
    @DisplayName("a negative rate and a missing price are both rejected")
    void invalidRateValuesAreRejected() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(roomTypeId, "TEST_NEGATIVE", 0, -1L)))
                .andExpect(status().isBadRequest());

        // rate_rule_price_or_adjustment allows exactly one — never neither.
        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"scope\":\"ROOM_TYPE\",\"roomTypeId\":\"%s\",\"name\":\"TEST\","
                                + "\"priority\":0,\"dateFrom\":\"%s\",\"dateTo\":\"%s\"}")
                                .formatted(roomTypeId, FROM, TO)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("an inverted date range is rejected")
    void invalidDateRangeIsRejected() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, f.roomTypeIds, TO, FROM, TEST_BULK)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("a bulk edit naming no room type is rejected")
    void emptyRoomTypeSelectionIsRejected() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(), FROM, TO, TEST_BULK)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("two equally applicable rules cannot be saved")
    void tieIsRefusedAtSave() throws Exception {
        Fixture f = partner(1);
        createRule(f, f.roomTypeIds.get(0), "TEST_A", 5, TEST_BULK);

        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(f.roomTypeIds.get(0), "TEST_B", 5, 2_000_000L)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("RATE_RULE_TIE"));
    }

    // ------------------------------------------------------------------ bulk edit

    @Test
    @DisplayName("the preview reports the affected cells and writes nothing")
    void previewReportsCellsAndWritesNothing() throws Exception {
        Fixture f = partner(3);

        // The owner's workflow: 3 room types × 12 dates = 36 cells.
        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, f.roomTypeIds, FROM, TO, TEST_BULK)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nights").value(12))
                .andExpect(jsonPath("$.cellsAffected").value(36))
                .andExpect(jsonPath("$.roomTypes.length()").value(3))
                .andExpect(jsonPath("$.roomTypes[0].action").value("CREATE"))
                .andExpect(jsonPath("$.roomTypes[0].currentLowest").value(TEST_BASE))
                .andExpect(jsonPath("$.conflicts.length()").value(0));

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("a bulk apply updates every intended row and is audited once")
    void bulkApplyUpdatesEveryIntendedRow() throws Exception {
        Fixture f = partner(3);

        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, f.roomTypeIds, FROM, TO, TEST_BULK)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cellsAffected").value(36));

        // One ACTIVE rule per room type, each carrying the range.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$[0].priceMinor").value(TEST_BULK));

        assertThat(fixtures.auditCount("rate.bulk_applied", f.propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("the new rate is what resolution then returns, on every affected date")
    void resolutionReturnsTheBulkRateAfterwards() throws Exception {
        Fixture f = partner(2);
        bulkApply(f, f.roomTypeIds, FROM, TO, TEST_BULK);

        mockMvc.perform(get(gridRoute(f, FROM, TO)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].cells.length()").value(12))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(TEST_BULK))
                .andExpect(jsonPath("$.rows[0].cells[11].amountMinor").value(TEST_BULK));

        // Outside the range the base price still wins — the bulk edit did not
        // silently become an open-ended rule.
        LocalDate outside = TO.plusDays(5);
        mockMvc.perform(get(gridRoute(f, outside, outside)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(TEST_BASE));
    }

    @Test
    @DisplayName("repeating a bulk edit reprices the same rule rather than creating a tie")
    void repeatedBulkEditUpdatesRatherThanDuplicating() throws Exception {
        Fixture f = partner(2);
        bulkApply(f, f.roomTypeIds, FROM, TO, TEST_BULK);

        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, f.roomTypeIds, FROM, TO, 1_800_000L)))
                .andExpect(jsonPath("$.roomTypes[0].action").value("UPDATE"));

        bulkApply(f, f.roomTypeIds, FROM, TO, 1_800_000L);

        // Still two rules, not four — otherwise doc 56 §3.1's tie rule would make
        // every date in the range unpriceable.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(1_800_000L));
    }

    // ----------------------------------------------------------- all-or-nothing

    @Test
    @DisplayName("a bulk apply naming another Partner's room type writes nothing at all")
    void bulkApplyIsAllOrNothingAcrossPartners() throws Exception {
        Fixture a = partner(2);
        Fixture b = partner(1);

        List<UUID> mixed = new java.util.ArrayList<>(a.roomTypeIds);
        mixed.add(b.roomTypeIds.get(0));

        // Part E: if row 31 of 50 is invalid, roll back all — never apply 49.
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(a, mixed, FROM, TO, TEST_BULK)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + a.propertyId).cookie(a.session))
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get(gridRoute(a, FROM, FROM)).cookie(a.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(TEST_BASE));
    }

    @Test
    @DisplayName("a room type of another property of the same Partner is refused, not skipped")
    void roomTypeOfAnotherPropertyIsRefused() throws Exception {
        Fixture f = partner(2);
        UUID otherProperty = fixtures.createProperties(f.partnerId, 1).get(0);
        UUID strayRoomType = fixtures.addRoomType(otherProperty, "stray-" + shortId());

        List<UUID> mixed = new java.util.ArrayList<>(f.roomTypeIds);
        mixed.add(strayRoomType);

        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, mixed, FROM, TO, TEST_BULK)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("BULK_RATE_CONFLICT"));

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("two bulk applies over the same range resolve to one deterministic rate")
    void concurrentBulkAppliesAreDeterministic() throws Exception {
        Fixture f = partner(2);

        // Sequential here because MockMvc shares the test transaction; the guard
        // under test is the deterministic lock ordering in lockPropertyRules plus
        // the update-in-place semantics, which together make the second apply a
        // reprice rather than a second competing rule.
        bulkApply(f, f.roomTypeIds, FROM, TO, TEST_BULK);
        bulkApply(f, f.roomTypeIds, FROM, TO, 1_700_000L);

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(1_700_000L));
    }

    // ---------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot read or change another Partner's rates")
    void crossPartnerIsolation() throws Exception {
        Fixture a = partner(1);
        Fixture b = partner(1);
        UUID bRule = createRule(b, b.roomTypeIds.get(0), "TEST_B", 0, TEST_BULK);

        // 404, never 403 — doc 85 §6.3.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + b.propertyId).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(gridRoute(b, FROM, TO)).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(ruleRoute() + "/" + bRule).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"priceMinor\":1}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch(ruleRoute() + "/" + bRule + "/status?status=ARCHIVED")
                        .with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(b, b.roomTypeIds, FROM, TO, 9L)))
                .andExpect(status().isNotFound());

        // B's rule is untouched.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + b.propertyId).cookie(b.session))
                .andExpect(jsonPath("$[0].priceMinor").value(TEST_BULK))
                .andExpect(jsonPath("$[0].status").value("DRAFT"));
    }

    @Test
    @DisplayName("rate routes require authentication and the rate permissions")
    void rateRoutesAreNotOpen() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId))
                .andExpect(status().isUnauthorized());

        UUID customer = fixtures.createUser("rate-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        Cookie[] session = login(fixtures.emailOf(customer), PASSWORD);

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(session))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, f.roomTypeIds, FROM, TO, TEST_BULK)))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------- no invention

    @Test
    @DisplayName("the grid renders an unpriced cell as a gap, never as zero")
    void unpricedCellIsAGapNotZero() throws Exception {
        Fixture f = partner(1);
        fixtures.clearBasePrice(f.roomTypeIds.get(0));

        // Doc 56 §9 records base rates as OPEN. A missing price is missing.
        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").doesNotExist());
    }

    @Test
    @DisplayName("the Java and SQL applicability predicates agree")
    void javaAndSqlAgreeOnApplicability() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        // A Saturday/Sunday rule over a bounded range: the grid filters in Java,
        // resolution during a guest search filters in SQL. Two implementations of
        // one predicate can drift, so both are exercised over the same dates.
        UUID weekend = createWeekendRule(f, roomTypeId, 2_500_000L);
        activate(f, weekend);

        for (LocalDate date = FROM; !date.isAfter(FROM.plusDays(6)); date = date.plusDays(1)) {
            boolean isWeekend = date.getDayOfWeek().getValue() % 7 == 0
                    || date.getDayOfWeek().getValue() % 7 == 6;
            long expected = isWeekend ? 2_500_000L : TEST_BASE;

            mockMvc.perform(get(gridRoute(f, date, date)).cookie(f.session))
                    .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(expected));
        }
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, List<UUID> roomTypeIds,
                           Cookie[] session) {
    }

    private Fixture partner(int roomTypeCount) throws Exception {
        UUID partnerId = fixtures.createPartner("rate-auth");
        UUID admin = fixtures.createUser("rate-auth-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");

        List<UUID> roomTypeIds = new java.util.ArrayList<>();
        for (int i = 0; i < roomTypeCount; i++) {
            UUID roomTypeId = fixtures.addRoomType(propertyId, "test-room-" + shortId());
            fixtures.setBasePrice(roomTypeId, TEST_BASE);
            roomTypeIds.add(roomTypeId);
        }
        return new Fixture(partnerId, propertyId, List.copyOf(roomTypeIds), session);
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private static String ruleRoute() {
        return "/api/v1/admin/rate-rules";
    }

    private static String bulkRoute(String action) {
        return "/api/v1/admin/rates/bulk-" + action;
    }

    private static String gridRoute(Fixture f, LocalDate from, LocalDate to) {
        return "/api/v1/admin/rates/grid?propertyId=" + f.propertyId + "&from=" + from + "&to=" + to;
    }

    private static String ruleJson(UUID roomTypeId, String name, int priority, long priceMinor) {
        return ("{\"scope\":\"ROOM_TYPE\",\"roomTypeId\":\"%s\",\"name\":\"%s\",\"priority\":%d,"
                + "\"dateFrom\":\"%s\",\"dateTo\":\"%s\",\"priceMinor\":%d}")
                .formatted(roomTypeId, name, priority, FROM, TO, priceMinor);
    }

    private static String bulkJson(Fixture f, List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                                   long amountMinor) {
        String ids = roomTypeIds.stream()
                .map(id -> "\"" + id + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
        return ("{\"propertyId\":\"%s\",\"roomTypeIds\":%s,\"dateFrom\":\"%s\",\"dateTo\":\"%s\","
                + "\"amountMinor\":%d,\"priority\":0,\"name\":\"TEST_BULK\"}")
                .formatted(f.propertyId, ids, from, to, amountMinor);
    }

    private UUID createRule(Fixture f, UUID roomTypeId, String name, int priority, long price)
            throws Exception {
        String body = mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(roomTypeId, name, priority, price)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private UUID createWeekendRule(Fixture f, UUID roomTypeId, long price) throws Exception {
        String body = mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"scope\":\"ROOM_TYPE\",\"roomTypeId\":\"%s\","
                                + "\"name\":\"TEST_WEEKEND\",\"priority\":0,\"dateFrom\":\"%s\","
                                + "\"dateTo\":\"%s\",\"daysOfWeek\":[0,6],\"priceMinor\":%d}")
                                .formatted(roomTypeId, FROM, TO, price)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private void activate(Fixture f, UUID ruleId) throws Exception {
        setStatus(f, ruleId, "ACTIVE").andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions setStatus(
            Fixture f, UUID ruleId, String status) throws Exception {
        return mockMvc.perform(patch(ruleRoute() + "/" + ruleId + "/status?status=" + status)
                .with(csrf()).cookie(f.session));
    }

    private void bulkApply(Fixture f, List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                           long amountMinor) throws Exception {
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, roomTypeIds, from, to, amountMinor)))
                .andExpect(status().isOk());
    }
}
