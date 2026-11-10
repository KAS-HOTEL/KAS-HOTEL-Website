package com.kas.platform.pricing;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.UUID;

/**
 * The late-cancellation fee SUPER_ADMIN configured (V63 {@code cancellation_fee_rule}):
 * a hotel's own active rule, else the all-hotels active rule, else none. With none, a late
 * cancellation goes to SUPER_ADMIN for manual review: no fee is ever guessed.
 */
@Service
public class CancellationFeeRuleService {

    public record Rule(UUID id, UUID propertyId, String feeType, Long amountMinor, BigDecimal percent,
                       String currency) {
    }

    /** A fee worked out from a rule, against what the guest pays. */
    public record Fee(Rule rule, long baseMinor, long feeMinor) {
    }

    private final JdbcClient jdbc;

    public CancellationFeeRuleService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The rule that applies to this hotel now, if SUPER_ADMIN configured one. */
    public Optional<Rule> activeFor(UUID propertyId) {
        return jdbc.sql("""
                SELECT id, property_id, fee_type, amount_minor, percent, currency
                  FROM cancellation_fee_rule
                 WHERE status = 'ACTIVE' AND (property_id = :propertyId OR property_id IS NULL)
                 ORDER BY (property_id IS NULL)
                 LIMIT 1
                """).param("propertyId", propertyId)
                .query((rs, n) -> new Rule(rs.getObject("id", UUID.class), rs.getObject("property_id", UUID.class),
                        rs.getString("fee_type"), rs.getObject("amount_minor", Long.class),
                        rs.getBigDecimal("percent"), rs.getString("currency")))
                .optional();
    }

    /**
     * The fee for a booking whose total is {@code totalMinor}: a fixed amount, or a percent
     * of the total rounded half-up to the minor unit. Never more than the total, never
     * negative.
     */
    public static Fee fee(Rule rule, long totalMinor) {
        long base = Math.max(0, totalMinor);
        long amount = switch (rule.feeType()) {
            case "FIXED_AMOUNT" -> rule.amountMinor() == null ? 0 : rule.amountMinor();
            case "PERCENT_OF_TOTAL" -> rule.percent() == null ? 0 : BigDecimal.valueOf(base)
                    .multiply(rule.percent()).movePointLeft(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
            default -> throw new IllegalStateException("Unknown fee type " + rule.feeType());
        };
        return new Fee(rule, base, Math.max(0, Math.min(base, amount)));
    }
}
