package com.kas.platform.property;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Policies, always within the caller's scope.
 *
 * <h2>Scope, on a partner-owned table</h2>
 *
 * <p>Since V32 a policy belongs to a <em>partner</em>, and optionally to one of
 * that partner's properties. So the predicate is on
 * {@code property_policy.partner_id} — the same shape
 * {@code MessageTemplateRepository} uses for {@code message_template}, which is
 * the other partner-owned table with an optional property.
 *
 * <p>It could not stay on the {@code property_policy → property → partner} join
 * it used before: that join is an inner join on {@code property_id}, and a
 * shared policy has none. Every shared policy would have been invisible to
 * every query in this class.
 *
 * <p>When a policy does name a property, that property is checked through
 * {@link ScopeFilter} as well — a PROPERTY-scoped actor must not reach an
 * override aimed at a property they cannot see, even one their own partner
 * owns.
 *
 * <p>A shared policy has no property, so it is checked against the partner
 * instead, with {@code PartnerRepository}'s rule: only a scope that reaches the
 * whole partner — GLOBAL, or PARTNER for that partner — reaches its shared rows.
 * A PROPERTY-scoped actor runs some of a portfolio, not all of it, and a shared
 * policy applies to all of it. Every statement here, reads and writes alike,
 * carries one of these two predicates; a {@code partnerId} argument narrows a
 * query but never stands in for the scope.
 *
 * <h2>How "the current policy" is resolved</h2>
 *
 * <p>The schema is <strong>effective-dated</strong>: each version carries an
 * {@code effective_from} date, and several versions may be {@code ACTIVE} at
 * once — a policy taking effect next month sits alongside the one in force
 * today, which is the point of the column.
 *
 * <p>The current version is the newest one that has actually started:
 *
 * <pre>status = ACTIVE AND effective_from &lt;= current_date
 * ORDER BY effective_from DESC, version DESC LIMIT 1</pre>
 *
 * <p>The {@code version DESC} tie-break makes it <strong>total</strong>: even two
 * versions sharing an {@code effective_from} resolve deterministically, so there
 * is no state in which "the current policy" is ambiguous. That is why no
 * single-active constraint was added and no migration was needed — see doc 96 §4.
 *
 * <h2>Resolution across scopes</h2>
 *
 * <p>{@link #resolveForProperty} adds the second half of the rule the brief
 * fixes: for one hotel, a property-specific policy beats the shared policy of
 * the same type, and the shared one applies wherever there is no override. That
 * choice is made in SQL, once, so no caller can implement it differently.
 */
@Repository
public class PropertyPolicyRepository implements ScopedRepository {

    private static final String COLUMNS =
            "pp.id, pp.partner_id, pp.property_id, pp.policy_type, pp.version, "
            + "pp.effective_from, pp.status";

    /**
     * Left join, not inner: a shared policy has no property, and an inner join
     * would drop exactly the rows this class was extended to carry.
     */
    private static final String FROM =
            " FROM property_policy pp LEFT JOIN property p ON p.id = pp.property_id ";

    private final JdbcClient jdbc;

    public PropertyPolicyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ create

    /**
     * Creates a shared policy version — one row for the whole portfolio.
     *
     * <p>{@code property_id} stays NULL. Nothing is copied per property: the
     * resolution query is what makes one row apply to eight hotels.
     *
     * <p>The partner is selected behind the scope predicate, so a scope that
     * does not reach it writes no row and the result is empty — the same answer
     * as a partner that does not exist.
     */
    public Optional<UUID> createShared(UUID partnerId, PolicyType type, int version,
                                       LocalDate effectiveFrom, AuthorizationScope scope) {
        ScopeFilter reach = partnerReach(scope, "pt.id");

        List<Object> params = new ArrayList<>();
        params.add(type.name());
        params.add(version);
        params.add(java.sql.Date.valueOf(effectiveFrom));
        params.add(partnerId);
        params.addAll(reach.parameters());

        return jdbc.sql("""
                        INSERT INTO property_policy
                            (partner_id, property_id, policy_type, version, effective_from)
                        SELECT pt.id, NULL, ?, ?, ?
                          FROM partner pt
                         WHERE pt.id = ? AND %s
                        RETURNING id
                        """.formatted(reach.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /**
     * Creates a policy version for one property. Created {@code DRAFT};
     * activation is separate.
     *
     * <p>{@code partner_id} is taken from the property rather than from the
     * caller, so the row cannot claim an owner the property does not have —
     * V32's {@code property_policy_scope_valid} requires it to be present.
     */
    public Optional<UUID> create(UUID propertyId, PolicyType type, int version,
                                 LocalDate effectiveFrom, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(type.name());
        params.add(version);
        params.add(java.sql.Date.valueOf(effectiveFrom));
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO property_policy
                            (partner_id, property_id, policy_type, version, effective_from)
                        SELECT p.partner_id, p.id, ?, ?, ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /**
     * The next version number for a policy type at one scope.
     *
     * <p>Counted within the scope it will be created at: a shared CANCELLATION
     * and a property's own CANCELLATION version independently, because the two
     * unique indexes V32 created are independent. Counting them together would
     * make an override's version jump whenever the shared policy was revised.
     *
     * <p>Read inside the caller's transaction and immediately used by
     * {@link #create} or {@link #createShared}; a concurrent creator racing to
     * the same number is stopped by the unique index rather than by this read
     * being clever.
     *
     * <p>Counted only over rows the scope reaches. Outside it the count is of
     * nothing, so the answer is 1 whether or not the other partner has versions
     * — nothing about their rows is disclosed — and the create that follows
     * refuses anyway.
     */
    public int nextVersion(UUID partnerId, UUID propertyId, PolicyType type,
                           AuthorizationScope scope) {
        ScopeFilter filter = propertyId == null
                ? partnerReach(scope, "pp.partner_id")
                : ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(partnerId);
        params.add(type.name());
        if (propertyId != null) {
            params.add(propertyId);
        }
        params.addAll(filter.parameters());

        String propertyPredicate = propertyId == null
                ? "pp.property_id IS NULL"
                : "pp.property_id = ?";

        return jdbc.sql("""
                        SELECT coalesce(max(pp.version), 0) + 1
                          FROM property_policy pp
                          LEFT JOIN property p ON p.id = pp.property_id
                         WHERE pp.partner_id = ? AND pp.policy_type = ? AND %s AND %s
                        """.formatted(propertyPredicate, filter.sql()))
                .params(params)
                .query(Integer.class)
                .single();
    }

    // -------------------------------------------------------------------- read

    public Optional<PropertyPolicy> findById(UUID policyId, UUID partnerId,
                                             AuthorizationScope scope) {
        ScopeFilter filter = visibleTo(scope);

        List<Object> params = new ArrayList<>();
        params.add(policyId);
        params.add(partnerId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + FROM
                        + " WHERE pp.id = ? AND pp.partner_id = ? AND " + filter.sql())
                .params(params)
                .query(PropertyPolicyRepository::map)
                .optional();
    }

    /** Every policy the partner owns, at either scope, newest version first. */
    public List<PropertyPolicy> findByPartner(UUID partnerId, AuthorizationScope scope) {
        ScopeFilter filter = visibleTo(scope);

        List<Object> params = new ArrayList<>();
        params.add(partnerId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + FROM
                        + " WHERE pp.partner_id = ? AND " + filter.sql()
                        + " ORDER BY pp.policy_type, pp.property_id NULLS FIRST,"
                        + " pp.effective_from DESC, pp.version DESC")
                .params(params)
                .query(PropertyPolicyRepository::map)
                .list();
    }

    /** One property's own policies — overrides only, nothing inherited. */
    public List<PropertyPolicy> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + FROM
                        + " WHERE pp.property_id = ? AND " + filter.sql()
                        + " ORDER BY pp.policy_type, pp.effective_from DESC, pp.version DESC")
                .params(params)
                .query(PropertyPolicyRepository::map)
                .list();
    }

    /**
     * What actually applies to one hotel: its own policies, plus the partner's
     * shared ones for every type it has not overridden.
     *
     * <p>The override rule lives here and only here, stated as the condition it
     * is: a shared policy is included <strong>only when the property has no
     * policy of that type at all</strong>. So overriding CANCELLATION replaces
     * the shared CANCELLATION for this hotel and leaves every other shared
     * policy untouched.
     *
     * <p>Written as {@code NOT EXISTS} rather than as {@code DISTINCT ON}: the
     * two scopes version independently, so a shared v1 and an override v2 are
     * both "newest of their own scope" and a per-row ranking would return both.
     * The rule is about the <em>type</em> being overridden, not about which row
     * sorts first.
     *
     * <p>Every version of the winning scope is returned, not just the current
     * one: the callers are authoring surfaces that need to see a scheduled
     * version as well as the live one. "Which version is in force today" stays
     * the {@code effective_from DESC, version DESC} rule documented on this
     * class.
     */
    public List<PropertyPolicy> resolveForProperty(UUID propertyId, UUID partnerId,
                                                   AuthorizationScope scope) {
        ScopeFilter filter = visibleTo(scope);

        List<Object> params = new ArrayList<>();
        params.add(partnerId);
        params.add(propertyId);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT %s
                          %s
                         WHERE pp.partner_id = ?
                           AND (
                                 pp.property_id = ?
                                 OR (pp.property_id IS NULL
                                     AND NOT EXISTS (
                                         SELECT 1 FROM property_policy override
                                          WHERE override.partner_id = pp.partner_id
                                            AND override.property_id = ?
                                            AND override.policy_type = pp.policy_type))
                               )
                           AND %s
                         ORDER BY pp.policy_type, pp.effective_from DESC, pp.version DESC
                        """.formatted(COLUMNS, FROM, filter.sql()))
                .params(params)
                .query(PropertyPolicyRepository::map)
                .list();
    }

    // ------------------------------------------------------------------- write

    public boolean setStatus(UUID policyId, UUID partnerId, PolicyStatus status,
                             AuthorizationScope scope) {
        if (findById(policyId, partnerId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE property_policy
                           SET status = CAST(? AS rule_status), updated_at = now()
                         WHERE id = ? AND partner_id = ?
                        """)
                .params(List.of(status.name(), policyId, partnerId))
                .update() > 0;
    }

    /** Localised summary and body. Locale is constrained to vi/en by CHECK. */
    public boolean setTranslation(UUID policyId, UUID partnerId, String locale, String summary,
                                  String body, AuthorizationScope scope) {
        if (findById(policyId, partnerId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO property_policy_translation (policy_id, locale, summary, body)
                        VALUES (:id, :locale, :summary, :body)
                        ON CONFLICT (policy_id, locale) DO UPDATE SET
                            summary = coalesce(EXCLUDED.summary, property_policy_translation.summary),
                            body    = coalesce(EXCLUDED.body, property_policy_translation.body)
                        """)
                .param("id", policyId)
                .param("locale", locale)
                .param("summary", summary)
                .param("body", body)
                .update();
        return true;
    }

    /**
     * Locale to body text, for the admin view and the publish gate. Empty when
     * the policy is not the caller's — the same answer as a policy with no text.
     *
     * <p>One statement: the scope predicate is joined in rather than checked by
     * a {@link #findById} first, so rendering a list costs one query per policy,
     * not two.
     */
    public Map<String, String> findTranslations(UUID policyId, UUID partnerId,
                                                AuthorizationScope scope) {
        ScopeFilter filter = visibleTo(scope);

        List<Object> params = new ArrayList<>();
        params.add(policyId);
        params.add(partnerId);
        params.addAll(filter.parameters());

        Map<String, String> byLocale = new java.util.LinkedHashMap<>();
        jdbc.sql("SELECT t.locale, t.body FROM property_policy_translation t"
                        + " JOIN property_policy pp ON pp.id = t.policy_id"
                        + " LEFT JOIN property p ON p.id = pp.property_id"
                        + " WHERE t.policy_id = ? AND pp.partner_id = ? AND " + filter.sql())
                .params(params)
                .query((rs, rowNum) -> Map.entry(rs.getString("locale").trim(),
                        rs.getString("body") == null ? "" : rs.getString("body")))
                .list()
                .forEach(entry -> byLocale.put(entry.getKey(), entry.getValue()));
        return byLocale;
    }

    /** How many of the two frozen locales carry non-blank body text. */
    public int bodyLocaleCount(UUID policyId, UUID partnerId, AuthorizationScope scope) {
        if (findById(policyId, partnerId, scope).isEmpty()) {
            return 0;
        }
        return jdbc.sql("""
                        SELECT count(*) FROM property_policy_translation
                         WHERE policy_id = :id AND locale IN ('en','vi')
                           AND body IS NOT NULL AND length(btrim(body)) > 0
                        """)
                .param("id", policyId)
                .query(Integer.class)
                .single();
    }

    /**
     * Which policy rows the scope reaches, over {@code pp} and {@code p}: a
     * property's override through {@link ScopeFilter}, a shared row through
     * {@link #partnerReach}.
     */
    private static ScopeFilter visibleTo(AuthorizationScope scope) {
        ScopeFilter shared = partnerReach(scope, "pp.partner_id");
        ScopeFilter property = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(shared.parameters());
        params.addAll(property.parameters());
        return new ScopeFilter(
                "((pp.property_id IS NULL AND " + shared.sql() + ")"
                        + " OR (pp.property_id IS NOT NULL AND " + property.sql() + "))",
                params);
    }

    /**
     * Whether the scope reaches the whole partner in {@code partnerIdColumn} —
     * {@code PartnerRepository.reaches}, as SQL. Never wider than
     * {@link ScopeFilter}: only GLOBAL is unrestricted.
     */
    private static ScopeFilter partnerReach(AuthorizationScope scope, String partnerIdColumn) {
        return switch (scope.kind()) {
            case GLOBAL -> new ScopeFilter("TRUE", List.of());
            case PARTNER -> new ScopeFilter(partnerIdColumn + " = ?", List.of(scope.partnerId()));
            // Some of the portfolio is not the portfolio; a customer reaches none of it.
            case PROPERTY, OWN -> new ScopeFilter("FALSE", List.of());
        };
    }

    private static PropertyPolicy map(ResultSet rs, int rowNum) throws SQLException {
        return new PropertyPolicy(
                rs.getObject("id", UUID.class),
                rs.getObject("partner_id", UUID.class),
                rs.getObject("property_id", UUID.class),
                PolicyType.valueOf(rs.getString("policy_type")),
                rs.getInt("version"),
                rs.getDate("effective_from").toLocalDate(),
                PolicyStatus.valueOf(rs.getString("status")));
    }
}
