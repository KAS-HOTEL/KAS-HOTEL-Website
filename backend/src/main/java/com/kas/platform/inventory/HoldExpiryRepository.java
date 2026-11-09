package com.kas.platform.inventory;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * The expiry sweep's queries — doc 55 §5.1, S13.
 *
 * <h2>Why this repository carries no {@code AuthorizationScope}</h2>
 *
 * Every other repository over partner-owned data implements {@code ScopedRepository}
 * and takes a scope, because it serves a <em>caller</em> whose reach must be
 * checked. This one serves no caller. It is a system sweep — doc 54 gives S13
 * the actor <strong>Y</strong> — and by design it must reach every partner's
 * expired holds, so there is no scope to apply and none to forget. Handing it a
 * synthetic global scope would dress an unscoped job up as a scoped one and make
 * the guard mean less everywhere else.
 *
 * <p>What replaces the scope is that <strong>nothing here takes an identifier
 * from outside</strong>. The reservation ids come from
 * {@link #reservationsWithExpiredHolds}, which is this class's own query, and
 * every subsequent statement is bounded by one of them.
 *
 * <h2>Idempotent by predicate</h2>
 *
 * Doc 55 §5.1: <em>"a hold already EXPIRED/RELEASED/CONVERTED is skipped, so a
 * re-run cannot double-decrement."</em> That is not a flag or a lock file — it is
 * {@code status = 'ACTIVE'} on every statement below. A second worker that
 * reaches the same reservation finds nothing ACTIVE and decrements nothing.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class HoldExpiryRepository {

    private final JdbcClient jdbc;

    public HoldExpiryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Reservations holding at least one expired ACTIVE hold — doc 55 §5.1's
     * {@code SELECT … WHERE status = 'ACTIVE' AND expires_at < now()}, grouped by
     * reservation as the sweep specifies.
     *
     * <p>{@code now()} is the transaction timestamp, so every hold in one sweep
     * pass is judged against a single instant.
     *
     * <p>The predicate is exactly {@code hold_expiry_sweep_idx}'s — a partial
     * index on {@code (expires_at) WHERE status = 'ACTIVE'} — so this reads the
     * index rather than scanning the table. The index is used as it stands and
     * was not altered.
     *
     * <p>{@code reservation_id IS NOT NULL} excludes {@code ALTERNATIVE_OFFER}
     * holds attached to an inquiry instead of a reservation. Doc 55 §5.1 groups
     * "by reservation/inquiry"; the inquiry half has no S7 to create it and no
     * transition of its own here, so this sweep handles the reservation half and
     * leaves inquiry holds alone rather than half-processing them.
     */
    public List<UUID> reservationsWithExpiredHolds(int limit) {
        return jdbc.sql("""
                        SELECT DISTINCT h.reservation_id
                          FROM inventory_hold h
                         WHERE h.status = 'ACTIVE'
                           AND h.expires_at < now()
                           AND h.reservation_id IS NOT NULL
                         LIMIT :limit
                        """)
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    /**
     * Locks the inventory nights this reservation's expired holds occupy.
     *
     * <p>{@code ORDER BY room_type_id, date} — doc 55 §5.1 states the order, and
     * it is the same one S1, the availability check and the release paths use, so
     * the sweep cannot deadlock against a guest booking or an agent's action.
     *
     * <p>This is also the serialisation point against a concurrent WIN or CANCEL:
     * both lock the same rows in the same order, so one of them waits, and the
     * loser then finds no ACTIVE hold left to act on.
     */
    public int lockNightsOfExpiredHolds(UUID reservationId) {
        return jdbc.sql("""
                        SELECT i.date
                          FROM room_type_inventory_day i
                          JOIN inventory_hold h
                            ON h.room_type_id = i.room_type_id AND h.date = i.date
                         WHERE h.reservation_id = :reservationId
                           AND h.status = 'ACTIVE'
                           AND h.expires_at < now()
                         ORDER BY i.room_type_id, i.date
                           FOR UPDATE OF i
                        """)
                .param("reservationId", reservationId)
                .query(java.sql.Date.class)
                .list()
                .size();
    }

    /**
     * Gives the nights back — doc 55 §5.1's {@code direct_committed -= quantity}.
     *
     * <p>Runs <strong>before</strong> {@link #expireHolds}, because it reads
     * {@code status = 'ACTIVE'}: expiring first would leave the cache permanently
     * high. The same ordering S11 and S12 use.
     *
     * <p>The {@code direct_committed >= 0} CHECK stays authoritative — a
     * decrement that would go negative fails the transaction rather than being
     * clamped, so a double-decrement bug becomes a loud failure and never a
     * silent oversell.
     */
    public int releaseExpiredFromDirectCommitted(UUID reservationId) {
        return jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET direct_committed = i.direct_committed - h.quantity,
                               updated_at = now()
                          FROM inventory_hold h
                         WHERE h.reservation_id = :reservationId
                           AND h.status = 'ACTIVE'
                           AND h.expires_at < now()
                           AND i.room_type_id = h.room_type_id
                           AND i.date = h.date
                        """)
                .param("reservationId", reservationId)
                .update();
    }

    /**
     * {@code ACTIVE → EXPIRED} — doc 55 §5.1's
     * {@code hold.status = 'EXPIRED', released_at = now()}.
     *
     * <p>{@code EXPIRED}, not {@code RELEASED}: {@code hold_status} carries both,
     * and an expiry is not a release by an agent. {@code released_at} is set
     * because {@code hold_released_has_timestamp} requires every non-ACTIVE hold
     * to carry one — it is the moment the hold left ACTIVE, which is what that
     * CHECK has always meant.
     *
     * <p>{@code expires_at} is <strong>not</strong> written. It is the reason
     * this row was swept and stays exactly as it was.
     *
     * @return the number of hold nights expired
     */
    public int expireHolds(UUID reservationId, String reason) {
        return jdbc.sql("""
                        UPDATE inventory_hold h
                           SET status = 'EXPIRED',
                               released_at = now(),
                               release_reason = :reason
                         WHERE h.reservation_id = :reservationId
                           AND h.status = 'ACTIVE'
                           AND h.expires_at < now()
                        """)
                .param("reservationId", reservationId)
                .param("reason", reason)
                .update();
    }

    /**
     * Doc 55 §5.1's condition for the reservation transition: <em>"if this was
     * the last REQUEST hold on a reservation"</em>.
     *
     * <p>Counted after the expiry, so a reservation still holding a live REQUEST
     * hold — one placed later, or one not yet expired — keeps its sales status.
     * Only {@code REQUEST} holds count: an {@code ALTERNATIVE_OFFER} hold is S7's
     * and does not keep a request alive.
     */
    public int activeRequestHoldCount(UUID reservationId) {
        return jdbc.sql("""
                        SELECT count(*)
                          FROM inventory_hold
                         WHERE reservation_id = :reservationId
                           AND hold_type = 'REQUEST'
                           AND status = 'ACTIVE'
                        """)
                .param("reservationId", reservationId)
                .query(Integer.class)
                .single();
    }

    /**
     * Reads the sales status under a row lock, so the S13 decision is made
     * against a reservation no other transaction can move underneath it.
     *
     * <p>Returns empty for an OTA reservation, which has no {@code sales_status}
     * at all and no sales lifecycle to expire.
     */
    public java.util.Optional<String> lockSalesStatus(UUID reservationId) {
        return jdbc.sql("""
                        SELECT sales_status::text
                          FROM reservation
                         WHERE id = :reservationId
                           AND channel_type = 'DIRECT'
                           FOR UPDATE
                        """)
                .param("reservationId", reservationId)
                .query(String.class)
                .optional();
    }

    /**
     * S13's reservation write — doc 54: {@code any non-terminal → EXPIRED}.
     *
     * <p>The {@code NOT IN} list is the terminal set, applied <em>in the
     * statement</em>. Combined with the {@code FOR UPDATE} above it, a
     * reservation that reached WON, DECLINED or CANCELLED between the sweep's
     * first query and this update is not moved: doc 54 freezes
     * {@code salesStatus} at its terminal value, and this is where that survives
     * a race.
     */
    public int expireReservation(UUID reservationId) {
        return jdbc.sql("""
                        UPDATE reservation
                           SET sales_status = 'EXPIRED',
                               updated_at = now()
                         WHERE id = :reservationId
                           AND channel_type = 'DIRECT'
                           AND sales_status NOT IN ('WON', 'DECLINED', 'CANCELLED', 'EXPIRED')
                        """)
                .param("reservationId", reservationId)
                .update();
    }

    /**
     * The transition's durable record, written as {@code SYSTEM}.
     *
     * <p>{@code clock_timestamp()} rather than the column's {@code now()}
     * default: {@code now()} is the transaction timestamp, and a log whose rows
     * all share one instant cannot be ordered.
     *
     * <p>Doc 54 gives S13 the actor <strong>Y</strong> — nobody did this, a timer
     * did. {@code actor_id} is null and {@code actor_type} is {@code SYSTEM},
     * which is exactly what that enum value exists for. Attributing the row to
     * whichever user happened to be around would be a false record.
     */
    public int insertExpiryHistory(UUID reservationId, String fromStatus, String note) {
        return jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_id, actor_type,
                             reason, note, created_at)
                        VALUES (:reservationId, 'SALES', :fromStatus, 'EXPIRED', NULL, 'SYSTEM',
                                NULL, :note, clock_timestamp())
                        """)
                .param("reservationId", reservationId)
                .param("fromStatus", fromStatus)
                .param("note", note)
                .update();
    }
}
