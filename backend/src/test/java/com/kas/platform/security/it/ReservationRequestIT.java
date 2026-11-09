package com.kas.platform.security.it;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code POST /api/v1/public/reservations/requests} — Step 16A Phase E4.
 *
 * <p>The governing contract is doc 117: the frozen request and 201 of §4 and
 * §12, the S1 guard and effects of §7 and §8, A6 and B2 at {@code PT24H}
 * (§9, §10), the idempotency rules of §5 and §24.1, and the refusals of §13.
 */
class ReservationRequestIT extends SecurityIntegrationTest {

    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(20);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 1_000_000L;
    private static final long PT24H_SECONDS = Duration.ofHours(24).toSeconds();

    // ---- the happy path -----------------------------------------------------

    @Test
    @DisplayName("an anonymous guest submits a request and receives the frozen 201")
    void anonymousGuestSubmits() throws Exception {
        Fixture f = property();

        submit(f, key("happy"), body(f, 2, 1))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reference").exists())
                // Doc 58 §3.3 — guest vocabulary, never salesStatus.
                .andExpect(jsonPath("$.status").value("REQUEST_RECEIVED"))
                .andExpect(jsonPath("$.responsePromise").exists())
                .andExpect(jsonPath("$.estimatedTotal.amountMinor").value(RATE * 2))
                .andExpect(jsonPath("$.estimatedTotal.currency").value("VND"))
                .andExpect(jsonPath("$.estimatedTotal.exponent").value(0))
                .andExpect(jsonPath("$.estimateDisclaimer").exists())
                // Delivery is OQ-162 and out of Step 16A, so no link was issued and
                // the response says so rather than claiming otherwise.
                .andExpect(jsonPath("$.trackingUrlIssued").value(false));

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.reservationLineCount()).isEqualTo(1);
        assertThat(fixtures.statusHistoryCount()).isEqualTo(1);
        assertThat(fixtures.idempotencyCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("the server sets leadSource = WEBSITE and the two lifecycles start correctly")
    void serverControlledFields() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("lead"), body(f, 2, 1)));

        // Doc 58:157 — a client cannot supply leadSource.
        assertThat(fixtures.reservationText(reference, "lead_source")).isEqualTo("WEBSITE");
        assertThat(fixtures.reservationText(reference, "channel_type")).isEqualTo("DIRECT");
        assertThat(fixtures.reservationText(reference, "sales_status")).isEqualTo("REQUESTED");
        // Doc 05 — stay_status is NULL until confirmed; CONFIRMED belongs to S10.
        assertThat(fixtures.reservationText(reference, "stay_status")).isNull();
        // OQ-016 closed: anonymous guest, no account.
        assertThat(fixtures.reservationText(reference, "customer_id")).isNull();
    }

    @Test
    @DisplayName("A6 — sla_due_at is exactly PT24H after requested_at")
    void slaIsPt24h() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("sla"), body(f, 2, 1)));

        assertThat(fixtures.reservationSecondsBetween(reference, "requested_at", "sla_due_at"))
                .as("doc 117 §9 — sla_due_at = requested_at + PT24H")
                .isEqualTo(PT24H_SECONDS);
    }

    @Test
    @DisplayName("responsePromise and sla_due_at come from the same A6 value")
    void responsePromiseMatchesTheSlaSource() throws Exception {
        Fixture f = property();
        MvcResult result = submit(f, key("promise"), body(f, 2, 1)).andReturn();
        String reference = referenceOf(result);
        String promise = result.getResponse().getContentAsString();

        // The stored deadline is PT24H after the request...
        assertThat(fixtures.reservationSecondsBetween(reference, "requested_at", "sla_due_at"))
                .isEqualTo(PT24H_SECONDS);
        // ...and the guest-facing wording states the same 24 hours. Doc 117 §9
        // forbids the two being computed by different logic.
        //
        // English, because doc 58 §3.3 writes these two strings in English and the
        // backend has no i18n mechanism — a Vietnamese translation would be copy
        // this step invented, which config B27 (OQ-061) reserves for a copywriter.
        assertThat(promise).contains("Within 24 hours");
        assertThat(promise).contains("Final amount is confirmed by the KAS team.");
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("B2 — the request hold expires exactly PT24H after requested_at, one row per night")
    void holdUsesB2() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("hold"), body(f, 2, 1)));

        assertThat(fixtures.holdSecondsFromRequest(reference))
                .as("doc 117 §10 — expires_at = requested_at + PT24H")
                .isEqualTo(PT24H_SECONDS);
        // V13 — one hold row per night. Two nights, one room type.
        assertThat(fixtures.holdCountFor(reference)).isEqualTo(2);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the hold moves direct_committed, so it actually reduces availability")
    void holdReducesAvailability() throws Exception {
        Fixture f = property();
        int before = fixtures.availableDirect(f.roomTypeId, CHECK_IN);

        submit(f, key("commit"), body(f, 2, 2)).andExpect(status().isCreated());

        // Doc 53 §4.2 — direct_committed caches direct reservations AND active
        // direct holds. A hold that skipped it would be invisible here.
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
        assertThat(fixtures.availableDirect(f.roomTypeId, CHECK_IN)).isEqualTo(before - 2);
        // The check-out night is not occupied and must be untouched — doc 55 §2.
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_OUT)).isZero();
    }

    @Test
    @DisplayName("acceptedTermsVersion is stored opaquely, exactly as sent")
    void termsVersionStoredOpaquely() throws Exception {
        Fixture f = property();
        String odd = "not-a-real-policy-version-àé-42";
        String reference = referenceOf(submit(f, key("terms"),
                bodyWithTerms(f, 2, 1, odd)));

        // OQ-167, closed by doc 117 §24.2 — stored verbatim, never validated,
        // never looked up. A value no policy catalogue could match is accepted.
        assertThat(fixtures.reservationText(reference, "terms_version")).isEqualTo(odd);
    }

    @Test
    @DisplayName("the price snapshot records every night with its rate, and no tax")
    void priceSnapshotIsWritten() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("snap"), body(f, 2, 1)));
        String snapshot = compact(fixtures.reservationText(reference, "price_snapshot"));

        assertThat(snapshot).isNotNull();
        assertThat(snapshot).contains("PER_ROOM_PER_NIGHT");
        assertThat(snapshot).contains(CHECK_IN.toString());
        assertThat(snapshot).contains(CHECK_IN.plusDays(1).toString());
        // The check-out night is not charged and must not appear.
        assertThat(snapshot).doesNotContain(CHECK_OUT.toString());
        assertThat(snapshot).contains("\"rateMinor\":" + RATE);
        assertThat(snapshot).contains("\"totalMinor\":" + RATE * 2);

        // Doc 117 §14.2 — tax left V1, so the snapshot carries neither field.
        assertThat(snapshot).doesNotContain("taxes").doesNotContain("serviceChargeMinor");
        assertThat(fixtures.reservationText(reference, "tax_minor")).isNull();
        assertThat(fixtures.reservationText(reference, "service_charge_minor")).isNull();

        // Doc 125 §11 — the typed shape. `propertySlug` is still not a snapshot
        // field: §7.2 admits propertyId and propertyName and nothing further.
        assertThat(snapshot).doesNotContain("propertySlug");
    }

    @Test
    @DisplayName("the snapshot is revision 1 and freezes the property's identity — OQ-171")
    void snapshotCarriesRevisionAndPropertyIdentity() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("rev"), body(f, 2, 1)));
        String snapshot = compact(fixtures.reservationText(reference, "price_snapshot"));

        // Doc 125 §4–§6: the snapshot's own revision number, 1 at S1.
        assertThat(snapshot).contains("\"version\":1");
        // Doc 125 §7: reservation.version is the optimistic-lock column. It starts
        // at 0, is never read or written here, and must not be confused with the
        // snapshot's revision — the two would be indistinguishable if it moved.
        assertThat(fixtures.reservationText(reference, "version")).isEqualTo("0");

        // Doc 125 §7.2 — both, frozen at snapshot time.
        assertThat(snapshot).contains("\"propertyId\":\"" + f.propertyId() + "\"");
        assertThat(snapshot).contains("\"propertyName\":\"TEST_PROPERTY\"");
    }

    @Test
    @DisplayName("propertyName is the request locale's name, not whichever row is found first")
    void snapshotPropertyNameFollowsRequestLocale() throws Exception {
        Fixture f = property();
        fixtures.setPropertyName(f.propertyId(), "en", "ENGLISH_NAME");
        fixtures.setPropertyName(f.propertyId(), "vi", "TIENG_VIET_NAME");

        // Doc 125 §7.2 — the same locale mechanism room_type_name_snapshot uses.
        String vi = compact(fixtures.reservationText(
                referenceOf(submitIn("vi", key("loc-vi"), body(f, 2, 1))), "price_snapshot"));
        assertThat(vi).contains("TIENG_VIET_NAME").doesNotContain("ENGLISH_NAME");

        String en = compact(fixtures.reservationText(
                referenceOf(submitIn("en", key("loc-en"), body(f, 2, 1))), "price_snapshot"));
        assertThat(en).contains("ENGLISH_NAME").doesNotContain("TIENG_VIET_NAME");
    }

    @Test
    @DisplayName("appliedRuleIds is the DISTINCT union — a rule pricing both nights appears once")
    void appliedRuleIdsAreDistinct() throws Exception {
        Fixture f = property();
        UUID ruleId = fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "BOTH_NIGHTS", 10,
                CHECK_IN, CHECK_OUT, null, 1_750_000L, null);

        String snapshot = compact(fixtures.reservationText(
                referenceOf(submit(f, key("distinct"), body(f, 2, 1))), "price_snapshot"));

        // Both nights carry the rule, so nights[] mentions it twice...
        assertThat(countOf(snapshot, "\"ruleId\":\"" + ruleId + "\"")).isEqualTo(2);
        // ...and appliedRuleIds carries it exactly once. Doc 125 §8.1.
        assertThat(appliedRuleIdsOf(snapshot)).containsExactly(ruleId.toString());
    }

    @Test
    @DisplayName("appliedRuleIds sort ascending by canonical lowercase UUID string — OQ-171 §8.3")
    void appliedRuleIdsAreOrderedByUuidString() throws Exception {
        Fixture f = property();
        // One rule per night, so two distinct ids reach the union in night order.
        // Both ends of a rate rule's range are INCLUSIVE — `date_from <= :on AND
        // date_to >= :on` — so each rule is written as a single-day range. Ranges
        // that overlapped at equal priority would be a RATE_RULE_TIE, not a stay.
        UUID first = fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "NIGHT_ONE", 10,
                CHECK_IN, CHECK_IN, null, 1_750_000L, null);
        UUID second = fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "NIGHT_TWO", 10,
                CHECK_IN.plusDays(1), CHECK_IN.plusDays(1), null, 1_950_000L, null);

        String snapshot = compact(fixtures.reservationText(
                referenceOf(submit(f, key("order"), body(f, 2, 1))), "price_snapshot"));

        List<String> expected = Stream.of(first.toString(), second.toString()).sorted().toList();
        assertThat(appliedRuleIdsOf(snapshot))
                .as("ascending by canonical lowercase UUID string, from %s and %s", first, second)
                .containsExactlyElementsOf(expected);
        // The ordering is the string's, not UUID.compareTo's — those disagree
        // whenever the signed 64-bit halves rank differently from the text.
        assertThat(appliedRuleIdsOf(snapshot)).isSorted();
    }

    @Test
    @DisplayName("a base-rate-only stay yields appliedRuleIds: [] — present, not omitted")
    void appliedRuleIdsAreEmptyWhenNoRuleApplied() throws Exception {
        Fixture f = property();
        String snapshot = compact(fixtures.reservationText(
                referenceOf(submit(f, key("norule"), body(f, 2, 1))), "price_snapshot"));

        // Doc 125 §8.2 — explicit emptiness, so a reader can tell "no rule applied"
        // from "this snapshot predates the field".
        assertThat(snapshot).contains("\"appliedRuleIds\":[]");
        assertThat(appliedRuleIdsOf(snapshot)).isEmpty();
        assertThat(snapshot).doesNotContain("\"ruleId\"");
    }

    @Test
    @DisplayName("uniform nightly rates populate nightly_price_minor")
    void uniformNightsPopulateTheNightlyScalar() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("uniform"), body(f, 2, 1)));

        // Both nights priced by the same base rate. Doc 125 §9.
        assertThat(fixtures.reservationLineText(reference, f.roomTypeId, "nightly_price_minor"))
                .isEqualTo(String.valueOf(RATE));
    }

    @Test
    @DisplayName("varying nightly rates leave nightly_price_minor NULL; nights[] stays authoritative")
    void varyingNightsLeaveTheNightlyScalarNull() throws Exception {
        Fixture f = property();
        // A rule's range is inclusive at both ends, so this covers the first
        // charged night and nothing else; the second night falls back to the base
        // rate and the two nights therefore differ.
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "ONLY_FIRST_NIGHT", 10,
                CHECK_IN, CHECK_IN, null, 1_750_000L, null);

        String reference = referenceOf(submit(f, key("vary"), body(f, 2, 1)));

        // Doc 125 §9 — no first / lowest / highest / average stand-in. A figure
        // equal to no night actually charged is worse than an absent one.
        assertThat(fixtures.reservationLineText(reference, f.roomTypeId, "nightly_price_minor"))
                .isNull();

        // Doc 125 §10 — and nothing was lost: every night is still recorded.
        String snapshot = compact(fixtures.reservationText(reference, "price_snapshot"));
        assertThat(snapshot).contains("\"rateMinor\":1750000");
        assertThat(snapshot).contains("\"rateMinor\":" + RATE);
        assertThat(fixtures.reservationLineText(reference, f.roomTypeId, "line_total_minor"))
                .isEqualTo(String.valueOf(1_750_000L + RATE));
    }

    @Test
    @DisplayName("rule identity never reaches the guest, however rich the snapshot becomes")
    void ruleIdentityStaysOutOfThePublicResponse() throws Exception {
        Fixture f = property();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "PRIVATE_RULE", 10,
                CHECK_IN, CHECK_OUT, null, 1_750_000L, null);

        String responseBody = submit(f, key("leak"), body(f, 2, 1))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // Doc 58 §9's INTERNAL denylist. Persisting these changed nothing about
        // exposure — the snapshot is server-side and no endpoint returns it.
        assertThat(responseBody)
                .doesNotContain("appliedRuleIds")
                .doesNotContain("ruleId")
                .doesNotContain("PRIVATE_RULE")
                .doesNotContain("priceSnapshot")
                .doesNotContain("propertyId");
    }

    /** The ids inside {@code "appliedRuleIds":[...]}, in the order the snapshot stores them. */
    private static List<String> appliedRuleIdsOf(String compactSnapshot) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"appliedRuleIds\":\\[(.*?)]").matcher(compactSnapshot);
        assertThat(m.find()).as("appliedRuleIds must be present in %s", compactSnapshot).isTrue();
        String body = m.group(1);
        return body.isEmpty()
                ? List.of()
                : Stream.of(body.split(",")).map(s -> s.replace("\"", "").trim()).toList();
    }

    private static int countOf(String haystack, String needle) {
        int count = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
            count++;
        }
        return count;
    }

    private ResultActions submitIn(String locale, String idempotencyKey, String payload)
            throws Exception {
        return mockMvc.perform(post("/api/v1/public/reservations/requests")
                .param("locale", locale)
                .with(csrf())
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload));
    }

    @Test
    @DisplayName("a rate rule's identity is recorded, so the price path stays reconstructible")
    void snapshotRecordsRuleProvenance() throws Exception {
        Fixture f = property();
        fixtures.addRateRule("ROOM_TYPE", null, f.roomTypeId, "WEEKEND_TEST", 10,
                CHECK_IN, CHECK_OUT, null, 1_750_000L, null);

        String reference = referenceOf(submit(f, key("rule"), body(f, 2, 1)));
        String snapshot = compact(fixtures.reservationText(reference, "price_snapshot"));

        // Doc 56 §5.3 — "without ruleId, a pricing dispute six months later is
        // unanswerable".
        assertThat(snapshot).contains("WEEKEND_TEST").contains("ruleId");
        assertThat(snapshot).contains("\"rateMinor\":1750000");
    }

    @Test
    @DisplayName("with no rule, the base rate prices the stay and no rule identity is invented")
    void baseRateFallbackRecordsNoRule() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("base"), body(f, 2, 1)));
        String snapshot = compact(fixtures.reservationText(reference, "price_snapshot"));

        // ResolvedRate.fromBase leaves ruleId and ruleName null; omitting them is
        // the honest record that no rule applied.
        assertThat(snapshot).contains("\"rateMinor\":" + RATE);
        assertThat(snapshot).doesNotContain("ruleId");
    }

    // ---- idempotency --------------------------------------------------------

    @Test
    @DisplayName("a missing Idempotency-Key is 400 VALIDATION_FAILED, never 500")
    void missingKeyIsBadRequest() throws Exception {
        Fixture f = property();

        mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(f, 2, 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("Idempotency-Key"));

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("an invalid body is 400 and creates nothing")
    void invalidBodyIsBadRequest() throws Exception {
        Fixture f = property();

        // No guest block at all — full name, email and phone are required by doc 26 §8.
        String malformed = """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s","adults":2,"children":0,
                 "lines":[{"roomTypeSlug":"%s","quantity":1}]}
                """.formatted(f.propertySlug, CHECK_IN, CHECK_OUT, f.roomTypeSlug);

        submitRaw(key("invalid"), malformed)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("the same key with the same body returns the original result and creates nothing new")
    void retryReturnsTheOriginal() throws Exception {
        Fixture f = property();
        String key = key("retry");

        String first = submit(f, key, body(f, 2, 1))
                .andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString();

        String second = submit(f, key, body(f, 2, 1))
                .andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString();

        assertThat(second).as("doc 117 §5.3 — the original result, byte for byte")
                .isEqualTo(first);

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.holdCount()).isZero();
        assertThat(fixtures.reservationLineCount()).isEqualTo(1);
        assertThat(fixtures.idempotencyCount()).isEqualTo(1);
        // The second call must not have committed inventory a second time.
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("the same key with a different body is 409 IDEMPOTENCY_KEY_REUSED")
    void reusedKeyWithDifferentBodyIsConflict() throws Exception {
        Fixture f = property();
        String key = key("reuse");

        submit(f, key, body(f, 2, 1)).andExpect(status().isCreated());

        // One field differs — quantity. Doc 117 §24.1 forbids treating that as a retry.
        submit(f, key, body(f, 2, 2))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.holdCount()).isZero();
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("every field participates — a changed special request is a different request")
    void fingerprintCoversEveryField() throws Exception {
        Fixture f = property();
        String key = key("fields");

        submit(f, key, body(f, 2, 1)).andExpect(status().isCreated());

        // Doc 117 §24.1 forbids a field-specific comparison subset. specialRequests
        // is not a business input to pricing, and it still counts.
        String differsOnlyInANote = body(f, 2, 1)
                .replace("\"specialRequests\":null", "\"specialRequests\":\"late arrival\"");
        submitRaw(key, differsOnlyInANote)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test
    @DisplayName("this endpoint never returns DUPLICATE_REFERENCE — that stays OTA-only")
    void neverReturnsDuplicateReference() throws Exception {
        Fixture f = property();
        String key = key("ota");

        submit(f, key, body(f, 2, 1)).andExpect(status().isCreated());
        submit(f, key, body(f, 2, 2))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(org.hamcrest.Matchers.not("DUPLICATE_REFERENCE")));
    }

    @Test
    @DisplayName("the frozen 201 carries all six fields — non_null must never omit one")
    void everyFrozenResponseFieldIsPresent() throws Exception {
        Fixture f = property();

        // spring.jackson.default-property-inclusion: non_null omits null fields, so
        // a null slipping into any of these would silently change the frozen shape.
        submit(f, key("shape"), body(f, 2, 1))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reference").isString())
                .andExpect(jsonPath("$.status").isString())
                .andExpect(jsonPath("$.responsePromise").isString())
                .andExpect(jsonPath("$.trackingUrlIssued").isBoolean())
                .andExpect(jsonPath("$.estimatedTotal").exists())
                .andExpect(jsonPath("$.estimateDisclaimer").isString())
                // and nothing beyond the six the contract froze
                .andExpect(jsonPath("$.*", org.hamcrest.Matchers.hasSize(6)));
    }

    @Test
    @DisplayName("a malformed country is refused, never silently discarded")
    void malformedCountryIsRefused() throws Exception {
        Fixture f = property();
        String badCountry = body(f, 2, 1).replace("\"country\":\"VN\"", "\"country\":\"Vietnam\"");

        // Storing NULL for what the guest typed would lose their answer quietly.
        submitRaw(key("country"), badCountry)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("a valid country is stored upper-cased, as the schema requires")
    void countryIsUpperCased() throws Exception {
        Fixture f = property();
        String lower = body(f, 2, 1).replace("\"country\":\"VN\"", "\"country\":\"vn\"");
        String reference = referenceOf(submitRaw(key("lower"), lower));

        assertThat(fixtures.reservationText(reference, "guest_country")).isEqualTo("VN");
    }

    // ---- refusals -----------------------------------------------------------

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("more rooms than exist is 422 NO_AVAILABILITY and leaves no partial state")
    void noAvailabilityIsRefused() throws Exception {
        Fixture f = property();
        fixtures.setInventory(f.roomTypeId, CHECK_IN, 1, 0, 0, 0);

        submit(f, key("noavail"), body(f, 2, 3))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertThat(fixtures.reservationCount()).isZero();
        assertThat(fixtures.holdCount()).isZero();
        assertThat(fixtures.idempotencyCount()).isZero();
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a missing inventory row is unavailable, never unlimited")
    void missingInventoryIsRefused() throws Exception {
        Fixture f = property();
        fixtures.deleteInventory(f.roomTypeId, CHECK_IN.plusDays(1));

        submit(f, key("missing"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertThat(fixtures.reservationCount()).isZero();
        assertThat(fixtures.holdCount()).isZero();
    }

    @Test
    @DisplayName("an unpriced night refuses the whole stay — missing rate is never free")
    void unpricedNightRefusesTheStay() throws Exception {
        Fixture f = property();
        fixtures.clearBasePrice(f.roomTypeId);

        submit(f, key("unpriced"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertThat(fixtures.reservationCount()).isZero();
        assertThat(fixtures.holdCount()).isZero();
    }

    @Test
    @DisplayName("an offer code is refused — config B23 is open")
    void offerCodeIsRefused() throws Exception {
        Fixture f = property();
        String withOffer = body(f, 2, 1).replace("\"offerCode\":null", "\"offerCode\":\"SUMMER\"");

        submitRaw(key("offer"), withOffer)
                .andExpect(status().isUnprocessableEntity());

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("children are refused — config B10 is open")
    void childrenAreRefused() throws Exception {
        Fixture f = property();
        String withChild = body(f, 2, 1)
                .replace("\"children\":0", "\"children\":1")
                .replace("\"childAges\":[]", "\"childAges\":[6]");

        submitRaw(key("children"), withChild)
                .andExpect(status().isUnprocessableEntity());

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("a party larger than the rooms hold is refused, never silently clamped")
    void overCapacityIsRefused() throws Exception {
        Fixture f = property();

        submitRaw(key("capacity"), body(f, 99, 1))
                .andExpect(status().isUnprocessableEntity());

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("an unpublished property is 404, never 403")
    void unpublishedPropertyIsNotFound() throws Exception {
        Fixture f = property();
        fixtures.setLifecycleState(f.propertyId, "DRAFT");

        submit(f, key("draft"), body(f, 2, 1))
                .andExpect(status().isNotFound());

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("a property that does not exist is the same 404")
    void unknownPropertyIsNotFound() throws Exception {
        Fixture f = property();
        String elsewhere = body(f, 2, 1)
                .replace("\"" + f.propertySlug + "\"", "\"no-such-property\"");

        submitRaw(key("unknown"), elsewhere).andExpect(status().isNotFound());
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("an existing ACTIVE hold consumes capacity for the next request")
    void existingActiveHoldConsumesCapacity() throws Exception {
        Fixture f = property();
        // Two rooms per night, and the first request takes both.
        for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(f.roomTypeId, d, 2, 0, 0, 0);
        }

        submit(f, key("first"), body(f, 2, 2)).andExpect(status().isCreated());

        // The holds the first request placed are ACTIVE and already counted in
        // direct_committed, so nothing is left for a second guest.
        submit(f, key("second"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("one unavailable night of several refuses the whole stay, atomically")
    void oneUnavailableNightRefusesTheWholeStay() throws Exception {
        Fixture f = property();
        // Night one has room; night two does not. Doc 54 §4 requires availability
        // for ALL nights, so the stay cannot be part-accepted.
        fixtures.setInventory(f.roomTypeId, CHECK_IN, 5, 0, 0, 0);
        fixtures.setInventory(f.roomTypeId, CHECK_IN.plusDays(1), 0, 0, 0, 0);

        submit(f, key("onenight"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"));

        // Not one hold for the night that was free — nothing at all.
        assertThat(fixtures.reservationCount()).isZero();
        assertThat(fixtures.holdCount()).isZero();
        assertThat(fixtures.reservationLineCount()).isZero();
        assertThat(fixtures.idempotencyCount()).isZero();
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN))
                .as("the available night was not committed either")
                .isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a released hold frees its capacity and the identity can be held again")
    void releasedHoldCanBeReHeld() throws Exception {
        Fixture f = property();
        for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
            fixtures.setInventory(f.roomTypeId, d, 1, 0, 0, 0);
        }

        String first = referenceOf(submit(f, key("hold-a"), body(f, 2, 1)));
        assertThat(fixtures.activeHoldCountFor(first)).isZero();

        // The last room is gone.
        submit(f, key("blocked"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity());

        // Simulate the release S11/S13 will perform — bounded to this reservation.
        fixtures.releaseHoldsOfReservation(first);
        assertThat(fixtures.activeHoldCountFor(first)).isZero();
        assertThat(fixtures.releasedHoldCountFor(first))
                .as("the row is retained as history, not deleted").isZero();

        // V26 scoped uniqueness to ACTIVE precisely so this succeeds: the same
        // room type and nights can be held again by a new reservation.
        String second = referenceOf(submit(f, key("hold-b"), body(f, 2, 1)));

        assertThat(second).isNotEqualTo(first);
        assertThat(fixtures.activeHoldCountFor(second)).isZero();
        assertThat(fixtures.reservationCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("the public response leaks no internal identifier")
    void responseLeaksNoInternalIdentifier() throws Exception {
        Fixture f = property();
        String response = submit(f, key("leak"), body(f, 2, 1))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // No UUID of any kind: not the reservation, the property, the room type,
        // the partner or the hold. The reference is the only identifier a guest
        // gets, and doc 22 §7 makes it an identifier, never a credential.
        assertThat(response)
                .as("a UUID in a public response would expose an internal key")
                .doesNotMatch("(?s).*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                        + "[0-9a-fA-F]{4}-[0-9a-fA-F]{12}.*");
        // And none of the denylisted concepts, checked on the wire rather than
        // only by reflection.
        for (String forbidden : new String[] {"salesStatus", "slaDueAt", "holdId", "expiresAt",
                "partnerId", "leadSource", "propertyId", "roomTypeId", "inquiryId",
                "distributionChannel", "priceSnapshot"}) {
            assertThat(response).doesNotContain(forbidden);
        }
    }

    @Test
    @DisplayName("no authentication is required, and none is offered")
    void endpointIsPublic() throws Exception {
        Fixture f = property();

        // Every other test in this class is already unauthenticated; this asserts
        // it on purpose. OQ-016 closed in favour of an anonymous guest, so a 401
        // or a redirect here would contradict doc 117 §6.
        submit(f, key("public"), body(f, 2, 1))
                .andExpect(status().isCreated());

        // And the reservation carries no customer, because none was created.
        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.customerCount())
                .as("no account is created for an anonymous guest")
                .isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the 422 carries code, message and details[] — and does NOT invent alternatives")
    void noAvailabilityEnvelopeIsTheFrozenOne() throws Exception {
        Fixture f = property();
        fixtures.setInventory(f.roomTypeId, CHECK_IN, 0, 0, 0, 0);

        String response = submit(f, key("envelope"), body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NO_AVAILABILITY"))
                .andExpect(jsonPath("$.message").isString())
                // details[] names the room type and what was actually available.
                .andExpect(jsonPath("$.details[0].field").value(f.roomTypeSlug))
                // The detail code is the shared availability path's own —
                // S1 reuses that refusal rather than inventing a second vocabulary.
                .andExpect(jsonPath("$.details[0].code").isString())
                .andExpect(jsonPath("$.correlationId").exists())
                .andReturn().getResponse().getContentAsString();

        // Doc 58 §3.3 shows an `alternatives` object on this error, but its two
        // arrays are elided — `{ "nearestDates": [...], "otherProperties": [...] }`
        // — so neither the item shape nor the selection rule exists anywhere in the
        // corpus. Emitting an empty object, or guessing "the next three dates" or
        // "every other OPEN property", would invent commercial behaviour a guest
        // would act on. It is therefore ABSENT and recorded as OQ-173, and this
        // test exists so the absence stays deliberate rather than drifting into a
        // plausible guess later.
        assertThat(response)
                .as("no invented alternatives — OQ-173")
                .doesNotContain("alternatives")
                .doesNotContain("nearestDates")
                .doesNotContain("otherProperties");
    }

    @Test
    @DisplayName("a blank Idempotency-Key is refused as a client error, never a 500")
    void blankIdempotencyKeyIsRefused() throws Exception {
        Fixture f = property();

        // `required = true` only catches an ABSENT header. A present-but-empty one
        // binds as "" and, before this was fixed, ran the whole S1 transaction and
        // then died on V24's key_not_blank CHECK — a reachable client mistake
        // surfacing as INTERNAL_ERROR.
        for (String blank : new String[] {"", "   ", "\t"}) {
            submitRaw(blank, body(f, 2, 1))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value("Idempotency-Key"));
        }

        assertThat(fixtures.reservationCount()).isZero();
        assertThat(fixtures.idempotencyCount()).isZero();
    }

    @Test
    @DisplayName("different keys with an identical body create independent reservations")
    void differentKeysSameBodyAreIndependent() throws Exception {
        Fixture f = property();

        String first = referenceOf(submit(f, key("indep-a"), body(f, 2, 1)));
        String second = referenceOf(submit(f, key("indep-b"), body(f, 2, 1)));

        // Idempotency is keyed on the KEY, not on the body. Two guests submitting
        // the same stay are two requests.
        assertThat(second).isNotEqualTo(first);
        assertThat(fixtures.reservationCount()).isEqualTo(2);
        assertThat(fixtures.idempotencyCount()).isEqualTo(2);
        assertThat(fixtures.directCommitted(f.roomTypeId, CHECK_IN)).isZero();
    }

    @Test
    @DisplayName("guest text is stored verbatim and cannot inject SQL or forge a fingerprint")
    void guestTextIsInert() throws Exception {
        Fixture f = property();
        String hostile = "Robert'); DROP TABLE reservation;-- \\n;lines[0].quantity=1:9";
        String payload = body(f, 2, 1)
                .replace("\"specialRequests\":null", "\"specialRequests\":\"" + hostile + "\"");

        String injectKey = key("inject");
        String reference = referenceOf(submitRaw(injectKey, payload));

        // The payload carries the two characters \\n, which is a JSON escape;
        // Jackson decodes it to one real newline, so the stored text holds a
        // newline. That is the point: a newline in guest text is inert data, not
        // a delimiter that could reshape anything downstream.
        assertThat(fixtures.reservationText(reference, "special_requests"))
                .isEqualTo(hostile.replace("\\n", "\n"));
        assertThat(fixtures.reservationCount()).isEqualTo(1);

        // And it did not smuggle a different quantity past the fingerprint: a
        // retry with the plain body must be a DIFFERENT request, not a replay.
        submitRaw(injectKey, body(f, 2, 1))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test
    @DisplayName("an undocumented field is REJECTED, so no commercial value can be smuggled in")
    void clientCannotControlCommercialFields() throws Exception {
        Fixture f = property();
        String hostile = body(f, 2, 1).replace("\"locale\":\"en\"",
                "\"locale\":\"en\",\"leadSource\":\"REFERRAL\",\"totalMinor\":1,"
                        + "\"currency\":\"USD\",\"partnerId\":\"11111111-1111-1111-1111-111111111111\"");

        // `fail-on-unknown-properties: true` means an undocumented field is not
        // quietly ignored — the whole request is refused. That is stronger than
        // inertness, and it is the body-side of doc 58 §2’s "explicit named
        // parameters only. No arbitrary query passthrough".
        submitRaw(key("hostile"), hostile)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(fixtures.reservationCount()).isZero();
    }

    @Test
    @DisplayName("the server owns leadSource, channel, currency and the total")
    void serverOwnsCommercialValues() throws Exception {
        Fixture f = property();
        String reference = referenceOf(submit(f, key("owned"), body(f, 2, 1)));

        // None of these is a request field, and none can be influenced.
        assertThat(fixtures.reservationText(reference, "lead_source")).isEqualTo("WEBSITE");
        assertThat(fixtures.reservationText(reference, "channel_type")).isEqualTo("DIRECT");
        assertThat(fixtures.reservationText(reference, "currency")).isEqualTo("VND");
        assertThat(fixtures.reservationText(reference, "total_minor"))
                .as("the price is the server’s arithmetic, never a client number")
                .isEqualTo(String.valueOf(RATE * 2));
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a key from a FAILED request is free — no phantom idempotency row survives")
    void failedRequestLeavesNoPhantomKey() throws Exception {
        Fixture f = property();
        String reusedKey = key("phantom");

        // First attempt fails on availability.
        fixtures.setInventory(f.roomTypeId, CHECK_IN, 0, 0, 0, 0);
        submitRaw(reusedKey, body(f, 2, 1))
                .andExpect(status().isUnprocessableEntity());
        assertThat(fixtures.idempotencyCount()).isZero();

        // Inventory returns. The SAME key must now be usable, because the first
        // attempt created nothing — a phantom row would have locked the guest out
        // of their own key, or worse, replayed a reservation that never existed.
        fixtures.setInventory(f.roomTypeId, CHECK_IN, 5, 0, 0, 0);
        submitRaw(reusedKey, body(f, 2, 1))
                .andExpect(status().isCreated());

        assertThat(fixtures.reservationCount()).isEqualTo(1);
        assertThat(fixtures.idempotencyCount()).isEqualTo(1);
    }

    // ---- helpers ------------------------------------------------------------

    private record Fixture(UUID propertyId, String propertySlug, UUID roomTypeId,
                           String roomTypeSlug) {
    }

    private Fixture property() {
        UUID partnerId = fixtures.createPartner("resv");
        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
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
        return new Fixture(propertyId, fixtures.slugOf(propertyId), roomTypeId, roomTypeSlug);
    }

    /** PostgreSQL renders jsonb with spaces; the contract is the keys and values. */
    private static String compact(String json) {
        return json == null ? null : json.replace(", ", ",").replace(": ", ":");
    }

    private static String key(String label) {
        return "idem-" + label + "-" + UUID.randomUUID();
    }

    private String body(Fixture f, int adults, int quantity) {
        return bodyWithTerms(f, adults, quantity, "booking-terms-v3");
    }

    private String bodyWithTerms(Fixture f, int adults, int quantity, String termsVersion) {
        return """
                {"propertySlug":"%s",
                 "checkIn":"%s","checkOut":"%s",
                 "adults":%d,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":%d}],
                 "guest":{"fullName":"Nguyen Van A","email":"guest@example.com",
                          "phone":"+84901234567","country":"VN",
                          "preferredChannel":"ZALO","bestTimeToContact":"EVENING"},
                 "specialRequests":null,
                 "discoveryChannel":"TIKTOK",
                 "offerCode":null,
                 "acceptedTermsVersion":"%s",
                 "marketingConsent":false,
                 "locale":"en"}
                """.formatted(f.propertySlug, CHECK_IN, CHECK_OUT, adults,
                f.roomTypeSlug, quantity, termsVersion);
    }

    private ResultActions submit(Fixture f, String idempotencyKey, String payload)
            throws Exception {
        return submitRaw(idempotencyKey, payload);
    }

    private ResultActions submitRaw(String idempotencyKey, String payload) throws Exception {
        return mockMvc.perform(post("/api/v1/public/reservations/requests")
                .with(csrf())
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload));
    }

    private static String referenceOf(ResultActions actions) throws Exception {
        return referenceOf(actions.andReturn());
    }

    private static String referenceOf(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        int start = body.indexOf("\"reference\":\"") + 13;
        return body.substring(start, body.indexOf('"', start));
    }
}
