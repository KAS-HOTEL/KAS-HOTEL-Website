package com.kas.platform.reservation;

import com.kas.platform.reservation.api.ReservationRequestBody;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The canonical fingerprint — doc 117 §24.1.
 *
 * <p>The idempotency identity is <strong>the whole canonical request body</strong>.
 * Two requests that differ anywhere must differ here, because a shared fingerprint
 * means the second replays the first instead of being refused.
 *
 * <p>These are collisions <em>by construction</em> — encoding ambiguities a
 * caller could reach on purpose — not SHA-256 collisions.
 */
class RequestFingerprintTest {

    private static final LocalDate CHECK_IN = LocalDate.of(2026, 9, 12);
    private static final LocalDate CHECK_OUT = LocalDate.of(2026, 9, 14);

    @Test
    @DisplayName("the same request fingerprints identically, every time")
    void deterministic() {
        assertThat(RequestFingerprint.of(body())).isEqualTo(RequestFingerprint.of(body()));
    }

    @Test
    @DisplayName("it is a prefixed SHA-256 hex digest, not the body itself")
    void shapeOfTheValue() {
        String fingerprint = RequestFingerprint.of(body());

        assertThat(fingerprint).startsWith("sha256:");
        assertThat(fingerprint.substring("sha256:".length()))
                .hasSize(64)
                .matches("[0-9a-f]+");
        // The canonical form is hashed, not stored: a fingerprint must not carry
        // the guest's email or name into the idempotency table in readable form.
        assertThat(fingerprint).doesNotContain("guest@example.com").doesNotContain("Nguyen");
    }

    @Test
    @DisplayName("an absent field cannot be imitated by any value a client can send")
    void absenceIsNotAValue() {
        // The defect this test exists for: an earlier version wrote null as the
        // literal "~null~" with a normal length prefix, so sending that exact
        // string produced a byte-identical canonical form to sending nothing —
        // and a same-key retry with a different body would have replayed rather
        // than raising 409.
        ReservationRequestBody absent = body(null);

        for (String impostor : new String[] {"~null~", "~", "null", "", "6:~null~"}) {
            assertThat(RequestFingerprint.of(body(impostor)))
                    .as("specialRequests=%s must differ from an absent one", impostor)
                    .isNotEqualTo(RequestFingerprint.of(absent));
        }
    }

    @Test
    @DisplayName("a value cannot smuggle a field separator to imitate another field")
    void delimitersCannotBeForged() {
        // Length prefixes are why: "a;discoveryChannel=1:b" is one 22-character
        // value, and is written as such.
        assertThat(RequestFingerprint.of(body("a;discoveryChannel=1:b")))
                .isNotEqualTo(RequestFingerprint.of(body("a")));
    }

    @Test
    @DisplayName("every field of the frozen body participates — no comparison subset")
    void everyFieldCounts() {
        String base = RequestFingerprint.of(body());

        assertThat(RequestFingerprint.of(withSpecialRequests("late arrival")))
                .as("specialRequests is not a pricing input, and still counts")
                .isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withDiscoveryChannel("FACEBOOK"))).isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withMarketingConsent(true))).isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withLocale("vi"))).isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withTerms("booking-terms-v4"))).isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withAdults(3))).isNotEqualTo(base);
        assertThat(RequestFingerprint.of(withQuantity(2))).isNotEqualTo(base);
    }

    @Test
    @DisplayName("marketingConsent absent and false are the same request — doc 58 defaults it false")
    void absentMarketingConsentIsFalse() {
        // Doc 58 §3.3: "marketingConsent — must default false". So omitting it and
        // sending false are the same request, and a retry that omits it is still a
        // retry.
        assertThat(RequestFingerprint.of(withMarketingConsent(null)))
                .isEqualTo(RequestFingerprint.of(withMarketingConsent(false)));
    }

    @Test
    @DisplayName("line order is part of the identity — the contract never says otherwise")
    void lineOrderMatters() {
        ReservationRequestBody first = bodyWithLines(List.of(
                new ReservationRequestBody.Line("deluxe", 1),
                new ReservationRequestBody.Line("suite", 2)));
        ReservationRequestBody reversed = bodyWithLines(List.of(
                new ReservationRequestBody.Line("suite", 2),
                new ReservationRequestBody.Line("deluxe", 1)));

        // Not a claim that reordering *should* be a different request — a claim
        // that normalising it would be a rule the corpus does not state. A genuine
        // retry resends the same body, so its order is identical anyway.
        assertThat(RequestFingerprint.of(first)).isNotEqualTo(RequestFingerprint.of(reversed));
    }

    @Test
    @DisplayName("two lines cannot be confused with one line whose slug contains the other")
    void lineBoundariesHold() {
        ReservationRequestBody two = bodyWithLines(List.of(
                new ReservationRequestBody.Line("a", 1),
                new ReservationRequestBody.Line("b", 1)));
        ReservationRequestBody one = bodyWithLines(List.of(
                new ReservationRequestBody.Line("a;lines[1].roomTypeSlug=1:b", 1)));

        assertThat(RequestFingerprint.of(two)).isNotEqualTo(RequestFingerprint.of(one));
    }

    // ---- bodies -------------------------------------------------------------

    private static ReservationRequestBody body() {
        return body((String) null);
    }

    private static ReservationRequestBody body(String specialRequests) {
        return build(specialRequests, "TIKTOK", false, "en", "booking-terms-v3", 2,
                List.of(new ReservationRequestBody.Line("deluxe", 1)));
    }

    private static ReservationRequestBody bodyWithLines(List<ReservationRequestBody.Line> lines) {
        return build(null, "TIKTOK", false, "en", "booking-terms-v3", 2, lines);
    }

    private static ReservationRequestBody withSpecialRequests(String value) {
        return body(value);
    }

    private static ReservationRequestBody withDiscoveryChannel(String value) {
        return build(null, value, false, "en", "booking-terms-v3", 2, oneLine());
    }

    private static ReservationRequestBody withMarketingConsent(Boolean value) {
        return build(null, "TIKTOK", value, "en", "booking-terms-v3", 2, oneLine());
    }

    private static ReservationRequestBody withLocale(String value) {
        return build(null, "TIKTOK", false, value, "booking-terms-v3", 2, oneLine());
    }

    private static ReservationRequestBody withTerms(String value) {
        return build(null, "TIKTOK", false, "en", value, 2, oneLine());
    }

    private static ReservationRequestBody withAdults(int value) {
        return build(null, "TIKTOK", false, "en", "booking-terms-v3", value, oneLine());
    }

    private static ReservationRequestBody withQuantity(int value) {
        return build(null, "TIKTOK", false, "en", "booking-terms-v3", 2,
                List.of(new ReservationRequestBody.Line("deluxe", value)));
    }

    private static List<ReservationRequestBody.Line> oneLine() {
        return List.of(new ReservationRequestBody.Line("deluxe", 1));
    }

    private static ReservationRequestBody build(String specialRequests, String discoveryChannel,
                                                Boolean marketingConsent, String locale,
                                                String termsVersion, int adults,
                                                List<ReservationRequestBody.Line> lines) {
        return new ReservationRequestBody(
                "kas-milestone-premium-hotel", CHECK_IN, CHECK_OUT, adults, 0, List.of(), lines,
                new ReservationRequestBody.Guest("Nguyen Van A", "guest@example.com",
                        "+84901234567", "VN", "ZALO", "EVENING"),
                specialRequests, discoveryChannel, null, termsVersion, marketingConsent, locale);
    }
}
