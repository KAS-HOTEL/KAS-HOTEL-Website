package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Map;

/**
 * A partial property update.
 *
 * <h2>{@code version} is required, and that is the point</h2>
 *
 * <p>Doc 58 §2 puts {@code If-Match} / {@code version} on every MASTER update.
 * Until now this record had no version at all, so {@code PATCH} was a blind
 * write: two partners editing the same hotel both succeeded and the second
 * silently erased the first. Making it {@code @NotNull} rather than optional is
 * deliberate — an optional version is one a caller forgets, and a caller who
 * forgets gets exactly the behaviour the field exists to prevent.
 *
 * <p>It is carried in the body rather than as an {@code If-Match} header because
 * {@code version} is already the domain's own concurrency token and doc 58 §2
 * names both forms. A header would additionally require an {@code ETag} on every
 * {@code GET} — a larger contract change for the same guarantee.
 *
 * <h2>Everything else stays optional</h2>
 *
 * <p>A null field leaves the column unchanged, which is what lets a Partner build
 * a draft up over several sessions instead of having to send a complete object
 * every time. An absent {@code names} key leaves that locale's name untouched;
 * it is not a request to delete it.
 *
 * <p>There is still no lifecycle field. A Partner cannot publish their own
 * property by PATCHing a state — publication happens only through approval.
 */
public record UpdatePropertyRequest(

        @NotNull(message = "must be supplied so a concurrent edit cannot be overwritten")
        Integer version,

        /**
         * Display name per locale, e.g. {@code {"vi": "…", "en": "…"}}.
         *
         * <p>The same shape {@link PropertyAdminView} returns, so a client can
         * read, edit and send back without reshaping. Locale keys are checked
         * against the two frozen locales in the service — an unknown key would
         * otherwise reach the {@code property_tr_locale_valid} CHECK and surface
         * as a 500 instead of a field error.
         */
        Map<String, @NotBlank @Size(max = 200) String> names,

        /**
         * The one-line editorial hook, per locale — doc 23 §3.2, <em>"≤ 90
         * chars"</em>, and {@code property_tr_sig_len} enforces the same 90 in
         * the schema.
         *
         * <p>Doc 52 §3.1 makes it a publish invariant, and
         * {@link com.kas.platform.onboarding.PropertyCompletenessChecker} has
         * required it since it was written — with nothing able to write it. This
         * is that write.
         *
         * <p>Unlike {@code names} it is <strong>not</strong> {@code @NotBlank}:
         * the column is nullable, and sending a blank clears the field. An absent
         * locale key leaves that locale untouched, exactly as {@code names} does.
         */
        Map<String, @Size(max = 90) String> signatureLines,

        /**
         * The card and meta-description text, per locale — doc 23 §3.2,
         * <em>"≤ 220 chars"</em>, matching {@code property_tr_short_len}.
         *
         * <p>Doc 23 §7 states the publish gate directly: <em>"A property cannot
         * publish without name, signatureLine, and shortDescription in both
         * locales."</em> Same blank and absent semantics as above.
         */
        Map<String, @Size(max = 220) String> shortDescriptions,

        @Size(max = 120) String district,
        @Size(max = 120) String ward,
        @Size(max = 120) String city,
        @Size(max = 40) String phone,

        /**
         * Doc 23 §3.3's {@code coordinates — lat/lng}, nullable.
         *
         * <p>The bounds are the schema's own — {@code property_lat_range} and
         * {@code property_lng_range} in V3 — reported here as field errors rather
         * than reaching the database and surfacing as a {@code 500}. Nothing
         * stricter is added: <strong>a latitude without a longitude is accepted</strong>,
         * because no frozen document makes them a mandatory pair and a Partner
         * mid-draft may genuinely have one.
         *
         * <p>Nothing is geocoded, defaulted or rounded here either. The column is
         * {@code numeric(9,6)} and PostgreSQL's own scale coercion is the only
         * rounding there is.
         */
        @DecimalMin(value = "-90", message = "latitude is between -90 and 90")
        @DecimalMax(value = "90", message = "latitude is between -90 and 90")
        BigDecimal latitude,

        @DecimalMin(value = "-180", message = "longitude is between -180 and 180")
        @DecimalMax(value = "180", message = "longitude is between -180 and 180")
        BigDecimal longitude) {

    public UpdatePropertyRequest {
        names = names == null ? Map.of() : Map.copyOf(names);
        signatureLines = signatureLines == null ? Map.of() : nullSafeCopy(signatureLines);
        shortDescriptions = shortDescriptions == null ? Map.of() : nullSafeCopy(shortDescriptions);
    }

    /**
     * {@code Map.copyOf} rejects null values, and null is meaningful here — it is
     * how a client clears a field it can also send blank.
     */
    private static Map<String, String> nullSafeCopy(Map<String, String> source) {
        return java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(source));
    }
}
