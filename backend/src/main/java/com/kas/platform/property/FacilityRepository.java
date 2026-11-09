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
 * {@code facility} and {@code facility_translation}, both since V4.
 *
 * <p>Every read and write joins {@code property} and applies the same
 * {@link ScopeFilter} the room-type repository uses, so a facility is reachable
 * exactly when its property is. The predicate lives in the same statement as the
 * identity, which is what makes a cross-partner id answer "no rows" rather than
 * leaking that it exists.
 *
 * <p>There is <strong>no version column</strong> on {@code facility}, so there is
 * no optimistic-locking check here. That is the schema's decision, not an
 * omission: unlike {@code property} and {@code room_type}, a facility carries no
 * field two editors would race over silently — a name is either replaced or it is
 * not, and the loser of a race sees the winner's text on the next read.
 */
@Repository
public class FacilityRepository implements ScopedRepository {

    private static final String COLUMNS =
            "f.id, f.property_id, f.facility_type, f.open_to_non_residents, "
                    + "f.sort_order, f.archived_at";

    private final JdbcClient jdbc;

    public FacilityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates a facility on a property the caller can reach.
     *
     * <p>Returns empty when the property is absent or out of scope — the insert
     * selects from {@code property} under the scope predicate, so an unreachable
     * property inserts nothing rather than being rejected after the fact.
     */
    public Optional<UUID> create(UUID propertyId, FacilityType type, Boolean openToNonResidents,
                                 int sortOrder, UUID actorId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        // Built in SQL-text order: the four value columns, the actor twice
        // (created_by and updated_by are the same on insert), the property
        // predicate, then the scope predicate's own parameters.
        List<Object> params = new ArrayList<>();
        params.add(type.name());
        params.add(openToNonResidents);
        params.add(sortOrder);
        params.add(actorId);
        params.add(actorId);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO facility (property_id, facility_type, open_to_non_residents,
                                              sort_order, created_by, updated_by)
                        SELECT p.id, CAST(? AS facility_type), ?, ?, ?, ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class)
                .optional();
    }

    /** A property's facilities, archived ones included, in the operator's order. */
    public List<Facility> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM facility f "
                        + "JOIN property p ON p.id = f.property_id "
                        + "WHERE f.property_id = ? AND " + filter.sql()
                        + " ORDER BY f.sort_order, f.id")
                .params(params)
                .query(FacilityRepository::map)
                .list();
    }

    public Optional<Facility> findById(UUID facilityId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(facilityId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM facility f "
                        + "JOIN property p ON p.id = f.property_id "
                        + "WHERE f.id = ? AND " + filter.sql())
                .params(params)
                .query(FacilityRepository::map)
                .optional();
    }

    /** Updates the structural fields. The type is not among them — see the service. */
    public boolean update(UUID facilityId, Boolean openToNonResidents, int sortOrder,
                          UUID actorId, AuthorizationScope scope) {
        if (findById(facilityId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE facility
                           SET open_to_non_residents = :open,
                               sort_order = :sort,
                               updated_by = :actor,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("open", openToNonResidents)
                .param("sort", sortOrder)
                .param("actor", actorId)
                .param("id", facilityId)
                .update() > 0;
    }

    /**
     * Archives a facility, which is how it leaves the guest page.
     *
     * <p>Idempotent: archiving an already-archived facility is not an error, so a
     * repeated request from a retried click cannot become a refusal a Partner has
     * to interpret.
     */
    public boolean archive(UUID facilityId, UUID actorId, AuthorizationScope scope) {
        if (findById(facilityId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        UPDATE facility
                           SET archived_at = coalesce(archived_at, now()),
                               updated_by = :actor,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("actor", actorId)
                .param("id", facilityId)
                .update();
        return true;
    }

    /**
     * Writes one locale's text.
     *
     * <p>{@code name} is {@code NOT NULL} in the schema and the description is
     * optional, so an update that omits the description keeps the stored one
     * rather than clearing it — the same {@code coalesce} the room-type
     * translation writer uses, and for the same reason.
     */
    public boolean setTranslation(UUID facilityId, String locale, String name, String description,
                                  AuthorizationScope scope) {
        if (findById(facilityId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO facility_translation (facility_id, locale, name, description)
                        VALUES (:id, :locale, :name, :description)
                        ON CONFLICT (facility_id, locale) DO UPDATE SET
                            name = EXCLUDED.name,
                            description = coalesce(EXCLUDED.description,
                                                   facility_translation.description)
                        """)
                .param("id", facilityId)
                .param("locale", locale)
                .param("name", name)
                .param("description", description)
                .update();
        return true;
    }

    /** Every locale's text for several facilities, keyed by facility then locale. */
    public Map<UUID, Map<String, FacilityTranslation>> findTranslations(
            Collection<UUID> facilityIds, AuthorizationScope scope) {

        if (facilityIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(facilityIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", java.util.Collections.nCopies(facilityIds.size(), "?"));

        Map<UUID, Map<String, FacilityTranslation>> byFacility = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.facility_id, t.locale, t.name, t.description
                          FROM facility_translation t
                          JOIN facility f ON f.id = t.facility_id
                          JOIN property p ON p.id = f.property_id
                         WHERE t.facility_id IN (%s) AND %s
                         ORDER BY t.facility_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Row(
                        rs.getObject("facility_id", UUID.class),
                        rs.getString("locale").trim(),
                        new FacilityTranslation(rs.getString("name"), rs.getString("description"))))
                .list()
                .forEach(row -> byFacility
                        .computeIfAbsent(row.facilityId(), id -> new LinkedHashMap<>())
                        .put(row.locale(), row.translation()));

        return Map.copyOf(byFacility);
    }

    /** One row of {@code facility_translation}, before it is grouped. */
    private record Row(UUID facilityId, String locale, FacilityTranslation translation) {
    }

    private static Facility map(ResultSet rs, int rowNum) throws SQLException {
        return new Facility(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                FacilityType.valueOf(rs.getString("facility_type")),
                (Boolean) rs.getObject("open_to_non_residents"),
                rs.getInt("sort_order"),
                rs.getObject("archived_at", java.sql.Timestamp.class) == null
                        ? null
                        : rs.getObject("archived_at", java.sql.Timestamp.class).toInstant());
    }
}
