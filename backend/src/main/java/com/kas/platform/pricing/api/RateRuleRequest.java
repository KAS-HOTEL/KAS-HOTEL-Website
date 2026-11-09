package com.kas.platform.pricing.api;

import com.kas.platform.pricing.RateScope;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Creates one rate rule — doc 58 §8 {@code POST /admin/rate-rules}.
 *
 * <p>Exactly one of {@code priceMinor} and {@code adjustmentPercent} must be supplied;
 * {@code rate_rule_price_or_adjustment} enforces it in the database and the service refuses it before
 * the constraint has to.
 *
 * <p>Absent by design: {@code currency} (VND is the only transactional currency — doc 56 §6),
 * {@code channelScope} and {@code ratePlanId} (doc 56 §2 keeps both NULL in V1), {@code status}
 * (every rule starts DRAFT and is activated through its own endpoint), and {@code restrictions}
 * (doc 56 §2 puts CTA/CTD/stop-sell in FUTURE).
 */
public record RateRuleRequest(

        @NotNull
        RateScope scope,

        /** Required for a {@code PROPERTY}-scope rule; null for a {@code ROOM_TYPE} one. */
        UUID propertyId,

        /** Required for a {@code ROOM_TYPE}-scope rule. */
        UUID roomTypeId,

        @NotBlank
        String name,

        /** Higher wins — doc 56 §3.1 orders {@code priority DESC}. */
        int priority,

        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateFrom,

        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate dateTo,

        /** PostgreSQL {@code dow}: 0 = Sunday … 6 = Saturday. Null = every day. */
        List<Integer> daysOfWeek,

        @Min(0)
        Long priceMinor,

        BigDecimal adjustmentPercent,

        @Min(1)
        Integer minNights,

        @Min(1)
        Integer maxNights) {
}
