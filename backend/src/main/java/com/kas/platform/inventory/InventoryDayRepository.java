package com.kas.platform.inventory;

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
import java.util.Optional;
import java.util.UUID;

/**
 * Daily inventory, always within the caller's scope.
 *
 * <p>Ownership derives as everywhere else: {@code room_type_inventory_day →
 * room_type → property → partner}. Every statement carries the scope predicate,
 * so an out-of-scope room type matches no row and nothing is written.
 *
 * <h2>Locking</h2>
 *
 * <p>{@link #lockForUpdate} orders by {@code (room_type_id, date)}. Doc 55 §7 and
 * doc 15 §5.1 both name this as the deadlock defence: "Two concurrent requests
 * touching the same rows in different orders will deadlock; in the same order,
 * one simply waits." Doc 88 §7 records it as "proven deadlock-free".
 *
 * <h2>Why the allocation methods return a boolean rather than validating</h2>
 *
 * <p>{@link #applyDirectDelta} and {@link #applyOtaDelta} issue a single atomic
 * {@code UPDATE}. They do not check whether the result would oversell — the
 * {@code inv_no_oversell} CHECK does that, and it is the only check that cannot
 * be raced. A pre-flight read in Java would be a TOCTOU window wearing a
 * validation costume.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class InventoryDayRepository implements ScopedRepository {

    private static final String COLUMNS =
            "i.room_type_id, i.date, i.total, i.maintenance, i.other_blocks, "
                    + "i.direct_committed, i.ota_committed, i.buffer_target";

    private static final String OWNERSHIP_JOIN =
            "FROM room_type_inventory_day i "
                    + "JOIN room_type rt ON rt.id = i.room_type_id "
                    + "JOIN property p ON p.id = rt.property_id ";

    private final JdbcClient jdbc;

    public InventoryDayRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The operator calendar: every day of a range for one property's room types. */
    public List<InventoryDay> findCalendar(UUID propertyId, LocalDate from, LocalDate to,
                                           AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(propertyId);
        params.add(java.sql.Date.valueOf(from));
        params.add(java.sql.Date.valueOf(to));
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " " + OWNERSHIP_JOIN
                        + "WHERE rt.property_id = ? AND i.date >= ? AND i.date <= ? AND " + filter.sql()
                        + " ORDER BY rt.sort_order, rt.id, i.date")
                .params(params)
                .query(InventoryDayRepository::map)
                .list();
    }

    public List<InventoryDay> findRange(UUID roomTypeId, LocalDate from, LocalDate to,
                                        AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(from));
        params.add(java.sql.Date.valueOf(to));
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " " + OWNERSHIP_JOIN
                        + "WHERE i.room_type_id = ? AND i.date >= ? AND i.date <= ? AND " + filter.sql()
                        + " ORDER BY i.date")
                .params(params)
                .query(InventoryDayRepository::map)
                .list();
    }

    public Optional<InventoryDay> find(UUID roomTypeId, LocalDate date, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(date));
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + COLUMNS + " " + OWNERSHIP_JOIN
                        + "WHERE i.room_type_id = ? AND i.date = ? AND " + filter.sql())
                .params(params)
                .query(InventoryDayRepository::map)
                .optional();
    }

    /**
     * Locks every row for a room type across a date range, in {@code (room_type_id,
     * date)} order, and returns them.
     *
     * <p>Doc 55 §7.1 step 1. The ORDER BY is inside the statement, not applied
     * afterwards, because it is the lock acquisition order that matters.
     */
    public List<InventoryDay> lockForUpdate(UUID roomTypeId, LocalDate from, LocalDate to,
                                            AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(from));
        params.add(java.sql.Date.valueOf(to));
        params.addAll(filter.parameters());

        // FOR UPDATE OF i — the joined room_type and property rows are read for
        // ownership only and must not be locked, or two operators working on
        // different room types of the same property would serialise needlessly.
        return jdbc.sql("SELECT " + COLUMNS + " " + OWNERSHIP_JOIN
                        + "WHERE i.room_type_id = ? AND i.date >= ? AND i.date <= ? AND " + filter.sql()
                        + " ORDER BY i.room_type_id, i.date FOR UPDATE OF i")
                .params(params)
                .query(InventoryDayRepository::map)
                .list();
    }

    /**
     * Creates the row for a date if it does not exist, with everything at zero.
     *
     * <p>A row is never created implicitly by a read. Doc 15 §12: "Inventory rows
     * missing for a date — treated as unavailable, never as unlimited. Fail
     * closed." Creating one on read would turn a missing row into a bookable one.
     */
    public boolean ensureRow(UUID roomTypeId, LocalDate date, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(java.sql.Date.valueOf(date));
        params.add(roomTypeId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO room_type_inventory_day (room_type_id, date)
                        SELECT rt.id, ?
                          FROM room_type rt
                          JOIN property p ON p.id = rt.property_id
                         WHERE rt.id = ? AND %s
                        ON CONFLICT (room_type_id, date) DO NOTHING
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /**
     * Sets the operator-writable columns for one date.
     *
     * <p>{@code total}, {@code maintenance} and {@code other_blocks} only — doc 58
     * §6: "{@code available} is not writable". The committed counters are moved by
     * the system, never by an operator (doc 15 §2.1).
     *
     * <p>A null argument leaves that column unchanged, so an operator setting
     * maintenance does not silently zero the total.
     */
    public boolean setOperatorColumns(UUID roomTypeId, LocalDate date, Integer total,
                                      Integer maintenance, Integer otherBlocks,
                                      AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(total);
        params.add(maintenance);
        params.add(otherBlocks);
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(date));
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET total        = coalesce(?, i.total),
                               maintenance  = coalesce(?, i.maintenance),
                               other_blocks = coalesce(?, i.other_blocks),
                               updated_at   = now()
                          FROM room_type rt, property p
                         WHERE rt.id = i.room_type_id AND p.id = rt.property_id
                           AND i.room_type_id = ? AND i.date = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /** Materialises the resolved OTA safety buffer onto one date — doc 55 §6.2. */
    public boolean setBufferTarget(UUID roomTypeId, LocalDate date, int bufferTarget,
                                   AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(bufferTarget);
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(date));
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET buffer_target = ?, updated_at = now()
                          FROM room_type rt, property p
                         WHERE rt.id = i.room_type_id AND p.id = rt.property_id
                           AND i.room_type_id = ? AND i.date = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update() > 0;
    }

    /**
     * Moves direct commitment by {@code delta} on one date, atomically.
     *
     * <p>This is the allocation primitive. The statement is a single {@code UPDATE};
     * PostgreSQL evaluates {@code inv_no_oversell} on the resulting row and refuses
     * it if the change would oversell. That refusal — not any Java check — is the
     * guarantee.
     *
     * @return false when no row matched (missing date, or out of scope). A CHECK
     *         violation is <em>not</em> reported here: it raises, because a silent
     *         false would be indistinguishable from a missing row.
     */
    public boolean applyDirectDelta(UUID roomTypeId, LocalDate date, int delta,
                                    AuthorizationScope scope) {
        return applyDelta("direct_committed", roomTypeId, date, delta, scope);
    }

    /** As {@link #applyDirectDelta}, for the OTA counter. */
    public boolean applyOtaDelta(UUID roomTypeId, LocalDate date, int delta,
                                 AuthorizationScope scope) {
        return applyDelta("ota_committed", roomTypeId, date, delta, scope);
    }

    private boolean applyDelta(String column, UUID roomTypeId, LocalDate date, int delta,
                               AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(delta);
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(date));
        params.addAll(filter.parameters());

        // The column name is a compile-time constant from this class, never input.
        return jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET %s = i.%s + ?, updated_at = now()
                          FROM room_type rt, property p
                         WHERE rt.id = i.room_type_id AND p.id = rt.property_id
                           AND i.room_type_id = ? AND i.date = ? AND %s
                        """.formatted(column, column, filter.sql()))
                .params(params)
                .update() > 0;
    }

    /**
     * The dates in a range on which a proposed {@code total} would fall below what
     * is already committed and blocked.
     *
     * <p>Doc 15 §8: a {@code total} change is "Blocked with an explanation naming
     * the conflicting dates". The CHECK would refuse the write anyway, but it
     * would refuse it as an opaque {@code 23514} on the first offending row —
     * which tells an operator nothing about the other eighty-nine days they were
     * trying to edit.
     */
    public List<LocalDate> datesWhereTotalIsTooLow(UUID roomTypeId, LocalDate from, LocalDate to,
                                                   int proposedTotal, AuthorizationScope scope) {
        ScopeFilter filter = filter(scope);

        List<Object> params = new ArrayList<>();
        params.add(proposedTotal);
        params.add(roomTypeId);
        params.add(java.sql.Date.valueOf(from));
        params.add(java.sql.Date.valueOf(to));
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT i.date " + OWNERSHIP_JOIN
                        + "WHERE ? - i.maintenance - i.other_blocks - i.direct_committed "
                        + "        - i.ota_committed - GREATEST(i.buffer_target - i.ota_committed, 0) < 0 "
                        + "  AND i.room_type_id = ? AND i.date >= ? AND i.date <= ? AND " + filter.sql()
                        + " ORDER BY i.date")
                .params(params)
                .query((rs, rowNum) -> rs.getDate("date").toLocalDate())
                .list();
    }

    private static ScopeFilter filter(AuthorizationScope scope) {
        return ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
    }

    private static InventoryDay map(ResultSet rs, int rowNum) throws SQLException {
        return new InventoryDay(
                rs.getObject("room_type_id", UUID.class),
                rs.getDate("date").toLocalDate(),
                rs.getInt("total"),
                rs.getInt("maintenance"),
                rs.getInt("other_blocks"),
                rs.getInt("direct_committed"),
                rs.getInt("ota_committed"),
                rs.getInt("buffer_target"));
    }
}
