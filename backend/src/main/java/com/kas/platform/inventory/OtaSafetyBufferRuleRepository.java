package com.kas.platform.inventory;

import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

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
 * OTA safety buffer rules, always within the caller's scope.
 *
 * <p>{@code ota_safety_buffer_rule.property_id} is {@code NOT NULL}, so ownership is direct and needs
 * no {@code coalesce} across two possible parents the way rate rules do.
 *
 * <p>Every read filters {@code distribution_channel_id IS NULL} — the V1 deferral (OQ-115b). A
 * channel-scoped rule can be stored, but it cannot participate in resolution, so no code path has to
 * decide how two channel buffers become one scalar.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class OtaSafetyBufferRuleRepository implements ScopedRepository {

    private static final String COLUMNS = """
            b.id, b.property_id, b.room_type_id, b.distribution_channel_id,
            b.date_from, b.date_to, b.days_of_week, b.buffer_type, b.buffer_value,
            b.priority, b.reason, b.status
            """;

    /** Owner decision OQ-115b — only channel-agnostic rules resolve in V1. */
    private static final String V1_CHANNEL_SCOPE = "b.distribution_channel_id IS NULL";

    private final JdbcClient jdbc;

    public OtaSafetyBufferRuleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Every ACTIVE rule that applies to one room type on one date, unordered.
     *
     * <p>A rule with {@code room_type_id IS NULL} applies to all room types of its property — doc 13
     * §3.4c's stated NULL semantic. {@code date_from}/{@code date_to} NULL means always in effect;
     * {@code days_of_week} NULL means every day.
     *
     * <p>Ordering is left to {@link BufferResolver}, because specificity is a property of the rule's
     * shape rather than a column — and because that is where a tie must be refused rather than
     * silently decided by a {@code LIMIT 1}.
     */
    public List<OtaSafetyBufferRule> candidatesFor(UUID roomTypeId, LocalDate date,
                                                   AuthorizationScope scope) {
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
                        FROM ota_safety_buffer_rule b
                        JOIN property p ON p.id = b.property_id
                        WHERE b.status = 'ACTIVE'
                          AND b.property_id = (SELECT property_id FROM room_type WHERE id = ?)
                          AND (b.room_type_id IS NULL OR b.room_type_id = ?)
                          AND (b.date_from IS NULL OR b.date_from <= ?)
                          AND (b.date_to   IS NULL OR b.date_to   >= ?)
                          AND (b.days_of_week IS NULL
                               OR EXTRACT(DOW FROM CAST(? AS date))::smallint = ANY (b.days_of_week))
                          AND """ + " " + V1_CHANNEL_SCOPE + " AND " + filter.sql())
                .params(params)
                .query(OtaSafetyBufferRuleRepository::map)
                .list();
    }

    public List<OtaSafetyBufferRule> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM ota_safety_buffer_rule b
                        JOIN property p ON p.id = b.property_id
                        WHERE b.property_id = ? AND """ + " " + filter.sql()
                        + " ORDER BY b.priority DESC, b.date_from NULLS LAST, b.id")
                .params(params)
                .query(OtaSafetyBufferRuleRepository::map)
                .list();
    }

    public Optional<OtaSafetyBufferRule> findById(UUID ruleId, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(ruleId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM ota_safety_buffer_rule b
                        JOIN property p ON p.id = b.property_id
                        WHERE b.id = ? AND """ + " " + filter.sql())
                .params(params)
                .query(OtaSafetyBufferRuleRepository::map)
                .optional();
    }

    /**
     * Creates a rule. Empty when the property is out of scope.
     *
     * <p>{@code distribution_channel_id} is never written: the V1 model has no channel dimension
     * (OQ-115b), so the column is left NULL rather than accepting a value the resolver would ignore.
     */
    public Optional<UUID> create(OtaSafetyBufferRule rule, UUID createdBy,
                                 AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(rule.roomTypeId());
        params.add(sqlDate(rule.dateFrom()));
        params.add(sqlDate(rule.dateTo()));
        params.add(toDowArray(rule.daysOfWeek()));
        params.add(rule.bufferType().name());
        params.add(rule.bufferValue());
        params.add(rule.priority());
        params.add(rule.reason());
        params.add(createdBy);
        params.add(rule.propertyId());
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO ota_safety_buffer_rule
                            (property_id, room_type_id, date_from, date_to, days_of_week,
                             buffer_type, buffer_value, priority, reason, created_by)
                        SELECT p.id, CAST(? AS uuid), CAST(? AS date), CAST(? AS date),
                               CAST(? AS smallint[]), CAST(? AS buffer_type), CAST(? AS numeric),
                               ?, ?, CAST(? AS uuid)
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    public boolean setStatus(UUID ruleId, RuleStatus status, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(status.name());
        params.add(ruleId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE ota_safety_buffer_rule b
                           SET status = CAST(? AS rule_status), updated_at = now()
                          FROM property p
                         WHERE p.id = b.property_id AND b.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /**
     * Whether an equally-ranked rule already exists on the same scope and dates.
     *
     * <p>The write-time half of the approved tie rule. Doc 56 §3.1 puts the guard in the editor —
     * "The admin rate editor blocks saving a rule that ties with an existing one on the same scope
     * and dates" — and the owner approved the same semantics for buffers. The table has no unique
     * constraint expressing it, so without this check the ambiguity would simply be written.
     */
    public boolean tiesWithExisting(OtaSafetyBufferRule candidate, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(candidate.propertyId());
        params.add(candidate.roomTypeId());
        params.add(candidate.priority());
        params.add(sqlDate(candidate.dateFrom()));
        params.add(sqlDate(candidate.dateTo()));
        params.add(toDowArray(candidate.daysOfWeek()));
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT count(*)
                          FROM ota_safety_buffer_rule b
                          JOIN property p ON p.id = b.property_id
                         WHERE b.status <> 'ARCHIVED'
                           AND b.property_id = ?
                           AND b.room_type_id  IS NOT DISTINCT FROM CAST(? AS uuid)
                           AND b.priority = ?
                           AND b.date_from     IS NOT DISTINCT FROM CAST(? AS date)
                           AND b.date_to       IS NOT DISTINCT FROM CAST(? AS date)
                           AND b.days_of_week  IS NOT DISTINCT FROM CAST(? AS smallint[])
                           AND %s
                           AND %s
                        """.formatted(V1_CHANNEL_SCOPE, filter.sql()))
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

    private static OtaSafetyBufferRule map(ResultSet rs, int rowNum) throws SQLException {
        return new OtaSafetyBufferRule(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getObject("room_type_id", UUID.class),
                rs.getObject("distribution_channel_id", UUID.class),
                date(rs, "date_from"),
                date(rs, "date_to"),
                dowList(rs.getArray("days_of_week")),
                BufferType.valueOf(rs.getString("buffer_type")),
                rs.getBigDecimal("buffer_value"),
                rs.getInt("priority"),
                rs.getString("reason"),
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
        return Arrays.stream((Object[]) array.getArray())
                .map(value -> ((Number) value).intValue())
                .toList();
    }

}
