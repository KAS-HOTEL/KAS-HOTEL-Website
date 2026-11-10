package com.kas.platform.reservation.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;

/**
 * The frozen request body of doc 58 §3.3, restated in doc 117 §4.
 *
 * <p><strong>No field is added, removed or renamed.</strong> There is no
 * convenience field, and nothing undocumented is accepted as a business input.
 *
 * <p><strong>{@code leadSource} is deliberately absent.</strong> Doc 58:157-159:
 * <em>"A client cannot supply {@code leadSource}"</em>. The server sets it to
 * {@code WEBSITE}. {@code discoveryChannel} is self-reported marketing
 * attribution and is stored in its own column, never conflated with it.
 *
 * <p>Validation here is <strong>structural only</strong>. Doc 117 §6 is explicit
 * that no per-field format rule exists in the corpus beyond doc 26 §8's
 * <em>"Vietnamese and international phone formats both accepted"</em>, so this
 * asserts presence and shape and invents no business rule — no national phone
 * pattern, no deliverability check. Occupancy, availability, capacity and offer
 * codes are refused by the frozen rules in {@code AvailabilityService}, not here.
 */
public record ReservationRequestBody(

        @NotBlank
        String propertySlug,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate checkIn,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate checkOut,

        @Min(1)
        int adults,

        @Min(0)
        int children,

        List<Integer> childAges,

        @NotEmpty
        @Valid
        List<Line> lines,

        @NotNull
        @Valid
        Guest guest,

        String specialRequests,
        String discoveryChannel,
        String offerCode,
        String acceptedTermsVersion,
        Boolean marketingConsent,
        String locale,
        /** KAS points to spend (1 point = 1 VND); only for a signed-in member (2026-11-10). */
        @jakarta.validation.constraints.PositiveOrZero
        Long pointsToUse) {

    /** The pre-2026-11-10 shape, without points. */
    public ReservationRequestBody(String propertySlug, LocalDate checkIn, LocalDate checkOut, int adults,
                                  int children, List<Integer> childAges, List<Line> lines, Guest guest,
                                  String specialRequests, String discoveryChannel, String offerCode,
                                  String acceptedTermsVersion, Boolean marketingConsent, String locale) {
        this(propertySlug, checkIn, checkOut, adults, children, childAges, lines, guest, specialRequests,
                discoveryChannel, offerCode, acceptedTermsVersion, marketingConsent, locale, null);
    }

    public long pointsOrZero() {
        return pointsToUse == null ? 0 : pointsToUse;
    }

    /** One requested room type and how many of it. */
    public record Line(
            @NotBlank
            String roomTypeSlug,

            @Min(1)
            int quantity) {
    }

    /**
     * The guest.
     *
     * <p>Doc 26 §8 marks full name, email and phone <strong>required</strong>;
     * country, preferred channel and best-time-to-contact are recommended or
     * optional and stay that way. Doc 117 §6 closed OQ-016 in favour of an
     * anonymous guest, so these fields are the whole identity — there is no
     * account, and none is created.
     */
    public record Guest(
            @NotBlank
            String fullName,

            @NotBlank
            @Email
            String email,

            @NotBlank
            String phone,

            /**
             * ISO-3166 alpha-2, as doc 58 §3.3’s {@code "VN"} shows and as
             * {@code reservation_country_fmt} enforces in the schema.
             *
             * <p>Optional — {@code @Pattern} passes a null. But a value that is
             * present and malformed is a <strong>400</strong> naming the field,
             * not a value quietly replaced with NULL: silently discarding what a
             * guest typed is worse than telling them it was not understood. This
             * is the schema’s own format, not an invented business rule.
             */
            @Pattern(regexp = "^[A-Za-z]{2}$")
            String country,

            String preferredChannel,
            String bestTimeToContact) {
    }

    public List<Integer> childAgesOrEmpty() {
        return childAges == null ? List.of() : childAges;
    }

    public List<Line> linesOrEmpty() {
        return lines == null ? List.of() : lines;
    }

    /** Doc 58 §3.3 — {@code marketingConsent} <em>"must default false"</em>. */
    public boolean marketingConsentOrFalse() {
        return marketingConsent != null && marketingConsent;
    }
}
