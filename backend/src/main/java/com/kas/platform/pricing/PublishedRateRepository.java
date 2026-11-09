package com.kas.platform.pricing;

import com.kas.platform.property.BasePrice;
import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;

/**
 * Rate rules as a guest may see them resolved.
 *
 * <p>A {@link PublicReadRepository}: a guest has no {@code AuthorizationScope},
 * so the filter is publication state instead — the property must be
 * {@code OPEN} (doc 03 §8, the only bookable state) and the room type
 * {@code PUBLISHED}. That is the same pair of conditions
 * {@code PublishedAvailabilityRepository} applies, and for the same reason: a
 * price must never be quoted for something that is not sellable.
 *
 * <p>This returns <em>candidates</em>, not a winner. The winner rule lives in
 * {@link RateResolver#rank} and is shared with the operator path, so the price a
 * guest is quoted and the price the rate grid shows come from one implementation.
 */
@Repository
public class PublishedRateRepository implements PublicReadRepository {

    private static final String COLUMNS = """
            r.id, r.scope, r.property_id, r.room_type_id, r.name, r.priority,
            r.date_from, r.date_to, r.days_of_week, r.price_minor, r.adjustment_percent,
            r.currency, r.min_nights, r.max_nights, r.channel_scope, r.status
            """;

    /** Doc 03 §8 — {@code OPEN} is the only bookable lifecycle state. */
    private static final String BOOKABLE =
            "p.lifecycle_state = 'OPEN' AND rt.status = 'PUBLISHED'";

    private final JdbcClient jdbc;

    public PublishedRateRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Doc 56 §3.1's candidate set for one publicly bookable room type on one date.
     *
     * <p>The predicate is the scoped repository's, with the caller's scope
     * replaced by the publication condition.
     */
    public List<RateRule> candidatesFor(UUID roomTypeId, LocalDate date) {
        return jdbc.sql("SELECT " + COLUMNS + """
                        FROM rate_rule r
                        JOIN room_type rt ON rt.id = :roomTypeId
                        JOIN property p ON p.id = rt.property_id
                        WHERE r.status = 'ACTIVE'
                          AND ( r.room_type_id = :roomTypeId
                                OR (r.room_type_id IS NULL AND r.property_id = p.id) )
                          AND (r.date_from IS NULL OR r.date_from <= :on)
                          AND (r.date_to   IS NULL OR r.date_to   >= :on)
                          AND (r.days_of_week IS NULL
                               OR EXTRACT(DOW FROM CAST(:on AS date))::smallint
                                  = ANY (r.days_of_week))
                          AND r.channel_scope IS NULL
                          AND r.rate_plan_id IS NULL
                          AND """ + " " + BOOKABLE)
                .param("roomTypeId", roomTypeId)
                .param("on", java.sql.Date.valueOf(date))
                .query(PublishedRateRepository::map)
                .list();
    }

    /**
     * The price a Partner typed for this exact date, if there is one — V29's
     * {@code rate_day}.
     *
     * <h2>Why the guest path needs this at all</h2>
     *
     * A price set on a specific date is the most specific statement anyone can
     * make about what a night costs, and doc 56's ladder puts it above every
     * range rule: <strong>{@code rate_day} &gt; {@code rate_rule} &gt; base</strong>.
     * The operator grid has applied that ordering since V29
     * ({@code RateAuthoringService.grid}); this read is what lets the guest side
     * apply the same one.
     *
     * <p>Without it a Partner could set a nightly price, see it on their calendar,
     * and have the guest shown nothing at all — because a room type the guest
     * path cannot price is omitted from availability entirely. The two surfaces
     * would be reading the same table and disagreeing about what it means.
     *
     * <h2>The same publication gate as everything else here</h2>
     *
     * {@link #BOOKABLE} applies, so a day price on a draft room type or a
     * property that is not {@code OPEN} is invisible for exactly the reasons its
     * rate rules are. No scope filter: this is the public surface, and a guest
     * has no partner scope to filter by — publication *is* the filter.
     */
    public Optional<DayPrice> dayPriceFor(UUID roomTypeId, LocalDate date) {
        return jdbc.sql("""
                        SELECT d.price_minor, d.currency
                          FROM rate_day d
                          JOIN room_type rt ON rt.id = d.room_type_id
                          JOIN property p ON p.id = rt.property_id
                         WHERE d.room_type_id = :roomTypeId
                           AND d.date = :on
                           AND %s
                        """.formatted(BOOKABLE))
                .param("roomTypeId", roomTypeId)
                .param("on", java.sql.Date.valueOf(date))
                .query((rs, rowNum) ->
                        new DayPrice(rs.getLong("price_minor"), rs.getString("currency")))
                .optional();
    }

    /**
     * One date's hand-set price. Deliberately not {@code RateRule}: it has no
     * range, no priority and no specificity, because it needs none — it names a
     * single date and nothing can be more specific than that.
     */
    public record DayPrice(long priceMinor, String currency) {
    }

    /** Base prices for every publicly bookable room type of a property, by room type id. */
    public Map<UUID, BasePrice> basePrices(String propertySlug) {
        Map<UUID, BasePrice> prices = new HashMap<>();
        jdbc.sql("""
                        SELECT rt.id, rt.base_price_minor, rt.currency
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE p.slug = :slug
                           AND rt.base_price_minor IS NOT NULL
                           AND %s
                        """.formatted(BOOKABLE))
                .param("slug", propertySlug)
                .query((rs, rowNum) -> Map.entry(
                        rs.getObject("id", UUID.class),
                        new BasePrice(rs.getLong("base_price_minor"),
                                rs.getString("currency").trim())))
                .list()
                .forEach(entry -> prices.put(entry.getKey(), entry.getValue()));
        return prices;
    }

    /** Localised room type name, for the doc 58 §3.2 {@code name} field. */
    public Map<UUID, String> names(String propertySlug, String locale) {
        Map<UUID, String> names = new HashMap<>();
        jdbc.sql("""
                        SELECT rt.id, t.name
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                          JOIN room_type_translation t
                            ON t.room_type_id = rt.id AND t.locale = :locale
                         WHERE p.slug = :slug AND %s
                        """.formatted(BOOKABLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> Map.entry(
                        rs.getObject("id", UUID.class), rs.getString("name")))
                .list()
                .forEach(entry -> names.put(entry.getKey(), entry.getValue()));
        return names;
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
        return Arrays.stream((Object[]) array.getArray())
                .map(value -> ((Number) value).intValue())
                .toList();
    }

}
