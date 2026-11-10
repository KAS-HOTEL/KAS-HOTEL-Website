package com.kas.platform.inventory.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;

/**
 * The guest quote request — doc 58 §3.2, <strong>transcribed, not designed</strong>:
 *
 * <pre>{@code
 * { propertySlug, checkIn, checkOut, adults, children, childAges[],
 *   lines:[{roomTypeSlug, quantity}], offerCode? }
 * }</pre>
 *
 * <p>Every field the frozen body names is here and nothing else is. Three of them —
 * {@code children}, {@code childAges} and {@code offerCode} — are accepted by the contract and
 * <strong>refused</strong> by V1, because the configs that would price them are OPEN. Doc 58 §11.2.3
 * freezes that: a supplied value is never silently ignored and never guessed at.
 *
 * <p>{@code locale} is deliberately absent from this record. The frozen body does not contain it, so
 * the controller takes it as a query parameter with a default, exactly as every other public route
 * does — the request contract is unchanged.
 *
 * @param adults at least one. A stay with no guests is not a stay; this is a degenerate-input guard,
 *               not a pricing rule
 */
public record QuoteRequest(

        @NotBlank
        String propertySlug,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate checkIn,

        /** Exclusive — doc 55 §2: a stay occupies {@code checkIn … checkOut − 1}. */
        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate checkOut,

        @Min(1)
        int adults,

        /** Must be 0 in V1 — config B10 is OPEN (OQ-007). See {@code AvailabilityService.quote}. */
        @Min(0)
        int children,

        /** Must be empty or absent in V1, for the same reason. */
        List<Integer> childAges,

        @NotEmpty
        @Valid
        List<Line> lines,

        /** One voucher code, or absent (owner decision 2026-11-09). */
        String offerCode,

        /** KAS points to spend (1 point = 1 VND); only for a signed-in member. Absent = none. */
        @jakarta.validation.constraints.PositiveOrZero
        Long pointsToUse) {

    /** The pre-2026-11-10 shape, without points. */
    public QuoteRequest(String propertySlug, LocalDate checkIn, LocalDate checkOut, int adults, int children,
                        List<Integer> childAges, List<Line> lines, String offerCode) {
        this(propertySlug, checkIn, checkOut, adults, children, childAges, lines, offerCode, null);
    }

    public long pointsOrZero() {
        return pointsToUse == null ? 0 : pointsToUse;
    }

    /** One requested room type and how many of it. */
    public record Line(

            @NotBlank
            String roomTypeSlug,

            /** At least one. Zero or negative is a malformed line, not an empty selection. */
            @Min(1)
            int quantity) {
    }

    public List<Integer> childAgesOrEmpty() {
        return childAges == null ? List.of() : childAges;
    }
}
