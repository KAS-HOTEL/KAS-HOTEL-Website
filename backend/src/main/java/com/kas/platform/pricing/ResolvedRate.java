package com.kas.platform.pricing;

import java.time.LocalDate;
import java.util.UUID;

/**
 * The nightly rate that won, and which rule produced it.
 *
 * <p>Doc 56 §5.2 requires the reservation price snapshot to record
 * "<strong>which rules applied</strong>, not merely the resulting number", with
 * the reason stated plainly: "Without {@code ruleId}, a pricing dispute six
 * months later is unanswerable." The snapshot is written in the booking phase,
 * not here, but the resolver must already be able to answer the question — so
 * {@code ruleId} and {@code ruleName} travel with every resolved rate.
 *
 * <p>{@code ruleId} is null when the rate came from
 * {@code room_type.base_price_minor} — doc 56 §3's Layer 0, which is not a rule.
 *
 * <p><strong>Never returned to a guest.</strong> {@code ruleId} and
 * {@code appliedRuleIds} are on the doc 58 §9 INTERNAL denylist.
 */
public record ResolvedRate(
        LocalDate date,
        long amountMinor,
        String currency,
        UUID ruleId,
        String ruleName) {

    static ResolvedRate fromBase(LocalDate date, long amountMinor, String currency) {
        return new ResolvedRate(date, amountMinor, currency, null, null);
    }

    /**
     * A price typed for this exact date — V29's {@code rate_day}, doc 56's top
     * rung.
     *
     * <p>{@code ruleId} and {@code ruleName} are null because no rule produced
     * it, and that distinction is load-bearing: doc 56 §5.2's price snapshot
     * records which rule set a price, and recording one that did not exist would
     * misattribute the decision. A day price was set by a person on a date, and
     * the absence of a rule id is how the snapshot says so.
     *
     * <p>Public because the guest path resolves rates outside this package;
     * {@link #fromBase} stays package-private because only {@link RateResolver}
     * ever falls back to a base price.
     */
    public static ResolvedRate forDay(LocalDate date, long amountMinor, String currency) {
        return new ResolvedRate(date, amountMinor, currency, null, null);
    }
}
