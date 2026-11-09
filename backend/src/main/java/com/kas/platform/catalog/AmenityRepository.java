package com.kas.platform.catalog;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Reads the amenity catalog.
 *
 * <p>Takes no {@link com.kas.platform.shared.scope.AuthorizationScope}, and that
 * is correct rather than an oversight: the catalog is global reference data
 * owned by no partner. It is also why this repository lives outside the
 * {@code property} module, where {@code ScopeEnforcementStructureTest} requires
 * every query to carry a scope.
 */
@Repository
public class AmenityRepository {

    private static final String COLUMNS = "id, code, category, icon, is_highlight, sort_order";

    private final JdbcClient jdbc;

    public AmenityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Catalog labels, keyed by amenity then locale.
     *
     * <p>{@code amenity_translation} exists in the schema and is currently empty,
     * so this returns nothing today. That is the honest answer: the catalog has
     * 56 codes and no approved Vietnamese or English labels yet, and inventing
     * them in a frontend lookup would freeze a vocabulary nobody has signed off.
     * When the owner seeds labels, every caller gets them with no code change.
     */
    public Map<UUID, Map<String, String>> findNames() {
        Map<UUID, Map<String, String>> byAmenity = new LinkedHashMap<>();
        jdbc.sql("SELECT amenity_id, locale, name FROM amenity_translation ORDER BY amenity_id, locale")
                .query((rs, rowNum) -> new Object[] {
                        rs.getObject("amenity_id", UUID.class),
                        rs.getString("locale").trim(),
                        rs.getString("name")})
                .list()
                .forEach(row -> byAmenity
                        .computeIfAbsent((UUID) row[0], id -> new LinkedHashMap<>())
                        .put((String) row[1], (String) row[2]));
        return Map.copyOf(byAmenity);
    }

    /** The selectable catalog. Archived entries are excluded. */
    public List<Amenity> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM amenity WHERE archived_at IS NULL "
                        + "ORDER BY category, sort_order, code")
                .query(AmenityRepository::map)
                .list();
    }

    /**
     * Resolves submitted codes to catalog ids.
     *
     * <p>Returns only codes that exist and are not archived. The caller compares
     * sizes to detect an invalid code — which is how an unknown amenity is
     * rejected rather than silently dropped.
     */
    public List<Amenity> findByCodes(Collection<String> codes) {
        if (codes.isEmpty()) {
            return List.of();
        }
        Set<String> distinct = Set.copyOf(codes);
        String placeholders = String.join(", ", java.util.Collections.nCopies(distinct.size(), "?"));

        return jdbc.sql("SELECT " + COLUMNS + " FROM amenity "
                        + "WHERE archived_at IS NULL AND code IN (" + placeholders + ")")
                .params(List.copyOf(distinct))
                .query(AmenityRepository::map)
                .list();
    }

    private static Amenity map(ResultSet rs, int rowNum) throws SQLException {
        return new Amenity(
                rs.getObject("id", UUID.class),
                rs.getString("code"),
                rs.getString("category"),
                rs.getString("icon"),
                rs.getBoolean("is_highlight"),
                rs.getInt("sort_order"));
    }
}
