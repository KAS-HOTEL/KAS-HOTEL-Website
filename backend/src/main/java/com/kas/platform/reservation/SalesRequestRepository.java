package com.kas.platform.reservation;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads the direct sales queue — doc 58 §5, {@code /admin/sales}.
 *
 * <h2>Ownership is a join, not a filter the caller can forget</h2>
 *
 * Doc 85:223 states the path — {@code reservation → property → partner} — and
 * §11 row 7 states the rule: <em>"Reservations cannot be accessed by guessing
 * IDs. Non-sequential references + <strong>mandatory ownership check</strong> —
 * a reference is an identifier, never a credential."</em> Every query below
 * joins {@code property} and applies {@link ScopeFilter}, the same predicate
 * {@code PropertyRepository} uses, so there is exactly one authorization model
 * in this codebase rather than a second one written for reservations.
 *
 * <p>A reservation outside the caller's scope is <strong>absent</strong>, not
 * refused: the detail read returns empty and the caller answers <strong>404</strong>,
 * never 403 (doc 85 §6.3). A 403 would confirm that the reference exists.
 *
 * <h2>DIRECT only</h2>
 *
 * Doc 58 §5 is <em>"Scoped to {@code channelType = DIRECT} at the data layer. An
 * OTA reservation is not addressable here."</em> The predicate is in the SQL, so
 * no caller can widen it.
 *
 * <h2>Reads only</h2>
 *
 * Nothing here writes. No hold is created, released or touched; no
 * {@code direct_committed} is moved; no availability is recalculated. A GET
 * cannot change what a guest is holding.
 */
@Repository
public class SalesRequestRepository implements ScopedRepository {

    /** Doc 58 §5 — an OTA reservation is not addressable through the sales API. */
    private static final String DIRECT_ONLY = "r.channel_type = 'DIRECT'";

    /** {@code status_field} values — a reservation carries two status machines. */
    public static final String SALES_FIELD = "SALES";
    public static final String STAY_FIELD = "STAY";

    private static final String SUMMARY_COLUMNS = """
            r.id, r.reference, r.sales_status::text AS sales_status,
            r.lead_source::text AS lead_source, r.check_in, r.check_out,
            r.adults, r.children, r.guest_name, r.requested_at, r.sla_due_at,
            r.currency, r.total_minor, p.slug AS property_slug, t.name AS property_name,
            COALESCE((SELECT sum(l.quantity) FROM reservation_line l
                       WHERE l.reservation_id = r.id), 0) AS rooms
            """;

    private static final String FROM = """
             FROM reservation r
             JOIN property p ON p.id = r.property_id
             LEFT JOIN property_translation t
                    ON t.property_id = p.id AND t.locale = ?
            """;

    private final JdbcClient jdbc;

    public SalesRequestRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The queue, in the frozen order.
     *
     * <p>Doc 69 §4.2: <em>"Default sort: oldest unactioned first. A request model
     * fails by neglect, not by backlog order."</em> {@code requested_at ASC} is
     * that order; {@code reference} breaks ties so the page is stable.
     *
     * <p>Filtered by {@link SalesQueueFilter}, which carries only the parameters
     * whose semantics doc 58 §5 actually freezes. No page or sort parameter is
     * accepted: the project has no pagination convention to follow, and the order
     * above is the frozen one.
     */
    public List<SalesRequestRow> queue(AuthorizationScope scope, String locale,
                                       SalesQueueFilter criteria) {
        return queue(scope, locale, criteria, null);
    }

    /** One page of the queue, in the same order; {@code page} null means every row. */
    public record QueuePage(int page, int size) {
        public QueuePage {
            if (page < 0 || size < 1 || size > 100) {
                throw new IllegalArgumentException("page must be >= 0 and size 1..100");
            }
        }
    }

    public List<SalesRequestRow> queue(AuthorizationScope scope, String locale,
                                       SalesQueueFilter criteria, QueuePage page) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(locale);
        params.addAll(filter.parameters());

        // Each clause is a fixed SQL fragment from this class; only the VALUES
        // are bound. Nothing a caller sends becomes SQL.
        StringBuilder where = new StringBuilder();
        if (criteria.salesStatus() != null) {
            where.append(" AND r.sales_status = CAST(? AS sales_status)");
            params.add(criteria.salesStatus());
        }
        if (criteria.leadSource() != null) {
            where.append(" AND r.lead_source = CAST(? AS lead_source)");
            params.add(criteria.leadSource());
        }
        if (criteria.propertySlug() != null) {
            // By slug, never by id. The slug is already in the queue response;
            // a property id is not, and adding one would put an internal
            // identifier in a URL. The scope filter still applies, so a slug
            // belonging to another partner simply matches nothing.
            where.append(" AND p.slug = ?");
            params.add(criteria.propertySlug());
        }
        if (criteria.statuses() != null && !criteria.statuses().isEmpty()) {
            // A queue view: a fixed set of enum values chosen by the service.
            where.append(" AND r.sales_status::text = ANY (?)");
            params.add(criteria.statuses().toArray(String[]::new));
        }
        if (criteria.search() != null) {
            where.append(" AND (r.reference ILIKE ? OR r.guest_name ILIKE ?)");
            params.add(searchPattern(criteria.search()));
            params.add(searchPattern(criteria.search()));
        }
        if (criteria.breachedOnly()) {
            // Doc 69 §127 / doc 21 §534 — "breached" is the one SLA band with an
            // unambiguous definition: the promise has passed. A request with no
            // deadline (config A6 unset) is not breached; it is unknown, and
            // NULL correctly excludes it here.
            where.append(" AND r.sla_due_at IS NOT NULL AND r.sla_due_at < now()");
            // A request closed by proposing an alternative was answered: it is never overdue
            // (owner decision 2026-11-07), even when its original deadline has passed.
            where.append(" AND r.sales_status::text <> 'ALTERNATIVE_OFFERED'");
        }

