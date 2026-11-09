package com.kas.platform.property;

import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;

/**
 * The public customer read path — doc 58 §3.1.
 *
 * <p>Implements {@link PublicReadRepository}: it takes no
 * {@code AuthorizationScope} because a guest has none. Its filter is
 * <strong>publication state</strong>, carried in the SQL of every statement:
 *
 * <pre>lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')</pre>
 *
 * <p>which is doc 03 §8's visibility table and doc 58 §3.1's "Excludes
 * DRAFT/CLOSED", encoded once. A property that has never been approved is
 * {@code DRAFT} and therefore cannot appear here — that, not a controller check,
 * is what keeps an unreviewed hotel off the public site.
 *
 * <p>The returned type carries no partner, no lifecycle internals and no
 * identifiers beyond the slug the public URL already exposes.
 */
@Repository
public class PublishedPropertyRepository implements PublicReadRepository {

    /**
     * Doc 03 §8. {@code DRAFT} and {@code CLOSED} are absent deliberately, and
     * this list is the single place the rule is stated.
     */
    private static final String PUBLICLY_VISIBLE =
            "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private final JdbcClient jdbc;

    public PublishedPropertyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The candidate's own locales whose signature line is already in use by
     * another published property.
     *
     * <h2>The rule, and only the rule</h2>
     *
     * <p>Doc 52 §3.1: <em>"{@code signatureLine} unique across published
     * properties."</em> Doc 23 §12 repeats it as a publish-time control, and doc
     * 03 §9 gives the reason — eight hotels described in near-identical language
     * defeats the individuality the portfolio exists for.
     *
     * <p><strong>Exact string comparison.</strong> No case folding, no trimming
     * beyond what was stored, no accent or whitespace normalisation: none is
     * specified, and each would be a rule invented here.
     *
     * <h2>"Published" is this class's own predicate</h2>
     *
     * <p>{@link #PUBLICLY_VISIBLE} — the single place doc 03 §8's visibility rule
     * is stated. The check is deliberately <strong>not</strong> partner-scoped:
     * the portfolio a guest sees is one list, so the rule that keeps two hotels
     * from reading alike has to span it.
     *
     * <p>It returns the <em>caller's own</em> locales, never the other
     * property's identity or text, so a collision cannot be used to read another
     * partner's content.
     */
    public List<String> conflictingSignatureLocales(UUID candidateId) {
        return jdbc.sql("""
                        SELECT DISTINCT mine.locale
                          FROM property_translation mine
                          JOIN property_translation theirs
                            ON theirs.signature_line = mine.signature_line
                           AND theirs.property_id <> mine.property_id
                          JOIN property p ON p.id = theirs.property_id
                         WHERE mine.property_id = :id
                           AND mine.signature_line IS NOT NULL
                           AND %s
                         ORDER BY mine.locale
                        """.formatted(PUBLICLY_VISIBLE))
                .param("id", candidateId)
                .query(String.class)
                .list();
    }

    /**
     * The published portfolio, optionally narrowed — doc 58 §3.1's
     * {@code GET /public/properties}, <em>"Filters: district, character, amenity,
     * collection"</em>.
     *
     * <h2>Two of the four filters, and why only two</h2>
     *
     * <ul>
     *   <li><strong>{@code district}</strong> — {@code property.district}, which
     *       a Partner authors. Doc 18 §5 calls district <em>"the single strongest
     *       decision factor for a city hotel"</em>.</li>
     *   <li><strong>{@code amenity}</strong> — a catalogue code, matched through
     *       {@code property_amenity}, authorable since Step 16A.39.</li>
     *   <li><strong>{@code collection}</strong> is not implemented. The column
     *       exists but V3 says of it: <em>"OQ-009 unresolved; text until the
     *       business decides. Not an invented enum."</em> Nothing writes it, so a
     *       filter on it could only ever match nothing.</li>
     *   <li><strong>{@code character}</strong> is not implemented. <strong>No
     *       column exists</strong>, and doc 18 §5 makes it the alternative that
     *       appears only <em>if</em> OQ-009 rejects collections.</li>
     * </ul>
     *
     * <p>Both filters are exact matches. Doc 58 names them and defines no
     * matching semantics, so a prefix or fuzzy match would be a rule this
     * repository invented.
     *
     * <p>A filter that matches nothing returns an <strong>empty list</strong>,
     * never an error: "no hotel in District 7" is an answer, not a failure.
     */
    public List<PublishedProperty> findAll(String locale, String district, String amenityCode) {
        // Built as predicates rather than one static string so an absent filter
        // adds no SQL at all, and the plan for the common case is unchanged.
        StringBuilder where = new StringBuilder(PUBLICLY_VISIBLE);
        if (district != null) {
            where.append(" AND p.district = :district");
        }
        if (amenityCode != null) {
            where.append("""
                     AND EXISTS (SELECT 1
                                   FROM property_amenity pa
                                   JOIN amenity a ON a.id = pa.amenity_id
                                  WHERE pa.property_id = p.id
                                    AND a.code = :amenity
                                    AND a.archived_at IS NULL)
                    """);
        }

        var query = jdbc.sql("""
                        SELECT p.slug, t.name, p.city, p.district, p.is_flagship, p.lifecycle_state
                          FROM property p
                          JOIN property_translation t
                            ON t.property_id = p.id AND t.locale = :locale
                         WHERE %s
                         ORDER BY p.sort_order, p.slug
                        """.formatted(where))
                .param("locale", locale);

        if (district != null) {
            query = query.param("district", district);
        }
        if (amenityCode != null) {
            query = query.param("amenity", amenityCode);
        }

        return query.query(PublishedPropertyRepository::map).list();
    }

    /**
     * The website's hotel cards: every publicly visible property with the fields its
     * list, Find Your KAS and saved-hotel cards render, in the operator's order.
     */
    public List<PublishedPropertyCard> findCards(String locale) {
        return jdbc.sql("""
                        SELECT p.slug, t.name, p.city, p.district, p.is_flagship, p.lifecycle_state,
                               p.frontend_key, p.address_line, t.short_description, p.star_rating,
                               p.trip_com_rating, p.trip_com_review_count, p.quick_search_tags,
                               p.check_in_time, p.check_out_time, p.sort_order,
                               ARRAY(SELECT pi.intent_code FROM property_trip_intent pi
                                      WHERE pi.property_id = p.id
                                      ORDER BY pi.sort_order, pi.intent_code) AS trip_intents
                          FROM property p
                          JOIN property_translation t
                            ON t.property_id = p.id AND t.locale = :locale
                         WHERE %s
                         ORDER BY p.sort_order, p.slug
                        """.formatted(PUBLICLY_VISIBLE))
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedPropertyCard(
                        rs.getString("slug"), rs.getString("name"), rs.getString("city"),
                        rs.getString("district"), rs.getBoolean("is_flagship"), rs.getString("lifecycle_state"),
                        rs.getString("frontend_key"), rs.getString("address_line"),
                        rs.getString("short_description"),
                        rs.getObject("star_rating") == null ? null : rs.getInt("star_rating"),
                        rs.getBigDecimal("trip_com_rating"),
                        rs.getObject("trip_com_review_count") == null ? null : rs.getInt("trip_com_review_count"),
                        strings(rs.getArray("quick_search_tags")),
                        strings(rs.getArray("trip_intents")),
                        rs.getObject("check_in_time", java.time.LocalTime.class),
                        rs.getObject("check_out_time", java.time.LocalTime.class),
                        rs.getInt("sort_order")))
                .list();
    }

