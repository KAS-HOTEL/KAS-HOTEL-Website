package com.kas.platform.inventory.api;

import com.kas.platform.inventory.BufferType;
import com.kas.platform.inventory.OtaSafetyBufferRule;
import com.kas.platform.shared.RuleStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A buffer rule on the distribution console — doc 58 §7.
 *
 * <p>An operator surface. {@code bufferUtilisation} is on the doc 58 §9 DISTRIBUTION denylist and is
 * absent here; the rule's own configuration is not, because an operator cannot manage what it cannot
 * see.
 *
 * <p>There is no {@code distributionChannelId} field. The V1 model has no channel dimension
 * (OQ-115b), and echoing an always-null column would suggest it does something.
 */
public record BufferRuleView(
        UUID id,
        UUID propertyId,
        UUID roomTypeId,
        LocalDate dateFrom,
        LocalDate dateTo,
        List<Integer> daysOfWeek,
        BufferType bufferType,
        BigDecimal bufferValue,
        int priority,
        int specificity,
        String reason,
        RuleStatus status) {

    static BufferRuleView of(OtaSafetyBufferRule rule) {
        return new BufferRuleView(
                rule.id(), rule.propertyId(), rule.roomTypeId(),
                rule.dateFrom(), rule.dateTo(), rule.daysOfWeek(),
                rule.bufferType(), rule.bufferValue(), rule.priority(), rule.specificity(),
                rule.reason(), rule.status());
    }
}
