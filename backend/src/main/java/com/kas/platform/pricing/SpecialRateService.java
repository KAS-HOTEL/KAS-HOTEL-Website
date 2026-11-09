package com.kas.platform.pricing;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Array;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * "Quy tắc đặc biệt" — a holiday, season or weekday pattern with a fixed price per room
 * type (owner-approved pricing redesign, 2026-11-08; V56).
 *
 * <p>Each group is stored as one {@code ROOM_TYPE} rate rule per priced room type, created,
 * activated, paused and archived through {@link RateAuthoringService} so every existing
 * guard (ties, dates, days of week, audit) still applies. The rate engine is untouched:
 * a price typed on the calendar for a date still outranks every rule.
 *
 * <p>Editing archives the group's rules and creates new ones: rule dates are immutable by
 * design (see {@link RateAuthoringService#update}), and archived rules keep resolving for
 * price snapshots.
 */
@Service
public class SpecialRateService {

    /** Rule priority by kind: a holiday inside a season wins; a season beats a weekly pattern. */
    public enum Kind {
        HOLIDAY(30), SEASON(20), OTHER(15), WEEKLY(10);

        final int priority;

        Kind(int priority) {
            this.priority = priority;
        }
    }

    public record Price(UUID roomTypeId, long priceMinor) {
    }

    public record Draft(Kind kind, String name, LocalDate dateFrom, LocalDate dateTo,
                        List<Integer> daysOfWeek, List<Price> prices) {
    }

    public record Group(UUID id, UUID propertyId, Kind kind, String name, LocalDate dateFrom,
                        LocalDate dateTo, List<Integer> daysOfWeek, boolean active,
                        Map<UUID, Long> prices, List<UUID> ruleIds) {
    }

    private final RateAuthoringService rates;
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public SpecialRateService(RateAuthoringService rates, JdbcClient jdbc, AuditLogger audit) {
        this.rates = rates;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public List<Group> list(UUID propertyId, AuthorizationScope scope) {
        rates.list(propertyId, scope); // 404 when the property is outside the caller's scope
        return jdbc.sql("""
                        SELECT id FROM rate_rule_group
                         WHERE property_id = :p AND NOT archived
                         ORDER BY date_from NULLS LAST, created_at
                        """)
                .param("p", propertyId).query(UUID.class).list()
                .stream().map(this::load).toList();
    }

    @Transactional
    public Group create(UUID propertyId, Draft draft, ResolvedActor actor, AuthorizationScope scope) {
        rates.list(propertyId, scope);
        Draft clean = validate(propertyId, draft);
        UUID id = jdbc.sql("""
                        INSERT INTO rate_rule_group (property_id, kind, name, date_from, date_to, days_of_week, created_by)
                        VALUES (:p, :kind, :name, :from, :to, CAST(:dow AS smallint[]), :by) RETURNING id
                        """)
                .param("p", propertyId).param("kind", clean.kind().name()).param("name", clean.name())
                .param("from", clean.dateFrom()).param("to", clean.dateTo())
                .param("dow", dowLiteral(clean.daysOfWeek())).param("by", actor.userId())
                .query(UUID.class).single();
        createRules(id, propertyId, clean, true, actor, scope);
        record(actor, "rate.special_created", id, Map.of("kind", clean.kind().name(), "name", clean.name()), scope);
        return load(id);
    }

    @Transactional
    public Group update(UUID groupId, Draft draft, ResolvedActor actor, AuthorizationScope scope) {
        Group current = require(groupId, scope);
        Draft clean = validate(current.propertyId(), draft);
        archiveRules(groupId, actor, scope);
        jdbc.sql("""
                        UPDATE rate_rule_group
                           SET kind = :kind, name = :name, date_from = :from, date_to = :to,
                               days_of_week = CAST(:dow AS smallint[]), updated_at = now()
                         WHERE id = :id
                        """)
                .param("kind", clean.kind().name()).param("name", clean.name())
                .param("from", clean.dateFrom()).param("to", clean.dateTo())
                .param("dow", dowLiteral(clean.daysOfWeek())).param("id", groupId).update();
        createRules(groupId, current.propertyId(), clean, current.active(), actor, scope);
        record(actor, "rate.special_updated", groupId, Map.of("kind", clean.kind().name(), "name", clean.name()), scope);
        return load(groupId);
    }

    @Transactional
    public Group setActive(UUID groupId, boolean active, ResolvedActor actor, AuthorizationScope scope) {
        Group current = require(groupId, scope);
        if (current.active() == active) return current;
        for (Member member : members(groupId)) {
            RuleStatus target = active ? RuleStatus.ACTIVE : RuleStatus.PAUSED;
            if (member.status().canTransitionTo(target)) rates.setStatus(member.ruleId(), target, actor, scope);
        }
        jdbc.sql("UPDATE rate_rule_group SET active = :a, updated_at = now() WHERE id = :id")
                .param("a", active).param("id", groupId).update();
        record(actor, "rate.special_status_changed", groupId, Map.of("active", active), scope);
        return load(groupId);
    }

    @Transactional
    public void archive(UUID groupId, ResolvedActor actor, AuthorizationScope scope) {
        require(groupId, scope);
        archiveRules(groupId, actor, scope);
        jdbc.sql("UPDATE rate_rule_group SET archived = true, active = false, updated_at = now() WHERE id = :id")
                .param("id", groupId).update();
        record(actor, "rate.special_archived", groupId, Map.of(), scope);
    }

    public record Cell(UUID roomTypeId, LocalDate date) {
    }

    /** Most cells one calendar action may touch (30 nights x many room types, with room to spare). */
    public static final int MAX_CELLS = 2000;

    /**
     * The calendar's "Áp giá" / "Bỏ giá đã áp" for many cells at once, all or nothing.
     * {@code amountMinor} null removes the day prices, so the cells fall back to a rule or base.
     */
    @Transactional
    public int applyDayPrices(List<Cell> cells, Long amountMinor, ResolvedActor actor, AuthorizationScope scope) {
        if (cells == null || cells.isEmpty() || cells.size() > MAX_CELLS) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "Select between 1 and " + MAX_CELLS + " cells.",
                    List.of(detail("cells", "SIZE", "Select between 1 and " + MAX_CELLS + " cells.")));
        }
        if (amountMinor != null && amountMinor < 0) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "A price cannot be negative.",
                    List.of(detail("amountMinor", "NEGATIVE", "A price cannot be negative.")));
        }
        for (Cell cell : cells) {
            if (cell == null || cell.roomTypeId() == null || cell.date() == null) {
                throw new KasException(ApiErrorCode.VALIDATION_FAILED, "Every cell needs a room type and a date.",
                        List.of(detail("cells", "INVALID", "Every cell needs a room type and a date.")));
            }
            if (amountMinor == null) rates.clearDayPrice(cell.roomTypeId(), cell.date(), actor, scope);
            else rates.setDayPrice(cell.roomTypeId(), cell.date(), amountMinor, actor, scope);
        }
        return cells.size();
    }

    // ------------------------------------------------------------------ internals

    private Group require(UUID groupId, AuthorizationScope scope) {
        UUID propertyId = jdbc.sql("SELECT property_id FROM rate_rule_group WHERE id = :id AND NOT archived")
                .param("id", groupId).query(UUID.class).optional()
                .orElseThrow(() -> NotFoundException.outOfScope("Special rate"));
        try {
            rates.list(propertyId, scope);
        } catch (NotFoundException outOfScope) {
            throw NotFoundException.outOfScope("Special rate");
        }
        return load(groupId);
    }

    private void createRules(UUID groupId, UUID propertyId, Draft draft, boolean active,
                             ResolvedActor actor, AuthorizationScope scope) {
        for (Price price : draft.prices()) {
            RateRule rule = new RateRule(null, RateScope.ROOM_TYPE, null, price.roomTypeId(), draft.name(),
                    draft.kind().priority, draft.dateFrom(), draft.dateTo(), draft.daysOfWeek(),
                    price.priceMinor(), null, Money.VND, null, null, null, RuleStatus.DRAFT);
            UUID ruleId = rates.create(rule, actor, scope).id();
            jdbc.sql("UPDATE rate_rule SET group_id = :g WHERE id = :id").param("g", groupId).param("id", ruleId).update();
            rates.setStatus(ruleId, RuleStatus.ACTIVE, actor, scope);
            if (!active) rates.setStatus(ruleId, RuleStatus.PAUSED, actor, scope);
        }
    }

    private void archiveRules(UUID groupId, ResolvedActor actor, AuthorizationScope scope) {
        for (Member member : members(groupId)) {
            rates.setStatus(member.ruleId(), RuleStatus.ARCHIVED, actor, scope);
        }
    }

    private record Member(UUID ruleId, UUID roomTypeId, long priceMinor, RuleStatus status) {
    }

    private List<Member> members(UUID groupId) {
        return jdbc.sql("""
                        SELECT id, room_type_id, price_minor, status FROM rate_rule
                         WHERE group_id = :g AND status <> 'ARCHIVED'
                        """)
                .param("g", groupId)
                .query((rs, n) -> new Member(rs.getObject("id", UUID.class), rs.getObject("room_type_id", UUID.class),
                        rs.getLong("price_minor"), RuleStatus.valueOf(rs.getString("status"))))
                .list();
    }

    private Group load(UUID groupId) {
        Map<UUID, Long> prices = new LinkedHashMap<>();
        List<UUID> ruleIds = new ArrayList<>();
        for (Member member : members(groupId)) {
            prices.put(member.roomTypeId(), member.priceMinor());
            ruleIds.add(member.ruleId());
        }
        return jdbc.sql("""
                        SELECT id, property_id, kind, name, date_from, date_to, days_of_week, active
                          FROM rate_rule_group WHERE id = :id
                        """)
                .param("id", groupId)
                .query((rs, n) -> new Group(rs.getObject("id", UUID.class), rs.getObject("property_id", UUID.class),
                        Kind.valueOf(rs.getString("kind")), rs.getString("name"),
                        rs.getObject("date_from", LocalDate.class), rs.getObject("date_to", LocalDate.class),
                        dows(rs.getArray("days_of_week")), rs.getBoolean("active"), prices, ruleIds))
                .single();
    }

    private Draft validate(UUID propertyId, Draft draft) {
        List<KasException.ErrorDetail> problems = new ArrayList<>();
        if (draft.kind() == null) problems.add(detail("kind", "REQUIRED", "Choose the kind of rule."));
        String name = draft.name() == null ? "" : draft.name().trim();
        if (name.isEmpty() || name.length() > 120) problems.add(detail("name", "REQUIRED", "A name of 1-120 characters is required."));
        List<Integer> dows = draft.daysOfWeek() == null ? List.of() : draft.daysOfWeek().stream().distinct().sorted().toList();
        if (dows.stream().anyMatch(d -> d == null || d < 0 || d > 6)) problems.add(detail("daysOfWeek", "INVALID", "Days of week are 0 (Sunday) to 6."));
        LocalDate from = draft.dateFrom(), to = draft.dateTo();
        if (draft.kind() == Kind.WEEKLY) {
            if (dows.isEmpty()) problems.add(detail("daysOfWeek", "REQUIRED", "Choose at least one weekday."));
        } else if (from == null || to == null) {
            problems.add(detail("dateFrom", "REQUIRED", "A date range is required."));
        }
        if (from != null && to != null && to.isBefore(from)) problems.add(detail("dateTo", "ORDER", "The end date is before the start date."));
        List<Price> prices = draft.prices() == null ? List.of() : draft.prices();
        if (prices.isEmpty()) problems.add(detail("prices", "REQUIRED", "Enter a price for at least one room type."));
        if (prices.stream().map(Price::roomTypeId).distinct().count() != prices.size()) problems.add(detail("prices", "DUPLICATE", "A room type is listed twice."));
        for (Price price : prices) {
            if (price.priceMinor() < 0) problems.add(detail("prices", "NEGATIVE", "A price cannot be negative."));
            boolean belongs = jdbc.sql("SELECT count(*) FROM room_type WHERE id = :id AND property_id = :p")
                    .param("id", price.roomTypeId()).param("p", propertyId).query(Long.class).single() == 1;
            if (!belongs) problems.add(detail("prices", "UNKNOWN_ROOM_TYPE", "A room type does not belong to this hotel."));
        }
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "The special rate is not valid.", problems);
        }
        return new Draft(draft.kind(), name, from, to, dows.isEmpty() ? null : dows, prices);
    }

    private static KasException.ErrorDetail detail(String field, String code, String message) {
        return new KasException.ErrorDetail(field, code, message);
    }

    private static String dowLiteral(List<Integer> days) {
        if (days == null || days.isEmpty()) return null;
        return "{" + String.join(",", days.stream().map(String::valueOf).toList()) + "}";
    }

    private static List<Integer> dows(Array array) throws SQLException {
        if (array == null) return null;
        Object[] values = (Object[]) array.getArray();
        return Arrays.stream(values).map(v -> ((Number) v).intValue()).toList();
    }

    private void record(ResolvedActor actor, String action, UUID id, Map<String, Object> after, AuthorizationScope scope) {
        String role = actor.roles().contains(UserRole.SUPER_ADMIN) ? UserRole.SUPER_ADMIN.name()
                : actor.roles().contains(UserRole.ADMIN) ? UserRole.ADMIN.name() : UserRole.CUSTOMER.name();
        audit.record(new AuditEvent(actor.userId(), role, action, "rate_rule_group", id,
                null, after, null, null, null, CorrelationId.current(), scope.toString()));
    }
}
