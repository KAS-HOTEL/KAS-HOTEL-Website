package com.kas.platform.pricing.api;

import jakarta.validation.constraints.Min;

import java.math.BigDecimal;

/**
 * Edits a rule's commercial fields — doc 56 §7 "Create / edit rate rule".
 *
 * <p>Scope, dates and days-of-week are deliberately not editable. Changing them would move the rule
 * to a different rung of doc 56 §3.1's specificity ladder and could create a tie the create-time
 * guard already refused. Archive and re-create instead; doc 56 §5.3 keeps the old rule readable so a
 * price snapshot's {@code ruleId} still resolves.
 */
public record RateRuleUpdateRequest(

        String name,

        @Min(0)
        Long priceMinor,

        BigDecimal adjustmentPercent,

        @Min(1)
        Integer minNights,

        @Min(1)
        Integer maxNights) {
}
