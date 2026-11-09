package com.kas.platform.pricing;

import com.kas.platform.shared.RuleStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One rate rule — doc 56 §3.
 *
 * <p>Exactly one of {@code priceMinor} and {@code adjustmentPercent} is set;
 * {@code rate_rule_price_or_adjustment} enforces it in the database.
 *
 * <p>{@code channelScope} and {@code ratePlanId} are the doc 56 §2 forward seam
 * and are {@code NULL} throughout V1. They are carried here rather than dropped
 * so that the day they are used, no shape changes.
 *
 * @param priority  higher wins — doc 56 §3.1 orders {@code priority DESC}
 * @param daysOfWeek ISO-less: PostgreSQL {@code dow}, 0 = Sunday … 6 = Saturday
 */
public record RateRule(
        UUID id,
        RateScope scope,
        UUID propertyId,
        UUID roomTypeId,
        String name,
        int priority,
        LocalDate dateFrom,
        LocalDate dateTo,
        List<Integer> daysOfWeek,
        Long priceMinor,
        BigDecimal adjustmentPercent,
        String currency,
        Integer minNights,
        Integer maxNights,
        UUID channelScope,
        RuleStatus status) {

    public RateRule {
        daysOfWeek = daysOfWeek == null ? null : List.copyOf(daysOfWeek);
    }

    /**
     * Doc 56 §3.1's specificity ladder, as a comparable rank.
     *
     * <blockquote>Specificity order: room-type + date-range + day-of-week ▸
     * room-type + date-range ▸ room-type ▸ property + date-range ▸ property ▸
     * base.</blockquote>
     *
     * <p>Transcribed rather than invented, and total over the five rule shapes
     * the ladder names — so {@code ORDER BY priority DESC, specificity DESC} has
     * no undefined comparison. "base" is rank 0 and is not a rule: it is
     * {@code room_type.base_price_minor}, the fallback when nothing matches.
     */
    /**
     * Whether this rule's date and day-of-week predicates admit {@code date}.
     *
     * <p>The Java twin of the SQL in {@link RateRuleRepository#candidatesFor}. It exists so the rate
     * grid and the bulk preview can rank many dates from one query instead of issuing a query per
     * cell — a 90-day, 15-room-type grid would otherwise be 1,350 round trips.
     *
     * <p>Two implementations of one predicate can drift, so
     * {@code RateAuthoringIT.javaAndSqlAgreeOnApplicability} asserts they do not.
     *
     * <p>{@code days_of_week} holds PostgreSQL {@code dow}: 0 = Sunday … 6 = Saturday.
     * {@link java.time.DayOfWeek} counts Monday = 1 … Sunday = 7, so {@code % 7} converts.
     */
    public boolean appliesOn(LocalDate date) {
        if (dateFrom != null && date.isBefore(dateFrom)) {
            return false;
        }
        if (dateTo != null && date.isAfter(dateTo)) {
            return false;
        }
        if (daysOfWeek == null || daysOfWeek.isEmpty()) {
            return true;
        }
        return daysOfWeek.contains(date.getDayOfWeek().getValue() % 7);
    }

    /** V1 carries no channel or rate plan — doc 56 §2. Only such rules resolve. */
    public boolean isV1Shape() {
        return channelScope == null;
    }

    public int specificity() {
        boolean dated = dateFrom != null || dateTo != null;
        boolean byDay = daysOfWeek != null && !daysOfWeek.isEmpty();

        if (scope == RateScope.ROOM_TYPE) {
            if (dated && byDay) {
                return 5;
            }
            return dated ? 4 : 3;
        }
        return dated ? 2 : 1;
    }
}
