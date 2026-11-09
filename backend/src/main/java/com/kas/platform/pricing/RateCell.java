package com.kas.platform.pricing;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One cell of the rate calendar: a room type on a date, and the rate that wins there.
 *
 * <p>Doc 56 §7: "View resolved rate grid — Room types × dates, <strong>showing which rule won each
 * cell</strong>." The winning rule's id and name travel with the number, because a grid that shows
 * only the price cannot answer "why is this date different?" — which is the question an operator
 * opens the grid to ask.
 *
 * <p>An <strong>operator</strong> shape. {@code ruleId} is on the doc 58 §9 INTERNAL denylist and
 * must never reach a guest; the guest-facing price is {@code nightlyFrom} on the availability
 * response, which carries no rule identity.
 *
 * @param amountMinor null when the room type has no price for that date at all — no rule matched and
 *                    no base price is set. Rendered as a gap, never as zero.
 */
public record RateCell(
        UUID roomTypeId,
        LocalDate date,
        Long amountMinor,
        String currency,
        UUID ruleId,
        String ruleName,
        /** True when this exact date was priced by hand — see {@link #forDay}. */
        boolean isDayPrice) {

    static RateCell empty(UUID roomTypeId, LocalDate date) {
        return new RateCell(roomTypeId, date, null, null, null, null, false);
    }

    /**
     * A cell priced by a day price (V29) rather than by a rule or the base.
     *
     * <p>It carries no {@code ruleId}: there is no rule behind it, and putting a
     * synthetic one there would make the grid claim a rule exists that the rule
     * list would then fail to show. {@code isDayPrice} is what the UI reads to
     * mark the cell as individually set — and to offer clearing it.
     */
    public static RateCell forDay(UUID roomTypeId, LocalDate date, long amountMinor,
                                  String currency) {
        return new RateCell(roomTypeId, date, amountMinor, currency, null, null, true);
    }

    static RateCell of(UUID roomTypeId, ResolvedRate rate) {
        return new RateCell(roomTypeId, rate.date(), rate.amountMinor(), rate.currency(),
                rate.ruleId(), rate.ruleName(), false);
    }

    public boolean isPriced() {
        return amountMinor != null;
    }
}
