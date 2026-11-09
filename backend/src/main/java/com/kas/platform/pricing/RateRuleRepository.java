package com.kas.platform.pricing;

import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Rate rules, always within the caller's scope.
 *
 * <p>A rule hangs off either a property or a room type
 * ({@code rate_rule_scope_target}), so ownership resolves through whichever is
 * set — expressed once, as {@link #ownedInScope}, and {@code AND}-ed into every
 * statement including the writes.
 */
@Repository
public class RateRuleRepository implements ScopedRepository {

    private static final String COLUMNS = """
            r.id, r.scope, r.property_id, r.room_type_id, r.name, r.priority,
            r.date_from, r.date_to, r.days_of_week, r.price_minor, r.adjustment_percent,
            r.currency, r.min_nights, r.max_nights, r.channel_scope, r.status
            """;

    private final JdbcClient jdbc;

    public RateRuleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The ownership predicate: this rule's property is inside the caller's scope.
     *
     * <p>A {@code PROPERTY}-scope rule names its property directly; a
     * {@code ROOM_TYPE}-scope rule reaches it through the room type.
     * {@code coalesce} covers both without a UNION and without a join that could
     * multiply rows.
     */
    private static String ownedInScope(ScopeFilter filter) {
        return """
                EXISTS (SELECT 1
                          FROM property p
                          LEFT JOIN room_type rt ON rt.id = r.room_type_id
                         WHERE p.id = coalesce(r.property_id, rt.property_id)
                           AND %s)
                """.formatted(filter.sql());
    }

    public List<RateRule> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM rate_rule r
                        LEFT JOIN room_type rt2 ON rt2.id = r.room_type_id
                        WHERE coalesce(r.property_id, rt2.property_id) = ?
                          AND """ + " " + ownedInScope(filter)
                        + " ORDER BY r.priority DESC, r.date_from NULLS LAST, r.name")
                .params(params)
                .query(RateRuleRepository::map)
                .list();
    }

    public Optional<RateRule> findById(UUID ruleId, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(ruleId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM rate_rule r WHERE r.id = ? AND "
                        + ownedInScope(filter))
                .params(params)
                .query(RateRuleRepository::map)
                .optional();
    }

    /**
     * Doc 56 §3.1's candidate set for one room type on one date, unordered.
     *
     * <p>Transcribed predicate by predicate:
     *
     * <pre>
     * WHERE status = ACTIVE
     *   AND (room_type_id = rt OR (room_type_id IS NULL AND property_id = rt.property))
     *   AND date BETWEEN date_from AND date_to        (NULL = always)
     *   AND (days_of_week IS NULL OR dow(date) = ANY(days_of_week))
     *   AND (channel_scope IS NULL OR channel_scope = channelScope)   ← V1: always NULL
     *   AND (rate_plan_id IS NULL)                                     ← V1: always NULL
     * </pre>
     *
     * <p>Ordering is deliberately <em>not</em> applied here. Doc 56 §3.1 sorts by
     * {@code priority DESC, specificity DESC}, and specificity is a property of
     * the rule's shape rather than a column — so {@link RateResolver} ranks the
     * candidates, which is also where the tie rule can be enforced instead of a
     * {@code LIMIT 1} silently taking whichever row PostgreSQL returned first.
     *
     * <p>{@code min_nights} / {@code max_nights} are <strong>not</strong> in the
     * predicate, because doc 56 §3.1 does not put them there — the resolver is
     * given a date, not a stay length. They are stay-level restrictions belonging
     * to the booking path. See doc 97 §8 and OQ-120.
     */
    public List<RateRule> candidatesFor(UUID roomTypeId, LocalDate date, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);
        java.sql.Date on = java.sql.Date.valueOf(date);

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(roomTypeId);
        params.add(on);
        params.add(on);
        params.add(on);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM rate_rule r
                        WHERE r.status = 'ACTIVE'
                          AND ( r.room_type_id = ?
                                OR ( r.room_type_id IS NULL
                                     AND r.property_id
                                         = (SELECT property_id FROM room_type WHERE id = ?) ) )
                          AND (r.date_from IS NULL OR r.date_from <= ?)
                          AND (r.date_to   IS NULL OR r.date_to   >= ?)
                          AND (r.days_of_week IS NULL
                               OR EXTRACT(DOW FROM CAST(? AS date))::smallint = ANY (r.days_of_week))
                          AND r.channel_scope IS NULL
                          AND r.rate_plan_id IS NULL
                          AND """ + " " + ownedInScope(filter))
                .params(params)
                .query(RateRuleRepository::map)
                .list();
    }

    /**
     * Creates a rule under {@code targetPropertyId}. Empty when out of scope.
     *
     * <p>The {@code INSERT ... SELECT FROM property WHERE … AND scope} form puts
     * the scope predicate inside the write, so an out-of-scope target produces no
     * row rather than being caught by a check the caller might forget.
     */
    public Optional<UUID> create(RateRule rule, UUID targetPropertyId, UUID createdBy,
                                 AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(rule.scope().name());
        params.add(rule.propertyId());
        params.add(rule.roomTypeId());
        params.add(rule.name());
        params.add(rule.priority());
        params.add(sqlDate(rule.dateFrom()));
        params.add(sqlDate(rule.dateTo()));
        params.add(toDowArray(rule.daysOfWeek()));
        params.add(rule.priceMinor());
        params.add(rule.adjustmentPercent());
        params.add(rule.currency());
        params.add(rule.minNights());
        params.add(rule.maxNights());
        params.add(createdBy);
        params.add(targetPropertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO rate_rule
                            (scope, property_id, room_type_id, name, priority, date_from, date_to,
                             days_of_week, price_minor, adjustment_percent, currency,
                             min_nights, max_nights, created_by)
                        SELECT CAST(? AS rate_scope), CAST(? AS uuid), CAST(? AS uuid), ?, ?,
                               CAST(? AS date), CAST(? AS date), CAST(? AS smallint[]),
                               CAST(? AS bigint), CAST(? AS numeric), ?,
                               CAST(? AS smallint), CAST(? AS smallint), CAST(? AS uuid)
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /**
     * Every ACTIVE V1-shaped rule that could apply to any of {@code roomTypeIds}.
     *
     * <p>Deliberately not filtered by date: the caller is building a grid or a preview over a range
     * and filters per cell with {@link RateRule#appliesOn}. One query, then ranking in memory —
     * doc 56 §7 requires a preview grid before a bulk commit, and a query per cell would make that
     * grid too slow to be mandatory.
     */
    public List<RateRule> findActiveForRoomTypes(List<UUID> roomTypeIds, AuthorizationScope scope) {
        if (roomTypeIds.isEmpty()) {
            return List.of();
        }
        ScopeFilter filter = filter(scope);
        String placeholders = String.join(", ", java.util.Collections.nCopies(roomTypeIds.size(), "?"));

        List<Object> params = new ArrayList<>();
        params.addAll(roomTypeIds);
        params.addAll(roomTypeIds);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM rate_rule r
                        WHERE r.status = 'ACTIVE'
                          AND ( r.room_type_id IN (%s)
                                OR ( r.room_type_id IS NULL
                                     AND r.property_id IN (SELECT property_id FROM room_type
                                                            WHERE id IN (%s)) ) )
                          AND r.channel_scope IS NULL
                          AND r.rate_plan_id IS NULL
                          AND """.formatted(placeholders, placeholders)
                        + " " + ownedInScope(filter))
                .params(params)
                .query(RateRuleRepository::map)
                .list();
    }

    /**
     * The rule occupying exactly this scope, dates and priority, if one exists.
     *
     * <p>What makes a repeated bulk edit an update rather than a refused tie. An operator setting the
     * same range to a new price means "change that rate", not "add a second equally applicable rule";
     * treating it as the latter would refuse every correction after the first.
     */
    public Optional<RateRule> findByExactScope(UUID roomTypeId, LocalDate dateFrom, LocalDate dateTo,
                                               List<Integer> daysOfWeek, int priority,
                                               AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(sqlDate(dateFrom));
        params.add(sqlDate(dateTo));
        params.add(toDowArray(daysOfWeek));
        params.add(priority);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM rate_rule r
                        WHERE r.status <> 'ARCHIVED'
                          AND r.room_type_id  IS NOT DISTINCT FROM CAST(? AS uuid)
                          AND r.date_from     IS NOT DISTINCT FROM CAST(? AS date)
                          AND r.date_to       IS NOT DISTINCT FROM CAST(? AS date)
                          AND r.days_of_week  IS NOT DISTINCT FROM CAST(? AS smallint[])
                          AND r.priority = ?
                          AND r.channel_scope IS NULL
                          AND """ + " " + ownedInScope(filter))
                .params(params)
                .query(RateRuleRepository::map)
                .optional();
    }

    /**
     * Locks the rules of a property in {@code id} order and returns their ids.
     *
     * <p>{@code rate_rule} carries no {@code version} column, so there is no optimistic lock to take
     * — Part C's "if required by the existing schema" is not met, and adding a column to create one
     * would be a migration for a capability the frozen schema deliberately does not have. Two
     * concurrent bulk edits are instead serialised by pessimistic row locks acquired in a
     * deterministic order, the same defence doc 55 §7 uses for inventory.
     */
    public List<UUID> lockPropertyRules(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.id
                          FROM rate_rule r
                          LEFT JOIN room_type rt ON rt.id = r.room_type_id
                         WHERE coalesce(r.property_id, rt.property_id) = ?
                           AND %s
                         ORDER BY r.id
                           FOR UPDATE OF r
                        """.formatted(ownedInScope(filter)))
                .params(params)
                .query(UUID.class)
                .list();
    }

    /** Changes the commercial fields of an existing rule. Ownership is re-checked in the statement. */
    public boolean update(UUID ruleId, String name, Long priceMinor, BigDecimal adjustmentPercent,
                          Integer minNights, Integer maxNights, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(name);
        params.add(priceMinor);
        params.add(adjustmentPercent);
        params.add(minNights);
        params.add(maxNights);
        params.add(ruleId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE rate_rule r
                           SET name               = coalesce(?, r.name),
                               price_minor        = CAST(? AS bigint),
                               adjustment_percent = CAST(? AS numeric),
                               min_nights         = coalesce(CAST(? AS smallint), r.min_nights),
                               max_nights         = coalesce(CAST(? AS smallint), r.max_nights),
                               updated_at         = now()
                         WHERE r.id = ? AND %s
                        """.formatted(ownedInScope(filter)))
                .params(params)
                .update() > 0;
    }

    public boolean setStatus(UUID ruleId, RuleStatus status, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(status.name());
        params.add(ruleId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE rate_rule r
                           SET status = CAST(? AS rule_status), updated_at = now()
                         WHERE r.id = ? AND %s
                        """.formatted(ownedInScope(filter)))
                .params(params)
                .update() > 0;
    }

    /**
     * Whether an equally-ranked rule already exists on the same scope and dates.
     *
     * <p>Doc 56 §3.1: "Ties on {@code (priority, specificity)} are a
     * <strong>configuration error</strong>, not a coin flip. The admin rate editor
     * blocks saving a rule that ties with an existing one on the same scope and
     * dates."
     *
     * <p>This is that guard, enforced at the API rather than only in a UI. The
     * database has no unique constraint expressing it — {@code rate_rule} carries
     * none at all — so without this check the ambiguity would simply be written
     * and surface later as an unresolvable price.
     *
     * <p>{@code IS NOT DISTINCT FROM} rather than {@code =}, because the columns
     * that define a rule's shape are mostly nullable and two NULLs here mean "the
     * same unbounded rule", not "unknown".
     */
    public boolean tiesWithExisting(RateRule candidate, AuthorizationScope scope) {
        return tiesWithExisting(candidate, null, scope);
    }

    /**
     * As above, ignoring one rule.
     *
     * <p>Needed when <em>activating</em> an existing rule: it necessarily matches its own scope,
     * dates and priority, so a check that did not exclude it would find itself and refuse every
     * activation. { IS DISTINCT FROM} handles the null exclusion without a second parameter.
     */
    public boolean tiesWithExisting(RateRule candidate, UUID excludeRuleId,
                                    AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(candidate.scope().name());
        params.add(candidate.propertyId());
        params.add(candidate.roomTypeId());
        params.add(candidate.priority());
        params.add(sqlDate(candidate.dateFrom()));
        params.add(sqlDate(candidate.dateTo()));
        params.add(toDowArray(candidate.daysOfWeek()));
        params.add(excludeRuleId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT count(*)
                          FROM rate_rule r
                         WHERE r.status <> 'ARCHIVED'
                           AND r.scope = CAST(? AS rate_scope)
                           AND r.property_id   IS NOT DISTINCT FROM CAST(? AS uuid)
                           AND r.room_type_id  IS NOT DISTINCT FROM CAST(? AS uuid)
                           AND r.priority = ?
                           AND r.date_from     IS NOT DISTINCT FROM CAST(? AS date)
                           AND r.date_to       IS NOT DISTINCT FROM CAST(? AS date)
                           AND r.days_of_week  IS NOT DISTINCT FROM CAST(? AS smallint[])
                           AND r.id IS DISTINCT FROM CAST(? AS uuid)
                           AND %s
                        """.formatted(ownedInScope(filter)))
                .params(params)
                .query(Long.class)
                .single() > 0;
    }

    private static java.sql.Date sqlDate(LocalDate date) {
        return date == null ? null : java.sql.Date.valueOf(date);
    }

    private static String toDowArray(List<Integer> daysOfWeek) {
        if (daysOfWeek == null || daysOfWeek.isEmpty()) {
            return null;
        }
        return daysOfWeek.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}"));
    }

    private static ScopeFilter filter(AuthorizationScope scope) {
        return ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
    }

    private static RateRule map(ResultSet rs, int rowNum) throws SQLException {
        return new RateRule(
                rs.getObject("id", UUID.class),
                RateScope.valueOf(rs.getString("scope")),
                rs.getObject("property_id", UUID.class),
                rs.getObject("room_type_id", UUID.class),
                rs.getString("name"),
                rs.getInt("priority"),
                date(rs, "date_from"),
                date(rs, "date_to"),
                dowList(rs.getArray("days_of_week")),
                (Long) rs.getObject("price_minor"),
                rs.getBigDecimal("adjustment_percent"),
                rs.getString("currency").trim(),
                (Integer) rs.getObject("min_nights"),
                (Integer) rs.getObject("max_nights"),
                rs.getObject("channel_scope", UUID.class),
                RuleStatus.valueOf(rs.getString("status")));
    }

    private static LocalDate date(ResultSet rs, String column) throws SQLException {
        java.sql.Date value = rs.getDate(column);
        return value == null ? null : value.toLocalDate();
    }

    private static List<Integer> dowList(Array array) throws SQLException {
        if (array == null) {
            return null;
        }
        Object[] values = (Object[]) array.getArray();
        return Arrays.stream(values).map(v -> ((Number) v).intValue()).toList();
    }
}