    private static List<String> strings(java.sql.Array array) throws SQLException {
        if (array == null) return List.of();
        List<String> out = new java.util.ArrayList<>();
        if (array.getArray() instanceof Object[] values) {
            for (Object value : values) if (value != null) out.add(value.toString());
        }
        return out;
    }

    /** Every published property, unnarrowed. */
    public List<PublishedProperty> findAll(String locale) {
        return findAll(locale, null, null);
    }

    /**
     * Every publicly visible property as a map point — doc 58 §3.1's
     * {@code GET /public/locations}.
     *
     * <p><strong>The same publication predicate as every sibling.</strong> Doc 58
     * gives this row no note where the property list carries
     * <em>"Excludes DRAFT/CLOSED"</em>, and a public endpoint that reached past
     * the predicate would disclose an unpublished hotel's address — so the
     * predicate is reused rather than re-decided.
     *
     * <p><strong>Properties without coordinates are still returned.</strong> Doc
     * 58 says <em>"all properties"</em>, and filtering them out would make an
     * empty map indistinguishable from a hotel that simply has no pin yet. The
     * consumer decides what to do with a null.
     *
     * <p>The translation join is <strong>inner</strong>, as on the portfolio list:
     * a property with no name in the reader's locale is omitted rather than
     * labelled with its slug.
     *
     * <p>Ordered {@code sort_order, slug} — the operator's own arrangement, the
     * same order the portfolio uses.
     */
    public List<PublicLocation> findLocations(String locale) {
        return jdbc.sql("""
                        SELECT p.slug, t.name, p.city, p.district, p.latitude, p.longitude
                          FROM property p
                          JOIN property_translation t
                            ON t.property_id = p.id AND t.locale = :locale
                         WHERE %s
                         ORDER BY p.sort_order, p.slug
                        """.formatted(PUBLICLY_VISIBLE))
                .param("locale", locale)
                .query((rs, rowNum) -> new PublicLocation(
                        rs.getString("slug"),
                        rs.getString("name"),
                        rs.getString("city"),
                        rs.getString("district"),
                        rs.getBigDecimal("latitude"),
                        rs.getBigDecimal("longitude")))
                .list();
    }

