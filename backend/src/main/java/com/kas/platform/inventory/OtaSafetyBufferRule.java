package com.kas.platform.inventory;

import com.kas.platform.shared.RuleStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One OTA safety buffer rule — doc 13 §3.4c.
 *
 * <p>Doc 15 §7.1a names the three dimensions and why each must exist: <strong>property</strong>
 * ("eight properties with different OTA dependence"), <strong>room type</strong> ("a room type an OTA
 * sells heavily needs a different buffer"), and <strong>date range / season</strong> ("Tết, holidays
 * and high season have entirely different channel behaviour").
 *
 * <h2>Channel is deferred to V2 — owner decision, 2026-08-18</h2>
 *
 * <p>{@code distribution_channel_id} exists on the table but is <strong>not part of the V1
 * configuration model</strong>. The frozen prose names three dimensions, never four, and the column
 * is described only in a schema comment. This mirrors {@code rate_rule.channel_scope}, which doc 56
 * §2 keeps "always NULL in V1".
 *
 * <p>The reason it matters: {@code buffer_target} is a <em>single integer</em> per (room type, date).
 * Two channel-scoped rules — Agoda 3, Booking.com 2 — have no stated way to become one number, and
 * inventing one would be inventing OTA allocation policy. Deferring avoids the question entirely.
 * See doc 99 §3 and OQ-115b.
 */
public record OtaSafetyBufferRule(
        UUID id,
        UUID propertyId,
        UUID roomTypeId,
        UUID distributionChannelId,
        LocalDate dateFrom,
        LocalDate dateTo,
        List<Integer> daysOfWeek,
        BufferType bufferType,
        BigDecimal bufferValue,
        int priority,
        String reason,
        RuleStatus status) {

    public OtaSafetyBufferRule {
        daysOfWeek = daysOfWeek == null ? null : List.copyOf(daysOfWeek);
    }

    /**
     * The specificity ladder, mirroring doc 56 §3.1's exactly.
     *
     * <p><strong>Owner decision, 2026-08-18 (OQ-115):</strong> buffer resolution uses the same
     * semantics as the frozen rate resolver — {@code priority DESC, specificity DESC}, with a tie
     * treated as a configuration error rather than an arbitrary selection.
     *
     * <p>Doc 56 §3.1's rate ladder is <em>room-type + date-range + day-of-week ▸ room-type +
     * date-range ▸ room-type ▸ property + date-range ▸ property</em>. A buffer rule always names a
     * property ({@code property_id NOT NULL}), so the same five levels map one-to-one onto the buffer
     * dimensions, with the room type playing the role it plays for rates.
     *
     * <p>Doc 13 §3.4c ¶1's single worked comparison — "property + room type + date range beats
     * property-wide" — is rank 4 beating rank 1, which this ordering reproduces.
     */
    public int specificity() {
        boolean dated = dateFrom != null || dateTo != null;
        boolean byDay = daysOfWeek != null && !daysOfWeek.isEmpty();

        if (roomTypeId != null) {
            if (dated && byDay) {
                return 5;
            }
            return dated ? 4 : 3;
        }
        return dated ? 2 : 1;
    }

    /**
     * The configured buffer for a date, before clamping.
     *
     * <p>Doc 13 §3.4c ¶3: "{@code PERCENTAGE} is of {@code total}" and <strong>rounds up</strong>.
     * Integer arithmetic is used rather than floating point so 10% of 7 is unambiguously 1 room short
     * of 0.7 being lost to a rounding mode.
     */
    public int configuredFor(int total) {
        if (bufferType == BufferType.FIXED_ROOMS) {
            return bufferValue.intValue();
        }
        return BigDecimal.valueOf(total)
                .multiply(bufferValue)
                .divide(BigDecimal.valueOf(100), 0, java.math.RoundingMode.CEILING)
                .intValueExact();
    }
}
