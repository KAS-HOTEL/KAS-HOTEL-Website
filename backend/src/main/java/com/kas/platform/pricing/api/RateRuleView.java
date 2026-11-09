package com.kas.platform.pricing.api;

import com.kas.platform.pricing.RateRule;
import com.kas.platform.pricing.RateScope;
import com.kas.platform.shared.RuleStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A rate rule on the commercial console.
 *
 * <p>An operator shape. {@code specificity} is derived rather than stored, and is exposed because it
 * is half of doc 56 §3.1's ordering — an operator debugging "why did that rule win?" cannot see it
 * otherwise.
 *
 * <p>{@code channelScope} and {@code ratePlanId} are absent: doc 56 §2 keeps both NULL in V1, and
 * echoing an always-null field suggests it does something.
 */
public record RateRuleView(
        UUID id,
        RateScope scope,
        UUID propertyId,
        UUID roomTypeId,
        String name,
        int priority,
        int specificity,
        LocalDate dateFrom,
        LocalDate dateTo,
        List<Integer> daysOfWeek,
        Long priceMinor,
        BigDecimal adjustmentPercent,
        String currency,
        Integer minNights,
        Integer maxNights,
        RuleStatus status) {

    static RateRuleView of(RateRule rule) {
        return new RateRuleView(
                rule.id(), rule.scope(), rule.propertyId(), rule.roomTypeId(), rule.name(),
                rule.priority(), rule.specificity(), rule.dateFrom(), rule.dateTo(),
                rule.daysOfWeek(), rule.priceMinor(), rule.adjustmentPercent(), rule.currency(),
                rule.minNights(), rule.maxNights(), rule.status());
    }
}
