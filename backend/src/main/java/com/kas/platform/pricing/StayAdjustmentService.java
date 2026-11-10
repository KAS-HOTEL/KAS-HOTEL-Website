package com.kas.platform.pricing;

import com.kas.platform.shared.TimeConfiguration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * What happens to a priced room subtotal before it becomes the guest's total: one voucher
 * (owner decision 2026-11-09: "Mỗi đơn sử dụng tối đa 1 voucher") and then the active
 * percentage taxes and charges from {@code tax_rule}.
 *
 * <p>Order (offers.html#member): the voucher comes off the room amount; a service charge, if
 * one is active, is on the room amount after the voucher; VAT is on that amount
 * ({@code ROOM_SUBTOTAL}) or on that amount plus the service charge
 * ({@code ROOM_SUBTOTAL_PLUS_SERVICE}). Amounts are rounded half-up to the minor unit.
 * A property-specific rule replaces the global rule of the same type.
 */
@Service
public class StayAdjustmentService {

    /** Why a voucher cannot be used on this stay. Stable codes: the website words them. */
    public enum VoucherReason {
        NOT_FOUND, INACTIVE, NOT_STARTED, EXPIRED, USED_UP, WRONG_HOTEL, WRONG_ROOM,
        STAY_OUT_OF_RANGE, MIN_NIGHTS, MIN_TOTAL, WRONG_CURRENCY
    }

    public record Voucher(UUID id, String code, String name, String description, String type,
                          BigDecimal valuePercent, Long valueMinor, String valueAddDescription,
                          String currency, LocalDate validFrom, LocalDate validTo, LocalDate stayFrom,
                          LocalDate stayTo, Integer minNights, Long minTotalMinor,
                          List<UUID> propertyIds, List<UUID> roomTypeIds,
                          Integer usageLimitTotal, int usedCount, String status, long activeHolds) {
    }

    /** A voucher judged against one stay. {@code reason} is null when it can be used. */
    public record VoucherCheck(Voucher voucher, VoucherReason reason, long discountMinor) {
        public boolean eligible() { return reason == null; }
    }

    public record TaxLine(String type, BigDecimal ratePercent, long amountMinor, boolean inclusive) {
    }

    /**
     * rooms − voucher − member discount = net; net + added taxes − points = total.
     * {@code discountMinor} is the voucher's part only; the member discount and the points have
     * their own fields so each can be shown and snapshotted.
     */
    public record Adjustment(long subtotalMinor, VoucherCheck voucher, long discountMinor,
                             List<TaxLine> taxes, long serviceChargeMinor, long taxMinor, long totalMinor,
                             MemberPricing member, long memberDiscountMinor, long pointsUsed) {
        public Adjustment {
            taxes = List.copyOf(taxes);
        }

        /** The pre-membership shape (no member discount, no points). */
        public Adjustment(long subtotalMinor, VoucherCheck voucher, long discountMinor, List<TaxLine> taxes,
                          long serviceChargeMinor, long taxMinor, long totalMinor) {
            this(subtotalMinor, voucher, discountMinor, taxes, serviceChargeMinor, taxMinor, totalMinor, null, 0, 0);
        }

        /** Rooms after voucher and member discount: what VAT is charged on and what points can reduce. */
        public long netMinor() { return subtotalMinor - discountMinor - memberDiscountMinor; }
    }

    /**
     * The signed-in guest's membership as it prices a booking: an ACTIVE membership, its current
     * ACTIVE tier and the ACTIVE discount policy ({@code membership_tier.discount_percent}, 10% for
     * every tier today), plus the tier's cashback rate and the points the guest can spend.
     */
    public record MemberPricing(UUID customerId, UUID membershipId, UUID tierId, String tierCode,
                                UUID discountPolicyId, BigDecimal discountPercent, BigDecimal cashbackRatePercent,
                                long availablePoints, boolean redemptionEnabled, long minimumRedemptionPoints,
                                BigDecimal maximumRedeemPercent) {
    }

    /** Why the points a guest asked to use cannot be used. Stable codes: the website words them. */
    public enum PointsReason { NOT_A_MEMBER, REDEMPTION_OFF, BELOW_MINIMUM, OVER_LIMIT, OVER_BALANCE }

    /** The points asked for cannot be used; {@code limit} is the relevant minimum, cap or balance. */
    public static final class PointsRefused extends RuntimeException {
        private final PointsReason reason;
        private final long limit;

        public PointsRefused(PointsReason reason, long limit) {
            super(reason.name());
            this.reason = reason;
            this.limit = limit;
        }

        public PointsReason reason() { return reason; }
        public long limit() { return limit; }
    }

    private final JdbcClient jdbc;
    private final Clock clock;

    public StayAdjustmentService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ vouchers

    /**
     * The vouchers worth showing a guest for this stay: active, not expired, not used up and
     * valid for this hotel. Each is judged against the stay, so one the guest cannot use yet
     * (too few nights, too small a total, other room type or dates) carries its reason.
     */
    public List<VoucherCheck> vouchersFor(String propertySlug, LocalDate checkIn, LocalDate checkOut,
                                          Collection<UUID> roomTypeIds, long subtotalMinor, String currency) {
        UUID propertyId = propertyId(propertySlug).orElse(null);
        if (propertyId == null) return List.of();
        LocalDate today = today();
        List<VoucherCheck> out = new ArrayList<>();
        for (Voucher v : jdbc.sql(SELECT_VOUCHER + """
                 WHERE status = 'ACTIVE'
                   AND (valid_to IS NULL OR valid_to >= :today)
                   AND (valid_from IS NULL OR valid_from <= :today)
                   AND (usage_limit_total IS NULL OR used_count + (SELECT count(*) FROM voucher_hold h WHERE h.voucher_id = voucher.id AND h.status = 'ACTIVE' AND h.expires_at > now()) < usage_limit_total)
                   AND (applicable_property_ids IS NULL OR cardinality(applicable_property_ids) = 0
                        OR :propertyId = ANY (applicable_property_ids))
                 ORDER BY created_at DESC
                 LIMIT 50
                """).param("today", today).param("propertyId", propertyId).query(this::voucher).list()) {
            out.add(judge(v, propertyId, checkIn, checkOut, roomTypeIds, subtotalMinor, currency, today));
        }
        return out;
    }

    /** One code typed by the guest, judged against this stay. */
    public VoucherCheck checkCode(String code, String propertySlug, LocalDate checkIn, LocalDate checkOut,
                                  Collection<UUID> roomTypeIds, long subtotalMinor, String currency) {
        String trimmed = code == null ? "" : code.trim();
        Optional<Voucher> found = trimmed.isEmpty() || trimmed.length() > 64 ? Optional.empty()
                : jdbc.sql(SELECT_VOUCHER + " WHERE code = CAST(:code AS citext)")
                        .param("code", trimmed).query(this::voucher).optional();
        if (found.isEmpty()) return new VoucherCheck(null, VoucherReason.NOT_FOUND, 0);
        UUID propertyId = propertyId(propertySlug).orElse(null);
        return judge(found.get(), propertyId, checkIn, checkOut, roomTypeIds, subtotalMinor, currency, today());
    }

    private VoucherCheck judge(Voucher v, UUID propertyId, LocalDate checkIn, LocalDate checkOut,
                               Collection<UUID> roomTypeIds, long subtotal, String currency, LocalDate today) {
        VoucherReason reason = null;
        long nights = ChronoUnit.DAYS.between(checkIn, checkOut);
        if ("EXPIRED".equals(v.status()) || (v.validTo() != null && v.validTo().isBefore(today))) {
            reason = VoucherReason.EXPIRED;
        } else if (!"ACTIVE".equals(v.status())) {
            reason = VoucherReason.INACTIVE;
        } else if (v.validFrom() != null && v.validFrom().isAfter(today)) {
            reason = VoucherReason.NOT_STARTED;
        } else if (v.usageLimitTotal() != null && v.usedCount() + v.activeHolds() >= v.usageLimitTotal()) {
            // Uses held by unpaid bookings count too (V65), so the last use cannot be promised twice.
            reason = VoucherReason.USED_UP;
        } else if (!v.propertyIds().isEmpty() && (propertyId == null || !v.propertyIds().contains(propertyId))) {
            reason = VoucherReason.WRONG_HOTEL;
        } else if (!v.roomTypeIds().isEmpty() && !v.roomTypeIds().containsAll(roomTypeIds)) {
            reason = VoucherReason.WRONG_ROOM;
        } else if ((v.stayFrom() != null && checkIn.isBefore(v.stayFrom()))
                || (v.stayTo() != null && checkOut.minusDays(1).isAfter(v.stayTo()))) {
            reason = VoucherReason.STAY_OUT_OF_RANGE;
        } else if (v.minNights() != null && nights < v.minNights()) {
            reason = VoucherReason.MIN_NIGHTS;
        } else if (v.minTotalMinor() != null && subtotal < v.minTotalMinor()) {
            reason = VoucherReason.MIN_TOTAL;
        } else if (currency != null && v.currency() != null && !currency.equalsIgnoreCase(v.currency().trim())) {
            reason = VoucherReason.WRONG_CURRENCY;
        }
        return new VoucherCheck(v, reason, discount(v, subtotal));
    }

    /** The amount a voucher takes off this subtotal; a gift (VALUE_ADD) takes nothing off. */
    static long discount(Voucher v, long subtotal) {
        long amount = switch (v.type()) {
            case "PERCENTAGE" -> v.valuePercent() == null ? 0 : BigDecimal.valueOf(subtotal)
                    .multiply(v.valuePercent()).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValue();
            case "FIXED_AMOUNT" -> v.valueMinor() == null ? 0 : v.valueMinor();
            default -> 0;
        };
        return Math.max(0, Math.min(subtotal, amount));
    }

    // ------------------------------------------------------------------ taxes

    /** Taxes and charges on top of {@code subtotal − discount}, for a stay starting {@code checkIn}. */
    public Adjustment adjust(String propertySlug, LocalDate checkIn, long subtotalMinor, VoucherCheck voucher) {
        return adjust(propertySlug, checkIn, subtotalMinor, voucher, null, 0);
    }

    /**
     * The whole price, in the order offers.html#member states: voucher, then the member discount
     * on what is left, then taxes on the rooms after both, then KAS points (1 point = 1 VND)
     * which pay only the room part, never the taxes.
     *
     * @throws PointsRefused when the points asked for cannot be used
     */
    public Adjustment adjust(String propertySlug, LocalDate checkIn, long subtotalMinor, VoucherCheck voucher,
                             MemberPricing member, long pointsRequested) {
        UUID propertyId = propertyId(propertySlug).orElse(null);
        return compute(subtotalMinor, voucher, member, pointsRequested, taxRules(propertyId, checkIn));
    }

    /** Pure arithmetic of {@link #adjust}; package-visible for the test. */
    static Adjustment compute(long subtotalMinor, VoucherCheck voucher, MemberPricing member, long pointsRequested,
                              Collection<TaxRule> rules) {
        long discount = voucher != null && voucher.eligible() ? voucher.discountMinor() : 0;
        long afterVoucher = subtotalMinor - discount;
        long memberDiscount = member == null || member.discountPercent() == null ? 0
                : BigDecimal.valueOf(afterVoucher).multiply(member.discountPercent())
                        .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValue();
        memberDiscount = Math.max(0, Math.min(afterVoucher, memberDiscount));
        long net = afterVoucher - memberDiscount;

        long points = Math.max(0, pointsRequested);
        if (points > 0) {
            if (member == null) throw new PointsRefused(PointsReason.NOT_A_MEMBER, 0);
            if (!member.redemptionEnabled()) throw new PointsRefused(PointsReason.REDEMPTION_OFF, 0);
            if (points < member.minimumRedemptionPoints()) {
                throw new PointsRefused(PointsReason.BELOW_MINIMUM, member.minimumRedemptionPoints());
            }
            long cap = member.maximumRedeemPercent() == null ? net : BigDecimal.valueOf(net)
                    .multiply(member.maximumRedeemPercent())
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.DOWN).longValue();
            if (points > cap) throw new PointsRefused(PointsReason.OVER_LIMIT, cap);
            if (points > member.availablePoints()) {
                throw new PointsRefused(PointsReason.OVER_BALANCE, member.availablePoints());
            }
        }

        List<TaxLine> lines = new ArrayList<>();
        long service = 0;
        long added = 0;
        for (TaxRule rule : rules) {
            long base = "ROOM_SUBTOTAL_PLUS_SERVICE".equals(rule.appliesTo()) ? net + service : net;
            long amount = BigDecimal.valueOf(base).multiply(rule.ratePercent())
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValue();
            if (rule.inclusive()) {
                // Already inside the price: shown, not added.
                amount = BigDecimal.valueOf(base).multiply(rule.ratePercent())
                        .divide(BigDecimal.valueOf(100).add(rule.ratePercent()), 0, RoundingMode.HALF_UP).longValue();
            } else {
                added += amount;
                if ("SERVICE_CHARGE".equals(rule.type())) service += amount;
            }
            lines.add(new TaxLine(rule.type(), rule.ratePercent(), amount, rule.inclusive()));
        }
        return new Adjustment(subtotalMinor, voucher, discount, lines, service, added - service,
                net + added - points, member, memberDiscount, points);
    }

    /** The active percentage rules for this hotel on this date; a hotel rule replaces the global one of its type. */
    private Collection<TaxRule> taxRules(UUID propertyId, LocalDate checkIn) {

        // Property rule of a type replaces the global rule of that type.
        Map<String, TaxRule> byType = new LinkedHashMap<>();
        for (TaxRule rule : jdbc.sql("""
                SELECT tax_type::text AS tax_type, applies_to::text AS applies_to, value, is_inclusive,
                       property_id IS NOT NULL AS own
                  FROM tax_rule
                 WHERE status = 'ACTIVE' AND calculation = 'PERCENTAGE'
                   AND (property_id IS NULL OR property_id = :propertyId)
                   AND (date_from IS NULL OR date_from <= :checkIn)
                   AND (date_to IS NULL OR date_to >= :checkIn)
                 ORDER BY (tax_type = 'SERVICE_CHARGE') DESC, sort_order, own
                """).param("propertyId", propertyId).param("checkIn", checkIn)
                .query((rs, n) -> new TaxRule(rs.getString("tax_type"), rs.getString("applies_to"),
                        rs.getBigDecimal("value"), rs.getBoolean("is_inclusive"))).list()) {
            byType.put(rule.type(), rule); // ordered so the property's own row comes last and wins
        }

        return byType.values();
    }

    record TaxRule(String type, String appliesTo, BigDecimal ratePercent, boolean inclusive) {
    }

    // ------------------------------------------------------------------ membership

    /**
     * The signed-in user's member pricing, or empty when they are not a customer with an ACTIVE
     * membership, a current ACTIVE tier and an ACTIVE discount policy. Membership is read from
     * the account, never inferred from an email address.
     */
    public Optional<MemberPricing> memberPricingForUser(UUID userId) {
        if (userId == null) return Optional.empty();
        return jdbc.sql("""
                SELECT c.id AS customer_id, cm.id AS membership_id, mt.id AS tier_id, mt.code AS tier_code,
                       dp.id AS policy_id, mt.discount_percent, mt.cashback_rate_percent,
                       COALESCE(ca.balance_points - ca.reserved_points, 0) AS available,
                       rp.redemption_enabled, rp.minimum_redemption_points, rp.maximum_redeem_percent
                  FROM customer c
                  JOIN customer_membership cm ON cm.customer_id = c.id AND cm.status = 'ACTIVE'
                  JOIN customer_membership_tier_history th ON th.membership_id = cm.id AND th.effective_to IS NULL
                  JOIN membership_tier mt ON mt.id = th.tier_id AND mt.status = 'ACTIVE'
                  JOIN membership_discount_policy dp ON dp.status = 'ACTIVE'
                       AND dp.effective_from <= CURRENT_DATE AND (dp.effective_to IS NULL OR dp.effective_to >= CURRENT_DATE)
                  LEFT JOIN cashback_account ca ON ca.customer_id = c.id
                  LEFT JOIN LATERAL (
                       SELECT redemption_enabled, minimum_redemption_points, maximum_redeem_percent
                         FROM cashback_program
                        WHERE status = 'ACTIVE' AND membership_tier_id IS NULL AND redemption_enabled
                          AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
                          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
                        ORDER BY created_at LIMIT 1) rp ON true
                 WHERE c.user_id = :userId AND c.merged_into_id IS NULL
                """).param("userId", userId)
                .query((rs, n) -> new MemberPricing(rs.getObject("customer_id", UUID.class),
                        rs.getObject("membership_id", UUID.class), rs.getObject("tier_id", UUID.class),
                        rs.getString("tier_code"), rs.getObject("policy_id", UUID.class),
                        rs.getBigDecimal("discount_percent"), rs.getBigDecimal("cashback_rate_percent"),
                        Math.max(0, rs.getLong("available")), rs.getBoolean("redemption_enabled"),
                        rs.getLong("minimum_redemption_points"), rs.getBigDecimal("maximum_redeem_percent")))
                .optional();
    }

    // ------------------------------------------------------------------ helpers

    private static final String SELECT_VOUCHER = """
            SELECT id, code::text AS code, name, description, voucher_type::text AS voucher_type,
                   value_percent, value_minor, value_add_description, currency, valid_from, valid_to,
                   stay_from, stay_to, min_nights, min_total_minor, applicable_property_ids,
                   applicable_room_type_ids, usage_limit_total, used_count, status::text AS status,
                   (SELECT count(*) FROM voucher_hold h WHERE h.voucher_id = voucher.id
                       AND h.status = 'ACTIVE' AND h.expires_at > now()) AS active_holds
              FROM voucher
            """;

    private Voucher voucher(ResultSet rs, int row) throws SQLException {
        return new Voucher(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getString("description"), rs.getString("voucher_type"), rs.getBigDecimal("value_percent"),
                rs.getObject("value_minor", Long.class), rs.getString("value_add_description"),
                rs.getString("currency"), rs.getObject("valid_from", LocalDate.class),
                rs.getObject("valid_to", LocalDate.class), rs.getObject("stay_from", LocalDate.class),
                rs.getObject("stay_to", LocalDate.class), (Integer) rs.getObject("min_nights"),
                rs.getObject("min_total_minor", Long.class), uuids(rs.getArray("applicable_property_ids")),
                uuids(rs.getArray("applicable_room_type_ids")), (Integer) rs.getObject("usage_limit_total"),
                rs.getInt("used_count"), rs.getString("status"), rs.getLong("active_holds"));
    }

    private static List<UUID> uuids(Array array) throws SQLException {
        if (array == null) return List.of();
        Object[] values = (Object[]) array.getArray();
        return Arrays.stream(values).map(v -> v instanceof UUID u ? u : UUID.fromString(String.valueOf(v))).toList();
    }

    private Optional<UUID> propertyId(String slug) {
        return jdbc.sql("SELECT id FROM property WHERE slug = :slug").param("slug", slug).query(UUID.class).optional();
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TimeConfiguration.PROPERTY_ZONE));
    }
}
