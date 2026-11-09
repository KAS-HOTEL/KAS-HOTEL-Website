package com.kas.platform.reservation;

import com.kas.platform.reservation.api.ReservationRequestBody;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/**
 * The server-side canonical fingerprint of a reservation request — doc 117 §24.1.
 *
 * <p>The owner froze the idempotency identity as <strong>the whole canonical
 * request body</strong>. A client neither supplies nor influences this value:
 * there is no hash header, and nothing in the request is trusted as a digest.
 *
 * <h2>Canonicalisation</h2>
 *
 * Every field of the frozen body (doc 58 §3.3, restated in doc 117 §4) is
 * appended in a <strong>fixed declared order</strong> — not Jackson's field
 * order, not a map iteration order, so the result cannot drift when an unrelated
 * DTO detail changes. Each field is written as
 * {@code name=<length>:<value>;}, and absence as {@code name=~;} — a shape no
 * value can produce — so no combination of values can be confused for another: {@code city="a", note="b"}
 * and {@code city="a;note=b"} produce different strings, which a plain delimiter
 * join would not guarantee.
 *
 * <p><strong>Arrays keep the order the client sent.</strong> The contract does
 * not declare {@code lines[]} or {@code childAges[]} order-insensitive, and
 * sorting them would be a normalisation rule the corpus never states. A genuine
 * retry resends the same body, so its order is identical by construction.
 *
 * <p><strong>Nothing is excluded.</strong> Doc 117 §24.1 forbids a field-specific
 * comparison subset, so every field participates — including
 * {@code specialRequests}, {@code discoveryChannel}, {@code marketingConsent} and
 * {@code locale}. A request that differs in any of them is a different request.
 *
 * <p>SHA-256, hex-encoded, prefixed with the algorithm so a future change of
 * algorithm is visible in the stored value rather than silent.
 */
final class RequestFingerprint {

    private static final String ALGORITHM = "SHA-256";
    /**
     * Absence is encoded by its own SHAPE, not by a reserved word.
     *
     * <p>An earlier version wrote null as the literal {@code ~null~} and gave it
     * a length like any other value, which meant a client sending the string
     * {@code "~null~"} produced a byte-identical canonical form to sending
     * nothing. Two different requests then shared a fingerprint, and the second
     * would have replayed the first instead of being refused under
     * doc 117 §24.1. A present value is always {@code <digits>:}; absence is
     * always this marker, so nothing a client can type reaches it.
     */
    private static final char ABSENT = '~';

    private RequestFingerprint() {
    }

    static String of(ReservationRequestBody body) {
        StringBuilder canonical = new StringBuilder();

        field(canonical, "propertySlug", body.propertySlug());
        field(canonical, "checkIn", body.checkIn() == null ? null : body.checkIn().toString());
        field(canonical, "checkOut", body.checkOut() == null ? null : body.checkOut().toString());
        field(canonical, "adults", String.valueOf(body.adults()));
        field(canonical, "children", String.valueOf(body.children()));

        List<Integer> ages = body.childAgesOrEmpty();
        field(canonical, "childAges.size", String.valueOf(ages.size()));
        for (int i = 0; i < ages.size(); i++) {
            field(canonical, "childAges[" + i + "]", String.valueOf(ages.get(i)));
        }

        List<ReservationRequestBody.Line> lines = body.linesOrEmpty();
        field(canonical, "lines.size", String.valueOf(lines.size()));
        for (int i = 0; i < lines.size(); i++) {
            ReservationRequestBody.Line line = lines.get(i);
            field(canonical, "lines[" + i + "].roomTypeSlug", line.roomTypeSlug());
            field(canonical, "lines[" + i + "].quantity", String.valueOf(line.quantity()));
        }

        ReservationRequestBody.Guest guest = body.guest();
        field(canonical, "guest.fullName", guest == null ? null : guest.fullName());
        field(canonical, "guest.email", guest == null ? null : guest.email());
        field(canonical, "guest.phone", guest == null ? null : guest.phone());
        field(canonical, "guest.country", guest == null ? null : guest.country());
        field(canonical, "guest.preferredChannel", guest == null ? null : guest.preferredChannel());
        field(canonical, "guest.bestTimeToContact",
                guest == null ? null : guest.bestTimeToContact());

        field(canonical, "specialRequests", body.specialRequests());
        field(canonical, "discoveryChannel", body.discoveryChannel());
        field(canonical, "offerCode", body.offerCode());
        field(canonical, "acceptedTermsVersion", body.acceptedTermsVersion());
        field(canonical, "marketingConsent", String.valueOf(body.marketingConsentOrFalse()));
        field(canonical, "locale", body.locale());

        return ALGORITHM.toLowerCase(java.util.Locale.ROOT).replace("-", "")
                + ":" + hash(canonical.toString());
    }

    private static void field(StringBuilder out, String name, String value) {
        out.append(name).append('=');
        if (value == null) {
            out.append(ABSENT).append(';');
            return;
        }
        out.append(value.length()).append(':').append(value).append(';');
    }

    private static String hash(String canonical) {
        try {
            MessageDigest digest = MessageDigest.getInstance(ALGORITHM);
            return HexFormat.of().formatHex(digest.digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK; its absence is not a runtime condition
            // this application can meaningfully continue past.
            throw new IllegalStateException(ALGORITHM + " is unavailable", e);
        }
    }
}
