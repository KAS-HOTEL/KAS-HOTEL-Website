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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * {@code property_landmark} and {@code property_landmark_translation}, both since
 * V3.
 *
 * <p>Every read and write joins {@code property} and applies the same
 * {@link ScopeFilter} the room-type and facility repositories use, so a landmark
 * is reachable exactly when its property is. The predicate sits in the same
 * statement as the identity, which is what makes a cross-partner id answer "no
 * rows" rather than leaking that it exists.
 *
 * <p>No version column, so no optimistic locking — the same reasoning as
 * {@link FacilityRepository}. No {@code archived_at} either, so
 * {@link #delete} really deletes: a landmark is a fact about the neighbourhood,
 * not a record of what a guest was shown.
 */
@Repository
public class LandmarkRepository implements ScopedRepository {

    private static final String COLUMNS =
            "l.id, l.property_id, l.landmark_type, l.distance_metres, "
                    + "l.walking_minutes, l.sort_order";

    private final JdbcClient jdbc;

    public LandmarkRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates a landmark on a property the caller can reach.
     *
     * <p>Returns empty when the property is absent or out of scope — the insert
     * selects from {@code property} under the scope predicate, so an unreachable
     * property inserts nothing rather than being rejected after the fact.
     */
    public Optional<UUID> create(UUID propertyId, String type, Integer distanceMetres,
                                 Integer walkingMinutes, int sortOrder,
                                 AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        // SQL-text order: the four value columns, the property predicate, then
        // the scope predicate's own parameters.
        List<Object> params = new ArrayList<>();
        params.add(type);
        params.add(distanceMetres);
        params.add(walkingMinutes);
        params.add(sortOrder);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO property_landmark (property_id, landmark_type,
                                                       distance_metres, walking_minutes, sort_order)
                        SELECT p.id, ?, ?, ?, ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /** A property's landmarks, in the operator's order. */
    public List<Landmark> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_landmark l "
                        + "JOIN property p ON p.id = l.property_id "
                        + "WHERE l.property_id = ? AND " + filter.sql()
                        + " ORDER BY l.sort_order, l.id")
                .params(params)
                .query(LandmarkRepository::map)
                .list();
    }

    public Optional<Landmark> findById(UUID landmarkId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(landmarkId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property_landmark l "
                        + "JOIN property p ON p.id = l.property_id "
                        + "WHERE l.id = ? AND " + filter.sql())
                .params(params)
                .query(LandmarkRepository::map)
                .optional();
    }

    public boolean update(UUID landmarkId, String type, Integer distanceMetres,
                          Integer walkingMinutes, int sortOrder, AuthorizationScope scope) {
        if (findById(landmarkId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE property_landmark
                           SET landmark_type = :type,
                               distance_metres = :distance,
                               walking_minutes = :walking,
                               sort_order = :sort
                         WHERE id = :id
                        """)
                .param("type", type)
                .param("distance", distanceMetres)
                .param("walking", walkingMinutes)
                .param("sort", sortOrder)
                .param("id", landmarkId)
                .update() > 0;
    }

    /**
     * Removes a landmark and, by {@code ON DELETE CASCADE}, its translations.
     *
     * <p>A real delete, because the table has no {@code archived_at}: a landmark
     * is a claim about the neighbourhood, and a wrong claim should stop being
     * made rather than being kept as history.
     */
    public boolean delete(UUID landmarkId, AuthorizationScope scope) {
        if (findById(landmarkId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("DELETE FROM property_landmark WHERE id = :id")
                .param("id", landmarkId)
                .update();
        return true;
    }

    /**
     * Writes one locale's text.
     *
     * <p>{@code name} is {@code NOT NULL} and the description is optional, so an
     * update that omits the description keeps the stored one rather than clearing
     * it — the same {@code coalesce} the room-type and facility writers use.
     */
    public boolean setTranslation(UUID landmarkId, String locale, String name, String description,
                                  AuthorizationScope scope) {
        if (findById(landmarkId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO property_landmark_translation (landmark_id, locale, name, description)
                        VALUES (:id, :locale, :name, :description)
                        ON CONFLICT (landmark_id, locale) DO UPDATE SET
                            name = EXCLUDED.name,
                            description = coalesce(EXCLUDED.description,
                                                   property_landmark_translation.description)
                        """)
                .param("id", landmarkId)
                .param("locale", locale)
                .param("name", name)
                .param("description", description)
                .update();
        return true;
    }

    /** Every locale's text for several landmarks, keyed by landmark then locale. */
    public Map<UUID, Map<String, LandmarkTranslation>> findTranslations(
            Collection<UUID> landmarkIds, AuthorizationScope scope) {

        if (landmarkIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(landmarkIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", java.util.Collections.nCopies(landmarkIds.size(), "?"));

        Map<UUID, Map<String, LandmarkTranslation>> byLandmark = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.landmark_id, t.locale, t.name, t.description
                          FROM property_landmark_translation t
                          JOIN property_landmark l ON l.id = t.landmark_id
                          JOIN property p ON p.id = l.property_id
                         WHERE t.landmark_id IN (%s) AND %s
                         ORDER BY t.landmark_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Row(
                        rs.getObject("landmark_id", UUID.class),
                        rs.getString("locale").trim(),
                        new LandmarkTranslation(rs.getString("name"), rs.getString("description"))))
                .list()
                .forEach(row -> byLandmark
                        .computeIfAbsent(row.landmarkId(), id -> new LinkedHashMap<>())
                        .put(row.locale(), row.translation()));

        return Map.copyOf(byLandmark);
    }

    /** One row of {@code property_landmark_translation}, before it is grouped. */
    private record Row(UUID landmarkId, String locale, LandmarkTranslation translation) {
    }

    private static Landmark map(ResultSet rs, int rowNum) throws SQLException {
        return new Landmark(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getString("landmark_type"),
                (Integer) rs.getObject("distance_metres"),
                (Integer) rs.getObject("walking_minutes"),
                rs.getInt("sort_order"));
    }
}
