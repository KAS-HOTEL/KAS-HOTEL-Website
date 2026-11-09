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
 * Reads properties, always within the caller's scope.
 *
 * <p>This class is the worked example of doc 85 §10 control 5:
 *
 * <blockquote>Authorisation cannot be bypassed by changing {@code property_id} —
 * the scope filter applies at the repository boundary <strong>before</strong>
 * the ID is used; mismatched ID → 404.</blockquote>
 *
 * <p>Note the shape of {@link #findById}: the scope predicate is {@code AND}ed
 * into the same statement as the identity predicate. The row is never fetched
 * and then checked, because a fetch-then-check can be skipped by a later caller.
 * Out of scope and non-existent are indistinguishable to the caller by
 * construction.
 *
 * <p>Every method takes an {@link AuthorizationScope}. There is no unscoped
 * overload, and {@code ScopeEnforcementStructureTest} asserts there never will
 * be one.
 */
@Repository
public class PropertyRepository implements ScopedRepository {

    private static final String COLUMNS = """
            p.id, p.partner_id, p.slug, p.lifecycle_state, p.is_flagship, p.collection,
            p.district, p.ward, p.city, p.phone, p.latitude, p.longitude,
            p.sort_order, p.version, p.published_at, p.created_at, p.updated_at
            """;

    private final JdbcClient jdbc;

    public PropertyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Empty when the property does not exist, or exists outside {@code scope}. */
    public Optional<Property> findById(UUID id, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(id);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " FROM property p WHERE p.id = ? AND " + filter.sql())
                .params(params)
                .query(PropertyRepository::map)
                .optional();
    }

    /** Every property the caller may reach, in the frozen display order. */
    public List<Property> findAll(AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        return jdbc.sql("SELECT " + COLUMNS + " FROM property p WHERE " + filter.sql()
                        + " ORDER BY p.sort_order, p.slug")
                .params(filter.parameters())
                .query(PropertyRepository::map)
                .list();
    }

    /** How many properties the caller reaches. Used by the readiness surface and by tests. */
    public long countInScope(AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        return jdbc.sql("SELECT count(*) FROM property p WHERE " + filter.sql())
                .params(filter.parameters())
                .query(Long.class)
                .single();
    }

    /**
     * Creates a property for {@code partnerId}.
     *
     * <p>The partner is checked against the caller's scope <em>before</em> the
     * insert, so a PARTNER-scoped Partner can only create hotels under their own
     * organisation. GLOBAL may create for any partner; PROPERTY and OWN may
     * create none — neither owns an organisation to create within.
     *
     * @return the new id, or empty when the caller may not create for that partner
     */
    public Optional<UUID> create(UUID partnerId, String slug, AuthorizationScope scope) {
        boolean permitted = switch (scope.kind()) {
            case GLOBAL -> true;
            case PARTNER -> scope.partnerId().equals(partnerId);
            case PROPERTY, OWN -> false;
        };
        if (!permitted) {
            return Optional.empty();
        }
        return jdbc.sql("""
                        INSERT INTO property (partner_id, slug, lifecycle_state, sort_order)
                        VALUES (:partnerId, :slug, 'DRAFT',
                                coalesce((SELECT max(sort_order) + 1 FROM property
                                           WHERE partner_id = :partnerId), 1))
                        RETURNING id
                        """)
                .param("partnerId", partnerId)
                .param("slug", slug)
                .query(UUID.class)
                .optional();
    }

    /** Partner-authored display name, per locale. */
    public boolean setName(UUID propertyId, String locale, String name, AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO property_translation (property_id, locale, name)
                        VALUES (:id, :locale, :name)
                        ON CONFLICT (property_id, locale) DO UPDATE SET name = EXCLUDED.name
                        """)
                .param("id", propertyId)
                .param("locale", locale)
                .param("name", name)
                .update();
        return true;
    }

    /**
     * Location and contact, applied only if the caller's copy is still current.
     *
     * <h2>Compare-and-set, not read-then-write</h2>
     *
     * <p>Doc 58 §2 requires {@code If-Match} / {@code version} on MASTER updates
     * with {@code 409} on conflict. The version predicate is in the same
     * statement as the identity predicate <em>and</em> the scope predicate, so
     * two partners editing the same hotel cannot interleave: PostgreSQL takes a
     * row lock for the duration of the {@code UPDATE}, the loser matches zero
     * rows, and the caller is told rather than silently overwriting.
     *
     * <p>A read-then-write would leave a window between the check and the write
     * in which the other edit lands — which is the bug this exists to prevent.
     *
     * <h2>Zero rows is ambiguous here, deliberately</h2>
     *
     * <p>It means "wrong version" <em>or</em> "not yours" <em>or</em> "gone", and
     * this method does not distinguish them. The caller establishes existence and
     * scope first (a 404, doc 85 §6.3) so that a zero here can only mean a stale
     * version. Collapsing them the other way would let a cross-partner PATCH with
     * a guessed version return {@code 409}, which discloses that the property
     * exists.
     *
     * <p>Any of {@code district}, {@code ward}, {@code city}, {@code phone},
     * {@code latitude}, {@code longitude} may be null; a null leaves the column
     * unchanged, which is what lets a Partner build a draft up over several
     * sessions. The version still advances, because the version belongs to the
     * property rather than to any one field.
     *
     * <p><strong>No field on this route can be cleared back to null</strong>, and
     * coordinates are no exception. The {@code coalesce} that makes an omitted
     * field keep its value also makes an explicit null indistinguishable from an
     * omission — that is the route's existing semantics since Step 16A.27, and
     * giving coordinates a private way out of it would be a second write path
     * wearing one method's name.
     *
     * @param expectedVersion the version the caller believes it is editing
     * @return false when nothing matched — stale version, out of scope, or absent
     */
    public boolean updateDetails(UUID propertyId, int expectedVersion, String district, String ward,
                                 String city, String phone, java.math.BigDecimal latitude,
                                 java.math.BigDecimal longitude, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(district);
        params.add(ward);
        params.add(city);
        params.add(phone);
        params.add(latitude);
        params.add(longitude);
        params.add(propertyId);
        params.add(expectedVersion);
        params.addAll(filter.parameters());

        // The casts are not decoration: a bare `?` bound to null gives the driver
        // no type to infer, and PostgreSQL refuses the statement rather than
        // guessing.
        return jdbc.sql("""
                        UPDATE property p
                           SET district = coalesce(CAST(? AS text), p.district),
                               ward     = coalesce(CAST(? AS text), p.ward),
                               city     = coalesce(CAST(? AS text), p.city),
                               phone    = coalesce(CAST(? AS text), p.phone),
                               latitude  = coalesce(CAST(? AS numeric(9,6)), p.latitude),
                               longitude = coalesce(CAST(? AS numeric(9,6)), p.longitude),
                               version  = p.version + 1,
                               updated_at = now()
                         WHERE p.id = ? AND p.version = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }


    /**
     * Moves the property's operating lifecycle.
     *
     * <p>Called by the onboarding service when a submission is approved. It is
     * separate from submission status by design (doc 92 §3.2): this column says
     * whether guests can see and book the hotel; the submission says whether an
     * editorial change was reviewed.
     */
    public boolean updateLifecycle(UUID propertyId, PropertyLifecycleState state,
                                   AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE property
                           SET lifecycle_state = CAST(:state AS property_lifecycle_state),
                               published_at = CASE WHEN :state = 'OPEN' AND published_at IS NULL
                                                  THEN now() ELSE published_at END,
                               version = version + 1,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("id", propertyId)
                .param("state", state.name())
                .update() > 0;
    }

    /**
     * The same lifecycle move, applied only if the caller's copy is current.
     *
     * <p>Doc 58 §2 puts {@code version} on every MASTER update, and publishing is
     * the most consequential one a property has: it is what makes the hotel
     * bookable. The version predicate sits in the same statement as the identity
     * and scope predicates, so a stale caller changes nothing rather than
     * publishing over an edit they never saw.
     *
     * @return false when the property is out of scope, absent, or the version is stale
     */
    public boolean updateLifecycle(UUID propertyId, PropertyLifecycleState state,
                                   int expectedVersion, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(state.name());
        params.add(state.name());
        params.add(propertyId);
        params.add(expectedVersion);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE property p
                           SET lifecycle_state = CAST(? AS property_lifecycle_state),
                               published_at = CASE WHEN ? = 'OPEN' AND p.published_at IS NULL
                                                  THEN now() ELSE p.published_at END,
                               version = p.version + 1,
                               updated_at = now()
                         WHERE p.id = ? AND p.version = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** Replaces the property's amenity assignment. */
    public boolean replaceAmenities(UUID propertyId, java.util.Collection<UUID> amenityIds,
                                    AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("DELETE FROM property_amenity WHERE property_id = :id")
                .param("id", propertyId)
                .update();

        int order = 0;
        for (UUID amenityId : amenityIds) {
            jdbc.sql("INSERT INTO property_amenity (property_id, amenity_id, sort_order) "
                            + "VALUES (:p, :a, :o) ON CONFLICT DO NOTHING")
                    .param("p", propertyId)
                    .param("a", amenityId)
                    .param("o", order++)
                    .update();
        }
        return true;
    }

    /** The property's assigned amenity codes, for completeness checks and review. */
    public List<String> findAmenityCodes(UUID propertyId, AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                        SELECT a.code FROM property_amenity pa
                          JOIN amenity a ON a.id = pa.amenity_id
                         WHERE pa.property_id = :id
                         ORDER BY pa.sort_order
                        """)
                .param("id", propertyId)
                .query(String.class)
                .list();
    }

    /** The display name in {@code locale}, if one has been set. */
    public Optional<String> findName(UUID propertyId, String locale, AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT name FROM property_translation "
                        + "WHERE property_id = :id AND locale = :locale")
                .param("id", propertyId)
                .param("locale", locale)
                .query(String.class)
                .optional();
    }

    /**
     * Display names for several properties at once, keyed by property then locale.
     *
     * <p>The name is what a Partner actually recognises a hotel by, and it is
     * per-locale, so it cannot travel on {@link Property} without the repository
     * silently choosing one of the two frozen locales (doc 25). Both are returned
     * and the caller decides — which is also why this is a batch method: a
     * per-property lookup behind a list endpoint is an N+1 waiting to happen.
     *
     * <p>Scoped like every other read here. The ids normally come from a query
     * that was already scope-filtered, but the filter is applied again rather
     * than assumed: a method that trusts its arguments is one refactor away from
     * being called with an id from somewhere else.
     *
     * @return one entry per property that has at least one translation; a
     *         property with none is simply absent, never an empty-string name
     */
    public Map<UUID, Map<String, String>> findNames(Collection<UUID> propertyIds,
                                                    AuthorizationScope scope) {
        if (propertyIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(propertyIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", java.util.Collections.nCopies(propertyIds.size(), "?"));

        Map<UUID, Map<String, String>> byProperty = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.property_id, t.locale, t.name
                          FROM property_translation t
                          JOIN property p ON p.id = t.property_id
                         WHERE t.property_id IN (%s) AND %s
                         ORDER BY t.property_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Translation(
                        rs.getObject("property_id", UUID.class),
                        rs.getString("locale").trim(),
                        rs.getString("name")))
                .list()
                .forEach(t -> byProperty
                        .computeIfAbsent(t.propertyId(), id -> new LinkedHashMap<>())
                        .put(t.locale(), t.name()));

        return Map.copyOf(byProperty);
    }

    /** One row of {@code property_translation}, before it is grouped by property. */
    private record Translation(UUID propertyId, String locale, String name) {
    }

    /**
     * Assigned amenity codes for several properties at once.
     *
     * <p>The batch form exists for the same reason {@link #findNames} has one: the
     * portfolio list renders every property the caller can reach, and a per-row
     * query behind a list endpoint is an N+1 that only shows up once a partner has
     * many hotels.
     *
     * <p>A property with no assignments is <strong>absent</strong> from the map
     * rather than present with an empty list, matching the sibling lookups; the
     * caller supplies the empty default.
     */
    public Map<UUID, List<String>> findAmenityCodes(Collection<UUID> propertyIds,
                                                    AuthorizationScope scope) {
        if (propertyIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(propertyIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", java.util.Collections.nCopies(propertyIds.size(), "?"));

        Map<UUID, List<String>> byProperty = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT pa.property_id, a.code
                          FROM property_amenity pa
                          JOIN amenity a ON a.id = pa.amenity_id
                          JOIN property p ON p.id = pa.property_id
                         WHERE pa.property_id IN (%s) AND %s
                         ORDER BY pa.property_id, pa.sort_order
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Assignment(
                        rs.getObject("property_id", UUID.class),
                        rs.getString("code")))
                .list()
                .forEach(a -> byProperty
                        .computeIfAbsent(a.propertyId(), id -> new ArrayList<>())
                        .add(a.code()));

        return Map.copyOf(byProperty);
    }

    /** One row of {@code property_amenity}, before it is grouped by property. */
    private record Assignment(UUID propertyId, String code) {
    }

    /**
     * The two editorial fields doc 52 §3.1 makes publish invariants.
     *
     * <p>Doc 23 §3.2 bounds them — {@code signatureLine} ≤ 90 characters,
     * {@code shortDescription} ≤ 220 — and {@code property_tr_sig_len} and
     * {@code property_tr_short_len} enforce exactly those numbers in the schema.
     * Either may be null: the columns are nullable and a property being written
     * is allowed to be half finished.
     */
    public record EditorialText(String signatureLine, String shortDescription) {
    }

    /**
     * Writes one locale's editorial text.
     *
     * <h2>Update, never insert</h2>
     *
     * <p>{@code property_translation.name} is {@code NOT NULL} with a non-blank
     * CHECK, so a translation row cannot exist without a name and this cannot
     * conjure one. A locale that has no row yet therefore reports zero rows
     * touched, and the caller turns that into a field error naming the locale
     * rather than silently dropping the text.
     *
     * <h2>Absent is not blank</h2>
     *
     * <p>A field the caller did not send keeps its stored value; a field sent
     * blank is cleared to NULL, because {@link PropertyCompletenessChecker}
     * counts a blank string as missing and the two must agree about what the
     * property has.
     *
     * @return true when a row was updated
     */
    public boolean setEditorial(UUID propertyId, String locale,
                                boolean signatureLineSupplied, String signatureLine,
                                boolean shortDescriptionSupplied, String shortDescription,
                                AuthorizationScope scope) {
        if (findById(propertyId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE property_translation
                           SET signature_line = CASE WHEN :sigSupplied
                                                     THEN :sig ELSE signature_line END,
                               short_description = CASE WHEN :shortSupplied
                                                        THEN :short ELSE short_description END,
                               updated_at = now()
                         WHERE property_id = :id AND locale = :locale
                        """)
                .param("id", propertyId)
                .param("locale", locale)
                .param("sigSupplied", signatureLineSupplied)
                .param("sig", blankToNull(signatureLine))
                .param("shortSupplied", shortDescriptionSupplied)
                .param("short", blankToNull(shortDescription))
                .update() > 0;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /**
     * The editorial text of each property, per locale — the read side of
     * {@link #setEditorial}.
     *
     * <p>Separate from {@link #findNames} rather than folded into it: the name is
     * required and these two are not, and three existing callers read names alone.
     */
    public Map<UUID, Map<String, EditorialText>> findEditorial(Collection<UUID> propertyIds,
                                                               AuthorizationScope scope) {
        if (propertyIds.isEmpty()) {
            return Map.of();
        }
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(propertyIds);
        params.addAll(filter.parameters());
        String placeholders = String.join(", ", java.util.Collections.nCopies(propertyIds.size(), "?"));

        Map<UUID, Map<String, EditorialText>> byProperty = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT t.property_id, t.locale, t.signature_line, t.short_description
                          FROM property_translation t
                          JOIN property p ON p.id = t.property_id
                         WHERE t.property_id IN (%s) AND %s
                         ORDER BY t.property_id, t.locale
                        """.formatted(placeholders, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new EditorialRow(
                        rs.getObject("property_id", UUID.class),
                        rs.getString("locale").trim(),
                        new EditorialText(rs.getString("signature_line"),
                                rs.getString("short_description"))))
                .list()
                .forEach(row -> byProperty
                        .computeIfAbsent(row.propertyId(), id -> new LinkedHashMap<>())
                        .put(row.locale(), row.text()));

        return Map.copyOf(byProperty);
    }

    private record EditorialRow(UUID propertyId, String locale, EditorialText text) {
    }
    private static Property map(ResultSet rs, int rowNum) throws SQLException {
        return new Property(
                rs.getObject("id", UUID.class),
                rs.getObject("partner_id", UUID.class),
                rs.getString("slug"),
                PropertyLifecycleState.valueOf(rs.getString("lifecycle_state")),
                rs.getBoolean("is_flagship"),
                rs.getString("collection"),
                rs.getString("district"),
                rs.getString("ward"),
                rs.getString("city"),
                rs.getString("phone"),
                rs.getBigDecimal("latitude"),
                rs.getBigDecimal("longitude"),
                rs.getInt("sort_order"),
                rs.getInt("version"),
                timestamp(rs, "published_at"),
                timestamp(rs, "created_at"),
                timestamp(rs, "updated_at"));
    }

    private static java.time.Instant timestamp(ResultSet rs, String column) throws SQLException {
        java.sql.Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}
