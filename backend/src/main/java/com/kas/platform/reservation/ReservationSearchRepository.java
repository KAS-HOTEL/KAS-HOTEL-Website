package com.kas.platform.reservation;

import com.kas.platform.shared.TimeConfiguration;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads reservations across <strong>every</strong> channel — doc 58 §6,
 * {@code GET /admin/ops/reservations}.
 *
 * <h2>Why this is not {@link SalesRequestRepository}</h2>
 *
 * That class is DIRECT-only <em>at the data layer</em>: {@code DIRECT_ONLY} is
 * welded into every statement, and doc 58 §5 is the reason — "an OTA reservation
 * is not addressable here." Widening it by parameterising that predicate would
 * turn a guarantee into an argument, and every caller of the sales API would
 * then depend on nobody ever passing the wrong one.
 *
 * <p>So the sales queue keeps its invariant and this repository carries the
 * operations one: doc 58 §6, <em>"All channels. Queries use
 * {@code stayStatus}."</em> Two read models over one table, which is what doc
 * 53's <em>one entity, two lifecycles</em> already implies. There is no second
 * reservation entity here, no second customer model and no CRM — every column
 * below is {@code reservation}'s own.
 *
 * <h2>Ownership is a join, not a filter the caller can forget</h2>
 *
 * The path is {@code reservation → property → partner}, and {@link ScopeFilter}
 * is applied inside the SQL of <em>every</em> statement — the search, the count
 * behind the page metadata, the detail, the lines, the money, the guest contact
 * and the history. A reservation outside the caller's scope is
 * <strong>absent</strong>, never refused, so the detail read answers 404 rather
 * than 403 (doc 85 §6.3): a reference is an identifier, never a credential, and
 * a 403 would confirm one exists.
 *
 * <h2>Reads only</h2>
 *
 * Nothing here writes. No status moves, no hold is touched, no availability is
 * recalculated. Doc 58 §6's mutations — check-in, check-out, no-show, cancel —
 * are separate routes and are not implemented; a search screen does not acquire
 * them by being built.
 */
@Repository
public class ReservationSearchRepository implements ScopedRepository {

    /**
     * The columns the list returns.
     *
     * <p>{@code sales_status} is deliberately <strong>not selected</strong>. Doc
     * 58 §6 makes {@code stayStatus} the operational field, and a column that is
     * NULL for every OTA row would invite exactly the conflation doc 53 forbids.
     * The sales lifecycle has its own workspace and its own API.
     */
    private static final String SUMMARY_COLUMNS = """
            r.id, r.reference, r.channel_type::text AS channel_type,
            r.ota_reference, r.stay_status::text AS stay_status,
            r.check_in, r.check_out, r.adults, r.children,
            r.guest_name, r.guest_phone, r.guest_email,
            r.currency, r.total_minor, r.created_at,
            p.slug AS property_slug, t.name AS property_name,
            COALESCE((SELECT sum(l.quantity) FROM reservation_line l
                       WHERE l.reservation_id = r.id), 0) AS rooms
            """;

    private static final String FROM = """
             FROM reservation r
             JOIN property p ON p.id = r.property_id
             LEFT JOIN property_translation t
                    ON t.property_id = p.id AND t.locale = ?
            """;

    /**
     * Newest first, then by the unique reference.
     *
     * <p>{@code created_at} is {@code NOT NULL} on every channel — unlike
     * {@code requested_at}, which V12 leaves nullable and which an OTA
     * reservation never carries — and {@code reference} is {@code UNIQUE}.
     * Together they are a <strong>total</strong> order, which is what makes an
     * offset page stable: without the tie-break two rows sharing a timestamp
     * could swap between page 1 and page 2, and a reservation could be shown
     * twice or not at all.
     */
    private static final String ORDER = " ORDER BY r.created_at DESC, r.reference DESC";

    private final JdbcClient jdbc;

    public ReservationSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * One page of reservations matching {@code criteria}, newest first.
     *
     * <p>{@code limit} and {@code offset} are integers this application computed
     * from a validated page and size, never text from a caller.
     */
    public List<ReservationRow> search(AuthorizationScope scope, String locale,
                                       ReservationSearchFilter criteria, int limit, int offset) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(locale);
        params.addAll(filter.parameters());
        String where = where(criteria, params);

        params.add(limit);
        params.add(offset);

