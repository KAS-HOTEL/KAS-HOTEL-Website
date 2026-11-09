package com.kas.platform.property;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * {@code property_experience} and {@code property_experience_translation}, both
 * since V3 and both empty until this repository was written.
 *
 * <p>Every read and write joins {@code property} and applies the same
 * {@link ScopeFilter} the landmark and facility repositories use, so an
 * experience is reachable exactly when its property is. The predicate sits in the
 * same statement as the identity, which is what makes a cross-partner id answer
 * "no rows" instead of leaking that it exists.
 *
 * <p>No version column, so no optimistic locking. No {@code archived_at} either,
 * so {@link #delete} really deletes — the same reasoning as
 * {@link LandmarkRepository}.
 *
 * <p><strong>{@code time_of_day} appears in no statement here.</strong> The
 * column is left exactly as V3 created it: nullable, unconstrained, and never
 * written. Step 16A.47's owner decision omits it from V1 rather than inventing
 * the vocabulary doc 23 §5 never supplies, and not naming it in the SQL is what
 * makes that decision structural rather than merely documented.
 */
@Repository
public class ExperienceRepository implements ScopedRepository {

    private static final String COLUMNS = "e.id, e.property_id, e.sort_order";

    private final JdbcClient jdbc;

    public ExperienceRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates an experience on a property the caller can reach.
     *
     * <p>Returns empty when the property is absent or out of scope — the insert
     * selects from {@code property} under the scope predicate, so an unreachable
     * property inserts nothing rather than being rejected after the fact.
     */
    public Optional<UUID> create(UUID propertyId, int sortOrder, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(sortOrder);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO property_experience (property_id, sort_order)
                        SELECT p.id, ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /** A property's experiences, in the operator's order. */
    public List<Experience> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_experience e "
                        + "JOIN property p ON p.id = e.property_id "
                        + "WHERE e.property_id = ? AND " + filter.sql()
                        + " ORDER BY e.sort_order, e.id")
                .params(params)
                .query(ExperienceRepository::map)
                .list();
    }

    public Optional<Experience> findById(UUID experienceId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(experienceId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_experience e "
                        + "JOIN property p ON p.id = e.property_id "
                        + "WHERE e.id = ? AND " + filter.sql())
                .params(params)
                .query(ExperienceRepository::map)
                .optional();
    }

    /**
     * Reorders one experience.
     *
     * <p>{@code sort_order} is the only column on the base row this contract can
     * write — {@code time_of_day} is out of scope for V1 and the timestamps are
     * the database's. {@code updated_at} is set here because nothing else would:
     * a reorder that left it stale would misreport when the content last moved.
     */
    public boolean update(UUID experienceId, int sortOrder, AuthorizationScope scope) {
        if (findById(experienceId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE property_experience
                           SET sort_order = :sort,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("sort", sortOrder)
                .param("id", experienceId)
                .update() > 0;
    }

    /**
     * Removes an experience and, by {@code ON DELETE CASCADE}, its translations.
     *
     * <p>A real delete, because the table has no {@code archived_at} — the same
     * answer the schema gives for landmarks.
     *
     * <p><strong>This can un-publish nothing and gate everything.</strong>
     * Removing a property's last experience does not touch its lifecycle, but it
     * does make the property fail the completeness check the next time it is
     * submitted. That asymmetry is the existing gate's, not this method's, and it
     * is deliberately left alone.
     */
    public boolean delete(UUID experienceId, AuthorizationScope scope) {
        if (findById(experienceId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("DELETE FROM property_experience WHERE id = :id")
                .param("id", experienceId)
                .update();
        return true;
    }

    /**
     * Writes one locale's text.
     *
     * <p>{@code title} is {@code NOT NULL} and the description is optional, so an
     * update that omits the description keeps the stored one rather than clearing
     * it — the same {@code coalesce} the landmark and facility writers use.
     */
    public boolean setTranslation(UUID experienceId, String locale, String title,
                                  String description, AuthorizationScope scope) {
        if (findById(experienceId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO property_experience_translation
                                    (experience_id, locale, title, description)
                        VALUES (:id, :locale, :title, :description)
                        ON CONFLICT (experience_id, locale) DO UPDATE SET
                            title = EXCLUDED.title,
                            description = coalesce(EXCLUDED.description,
                                                   property_experience_translation.description)
                        """)
                .param("id", experienceId)
                .param("locale", locale)
                .param("title", title)
                .param("description", description)
                .update();
        return true;
    }

    /** Every locale's text for several experiences, keyed by experience then locale. */
    public Map<UUID, Map<String, ExperienceTranslation>> findTranslations(
            Collection<UUID> experienceIds, AuthorizationScope scope) {

        if (experienceIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(experienceIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", Collections.nCopies(experienceIds.size(), "?"));

        Map<UUID, Map<String, ExperienceTranslation>> byExperience = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.experience_id, t.locale, t.title, t.description
                          FROM property_experience_translation t
                          JOIN property_experience e ON e.id = t.experience_id
                          JOIN property p ON p.id = e.property_id
                         WHERE t.experience_id IN (%s) AND %s
                         ORDER BY t.experience_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Row(
                        rs.getObject("experience_id", UUID.class),
                        rs.getString("locale").trim(),
                        new ExperienceTranslation(rs.getString("title"), rs.getString("description"))))
                .list()
                .forEach(row -> byExperience
                        .computeIfAbsent(row.experienceId(), id -> new LinkedHashMap<>())
                        .put(row.locale(), row.translation()));

        return Map.copyOf(byExperience);
    }

    /** One row of {@code property_experience_translation}, before it is grouped. */
    private record Row(UUID experienceId, String locale, ExperienceTranslation translation) {
    }

    private static Experience map(ResultSet rs, int rowNum) throws SQLException {
        return new Experience(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getInt("sort_order"));
    }
}
