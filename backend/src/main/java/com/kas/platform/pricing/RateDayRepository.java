package com.kas.platform.pricing;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Day prices — one row per room type per date (V29).
 *
 * <h2>Scope is in the statement, not around it</h2>
 *
 * {@code rate_day} hangs off {@code room_type}, which hangs off {@code property},
 * which carries {@code partner_id}. Every query here joins that chain and
 * {@code AND}s the scope predicate into the same statement, so a partner cannot
 * read or write another partner's prices and an out-of-scope room type yields no
 * row rather than a refusal that confirms it exists.
 */
@Repository
public class RateDayRepository implements ScopedRepository {

    private final JdbcClient jdbc;

    public RateDayRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Every day price for these room types in the window, keyed by room type.
     *
     * <p>One statement for the whole grid rather than one per cell: a 10 room ×
     * 31 day view would otherwise be 310 round trips.
     */
    public Map<UUID, Map<LocalDate, DayPrice>> findForRoomTypes(
            List<UUID> roomTypeIds, LocalDate from, LocalDate to, AuthorizationScope scope) {

        Map<UUID, Map<LocalDate, DayPrice>> byRoomType = new LinkedHashMap<>();
        if (roomTypeIds.isEmpty()) {
            return byRoomType;
        }

        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(roomTypeIds.toArray(new UUID[0]));
        params.add(from);
        params.add(to);
        params.addAll(filter.parameters());

        List<DayPriceRow> rows = jdbc.sql("""
                        SELECT d.room_type_id, d.date, d.price_minor, d.currency
                          FROM rate_day d
                          JOIN room_type rt ON rt.id = d.room_type_id
                          JOIN property p ON p.id = rt.property_id
                         WHERE d.room_type_id = ANY (?)
                           AND d.date BETWEEN ? AND ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new DayPriceRow(
                        rs.getObject("room_type_id", UUID.class),
                        rs.getObject("date", LocalDate.class),
                        rs.getLong("price_minor"),
                        rs.getString("currency")))
                .list();

        for (DayPriceRow row : rows) {
            byRoomType.computeIfAbsent(row.roomTypeId(), key -> new LinkedHashMap<>())
                    .put(row.date(), new DayPrice(row.priceMinor(), row.currency()));
        }
        return byRoomType;
    }

    /**
     * Sets one date's price, creating the row or replacing it.
     *
     * <p>The scope predicate is inside the {@code SELECT} the insert draws from,
     * so an out-of-scope room type inserts nothing and the caller sees
     * {@code false} — the same shape every other scoped write in this codebase
     * uses. It is an {@code ON CONFLICT} upsert rather than a read-then-write
     * because the primary key already says one row per day: two operators saving
     * the same cell resolve in the database instead of racing.
     *
     * @return false when the room type is absent or out of scope
     */
    public boolean upsert(UUID roomTypeId, LocalDate date, long priceMinor, String currency,
                          UUID setBy, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(date);
        params.add(priceMinor);
        params.add(currency);
        params.add(setBy);
        params.add(roomTypeId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO rate_day (room_type_id, date, price_minor, currency, set_by)
                        SELECT rt.id, ?, ?, ?, ?
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE rt.id = ? AND %s
                        ON CONFLICT (room_type_id, date) DO UPDATE
                            SET price_minor = EXCLUDED.price_minor,
                                currency    = EXCLUDED.currency,
                                set_by      = EXCLUDED.set_by,
                                updated_at  = now()
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /**
     * Removes one date's price, so the cell falls back to a rule or the base.
     *
     * @return false when there was nothing to clear, or it was out of scope
     */
    public boolean clear(UUID roomTypeId, LocalDate date, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(date);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        DELETE FROM rate_day d
                         USING room_type rt, property p
                         WHERE d.room_type_id = rt.id
                           AND p.id = rt.property_id
                           AND d.room_type_id = ?
                           AND d.date = ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** A price and its currency, with no identity of its own — the key is (room type, date). */
    public record DayPrice(long priceMinor, String currency) {
    }

    private record DayPriceRow(UUID roomTypeId, LocalDate date, long priceMinor, String currency) {
    }
}
