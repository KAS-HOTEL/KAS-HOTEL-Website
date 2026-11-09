package com.kas.platform.property;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
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
 * Room types, always within the caller's scope.
 *
 * <p>A room type is scoped through its property: {@code room_type → property →
 * partner}. Every statement therefore joins {@code property} and applies the
 * shared {@link ScopeFilter} there — doc 85 §4.5, "no transactional table gains
 * {@code partner_id}", partner is derived through the join.
 *
 * <p>Note that the writes carry the scope predicate too. A create is an
 * {@code INSERT … SELECT … WHERE <scope>}: if the property is out of scope the
 * select yields nothing and no row is written, so a Partner cannot add a room to
 * another Partner's hotel by supplying its id.
 */
@Repository
public class RoomTypeRepository implements ScopedRepository {

    private static final String COLUMNS = """
            rt.id, rt.property_id, rt.slug, rt.status, rt.area_sqm, rt.max_adults,
            rt.max_children, rt.max_occupancy, rt.view_type, rt.smoking, rt.sort_order,
            rt.version
            """;

    private final JdbcClient jdbc;

    public RoomTypeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates a room type under {@code propertyId}.
     *
     * @return the new id, or empty when the property is not in scope — which the
     *         caller maps to 404, indistinguishable from "no such property"
     */
    public Optional<UUID> create(UUID propertyId, String slug, int maxAdults, int maxChildren,
                                 int maxOccupancy, BigDecimal areaSqm, String viewType,
                                 boolean smoking, int sortOrder, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(slug);
        params.add(maxAdults);
        params.add(maxChildren);
        params.add(maxOccupancy);
        params.add(areaSqm);
        params.add(viewType);
        params.add(smoking);
        params.add(sortOrder);
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO room_type (property_id, slug, max_adults, max_children,
                                               max_occupancy, area_sqm, view_type, smoking, sort_order)
                        SELECT p.id, ?, ?, ?, ?, ?, CAST(? AS view_type), ?, ?
                          FROM property p
                         WHERE p.id = ? AND %s
                        RETURNING id
                        """.formatted(filter.sql()))
                // params are built in SQL-text order: the eight value columns,
                // then the property predicate, then the scope predicate's own.
                .params(params)
                .query(UUID.class)
                .optional();
    }

    public List<RoomType> findByProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM room_type rt "
                        + "JOIN property p ON p.id = rt.property_id "
                        + "WHERE rt.property_id = ? AND " + filter.sql()
                        + " ORDER BY rt.sort_order, rt.slug")
                .params(params)
                .query(RoomTypeRepository::map)
                .list();
    }

    public Optional<RoomType> findById(UUID roomTypeId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM room_type rt "
                        + "JOIN property p ON p.id = rt.property_id "
                        + "WHERE rt.id = ? AND " + filter.sql())
                .params(params)
                .query(RoomTypeRepository::map)
                .optional();
    }

    /**
     * The room type's base nightly rate, if one has been supplied.
     *
     * <p>Kept off {@link RoomType} deliberately. Phase 7.5B modelled the room
     * type as a content and occupancy entity; price is commercial data consumed
     * by {@code pricing}, and folding a nullable price into the record every
     * caller reads would invite {@code basePriceMinor()} being treated as
     * present. An {@link Optional} at the point of use cannot be.
     */
    public Optional<BasePrice> findBasePrice(UUID roomTypeId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT rt.base_price_minor, rt.currency
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE rt.id = ? AND rt.base_price_minor IS NOT NULL AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new BasePrice(
                        rs.getLong("base_price_minor"), rs.getString("currency").trim()))
                .optional();
    }

    /** Partner-authored display name — free text, doc 52 §3.2 and brief §10.1. */
    public boolean setName(UUID roomTypeId, String locale, String name, AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO room_type_translation (room_type_id, locale, name)
                        VALUES (:id, :locale, :name)
                        ON CONFLICT (room_type_id, locale) DO UPDATE SET name = EXCLUDED.name
                        """)
                .param("id", roomTypeId)
                .param("locale", locale)
                .param("name", name)
                .update();
        return true;
    }

    /** Replaces the room's amenity assignment with {@code amenityIds}. */
    public boolean replaceAmenities(UUID roomTypeId, Collection<UUID> amenityIds,
                                    AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("DELETE FROM room_type_amenity WHERE room_type_id = :id")
                .param("id", roomTypeId)
                .update();

        int order = 0;
        for (UUID amenityId : amenityIds) {
            jdbc.sql("INSERT INTO room_type_amenity (room_type_id, amenity_id, sort_order) "
                            + "VALUES (:rt, :a, :o) ON CONFLICT DO NOTHING")
                    .param("rt", roomTypeId)
                    .param("a", amenityId)
                    .param("o", order++)
                    .update();
        }
        return true;
    }

    /**
     * Updates a room type's attributes, guarded by its {@code version}.
     *
     * <p>Optimistic locking uses the column the frozen schema already provides —
     * no migration, and doc 58 §2 already specifies {@code If-Match} / version
     * with 409 on conflict as the convention for MASTER updates.
     *
     * @return false when the room type is out of scope, absent, <em>or</em> the
     *         version has moved on. The caller distinguishes the last case by
     *         re-reading, so a lost update surfaces as a conflict rather than
     *         silently overwriting a concurrent edit.
     */
    public boolean update(UUID roomTypeId, int expectedVersion, BigDecimal areaSqm,
                          int maxAdults, int maxChildren, int maxOccupancy, String viewType,
                          boolean smoking, int sortOrder, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(areaSqm);
        params.add(maxAdults);
        params.add(maxChildren);
        params.add(maxOccupancy);
        params.add(viewType);
        params.add(smoking);
        params.add(sortOrder);
        params.add(roomTypeId);
        params.add(expectedVersion);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type rt
                           SET area_sqm = ?, max_adults = ?, max_children = ?, max_occupancy = ?,
                               view_type = CAST(? AS view_type), smoking = ?, sort_order = ?,
                               version = rt.version + 1, updated_at = now()
                          FROM property p
                         WHERE p.id = rt.property_id AND rt.id = ? AND rt.version = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** Moves a room type's lifecycle. The transition itself is validated by the caller. */
    /**
     * Sets one room type's display position. Bumps {@code version} like any other
     * change to the row, so an editor holding the old version is told to reload.
     */
    public boolean updateSortOrder(UUID roomTypeId, int sortOrder, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(sortOrder);
        params.add(roomTypeId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        UPDATE room_type rt
                           SET sort_order = ?, version = rt.version + 1, updated_at = now()
                          FROM property p
                         WHERE p.id = rt.property_id AND rt.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    public boolean updateStatus(UUID roomTypeId, RoomTypeStatus status, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(status.name());
        params.add(roomTypeId);
        params.addAll(filter.parameters());

        // The status appears twice in the SQL — once in the SET, once in the
        // archived_at CASE — so it is bound twice, in text order.
        params.add(0, status.name());

        return jdbc.sql("""
                        UPDATE room_type rt
                           SET status = CAST(? AS room_type_status),
                               archived_at = CASE WHEN ? = 'ARCHIVED' THEN now()
                                                  ELSE rt.archived_at END,
                               version = rt.version + 1, updated_at = now()
                          FROM property p
                         WHERE p.id = rt.property_id AND rt.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** Replaces the room type's bed configurations. */
    public boolean replaceBedConfigurations(UUID roomTypeId, List<BedConfiguration> beds,
                                            AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("DELETE FROM room_type_bed_config WHERE room_type_id = :id")
                .param("id", roomTypeId)
                .update();

        int order = 0;
        for (BedConfiguration bed : beds) {
            jdbc.sql("""
                            INSERT INTO room_type_bed_config
                                (room_type_id, bed_type, bed_count, is_default, sort_order)
                            VALUES (:rt, :type, :count, :isDefault, :order)
                            """)
                    .param("rt", roomTypeId)
                    .param("type", bed.bedType())
                    .param("count", bed.bedCount())
                    .param("isDefault", bed.isDefault())
                    .param("order", order++)
                    .update();
        }
        return true;
    }

    public List<BedConfiguration> findBedConfigurations(UUID roomTypeId, AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                        SELECT bed_type, bed_count, is_default, sort_order
                          FROM room_type_bed_config
                         WHERE room_type_id = :id
                         ORDER BY sort_order
                        """)
                .param("id", roomTypeId)
                .query((rs, rowNum) -> new BedConfiguration(
                        rs.getString("bed_type"),
                        rs.getInt("bed_count"),
                        rs.getBoolean("is_default"),
                        rs.getInt("sort_order")))
                .list();
    }

    /** The room type's assigned amenity codes. */
    public List<String> findAmenityCodes(UUID roomTypeId, AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                        SELECT a.code FROM room_type_amenity rta
                          JOIN amenity a ON a.id = rta.amenity_id
                         WHERE rta.room_type_id = :id
                         ORDER BY rta.sort_order
                        """)
                .param("id", roomTypeId)
                .query(String.class)
                .list();
    }

    /**
     * Partner-authored content for several room types at once, keyed by room
     * type then locale.
     *
     * <p>Batched deliberately. The list endpoint renders every room type of a
     * property, and a per-room lookup for something as basic as the name would
     * add one query per row to a handler that already makes several.
     *
     * <p>Scoped like every other read here: the join to {@code property} carries
     * the caller's scope, so an id from another partner contributes nothing even
     * if it reaches this method from somewhere that did not check.
     *
     * @return one entry per room type that has at least one translation; a room
     *         type with none is absent rather than present-and-empty
     */
    public Map<UUID, Map<String, RoomTypeTranslation>> findTranslations(
            Collection<UUID> roomTypeIds, AuthorizationScope scope) {

        if (roomTypeIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(roomTypeIds);
        params.addAll(filter.parameters());
        String placeholders =
                String.join(", ", java.util.Collections.nCopies(roomTypeIds.size(), "?"));

        Map<UUID, Map<String, RoomTypeTranslation>> byRoomType = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.room_type_id, t.locale, t.name, t.short_description
                          FROM room_type_translation t
                          JOIN room_type rt ON rt.id = t.room_type_id
                          JOIN property p ON p.id = rt.property_id
                         WHERE t.room_type_id IN (%s) AND %s
                         ORDER BY t.room_type_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Object[] {
                        rs.getObject("room_type_id", UUID.class),
                        rs.getString("locale").trim(),
                        new RoomTypeTranslation(rs.getString("name"),
                                rs.getString("short_description"))})
                .list()
                .forEach(row -> byRoomType
                        .computeIfAbsent((UUID) row[0], id -> new LinkedHashMap<>())
                        .put((String) row[1], (RoomTypeTranslation) row[2]));

        return Map.copyOf(byRoomType);
    }

    /**
     * The base rate of many room types at once — doc 56 §3's Layer 0.
     *
     * <p>The batched twin of {@link #findBasePrice}, for the rate console, which needs every room
     * type's fallback price on one screen. Same predicate: a room type with no base rate is
     * <strong>absent</strong> from the map rather than present with a zero, because
     * {@code base_price_minor} is nullable and doc 56 §9 keeps base rates (config B6) OPEN. Zero is
     * a price a Partner may deliberately set; absent is a price nobody has set yet, and the two must
     * never collapse into each other.
     */
    public Map<UUID, BasePrice> findBaseRates(Collection<UUID> roomTypeIds,
                                              AuthorizationScope scope) {
        if (roomTypeIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(roomTypeIds);
        params.addAll(filter.parameters());
        String placeholders =
                String.join(", ", java.util.Collections.nCopies(roomTypeIds.size(), "?"));

        Map<UUID, BasePrice> byRoomType = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT rt.id, rt.base_price_minor, rt.currency
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE rt.id IN (%s) AND rt.base_price_minor IS NOT NULL AND %s
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Object[] {
                        rs.getObject("id", UUID.class),
                        new BasePrice(rs.getLong("base_price_minor"),
                                rs.getString("currency").trim())})
                .list()
                .forEach(row -> byRoomType.put((UUID) row[0], (BasePrice) row[1]));

        return Map.copyOf(byRoomType);
    }

    /**
     * Sets — or clears — a room type's base rate. Doc 56 §7 "Set base rate", per room type.
     *
     * <p>{@code amountMinor} is minor units of VND, which is zero-decimal (doc 56 §6). A
     * {@code null} <strong>clears</strong> the rate, which is a real operation: it returns the room
     * type to "no price at all" rather than pricing it at zero.
     *
     * <p>The currency column is deliberately not written. VND is the only transactional currency
     * (doc 56 §6) and the column already defaults to it; a settable currency would imply a second
     * one exists.
     *
     * <p>Compare-and-set on {@code version}, the same concurrency model
     * {@link #update} already uses for this table — doc 58 §2's {@code version} on MASTER updates.
     * Rates carry no version of their own and none is invented here; this row does have one.
     *
     * @return false when the room type is out of scope, absent, <em>or</em> the version has moved
     *         on. The caller distinguishes the last case by re-reading, so a lost update surfaces as
     *         a conflict rather than silently overwriting someone else's price.
     */
    public boolean updateBasePrice(UUID roomTypeId, Long amountMinor, int expectedVersion,
                                   AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(amountMinor);
        params.add(roomTypeId);
        params.add(expectedVersion);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type rt
                           SET base_price_minor = CAST(? AS bigint),
                               version = rt.version + 1, updated_at = now()
                          FROM property p
                         WHERE p.id = rt.property_id AND rt.id = ? AND rt.version = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** Localised name and descriptions. Locale is constrained to vi/en by CHECK. */
    public boolean setTranslation(UUID roomTypeId, String locale, String name,
                                  String shortDescription, String longDescription,
                                  AuthorizationScope scope) {
        if (findById(roomTypeId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO room_type_translation
                            (room_type_id, locale, name, short_description, long_description)
                        VALUES (:id, :locale, :name, :shortDescription, :longDescription)
                        ON CONFLICT (room_type_id, locale) DO UPDATE SET
                            name = EXCLUDED.name,
                            short_description = coalesce(EXCLUDED.short_description,
                                                         room_type_translation.short_description),
                            long_description  = coalesce(EXCLUDED.long_description,
                                                         room_type_translation.long_description)
                        """)
                .param("id", roomTypeId)
                .param("locale", locale)
                .param("name", name)
                .param("shortDescription", shortDescription)
                .param("longDescription", longDescription)
                .update();
        return true;
    }

/**
     * How many of a property's room types are actually published.
     *
     * <p>Doc 52 §3.1 makes <em>"≥1 <strong>published</strong> room type"</em> a
     * publish invariant, and {@code PublishedRateRepository} and
     * {@code PublishedAvailabilityRepository} both require
     * {@code rt.status = 'PUBLISHED'} before they will quote anything — so a
     * property with only {@code DRAFT} rooms is one nothing can sell.
     *
     * <p>Archived rooms are excluded for the same reason the completeness check
     * excludes them: a withdrawn room is not an offer.
     */
    public int countPublished(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        Integer count = jdbc.sql("""
                        SELECT count(*)
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE rt.property_id = ? AND rt.status = 'PUBLISHED'
                           AND rt.archived_at IS NULL AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query(Integer.class)
                .single();
        return count == null ? 0 : count;
    }

    /** Publishes every room type of a property. Used when a submission is approved. */
    public int publishAllForProperty(UUID propertyId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type rt SET status = 'PUBLISHED', updated_at = now()
                          FROM property p
                         WHERE p.id = rt.property_id AND rt.property_id = ? AND %s
                           AND rt.status = 'DRAFT'
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    private static RoomType map(ResultSet rs, int rowNum) throws SQLException {
        return new RoomType(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getString("slug"),
                RoomTypeStatus.valueOf(rs.getString("status")),
                rs.getBigDecimal("area_sqm"),
                rs.getInt("max_adults"),
                rs.getInt("max_children"),
                rs.getInt("max_occupancy"),
                rs.getString("view_type"),
                rs.getBoolean("smoking"),
                rs.getInt("sort_order"),
                rs.getInt("version"));
    }
}