    public Optional<PublishedProperty> findBySlug(String slug, String locale) {
        return findContentBySlug(slug, locale).map(PublishedPropertyContent::summary);
    }

    /**
     * The detail row: the same publication, locale and slug rules as
     * {@link #findBySlug}, plus the editorial text doc 23 §3.2 places on guest
     * surfaces.
     *
     * <p>{@code signature_line} and {@code short_description} sit in the
     * {@code property_translation} row that already supplies {@code name}, so
     * this reads two more columns rather than running a second query. Both are
     * nullable in the schema and are carried through as {@code null} — the
     * operator has either written them in this locale or has not, and no
     * fallback is invented here.
     *
     * <p>The translation join stays <strong>inner</strong> and
     * {@link #PUBLICLY_VISIBLE} is unchanged: an unpublished property is as
     * unreachable through this method as it was through the one it replaces.
     */
    public Optional<PublishedPropertyContent> findContentBySlug(String slug, String locale) {
        return jdbc.sql("""
                        SELECT p.slug, t.name, p.city, p.district, p.is_flagship, p.lifecycle_state,
                               t.short_description, t.signature_line
                          FROM property p
                          JOIN property_translation t
                            ON t.property_id = p.id AND t.locale = :locale
                         WHERE p.slug = :slug AND %s
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", slug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedPropertyContent(
                        map(rs, rowNum),
                        rs.getString("short_description"),
                        rs.getString("signature_line")))
                .optional();
    }

    /**
     * The amenities this property offers — doc 58 §3.1's <em>"includes …
     * amenities"</em>.
     *
     * <h2>This hotel's, never the catalogue's</h2>
     *
     * <p>The join is through {@code property_amenity}, so a hotel returns only
     * what an operator actually assigned to it. The 56-row shared taxonomy is a
     * vocabulary, not a feature list, and listing it under every hotel would tell
     * a guest that all eight are identical — the exact failure doc 03 §9's P1
     * risk names.
     *
     * <h2>Publication, ordering and locale</h2>
     *
     * <p>{@link #PUBLICLY_VISIBLE} again, so an unpublished hotel's amenities are
     * unreachable here for the same reason its page is. An archived amenity is
     * excluded: a code withdrawn from the catalogue should stop appearing without
     * anyone having to unassign it hotel by hotel.
     *
     * <p>Order is the operator's own — {@code property_amenity.sort_order} first,
     * then the catalogue's, then the code — so the list is stable and the caller
     * never needs a sort key of its own.
     *
     * <p>The name comes from {@code amenity_translation} for the requested
     * locale. That join is <strong>inner</strong>, matching {@code findAll} and
     * {@code findRoomTypes}: an amenity with no translation in this locale is
     * omitted rather than shown as a raw code. It is the same trade-off OQ-159
     * already records for the property list, and this adds no new instance of it
     * beyond the one the corpus is tracking.
     */
    public List<PublishedAmenity> findAmenities(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT a.code, tr.name, a.category, pa.is_highlight
                          FROM property_amenity pa
                          JOIN property p ON p.id = pa.property_id
                          JOIN amenity a ON a.id = pa.amenity_id
                          JOIN amenity_translation tr
                            ON tr.amenity_id = a.id AND tr.locale = :locale
                         WHERE p.slug = :slug AND a.archived_at IS NULL AND %s
                         ORDER BY pa.sort_order, a.sort_order, a.code
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedAmenity(
                        rs.getString("code"),
                        rs.getString("name"),
                        rs.getString("category"),
                        rs.getBoolean("is_highlight")))
                .list();
    }

    /**
     * The neighbourhood a guest would walk into — doc 58 §3.1's landmarks.
     *
     * <p>The translation join is <strong>inner</strong>, matching the amenities:
     * a landmark with no name in the reader's locale is omitted rather than shown
     * as a bare distance. The publication predicate is carried here, so an
     * unpublished hotel's landmarks are unreachable for the reason its page is.
     *
     * <p>Ordered by the operator's own {@code sort_order}, never re-sorted by
     * distance: which landmark matters most is an editorial judgement doc 03 §5.2
     * leaves to the hotel.
     */
    public List<PublishedLandmark> findLandmarks(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT tr.name, tr.description, l.landmark_type,
                               l.distance_metres, l.walking_minutes
                          FROM property_landmark l
                          JOIN property p ON p.id = l.property_id
                          JOIN property_landmark_translation tr
                            ON tr.landmark_id = l.id AND tr.locale = :locale
                         WHERE p.slug = :slug AND %s
                         ORDER BY l.sort_order, l.id
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedLandmark(
                        rs.getString("name"),
                        rs.getString("description"),
                        rs.getString("landmark_type"),
                        (Integer) rs.getObject("distance_metres"),
                        (Integer) rs.getObject("walking_minutes")))
                .list();
    }

    /**
     * The hotel's signature experiences — doc 67 §1's section 5.
     *
     * <p>The translation join is <strong>inner</strong>, matching amenities and
     * landmarks: an experience with no title in the reader's locale is omitted
     * rather than shown as an empty card. The publication predicate is carried
     * here too, so an unpublished hotel's experiences are unreachable for the same
     * reason its page is.
     *
     * <p>Ordered by the operator's own {@code sort_order}. Which experience leads
     * is an editorial judgement, and doc 67 §1 calls these "named, unique to this
     * property" — not a ranked list the platform should re-sort.
     *
     * <p>{@code time_of_day} is not selected. The column exists and is always
     * null; Step 16A.47 left it out of V1 rather than inventing the enum doc 23 §5
     * never enumerates.
     */
    public List<PublishedExperience> findExperiences(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT tr.title, tr.description
                          FROM property_experience e
                          JOIN property p ON p.id = e.property_id
                          JOIN property_experience_translation tr
                            ON tr.experience_id = e.id AND tr.locale = :locale
                         WHERE p.slug = :slug AND %s
                         ORDER BY e.sort_order, e.id
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedExperience(
                        rs.getString("title"),
                        rs.getString("description")))
                .list();
    }

    /**
     * Published room types of a published property.
     *
     * <p>Two statements, not one per room: the beds are a separate table, and a
     * join would multiply each room type by its bed rows and need de-duplicating
     * in Java. One extra query for the whole set is cheaper and clearer than a
     * query per room type, which is what a lazy field would have cost.
     */
    public List<PublishedRoomType> findRoomTypes(String propertySlug, String locale) {
        Map<String, List<PublishedBed>> bedsBySlug = findBeds(propertySlug);

        return jdbc.sql("""
                        SELECT rt.slug, tr.name, rt.max_adults, rt.max_children, rt.max_occupancy,
                               rt.area_sqm, rt.view_type, rt.smoking, tr.short_description,
                               rt.frontend_key, rt.frontend_bed_description, rt.breakfast_included, tr.long_description
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                          JOIN room_type_translation tr
                            ON tr.room_type_id = rt.id AND tr.locale = :locale
                         WHERE p.slug = :slug AND rt.status = 'PUBLISHED' AND %s
                         ORDER BY rt.sort_order, rt.slug
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublishedRoomType(
                        rs.getString("slug"),
                        rs.getString("name"),
                        rs.getInt("max_adults"),
                        rs.getInt("max_children"),
                        rs.getInt("max_occupancy"),
                        rs.getBigDecimal("area_sqm"),
                        rs.getString("view_type"),
                        rs.getBoolean("smoking"),
                        rs.getString("short_description"),
                        bedsBySlug.getOrDefault(rs.getString("slug"), List.of()),
                        rs.getString("frontend_key"),
                        rs.getString("frontend_bed_description"),
                        (Boolean) rs.getObject("breakfast_included"),
                        rs.getString("long_description")))
                .list();
    }