        return jdbc.sql("SELECT " + SUMMARY_COLUMNS + FROM
                        + " WHERE " + filter.sql() + where + ORDER + " LIMIT ? OFFSET ?")
                .params(params)
                .query(ReservationSearchRepository::mapRow)
                .list();
    }

    /**
     * How many reservations the same criteria match.
     *
     * <p>Built from the <em>same</em> predicate builder as {@link #search}, under
     * the same scope filter — so the total can never describe a population the
     * caller may not see. A count computed from a wider predicate than the list
     * would leak the existence of another partner's reservations without ever
     * showing one, which is why this shares {@link #where} rather than repeating
     * it.
     *
     * <p>No {@code property_translation} join: a count needs no name, and the
     * locale parameter would otherwise have to be threaded through for nothing.
     */
    public long count(AuthorizationScope scope, ReservationSearchFilter criteria) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>(filter.parameters());
        String where = where(criteria, params);

        return jdbc.sql("""
                        SELECT count(*)
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE %s%s
                        """.formatted(filter.sql(), where))
                .params(params)
                .query(Long.class)
                .single();
    }

    /**
     * Every clause the criteria ask for, as fixed SQL with bound values.
     *
     * <p>Each fragment below is a literal in this file. Only <em>values</em> are
     * appended to {@code params}; nothing a caller sends ever becomes SQL. The
     * parameters are positional, so this must be called at the point in the list
     * where its values belong — after the scope filter's, before the page's.
     */
    private static String where(ReservationSearchFilter criteria, List<Object> params) {
        StringBuilder where = new StringBuilder();

        if (criteria.term() != null) {
            // The reference and the guest's own name are always searchable. The
            // two contact fields are searchable only when the caller may read
            // them: without that gate the search box would answer "does this
            // phone number appear in your portfolio?" for a caller forbidden to
            // see the number, which is the same disclosure by a slower route.
            where.append(criteria.searchContact()
                    ? CONTACT_TERM_SQL
                    : NAME_TERM_SQL);

            String pattern = "%" + escapeLike(criteria.term()) + "%";
            int fields = criteria.searchContact() ? 4 : 2;
            for (int i = 0; i < fields; i++) {
                params.add(pattern);
            }
        }
        if (criteria.stayStatuses() != null) {
            // `IN` over one placeholder per value rather than a single `= ANY`:
            // the column is an enum, so each parameter needs its own CAST, and a
            // bound array of text would not compare against `stay_status`.
            //
            // A one-element list produces `IN (CAST(? AS stay_status))`, which is
            // the same plan the previous `=` produced.
            where.append(" AND r.stay_status IN (");
            for (int i = 0; i < criteria.stayStatuses().size(); i++) {
                where.append(i == 0 ? "" : ", ").append("CAST(? AS stay_status)");
                params.add(criteria.stayStatuses().get(i));
            }
            where.append(")");
        }
        if (criteria.channelType() != null) {
            // The real column, never inferred from lead_source: V12 denormalises
            // channel_type precisely so the six structural CHECKs need no join,
            // and it is the field those constraints are written against.
            where.append(" AND r.channel_type = CAST(? AS channel_type)");
            params.add(criteria.channelType());
        }
        if (criteria.propertySlug() != null) {
            // By slug, never by id — the slug is already in the response and a
            // property id is not. The scope filter still applies, so another
            // partner's slug matches nothing rather than widening anything.
            where.append(" AND p.slug = ?");
            params.add(criteria.propertySlug());
        }
        if (criteria.roomTypeSlug() != null) {
            // EXISTS, not a join: a reservation with three lines must appear
            // once. Joining reservation_line would return it three times and the
            // total behind the page would silently be wrong.
            where.append(ROOM_TYPE_SQL);
            params.add(criteria.roomTypeSlug());
        }
        if (criteria.checkInFrom() != null) {
            where.append(" AND r.check_in >= ?");
            params.add(criteria.checkInFrom());
        }
        if (criteria.checkInTo() != null) {
            where.append(" AND r.check_in <= ?");
            params.add(criteria.checkInTo());
        }
        if (criteria.checkOutFrom() != null) {
            where.append(" AND r.check_out >= ?");
            params.add(criteria.checkOutFrom());
        }
        if (criteria.checkOutTo() != null) {
            where.append(" AND r.check_out <= ?");
            params.add(criteria.checkOutTo());
        }
        if (criteria.bookedFrom() != null) {
            // created_at is a timestamptz and the filter is a calendar day, so
            // the day is resolved in the property's own zone rather than the
            // database session's — TimeConfiguration.PROPERTY_ZONE, the clock the
            // rest of the application books against.
            where.append(" AND r.created_at >= ?");
            params.add(startOfDay(criteria.bookedFrom()));
        }
        if (criteria.bookedTo() != null) {
            // Half-open on the upper end, so the whole of the last day is
            // included exactly once. A closed comparison against the day itself
            // would silently drop every booking made after midnight on it.
            where.append(" AND r.created_at < ?");
            params.add(startOfDay(criteria.bookedTo().plusDays(1)));
        }
        return where.toString();
    }

    private static final String NAME_TERM_SQL =
            " AND (r.reference ILIKE ? ESCAPE '\\' OR r.guest_name ILIKE ? ESCAPE '\\')";

    private static final String CONTACT_TERM_SQL =
            " AND (r.reference ILIKE ? ESCAPE '\\' OR r.guest_name ILIKE ? ESCAPE '\\'"
            + " OR r.guest_phone ILIKE ? ESCAPE '\\' OR r.guest_email ILIKE ? ESCAPE '\\')";

    /**
     * Written as a concatenation rather than a text block: a text block strips
     * the common indentation of its lines, which would drop the leading space and
     * weld this clause onto the one before it.
     */
    private static final String ROOM_TYPE_SQL =
            " AND EXISTS (SELECT 1 FROM reservation_line rl"
            + " JOIN room_type rt ON rt.id = rl.room_type_id"
            + " WHERE rl.reservation_id = r.id AND rt.slug = ?)";

    private static OffsetDateTime startOfDay(LocalDate day) {
        return day.atStartOfDay(TimeConfiguration.PROPERTY_ZONE).toOffsetDateTime();
    }

    /**
     * Makes the caller's own text a literal inside a {@code LIKE} pattern.
     *
     * <p>A reference such as {@code KAS-260908-CA9W} contains no wildcard, but a
     * search box accepts anything. Without this, {@code %} would match every
     * reservation in scope and {@code _} would match any character — a filter
     * that had silently stopped filtering. The backslash is escaped first, or it
     * would escape the escapes added after it.
     */
    private static String escapeLike(String term) {
        return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /**
     * One reservation, or empty when it does not exist <em>or</em> lies outside
     * the caller's scope. The two are deliberately indistinguishable.
     *
     * <p>No channel predicate: doc 58 §6 is <em>"full detail, any channel"</em>,
     * which is the whole difference between this workspace and the sales one.
     */
    public Optional<ReservationRow> byReference(String reference, AuthorizationScope scope,
                                                String locale) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(locale);
        params.add(reference);
        params.addAll(filter.parameters());

        return jdbc.sql("SELECT " + SUMMARY_COLUMNS + FROM
                        + " WHERE r.reference = ? AND " + filter.sql())
                .params(params)
                .query(ReservationSearchRepository::mapRow)
                .optional();
    }

    /**
     * The authoritative money, from the reservation's own columns.
     *
     * <p>Read separately from the summary so the list never carries a breakdown
     * it does not display. Every figure is the record's: nothing is summed here,
     * and nothing may be summed by the client — doc 125 makes the reservation the
     * authority on what a stay costs.
     */
    public Optional<ReservationAmountRow> amounts(UUID reservationId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reservationId);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.currency, r.subtotal_minor, r.tax_minor,
                               r.service_charge_minor, r.discount_minor, r.total_minor
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.id = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new ReservationAmountRow(
                        rs.getString("currency"),
                        (Long) rs.getObject("subtotal_minor"),
                        (Long) rs.getObject("tax_minor"),
                        (Long) rs.getObject("service_charge_minor"),
                        (Long) rs.getObject("discount_minor"),
                        (Long) rs.getObject("total_minor")))
                .optional();
    }

    /**
     * Every line of one reservation — doc 53's <em>"same room type, several rooms
     * = ONE line with quantity N"</em>.
     *
     * <p>Ordered by the snapshot name so a multi-room reservation renders the
     * same way twice. Re-applies the ownership join even though the caller has
     * just read the reservation through it: {@code ScopeEnforcementRule} refuses
     * a scoped method that can be called without a scope, and it is right to.
     */
    public List<ReservationLineRow> lines(UUID reservationId, AuthorizationScope scope) {
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
                         WHERE l.reservation_id = ? AND %s
                         ORDER BY l.room_type_name_snapshot
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new ReservationLineRow(
                        rs.getString("room_type_name_snapshot"),
                        rs.getInt("quantity"),
                        (Long) rs.getObject("nightly_price_minor"),
                        (Long) rs.getObject("line_total_minor")))
                .list();
    }

    /**
     * The guest's contact details — the read doc 59:148 gates behind
     * {@code customer.view} and requires to be logged.
     *
     * <p>Kept apart from {@link #byReference} for that reason: the audit
     * obligation attaches to the call that actually discloses, and the list can
     * be served without incurring it.
     */
    public Optional<GuestContactRow> guestContact(String reference, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        List<Object> params = new ArrayList<>();
        params.add(reference);
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT r.guest_email, r.guest_phone, r.guest_country,
                               r.preferred_channel::text AS preferred_channel,
                               r.arrival_time_est, r.special_requests, r.children_ages
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.reference = ? AND %s
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, n) -> new GuestContactRow(
                        rs.getString("guest_email"),
                        rs.getString("guest_phone"),
                        rs.getString("guest_country"),
                        rs.getString("preferred_channel"),
                        rs.getObject("arrival_time_est", LocalTime.class),
                        rs.getString("special_requests"),
                        childrenAges(rs)))
                .optional();
    }

    /** {@code smallint[]}, or null when the column is. Never a fabricated empty list. */
    private static List<Integer> childrenAges(ResultSet rs) throws SQLException {
        java.sql.Array array = rs.getArray("children_ages");
        if (array == null) {
            return null;
        }
        Object[] values = (Object[]) array.getArray();
        List<Integer> ages = new ArrayList<>(values.length);
        for (Object value : values) {
            ages.add(value == null ? null : ((Number) value).intValue());
        }
        return List.copyOf(ages);
    }

    /**
     * The reservation's recorded transitions, oldest first — both lifecycles.
     *
     * <p>{@code field} distinguishes them, exactly as
     * {@code reservation_status_history} does. A SALES row and a STAY row are
     * never merged into one "status changed" entry: doc 54 keeps the two machines
     * apart and so does this.
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

    private static ReservationRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new ReservationRow(
                rs.getObject("id", UUID.class),
                rs.getString("reference"),
                rs.getString("channel_type"),
                rs.getString("ota_reference"),
                rs.getString("stay_status"),
                rs.getObject("check_in", LocalDate.class),
                rs.getObject("check_out", LocalDate.class),
                rs.getInt("adults"),
                rs.getInt("children"),
                rs.getString("guest_name"),
                rs.getString("guest_phone"),
                rs.getString("guest_email"),
                rs.getString("currency"),
                (Long) rs.getObject("total_minor"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getString("property_slug"),
                rs.getString("property_name"),
                rs.getInt("rooms"));
    }

    /**
     * The search criteria — doc 58 §6's
     * {@code ?stayStatus,channelType,property,checkIn,checkOut}, plus the text
     * term, the room type and the second bound on each date.
     *
     * <p>A null field means "not filtered". Absent is not the same as empty.
     *
     * <p>{@code searchContact} is not a filter but a <strong>permission</strong>
     * carried into the query: it decides whether the term is matched against the
     * guest's phone and email at all. The service sets it from the caller's own
     * authorities; no request parameter can reach it.
     */
    public record ReservationSearchFilter(
            String term, boolean searchContact,
            /**
             * One or more `stay_status` values, or null for no filter.
             *
             * <p>A list because the console groups the seven states into four
             * operational questions — see `ReservationSearchService.allOf`. Never
             * empty: empty would read as "match nothing" here, and "no filter" is
             * what an absent parameter means.
             */
            java.util.List<String> stayStatuses,
            String channelType, String propertySlug, String roomTypeSlug,
            LocalDate checkInFrom, LocalDate checkInTo,
            LocalDate checkOutFrom, LocalDate checkOutTo,
            LocalDate bookedFrom, LocalDate bookedTo) {

        public static final ReservationSearchFilter NONE = new ReservationSearchFilter(
                null, false, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * One reservation, as the list and the detail header show it.
     *
     * <p>Carries {@code guestPhone} and {@code guestEmail} because the workspace
     * searches on them; the <em>view</em> withholds both unless the caller holds
     * {@code customer.view}. Carries no {@code sales_status}: this surface
     * belongs to the stay lifecycle.
     */
    public record ReservationRow(
            UUID reservationId, String reference, String channelType, String otaReference,
            String stayStatus, LocalDate checkIn, LocalDate checkOut, int adults, int children,
            String guestName, String guestPhone, String guestEmail,
            String currency, Long totalMinor, OffsetDateTime createdAt,
            String propertySlug, String propertyName, int rooms) {
    }

    /** The reservation's own money columns. Nothing derived. */
    public record ReservationAmountRow(
            String currency, Long subtotalMinor, Long taxMinor, Long serviceChargeMinor,
            Long discountMinor, Long totalMinor) {
    }

    /** One booked room type, from the line's own snapshot. */
    public record ReservationLineRow(
            String roomTypeName, int quantity, Long nightlyPriceMinor, Long lineTotalMinor) {
    }

    /** Guest contact detail — disclosed only through the audited path. */
    public record GuestContactRow(
            String email, String phone, String country, String preferredChannel,
            LocalTime arrivalTimeEst, String specialRequests, List<Integer> childrenAges) {
    }

    /** One recorded transition, either lifecycle. */
    public record StatusEventRow(
            String field, String fromStatus, String toStatus, String actorType,
            String reason, String note, OffsetDateTime at) {
    }
}