        return jdbc.sql("SELECT " + SUMMARY_COLUMNS + FROM
                        + " WHERE " + DIRECT_ONLY + " AND " + filter.sql()
                        + where
                        // Newest request first, like an inbox: ordered in the query, before
                        // the page is cut, so every page and every tab share one order.
                        + (criteria.oldestFirst() ? " ORDER BY r.requested_at ASC, r.reference ASC"
                                                  : " ORDER BY r.requested_at DESC, r.reference DESC")
                        + (page == null ? "" : " LIMIT " + page.size() + " OFFSET " + ((long) page.page() * page.size())))
                .params(params)
                .query(SalesRequestRepository::mapRow)
                .list();
    }

    /**
     * The queue's filter criteria — doc 58 §5's
     * {@code ?salesStatus,leadSource,owner,slaState,property}, as far as their
     * semantics are actually frozen.
     *
     * <p>{@code owner} is absent. Doc 134 established that no endpoint, response
     * field or session value in this repository yields an assignable owner's
     * identity, so a filter by owner would need a picker that cannot be built and
     * would otherwise mean putting a raw user id in a URL.
     *
     * <p>{@code slaState} is reduced to {@code breachedOnly}. Doc 69 §127 names
     * three bands — within, approaching, breached — but freezes no threshold
     * separating the first two. "Breached" is exact; "approaching" is not, and a
     * filter is a stronger commitment than a colour.
     *
     * <p>A null field means "not filtered". Absent is not the same as empty.
     */
    public record SalesQueueFilter(String salesStatus, String leadSource, String propertySlug,
                                   boolean breachedOnly, java.util.Set<String> statuses,
                                   String search, boolean oldestFirst) {

        public static final SalesQueueFilter NONE =
                new SalesQueueFilter(null, null, null, false, null, null, false);

        public SalesQueueFilter(String salesStatus, String leadSource, String propertySlug, boolean breachedOnly) {
            this(salesStatus, leadSource, propertySlug, breachedOnly, null, null, false);
        }

        public SalesQueueFilter(String salesStatus, String leadSource, String propertySlug, boolean breachedOnly,
                                java.util.Set<String> statuses) {
            this(salesStatus, leadSource, propertySlug, breachedOnly, statuses, null, false);
        }
    }

    /** Reference or guest name, case-insensitive; {@code %} and {@code _} are matched literally. */
    private static String searchPattern(String search) {
        return "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /** Request counts per queue view, under the same scope and hotel filter as the list. */
    public record QueueCounts(long all, long awaiting, long expired, long accepted, long alternative) { }

    /**
     * Counts for the queue's views in one statement, from the database rather than
     * from whatever rows a page happens to show. The status sets are the ones the
     * list uses for the same views, passed in by the service.
     */
    public QueueCounts queueCounts(AuthorizationScope scope, String propertySlug,
                                   java.util.Set<String> awaiting, java.util.Set<String> expired,
                                   java.util.Set<String> accepted, java.util.Set<String> alternative) {
        return queueCounts(scope, propertySlug, null, awaiting, expired, accepted, alternative);
    }

    public QueueCounts queueCounts(AuthorizationScope scope, String propertySlug, String search,
                                   java.util.Set<String> awaiting, java.util.Set<String> expired,
                                   java.util.Set<String> accepted, java.util.Set<String> alternative) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(awaiting.toArray(String[]::new));
        params.add(expired.toArray(String[]::new));
        params.add(accepted.toArray(String[]::new));
        params.add(alternative.toArray(String[]::new));
        params.addAll(filter.parameters());
        String property = "";
        if (propertySlug != null) {
            property = " AND p.slug = ?";
            params.add(propertySlug);
        }
        if (search != null) {
            property += " AND (r.reference ILIKE ? OR r.guest_name ILIKE ?)";
            params.add(searchPattern(search));
            params.add(searchPattern(search));
        }
        return jdbc.sql("""
                        SELECT count(*) AS all_count,
                               count(*) FILTER (WHERE r.sales_status::text = ANY (?)) AS awaiting,
                               count(*) FILTER (WHERE r.sales_status::text = ANY (?)) AS expired,
                               count(*) FILTER (WHERE r.sales_status::text = ANY (?)) AS accepted,
                               count(*) FILTER (WHERE r.sales_status::text = ANY (?)) AS alternative
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE %s AND %s%s
                        """.formatted(DIRECT_ONLY, filter.sql(), property))
                .params(params)
                .query((rs, n) -> new QueueCounts(rs.getLong("all_count"), rs.getLong("awaiting"),
                        rs.getLong("expired"), rs.getLong("accepted"), rs.getLong("alternative")))
                .single();
    }

    /**
     * One request, or empty when it does not exist <em>or</em> lies outside the
     * caller's scope. The two are deliberately indistinguishable.
     */
    public Optional<SalesRequestRow> byReference(String reference, AuthorizationScope scope,
                                                 String locale) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(locale);
        params.add(reference);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + SUMMARY_COLUMNS + FROM
                        + " WHERE " + DIRECT_ONLY + " AND r.reference = ? AND " + filter.sql())
                .params(params)
                .query(SalesRequestRepository::mapRow)
                .optional();
    }

    /**
     * The guest's contact details for one request.
     *
     * <p>Separate from {@link #byReference} on purpose. Doc 59:148 makes
     * {@code customer.view} the permission that gates guest data and requires
     * that <em>"staff access to guest data is logged"</em>. Keeping this read
     * apart means the audit obligation attaches to the call that actually
     * discloses the data, and the queue can be served without incurring it.
     *
     * <p>Re-applies the ownership filter rather than trusting the caller to have
     * checked: a repository method that assumes authorization is one refactor
     * away from being called without it.
     */
    public Optional<GuestContactRow> guestContact(String reference, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reference);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.guest_email, r.guest_phone, r.guest_country,
                               r.preferred_channel::text AS preferred_channel,
                               r.special_requests
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE %s AND r.reference = ? AND %s
                        """.formatted(DIRECT_ONLY, filter.sql()))
                .params(params)
                .query((rs, n) -> new GuestContactRow(
                        rs.getString("guest_email"),
                        rs.getString("guest_phone"),
                        rs.getString("guest_country"),
                        rs.getString("preferred_channel"),
                        rs.getString("special_requests")))
                .optional();
    }

    /**
     * The room types requested.
     *
     * <p>Takes the scope and re-applies the ownership join even though the caller
     * has just read the reservation through it. {@code ScopeEnforcementRule}
     * refuses a scoped repository method that can be called without one, and it
     * is right to: a method that trusts its caller to have checked is one
     * refactor away from being called by one that did not.
     */
    public List<SalesRequestLineRow> lines(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT l.room_type_name_snapshot, l.quantity,
                               l.nightly_price_minor, l.line_total_minor
                          FROM reservation_line l
                          JOIN reservation r ON r.id = l.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE l.reservation_id = ? AND %s AND %s
                         ORDER BY l.room_type_name_snapshot
                        """.formatted(DIRECT_ONLY, filter.sql()))
                .params(params)
                .query((rs, n) -> new SalesRequestLineRow(
                        rs.getString("room_type_name_snapshot"),
                        rs.getInt("quantity"),
                        (Long) rs.getObject("nightly_price_minor"),
                        (Long) rs.getObject("line_total_minor")))
                .list();
    }

    /**
     * The price as the request recorded it: rooms, voucher, taxes, total — the reservation's
     * own columns and the S1 price snapshot, so staff can check the figure the guest was shown
     * and will be asked to pay. Nothing is recomputed.
     */
    public Optional<SalesRequestPriceRow> price(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.currency, r.subtotal_minor, r.discount_minor, r.tax_minor,
                               r.service_charge_minor, r.total_minor,
                               v.code::text AS voucher_code, v.name AS voucher_name,
                               v.voucher_type::text AS voucher_type, v.value_percent,
                               COALESCE(r.price_snapshot -> 'discount' ->> 'voucherCode', v.code::text) AS snapshot_code,
                               COALESCE(r.price_snapshot -> 'taxes', '[]'::jsonb)::text AS taxes,
                               ls.member_discount_percent, COALESCE(ls.member_discount_minor, 0) AS member_discount_minor,
                               COALESCE(ls.cashback_redeemed_points, 0) AS points_used, ls.tier_code_snapshot
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN voucher v ON v.id = r.voucher_id
                          LEFT JOIN reservation_loyalty_snapshot ls ON ls.reservation_id = r.id
                         WHERE r.id = ? AND %s AND %s
                        """.formatted(DIRECT_ONLY, filter.sql()))
                .params(params)
                .query((rs, n) -> new SalesRequestPriceRow(
                        rs.getString("currency"),
                        (Long) rs.getObject("subtotal_minor"),
                        rs.getLong("discount_minor"),
                        (Long) rs.getObject("tax_minor"),
                        (Long) rs.getObject("service_charge_minor"),
                        (Long) rs.getObject("total_minor"),
                        rs.getString("snapshot_code"),
                        rs.getString("voucher_name"),
                        rs.getString("voucher_type"),
                        rs.getBigDecimal("value_percent"),
                        rs.getString("taxes"), rs.getBigDecimal("member_discount_percent"),
                        rs.getLong("member_discount_minor"), rs.getLong("points_used"), rs.getString("tier_code_snapshot")))
                .optional();
    }

    public record SalesRequestPriceRow(String currency, Long subtotalMinor, long discountMinor, Long taxMinor,
                                       Long serviceChargeMinor, Long totalMinor, String voucherCode,
                                       String voucherName, String voucherType,
                                       java.math.BigDecimal voucherPercent, String taxesJson,
                                       java.math.BigDecimal memberPercent, long memberDiscountMinor, long pointsUsed,
                                       String tierCode) {
    }

    // ------------------------------------------------------------- transitions

    /**
     * Locks one request for a state transition and returns its current status.
     *
     * <p>{@code FOR UPDATE OF r} is the whole point: two agents acting on the same
     * reservation serialise here, so the second reads the status the first
     * <em>wrote</em> rather than the one it started from. Without it, a double
     * decline would be two transactions each seeing {@code REQUESTED}.
     *
     * <p>The ownership filter is applied in the same statement, so a partner
     * cannot even take the lock on another partner's reservation — the row is
     * absent to them, and absent is a 404.
     */
    public Optional<LockedRequest> lockForTransition(String reference, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reference);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.id, r.sales_status::text AS sales_status,
                               r.property_id, r.sales_owner_id, r.check_in, r.check_out
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE %s AND r.reference = ? AND %s
                           FOR UPDATE OF r
                        """.formatted(DIRECT_ONLY, filter.sql()))
                .params(params)
                .query((rs, n) -> new LockedRequest(
                        rs.getObject("id", UUID.class),
                        rs.getString("sales_status"),
                        rs.getObject("property_id", UUID.class),
                        rs.getObject("sales_owner_id", UUID.class),
                        rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class)))
                .optional();
    }

    /**
     * Locks the inventory nights this reservation's ACTIVE holds occupy.
     *
     * <p>Ordered {@code room_type_id, date} — the identical sequence
     * {@code PublicAllocationRepository.lockNights} uses at S1, so a release and a
     * concurrent request cannot acquire the same rows in opposite orders and
     * deadlock.
     *
     * <p>Carries the scope like every other method here. It is not decoration: a
     * caller that had skipped {@link #lockForTransition} would otherwise lock
     * another partner's inventory rows.
     */
    public int lockNightsOfActiveHolds(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT i.date
                          FROM room_type_inventory_day i
                          JOIN inventory_hold h
                            ON h.room_type_id = i.room_type_id AND h.date = i.date
                          JOIN reservation r ON r.id = h.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE h.reservation_id = ? AND h.status = 'ACTIVE' AND %s
                         ORDER BY i.room_type_id, i.date
                           FOR UPDATE OF i
                        """.formatted(filter.sql()))
                .params(params)
                .query(java.sql.Date.class)
                .list()
                .size();
    }

    /**
     * Removes this reservation's ACTIVE holds from {@code direct_committed}.
     *
     * <p>Doc 55 §3.1 defines the cache as direct reservation lines
     * <em>whose {@code stayStatus} is CONFIRMED, CHECK_IN_READY or CHECKED_IN</em>
     * plus <strong>ACTIVE holds</strong>. A {@code REQUESTED} reservation has
     * {@code stayStatus = NULL}, so its entire contribution is the hold — release
     * it and the contribution must go with it, exactly as doc 55 row 14 does on
     * expiry ({@code DirectCommitted −q}).
     *
     * <p>Bounded by {@code reservation_id} <em>and</em> the ownership filter: this
     * can never touch another reservation's holds, let alone another partner's.
     * V26's ACTIVE-only unique index guarantees at most one ACTIVE hold per
     * {@code (type, reservation, room type, date)}, so no night is decremented
     * twice.
     *
     * <p>The {@code direct_committed >= 0} CHECK stays authoritative — a decrement
     * that would go negative fails the transaction rather than being clamped.
     */
    public int releaseFromDirectCommitted(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET direct_committed = i.direct_committed - h.quantity,
                               updated_at = now()
                          FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE h.reservation_id = ?
                           AND h.status = 'ACTIVE'
                           AND i.room_type_id = h.room_type_id
                           AND i.date = h.date
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * Marks this reservation's ACTIVE holds RELEASED — doc 14 §6.3,
     * <em>"Reservation → DECLINED / CANCELLED / EXPIRED | All holds RELEASED"</em>.
     *
     * <p><strong>Bounded by {@code reservation_id}, {@code status = 'ACTIVE'} and
     * the ownership filter.</strong> Never a table-wide update, and never a
     * delete: a hold is history, and V26's index is scoped to ACTIVE precisely so
     * a released row can coexist with a later one for the same night.
     */
    public int releaseActiveHolds(UUID reservationId, String reason, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reason);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE inventory_hold h
                           SET status = 'RELEASED',
                               released_at = now(),
                               release_reason = ?
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = h.reservation_id
                           AND h.reservation_id = ?
                           AND h.status = 'ACTIVE'
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * Moves {@code sales_status}.
     *
     * <p>The caller has already locked the row and checked the guard; the filter
     * is repeated anyway, so this statement is safe read in isolation.
     */
    public int updateSalesStatus(UUID reservationId, String toStatus, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(toStatus);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE reservation r
                           SET sales_status = CAST(? AS sales_status),
                               updated_at = now()
                          FROM property p
                         WHERE p.id = r.property_id
                           AND r.id = ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * The transition's durable record — doc 54's Audit column, V14's table.
     *
     * <p>{@code reason} is the frozen "reason required" of S11, stored on the
     * history row rather than on {@code reservation.cancellation_reason}: that
     * column and {@code cancelled_at} are named for cancellation, and a decline is
     * a different transition. Nothing in the corpus says a decline writes them, so
     * nothing here does.
     *
     * <h2>{@code clock_timestamp()}, not the column's {@code now()} default</h2>
     *
     * <p>{@code now()} is the <strong>transaction</strong> timestamp, so every row
     * written inside one transaction carries an identical {@code created_at} and
     * the log cannot be ordered at all. S10 writes two rows in one transaction —
     * sales {@code WON} and stay {@code CONFIRMED} — and would produce a tie even
     * in production. {@code clock_timestamp()} advances within a transaction, so
     * an event log records when each event actually happened.
     *
     * <p>The column default stays {@code now()}; this states the value it needs
     * rather than changing the schema for every future writer.
     *
     * <p>An {@code INSERT … SELECT} rather than {@code INSERT … VALUES}, so the
     * ownership filter guards the write itself: outside the caller's scope the
     * select yields nothing and no row is written.
     */
    public int insertStatusHistory(UUID reservationId, String fromStatus, String toStatus,
                                   UUID actorId, String reason, String note,
                                   AuthorizationScope scope) {
        return insertStatusHistory(SALES_FIELD, reservationId, fromStatus, toStatus, actorId,
                reason, note, scope);
    }

    /**
     * The same record, for either lifecycle.
     *
     * <p>{@code reservation_status_history.field} exists precisely because a
     * reservation carries two independent status machines, and S10 moves both in
     * one transaction: {@code salesStatus → WON} and {@code stayStatus →
     * CONFIRMED}. Writing one row and calling it the transition would lose half
     * of what happened.
     *
     * <p>{@code field} is a constant from this class — {@link #SALES_FIELD} or
     * {@link #STAY_FIELD} — never caller input.
     */
    public int insertStatusHistory(String field, UUID reservationId, String fromStatus,
                                   String toStatus, UUID actorId, String reason, String note,
                                   AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(field);
        params.add(fromStatus);
        params.add(toStatus);
        params.add(actorId);
        params.add(reason);
        params.add(note);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO reservation_status_history (reservation_id, field, from_status,
                                                                to_status, actor_id, actor_type,
                                                                reason, note, created_at)
                        SELECT r.id, CAST(? AS status_field), ?, ?, ?, 'ADMIN', ?, ?,
                               clock_timestamp()
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    // ------------------------------------------------------------------ S2

    /**
     * Is this user allowed to become the sales owner of this reservation?
     *
     * <p>Two conditions, and both are the caller's to fail rather than to
     * assume: the target must be an {@code ACTIVE} account, and it must hold a
     * live {@code role_assignment} whose scope <strong>reaches this
     * reservation's property</strong>. That second half is the whole defence
     * against cross-partner assignment — without it, a partner admin could
     * park another partner's request on one of their own agents, or on a
     * stranger's user id harvested from anywhere.
     *
     * <p>The three scope kinds are evaluated exactly as
     * {@code role_assignment_scope_valid} defines them, so this predicate and
     * the database CHECK cannot disagree. {@code OWN} is deliberately absent: a
     * customer scope reaches no property and can own no request.
     *
     * <p>The reservation is itself filtered by the <em>caller's</em> scope too,
     * so an unreachable reservation answers "no" rather than leaking that some
     * user would have been valid for it.
     */
    /** The latest alternative offer on a reservation in the caller's scope. */
    public java.util.Optional<AlternativeOfferRow> latestAlternativeOffer(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "rp.partner_id", "rp.id");
        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        SELECT coalesce(pt.name, p.slug) AS property_name,
                               l.room_type_name_snapshot AS room_name, o.check_in, o.check_out,
                               coalesce(l.quantity, 1) AS quantity, o.total_minor, o.currency,
                               o.hotel_message, o.sent_at
                          FROM reservation_alternative_offer o
                          JOIN property p ON p.id = o.property_id
                          LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                          LEFT JOIN reservation_alternative_offer_line l ON l.offer_id = o.id
                          JOIN reservation r ON r.id = o.reservation_id
                          JOIN property rp ON rp.id = r.property_id
                         WHERE o.reservation_id = ? AND %s
                         ORDER BY o.sent_at DESC NULLS LAST, o.id DESC
                         LIMIT 1
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new AlternativeOfferRow(rs.getString("property_name"), rs.getString("room_name"),
                        rs.getObject("check_in", java.time.LocalDate.class), rs.getObject("check_out", java.time.LocalDate.class),
                        rs.getInt("quantity"), rs.getLong("total_minor"), rs.getString("currency"),
                        rs.getString("hotel_message"), rs.getObject("sent_at", java.time.OffsetDateTime.class)))
                .optional();
    }

    public record AlternativeOfferRow(String propertyName, String roomName, java.time.LocalDate checkIn,
                                      java.time.LocalDate checkOut, int quantity, long totalMinor,
                                      String currency, String message, java.time.OffsetDateTime sentAt) { }

    /**
     * Whether the guest told the hotel they transferred the money (they used the
     * "I have made the transfer" link from the payment email). The money may be in the
     * account even though no payment is VERIFIED yet.
     */
    public boolean guestReportedPayment(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_email_action_token t
                          JOIN reservation r ON r.id = t.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE t.reservation_id = ? AND t.action = 'GUEST_MARK_PAID' AND t.used_at IS NOT NULL
                           AND %s
                        """.formatted(filter.sql()))
                .params(params).query(Long.class).single() > 0;
    }

    public boolean isAssignableOwner(UUID targetUserId, UUID reservationId,
                                     AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        // Bound in the order the placeholders appear: the target id, then the
        // reservation, then the caller's scope.
        List<Object> params = new ArrayList<>();
        params.add(targetUserId);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT EXISTS (
                            SELECT 1
                              FROM reservation r
                              JOIN property p ON p.id = r.property_id
                              JOIN app_user u ON u.id = ?
                              JOIN role_assignment ra ON ra.user_id = u.id
                             WHERE r.id = ? AND %s
                               AND u.status = 'ACTIVE'
                               AND ra.revoked_at IS NULL
                               AND ra.role IN ('ADMIN', 'SUPER_ADMIN')
                               AND (
                                     ra.scope_kind = 'GLOBAL'
                                  OR (ra.scope_kind = 'PARTNER'  AND ra.partner_id = p.partner_id)
                                  OR (ra.scope_kind = 'PROPERTY' AND p.id = ANY (ra.property_ids))
                               )
                        )
                        """.formatted(filter.sql()))
                .params(params)
                .query(Boolean.class)
                .single();
    }

    /**
     * Moves the current sales owner. The history row is a separate statement —
     * see {@link #insertAssignment}.
     *
     * <p>Bounded by {@code r.id} and the ownership filter. Never a table-wide
     * update.
     */
    public int assignOwner(UUID reservationId, UUID toOwnerId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(toOwnerId);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE reservation r
                           SET sales_owner_id = ?,
                               updated_at = now()
                          FROM property p
                         WHERE p.id = r.property_id
                           AND r.id = ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * Appends the assignment event — V27's dedicated table, per the owner ruling
     * that assignment history is not reservation status history.
     *
     * <p>An {@code INSERT … SELECT} guarded by the ownership join, exactly like
     * {@link #insertStatusHistory}: the row cannot be written for a reservation
     * the caller cannot reach, and {@code property_id} is taken from the
     * reservation rather than from anything the caller supplied.
     *
     * <p>Returns 0 when the guard refuses, which the service treats as a failed
     * transition rather than a silent success.
     */
    public int insertAssignment(UUID reservationId, UUID fromOwnerId, UUID toOwnerId,
                                UUID actorId, String reason, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(fromOwnerId);
        params.add(toOwnerId);
        params.add(actorId);
        params.add(reason);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO reservation_assignment
                            (reservation_id, property_id, from_owner_id, to_owner_id,
                             actor_id, actor_type, reason)
                        SELECT r.id, r.property_id, ?, ?, ?, 'ADMIN', ?
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    // --------------------------------------------------------------- S3 / S4

    /**
     * Locks every inventory night of every line of this reservation.
     *
     * <p>Ordered {@code room_type_id, date} — the same sequence S1 and
     * {@link #lockNightsOfActiveHolds} use, so no two paths can take these rows
     * in opposite orders and deadlock.
     *
     * <p>The count is the caller's evidence that inventory exists: doc 15 §12
     * makes a missing night <em>unavailable</em>, never unlimited, and a short
     * count is how that is detected.
     */
    public int lockStayNights(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT i.date
                          FROM room_type_inventory_day i
                          JOIN reservation_line l ON l.room_type_id = i.room_type_id
                          JOIN reservation r ON r.id = l.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE l.reservation_id = ?
                           AND i.date >= r.check_in AND i.date < r.check_out
                           AND %s
                         ORDER BY i.room_type_id, i.date
                           FOR UPDATE OF i
                        """.formatted(filter.sql()))
                .params(params)
                .query(java.sql.Date.class)
                .list()
                .size();
    }

    /**
     * The live availability of every line, read under the lock above.
     *
     * <h2>Why this reservation's own hold is added back</h2>
     *
     * <p>{@code available_direct()} subtracts {@code direct_committed}, and doc 55
     * §3.1 puts every ACTIVE hold inside that cache — including the hold this
     * reservation already owns. Comparing the raw number against the line
     * quantity would therefore demand the inventory <em>twice</em>: once for the
     * rooms already committed to this guest, and again to satisfy the same
     * request. Adding back <strong>only this reservation's own</strong> ACTIVE
     * hold (bounded by {@code h.reservation_id = r.id}) asks the question S3
     * actually asks: <em>can this reservation still be honoured?</em>
     *
     * <p>So a request whose hold is intact and whose inventory is untouched
     * passes, and one whose rooms were taken away underneath it — a lowered
     * {@code total}, a raised buffer, a maintenance block — fails, which is
     * exactly the case a live re-check exists to catch.
     *
     * <p>{@code available_direct(i.*)} is <em>called</em>, never reimplemented.
     * Doc 88 §7: it is character-for-character the {@code inv_no_oversell} CHECK,
     * so what this reads and what the database will enforce cannot drift apart.
     *
     * <p>{@code coveredNights} is returned unaggregated so the caller can compare
     * it against the stay length; a {@code LEFT JOIN} that found no inventory row
     * yields 0 nights and a 0 availability, never an unbounded one.
     */
    public List<LineCheckRow> checkLines(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT l.room_type_id,
                               l.room_type_name_snapshot AS room_type_name,
                               l.quantity,
                               count(i.date) AS covered_nights,
                               coalesce(min(available_direct(i.*) + coalesce(own.held, 0)), 0)
                                   AS lowest_available
                          FROM reservation_line l
                          JOIN reservation r ON r.id = l.reservation_id
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN room_type_inventory_day i
                                 ON i.room_type_id = l.room_type_id
                                AND i.date >= r.check_in AND i.date < r.check_out
                          LEFT JOIN LATERAL (
                                 SELECT sum(h.quantity)::int AS held
                                   FROM inventory_hold h
                                  WHERE h.reservation_id = r.id
                                    AND h.room_type_id = i.room_type_id
                                    AND h.date = i.date
                                    AND h.status = 'ACTIVE'
                               ) own ON true
                         WHERE l.reservation_id = ? AND %s
                         GROUP BY l.room_type_id, l.room_type_name_snapshot, l.quantity
                         ORDER BY l.room_type_id
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new LineCheckRow(
                        rs.getObject("room_type_id", UUID.class),
                        rs.getString("room_type_name"),
                        rs.getInt("quantity"),
                        rs.getInt("covered_nights"),
                        rs.getInt("lowest_available")))
                .list();
    }

    /**
     * Records the re-check and its result — V27's table, per the owner ruling
     * that a status-history note is not a record.
     *
     * <p>Written for a refusal as well as a success. A check that found nothing
     * available is the document explaining why a request could not advance, and
     * discarding it would leave that gap undocumented.
     */
    public int insertAvailabilityCheck(UUID reservationId, UUID actorId, String outcome,
                                       String detailJson, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(actorId);
        params.add(outcome);
        params.add(detailJson);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO reservation_availability_check
                            (reservation_id, property_id, actor_id, actor_type, outcome, detail)
                        SELECT r.id, r.property_id, ?, 'ADMIN',
                               CAST(? AS availability_check_outcome), CAST(? AS jsonb)
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * The internal notes on one request — {@code reservation_note} (V14:46),
     * newest first.
     *
     * <h2>Newest first, because the schema says so</h2>
     *
     * V14's own index is {@code (reservation_id, created_at DESC)}. That is the
     * order the table was built to be read in, and a notes panel is read for what
     * was said most recently. {@code id} breaks a tie so repeated reads agree.
     *
     * <h2>{@code admin_id} is stored and not selected</h2>
     *
     * The column exists and every note records its author, but nothing here
     * returns it. {@code app_user} has no name column, its only human-readable
     * identifier is an email address, and no frozen document permits disclosing
     * staff identity between colleagues — doc 134 §5. The same decision the
     * status timeline made, for the same reason: the data is kept, the disclosure
     * waits for a ruling.
     */
    public List<NoteRow> notes(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT n.body, n.created_at
                          FROM reservation_note n
                          JOIN reservation r ON r.id = n.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE n.reservation_id = ? AND %s
                         ORDER BY n.created_at DESC, n.id DESC
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new NoteRow(
                        rs.getString("body"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .list();
    }

    /**
     * Appends one internal note.
     *
     * <p>An {@code INSERT … SELECT} behind the ownership join, like every other
     * write here: the row cannot be written for a reservation the caller cannot
     * reach, and {@code reservation_id} comes from the query rather than from
     * anything the caller supplied.
     *
     * <p>{@code created_at} is stated as {@code clock_timestamp()} rather than
     * left to the column's {@code now()} default: {@code now()} is the
     * transaction timestamp, so notes written in one transaction would tie and
     * the newest-first order would fall back to a random uuid. The same fix the
     * status history needed, for the same reason.
     *
     * <p>{@code admin_id} is the authenticated actor. Neither it nor the
     * timestamp is accepted from the caller — a note that
     * could name someone else as its author, or claim a time it was not written,
     * is not a record.
     *
     * @return 1 when written, 0 when the ownership guard refused
     */
    public int insertNote(UUID reservationId, UUID adminId, String body,
                          AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(adminId);
        params.add(body);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO reservation_note (reservation_id, admin_id, body,
                                                      created_at)
                        SELECT r.id, ?, ?, clock_timestamp()
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /** One internal note. Carries no author identity — see {@link #notes}. */
    public record NoteRow(String body, OffsetDateTime createdAt) {
    }

    /**
     * The transition history of one request — every row S1 and doc 54's
     * transitions have written to {@code reservation_status_history}.
     *
     * <h2>Read-only, and scoped like everything else here</h2>
     *
     * The same {@code reservation → property → partner} join every other method
     * applies. A caller who cannot reach the reservation reaches none of its
     * history either, and there is no route to this that does not go through the
     * detail read's own authorization.
     *
     * <h2>What is deliberately not selected</h2>
     *
     * {@code actor_id}. It is a {@code uuid}, {@code app_user} has no name
     * column, and no frozen document permits disclosing staff identity between
     * colleagues — doc 134 §5 recorded that as an open question when it blocked
     * the assignment UI. {@code actor_type} carries what the timeline actually
     * needs: whether a person or the system moved the request.
     *
     * <h2>Ordering</h2>
     *
     * {@code created_at ASC, id ASC}. The tiebreak matters because {@code now()}
     * is the <em>transaction</em> timestamp: S10 writes its SALES and STAY rows
     * inside one transaction and they carry identical {@code created_at} values.
     * Ordering by the random {@code id} is <strong>stable</strong> — the same
     * query returns the same order every time — without pretending to know which
     * of two simultaneous rows came first, because neither did.
     */
    public List<StatusEventRow> history(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT h.field::text AS field, h.from_status, h.to_status,
                               h.actor_type::text AS actor_type, h.reason, h.note, h.created_at
                          FROM reservation_status_history h
                          JOIN reservation r ON r.id = h.reservation_id
                          JOIN property p ON p.id = r.property_id
                         WHERE h.reservation_id = ? AND %s
                         ORDER BY h.created_at ASC, h.id ASC
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new StatusEventRow(
                        rs.getString("field"),
                        rs.getString("from_status"),
                        rs.getString("to_status"),
                        rs.getString("actor_type"),
                        rs.getString("reason"),
                        rs.getString("note"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .list();
    }

    /** One recorded transition. Carries no actor identity — see {@link #history}. */
    public record StatusEventRow(String field, String fromStatus, String toStatus,
                                 String actorType, String reason, String note,
                                 OffsetDateTime at) {
    }

    /**
     * S5/S6's side effect — doc 54: <em>"Contact recorded: channel, direction,
     * outcome"</em>, and doc 29:275's fuller list, <em>"Channel, direction,
     * outcome, notes, timestamp, agent"</em>.
     *
     * <p>Every one of those is a column of {@code reservation_contact_log}, which
     * V14:32 created and which <strong>nothing had written until now</strong>. No
     * migration was needed; the table was waiting for its transition.
     *
     * <p>{@code contacted_at} is the column's own {@code DEFAULT now()} and is
     * not accepted from the caller. A contact log is a record of when a
     * conversation happened, and letting a client supply the timestamp would let
     * an agent backdate one.
     *
     * <p>An {@code INSERT … SELECT} behind the ownership join, like every other
     * write here: the row cannot be written for a reservation the caller cannot
     * reach, and {@code reservation_id} comes from the query rather than from
     * anything the caller supplied.
     */
    public int insertContactLog(UUID reservationId, UUID adminId, String channel,
                                String direction, String outcome, String notes,
                                AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(adminId);
        params.add(channel);
        params.add(direction);
        params.add(outcome);
        params.add(notes);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        INSERT INTO reservation_contact_log
                            (reservation_id, admin_id, channel, direction, outcome, notes)
                        SELECT r.id, ?,
                               CAST(? AS contact_channel),
                               CAST(? AS contact_direction),
                               ?, ?
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /**
     * S12's reservation write — status, timestamp and reason in one statement.
     *
     * <p>{@code cancelled_at} and {@code cancellation_reason} exist in V12:86-87
     * and, until this transition, <strong>nothing wrote them</strong>. S11
     * deliberately left them alone: they are named for cancellation, and a
     * decline is not one, so the decline's reason lives on its status-history row
     * and a test pins both columns at null.
     *
     * <p>S12 is the transition they are named for, and doc 54 S12's guard is
     * "reason required" — the same value the history row records. Writing them
     * here uses the canonical columns the schema already provides rather than
     * inventing storage; no document states it in those words, and no other code
     * reads or writes them.
     *
     * <p>All three move together because a {@code CANCELLED} row with no
     * {@code cancelled_at} would be a reservation whose cancellation has no
     * moment.
     */
    public int markCancelled(UUID reservationId, String reason, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reason);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE reservation r
                           SET sales_status = 'CANCELLED',
                               cancelled_at = now(),
                               cancellation_reason = ?,
                               updated_at = now()
                          FROM property p
                         WHERE p.id = r.property_id
                           AND r.id = ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    // ----------------------------------------------------------------- S10

    /**
     * The accepted hold becomes firm — doc 54 S10, under owner decision 1
     * (OQ-172, option B).
     *
     * <p>{@code ACTIVE → CONVERTED}. {@code expires_at} is <strong>not</strong>
     * touched and stays {@code NOT NULL}: the ruling keeps the column's
     * guarantee and expresses firmness through the status instead. Every
     * consumer of a hold filters {@code status = 'ACTIVE'} before it ever reads
     * {@code expires_at} — {@code hold_expiry_sweep_idx}, {@code
     * v_active_hold_demand}, doc 55 §3.1 — so a CONVERTED row stops counting as
     * demand, stops being swept, and stops occupying V26's ACTIVE-scoped
     * uniqueness, while remaining a complete historical record.
     *
     * <p>{@code released_at} is set because {@code hold_released_has_timestamp}
     * requires every non-ACTIVE hold to carry one. It is the moment the hold left
     * ACTIVE, which is what that CHECK has always meant; the reason column says
     * which transition did it, so a conversion is never mistaken for a release.
     *
     * <p>Only {@code REQUEST} holds convert. Doc 54 S10 also requires <em>"all
     * other holds on the reservation released"</em>, which is
     * {@link #releaseOtherActiveHolds}.
     */
    public int convertRequestHolds(UUID reservationId, String reason, AuthorizationScope scope) {
        return updateHoldStatus(reservationId, "CONVERTED", "h.hold_type = 'REQUEST'", reason,
                scope);
    }

    /**
     * Doc 54 S10's second hold clause — every hold on the reservation that is
     * not the accepted one is released.
     *
     * <p>Today this can only match an {@code ALTERNATIVE_OFFER} hold, which S7
     * would create and S7 does not exist. It is implemented anyway because the
     * frozen contract states it, and because a hold left ACTIVE on a WON
     * reservation would hold inventory nothing will ever claim.
     */
    public int releaseOtherActiveHolds(UUID reservationId, String reason,
                                       AuthorizationScope scope) {
        return updateHoldStatus(reservationId, "RELEASED", "h.hold_type <> 'REQUEST'", reason,
                scope);
    }

    /**
     * The one statement behind both hold transitions above.
     *
     * <p>{@code typePredicate} is a compile-time constant from this class, never
     * caller input — the two call sites pass string literals. Everything a
     * caller supplies is bound.
     */
    private int updateHoldStatus(UUID reservationId, String toStatus, String typePredicate,
                                 String reason, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(toStatus);
        params.add(reason);
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE inventory_hold h
                           SET status = CAST(? AS hold_status),
                               released_at = now(),
                               release_reason = ?
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = h.reservation_id
                           AND h.reservation_id = ?
                           AND h.status = 'ACTIVE'
                           AND %s
                           AND %s
                        """.formatted(typePredicate, filter.sql()))
                .params(params)
                .update();
    }

    /**
     * S10's reservation write — doc 54 S10: <em>"Opens {@code stayStatus =
     * CONFIRMED} in the same transaction; {@code won_at} set"</em>.
     *
     * <p>Both statuses and both timestamps move in one statement, so no window
     * exists in which a reservation is WON but not CONFIRMED. {@code
     * confirmed_at} accompanies {@code stay_status} for the same reason
     * {@code won_at} accompanies {@code sales_status}.
     *
     * <p>{@code price_snapshot} is not in the SET list. Doc 54 calls the snapshot
     * <em>sealed</em> at S10, and the way to seal a document is to not write it.
     */
    public int markWon(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        UPDATE reservation r
                           SET sales_status = 'WON',
                               stay_status = 'CONFIRMED',
                               won_at = now(),
                               confirmed_at = now(),
                               payment_verified_at = COALESCE(payment_verified_at, now()),
                               updated_at = now()
                          FROM property p
                         WHERE p.id = r.property_id
                           AND r.id = ?
                           AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .update();
    }

    /** A direct request may be won only after an actual payment was verified. */
    public boolean hasVerifiedPayment(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        SELECT EXISTS (
                            SELECT 1 FROM payment pay
                            JOIN reservation r ON r.id = pay.reservation_id
                            JOIN property p ON p.id = r.property_id
                            WHERE r.id = ? AND pay.status = 'VERIFIED' AND %s
                        )
                        """.formatted(filter.sql()))
                .params(params).query(Boolean.class).single();
    }

    /** One line's live availability, as the re-check read it under lock. */
    public record LineCheckRow(UUID roomTypeId, String roomTypeName, int quantity,
                               int coveredNights, int lowestAvailable) {
    }

    /**
     * A reservation held under a row lock, with the facts that lock proved.
     *
     * <p>{@code salesOwnerId} is null while nobody owns the request — the state
     * every S1 reservation starts in, and the reason S2's first assignment writes
     * a history row whose {@code from_owner_id} is null rather than absent.
     */
    public record LockedRequest(UUID reservationId, String salesStatus, UUID propertyId,
                                UUID salesOwnerId, LocalDate checkIn, LocalDate checkOut) {
    }


    private static SalesRequestRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new SalesRequestRow(
                rs.getObject("id", UUID.class),
                rs.getString("reference"),
                rs.getString("sales_status"),
                rs.getString("lead_source"),
                rs.getObject("check_in", LocalDate.class),
                rs.getObject("check_out", LocalDate.class),
                rs.getInt("adults"),
                rs.getInt("children"),
                rs.getString("guest_name"),
                rs.getObject("requested_at", OffsetDateTime.class),
                rs.getObject("sla_due_at", OffsetDateTime.class),
                rs.getString("currency"),
                (Long) rs.getObject("total_minor"),
                rs.getString("property_slug"),
                rs.getString("property_name"),
                rs.getInt("rooms"));
    }

    /** One queue row, straight from the reservation. Carries no guest contact detail. */
    public record SalesRequestRow(
            UUID reservationId, String reference, String salesStatus, String leadSource,
            LocalDate checkIn, LocalDate checkOut, int adults, int children,
            String guestName, OffsetDateTime requestedAt, OffsetDateTime slaDueAt,
            String currency, Long totalMinor,
            String propertySlug, String propertyName, int rooms) {
    }

    /** Guest contact detail — disclosed only through the audited path. */
    public record GuestContactRow(
            String email, String phone, String country, String preferredChannel,
            String specialRequests) {
    }

    /** One requested room type, from the line's own snapshot. */
    public record SalesRequestLineRow(
            String roomTypeName, int quantity, Long nightlyPriceMinor, Long lineTotalMinor) {
    }
}