    /** Every published room type's beds for one property, keyed by room-type slug. */
    private Map<String, List<PublishedBed>> findBeds(String propertySlug) {
        Map<String, List<PublishedBed>> bySlug = new LinkedHashMap<>();

        jdbc.sql("""
                        SELECT rt.slug AS room_type_slug, b.bed_type, b.bed_count, b.is_default
                          FROM room_type_bed_config b
                          JOIN room_type rt ON rt.id = b.room_type_id
                          JOIN property p ON p.id = rt.property_id
                         WHERE p.slug = :slug AND rt.status = 'PUBLISHED' AND %s
                         ORDER BY rt.slug, b.sort_order, b.bed_type
                        """.formatted(PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .query((rs, rowNum) -> Map.entry(
                        rs.getString("room_type_slug"),
                        new PublishedBed(rs.getString("bed_type"), rs.getInt("bed_count"),
                                rs.getBoolean("is_default"))))
                .list()
                .forEach(entry -> bySlug
                        .computeIfAbsent(entry.getKey(), key -> new ArrayList<>())
                        .add(entry.getValue()));

        return bySlug;
    }

    private static PublishedProperty map(ResultSet rs, int rowNum) throws SQLException {
        return new PublishedProperty(
                rs.getString("slug"),
                rs.getString("name"),
                rs.getString("city"),
                rs.getString("district"),
                rs.getBoolean("is_flagship"),
                rs.getString("lifecycle_state"));
    }
}
