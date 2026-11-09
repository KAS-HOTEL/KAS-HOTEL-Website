package com.kas.platform.pricing.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The extranet-style bulk rate edit — doc 58 §8 {@code /admin/rates/bulk-preview} and
 * {@code /bulk-apply}.
 *
 * <p>Exactly the operator workflow the owner specified: one property, one or more room types, a date
 * range, one rate.
 *
 * <p>{@code amountMinor} is <strong>minor units of VND</strong>, which is zero-decimal (doc 56 §6):
 * 1,500,000 ₫ is {@code 1500000}, not {@code 150000000}. There is no default and no suggested value —
 * base rates are config B6 and remain OPEN.
 *
 * <p>{@code priority} defaults to 0, the same default the column carries. It is exposed because doc
 * 56 §3.1 resolves on it, so an operator laying a promotional rate over a seasonal one needs to say
 * which wins.
 */
public record BulkRateRequest(

        @NotNull
        UUID propertyId,

        @NotEmpty
        List<UUID> roomTypeIds,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateFrom,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateTo,

        @NotNull
        @Min(0)
        Long amountMinor,

        int priority,

        String name) {

    /** A name is required for the audit trail and the grid's "which rule won" column. */
    public String nameOrDefault() {
        return name == null || name.isBlank()
                ? "Bulk " + dateFrom + " to " + dateTo
                : name;
    }
}
