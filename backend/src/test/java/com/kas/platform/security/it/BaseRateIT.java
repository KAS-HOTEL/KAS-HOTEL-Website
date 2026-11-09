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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base rates — doc 56 §3's Layer 0, doc 56 §7 "Set base rate · Per room type" — and the
 * overlapping-tie guard that closes OQ-148.
 *
 * <p><strong>No amount here is a KAS rate.</strong> Base rates are config B6 and remain OPEN (doc 56
 * §9). Every figure is a synthetic fixture created and discarded by the test.
 */
class BaseRateIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "base-rate-password-7781";

    private static final LocalDate FROM = LocalDate.now().plusDays(30);
    private static final LocalDate TO = FROM.plusDays(11);

    private static final long TEST_BASE = 1_200_000L;

    // --------------------------------------------------------------------- read

    @Test
    @DisplayName("a room type with no base rate is listed with no amount, never with zero")
    void unsetBaseRateIsAGapNotZero() throws Exception {
        Fixture f = partner(2);

        // Doc 56 §9 keeps B6 OPEN — every room type starts here, and an operator has to be able
        // to see which ones still have no fallback price.
        mockMvc.perform(get(baseRoute(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].amountMinor").doesNotExist())
                .andExpect(jsonPath("$[0].currency").value("VND"))
                .andExpect(jsonPath("$[0].roomTypeSlug").exists());
    }

    @Test
    @DisplayName("the base rate carries the room type's own version token")
    void baseRateCarriesTheRoomTypeVersion() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(get(baseRoute(f)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].version").value(0));

        setBase(f, f.roomTypeIds.get(0), TEST_BASE, 0).andExpect(status().isOk());

        // room_type is the row that changed, so room_type's version moved — no version was
        // invented for rate_rule, which has none.
        mockMvc.perform(get(baseRoute(f)).cookie(f.session))
                .andExpect(jsonPath("$[0].version").value(1));
    }

    // -------------------------------------------------------------------- write

    @Test
    @DisplayName("a Partner sets a base rate and the grid then resolves it")
    void settingABaseRatePricesEveryUnruledDate() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").doesNotExist());

        setBase(f, roomTypeId, TEST_BASE, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(TEST_BASE))
                .andExpect(jsonPath("$.currency").value("VND"));

        // Doc 56 §3.1: "if candidates empty: return roomType.base_price_minor". No rule exists,
        // so every date in the horizon now resolves — and with no winning rule.
        mockMvc.perform(get(gridRoute(f, FROM, TO)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(TEST_BASE))
                .andExpect(jsonPath("$.rows[0].cells[0].ruleId").doesNotExist())
                .andExpect(jsonPath("$.rows[0].cells[11].amountMinor").value(TEST_BASE));

        assertThat(fixtures.auditCount("rate.base_rate_set", roomTypeId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a rate rule still beats the base rate on the dates it covers")
    void aRuleStillOverridesTheBase() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);
        setBase(f, roomTypeId, TEST_BASE, 0).andExpect(status().isOk());

        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_800_000L);

        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(1_800_000L))
                .andExpect(jsonPath("$.rows[0].cells[0].ruleName").exists());

        // Outside the rule's range the base rate is what remains — the two are different layers,
        // not two names for one number.
        LocalDate outside = TO.plusDays(3);
        mockMvc.perform(get(gridRoute(f, outside, outside)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(TEST_BASE))
                .andExpect(jsonPath("$.rows[0].cells[0].ruleName").doesNotExist());
    }

    @Test
    @DisplayName("clearing a base rate is not the same as pricing it at zero")
    void clearingIsNotZeroing() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        // Zero is a price the schema permits — room_type_price_nonneg allows it.
        setBase(f, roomTypeId, 0L, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(0));
        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(0));

        // Clearing returns the room type to having no price at all, which RateResolver treats as
        // not sellable rather than free.
        mockMvc.perform(put(baseWriteRoute(roomTypeId)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").doesNotExist());

        mockMvc.perform(get(gridRoute(f, FROM, FROM)).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").doesNotExist());
    }

    @Test
    @DisplayName("a negative base rate is rejected and a stale version is a conflict")
    void invalidBaseRatesAreRejected() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        setBase(f, roomTypeId, -1L, 0).andExpect(status().isBadRequest());

        mockMvc.perform(put(baseWriteRoute(roomTypeId)).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":%d}".formatted(TEST_BASE)))
                .andExpect(status().isBadRequest());

        setBase(f, roomTypeId, TEST_BASE, 0).andExpect(status().isOk());

        // Doc 58 §2 — version on MASTER updates, 409 on conflict. Someone else priced it first.
        setBase(f, roomTypeId, 999_000L, 0)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mockMvc.perform(get(baseRoute(f)).cookie(f.session))
                .andExpect(jsonPath("$[0].amountMinor").value(TEST_BASE));
    }

    // ---------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot read or set another Partner's base rates")
    void baseRatesAreScoped() throws Exception {
        Fixture a = partner(1);
        Fixture b = partner(1);

        // 404, never 403 — doc 85 §6.3.
        mockMvc.perform(get(baseRoute(b)).cookie(a.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(put(baseWriteRoute(b.roomTypeIds.get(0))).with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":9,\"version\":0}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(get(baseRoute(b)).cookie(b.session))
                .andExpect(jsonPath("$[0].amountMinor").doesNotExist());
    }

    @Test
    @DisplayName("the base-rate routes require authentication and the rate permissions")
    void baseRateRoutesAreNotOpen() throws Exception {
        Fixture f = partner(1);

        mockMvc.perform(get(baseRoute(f))).andExpect(status().isUnauthorized());

        UUID customer = fixtures.createUser("base-rate-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        Cookie[] session = login(fixtures.emailOf(customer), PASSWORD);

        mockMvc.perform(get(baseRoute(f)).cookie(session)).andExpect(status().isForbidden());
        mockMvc.perform(put(baseWriteRoute(f.roomTypeIds.get(0))).with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\":1,\"version\":0}"))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------- OQ-148

    @Test
    @DisplayName("a bulk edit that would create an overlapping tie is refused at preview")
    void overlappingTieIsCaughtByThePreview() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        // An existing dated room-type rule at priority 0 — specificity 4.
        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_500_000L);

        // A second edit at the same priority whose range merely OVERLAPS: not an exact match, so
        // the old preview called it CREATE and applied it, and the grid then refused every
        // overlapping date.
        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(roomTypeId), FROM.plusDays(5), TO.plusDays(5),
                                1_700_000L, 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conflicts.length()").value(1))
                .andExpect(jsonPath("$.conflicts[0]").value(
                        org.hamcrest.Matchers.containsString("same specificity")));
    }

    @Test
    @DisplayName("a bulk apply that would create an overlapping tie writes nothing")
    void overlappingTieIsRefusedByApply() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);
        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_500_000L);

        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(roomTypeId), FROM.plusDays(5), TO.plusDays(5),
                                1_700_000L, 0)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("BULK_RATE_CONFLICT"));

        // Still one rule, and the grid still prices every date.
        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get(gridRoute(f, FROM, TO)).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(1_500_000L));
    }

    @Test
    @DisplayName("an overlapping edit at a different priority is not a tie")
    void differentPriorityIsNotATie() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);
        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_500_000L);

        // Doc 56 §3.1 orders on priority first, so a higher one resolves cleanly.
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(roomTypeId), FROM.plusDays(5), TO.plusDays(5),
                                1_700_000L, 5)))
                .andExpect(status().isOk());

        mockMvc.perform(get(gridRoute(f, FROM.plusDays(5), FROM.plusDays(5))).cookie(f.session))
                .andExpect(jsonPath("$.rows[0].cells[0].amountMinor").value(1_700_000L));
    }

    @Test
    @DisplayName("a non-overlapping edit at the same priority is not a tie")
    void adjacentRangeIsNotATie() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);
        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_500_000L);

        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(roomTypeId), TO.plusDays(1), TO.plusDays(10),
                                1_700_000L, 0)))
                .andExpect(status().isOk());

        mockMvc.perform(get(ruleRoute() + "?propertyId=" + f.propertyId).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    @DisplayName("repeating the identical edit is still a reprice, not a tie")
    void repeatedIdenticalEditIsStillAnUpdate() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);
        bulkApply(f, List.of(roomTypeId), FROM, TO, 1_500_000L);

        // The rule being repriced overlaps itself; excluding it is what keeps a correction working.
        mockMvc.perform(post(bulkRoute("preview")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, List.of(roomTypeId), FROM, TO, 1_900_000L, 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conflicts.length()").value(0))
                .andExpect(jsonPath("$.roomTypes[0].action").value("UPDATE"));
    }

    @Test
    @DisplayName("creating a rule that overlaps an existing one of equal rank is refused")
    void overlappingTieIsRefusedAtCreate() throws Exception {
        Fixture f = partner(1);
        UUID roomTypeId = f.roomTypeIds.get(0);

        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(roomTypeId, "TEST_SEASON", 0, 1_500_000L, FROM, TO)))
                .andExpect(status().isCreated());

        // Different dates, so the exact-shape guard sees nothing — but the ranges overlap and both
        // rules rank identically, which doc 56 §3.1 calls a configuration error.
        mockMvc.perform(post(ruleRoute()).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson(roomTypeId, "TEST_PROMO", 0, 1_700_000L,
                                FROM.plusDays(5), TO.plusDays(5))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].code").value("RATE_RULE_TIE"));
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, List<UUID> roomTypeIds,
                           Cookie[] session) {
    }

    private Fixture partner(int roomTypeCount) throws Exception {
        UUID partnerId = fixtures.createPartner("base-rate");
        UUID admin = fixtures.createUser("base-rate-admin", PASSWORD);
        fixtures.grantPartnerOperations(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");

        List<UUID> roomTypeIds = new java.util.ArrayList<>();
        for (int i = 0; i < roomTypeCount; i++) {
            roomTypeIds.add(fixtures.addRoomType(propertyId,
                    "test-room-" + UUID.randomUUID().toString().substring(0, 8)));
        }
        return new Fixture(partnerId, propertyId, List.copyOf(roomTypeIds), session);
    }

    private ResultActions setBase(Fixture f, UUID roomTypeId, long amountMinor, int version)
            throws Exception {
        return mockMvc.perform(put(baseWriteRoute(roomTypeId)).with(csrf()).cookie(f.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountMinor\":%d,\"version\":%d}".formatted(amountMinor, version)));
    }

    private void bulkApply(Fixture f, List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                           long amountMinor) throws Exception {
        mockMvc.perform(post(bulkRoute("apply")).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bulkJson(f, roomTypeIds, from, to, amountMinor, 0)))
                .andExpect(status().isOk());
    }

    private static String baseRoute(Fixture f) {
        return "/api/v1/admin/rates/base?propertyId=" + f.propertyId;
    }

    private static String baseWriteRoute(UUID roomTypeId) {
        return "/api/v1/admin/rates/base/" + roomTypeId;
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

    private static String ruleJson(UUID roomTypeId, String name, int priority, long priceMinor,
                                   LocalDate from, LocalDate to) {
        return ("{\"scope\":\"ROOM_TYPE\",\"roomTypeId\":\"%s\",\"name\":\"%s\",\"priority\":%d,"
                + "\"dateFrom\":\"%s\",\"dateTo\":\"%s\",\"priceMinor\":%d}")
                .formatted(roomTypeId, name, priority, from, to, priceMinor);
    }

    private static String bulkJson(Fixture f, List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                                   long amountMinor, int priority) {
        String ids = roomTypeIds.stream()
                .map(id -> "\"" + id + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
        return ("{\"propertyId\":\"%s\",\"roomTypeIds\":%s,\"dateFrom\":\"%s\",\"dateTo\":\"%s\","
                + "\"amountMinor\":%d,\"priority\":%d,\"name\":\"TEST_BULK\"}")
                .formatted(f.propertyId, ids, from, to, amountMinor, priority);
    }
}
