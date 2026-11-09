package com.kas.platform.inventory.api;

import com.kas.platform.inventory.BufferType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Creates an OTA safety buffer rule — doc 58 §7 {@code PUT /distribution/buffer-rules}.
 *
 * <p>Three dimensions, exactly the three doc 15 §7.1a names: property, room type (null = all room
 * types of that property), and date range or day-of-week season.
 *
 * <p><strong>No {@code distributionChannelId} field.</strong> OQ-115b defers the channel dimension
 * to V2; a request cannot supply what the resolver would ignore.
 *
 * <p><strong>No default {@code bufferValue}.</strong> Buffer values are config B3, status
 * {@code BLOCKED} (doc 51 §3). The caller supplies one or the request fails validation — nothing
 * here has a fallback.
 */
public record BufferRuleRequest(

        @NotNull
        UUID propertyId,

        /** Null = every room type at this property — doc 13 §3.4c. */
        UUID roomTypeId,

        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateFrom,

        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateTo,

        /** PostgreSQL {@code dow}: 0 = Sunday … 6 = Saturday. Null = every day. */
        List<Integer> daysOfWeek,

        @NotNull
        BufferType bufferType,

        @NotNull
        @DecimalMin("0")
        BigDecimal bufferValue,

        /** Higher wins — doc 56 §3.1 semantics, applied to buffers by owner decision. */
        int priority,

        String reason) {
}
