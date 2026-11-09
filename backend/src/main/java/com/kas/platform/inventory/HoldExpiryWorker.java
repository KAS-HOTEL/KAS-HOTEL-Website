package com.kas.platform.inventory;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.shared.CorrelationId;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One reservation's expiry, in one transaction — doc 55 §5.1's inner block.
 *
 * <h2>Why this is a separate bean and not a method on the service</h2>
 *
 * It was a method on {@link HoldExpiryService}, and the concurrency test caught
 * that it did not work: {@code sweep()} called it directly, and a self-invocation
 * does not pass through Spring's proxy, so {@code @Transactional} never applied.
 * Every statement ran in its own auto-commit transaction, which released the
 * reservation lock the instant the {@code SELECT … FOR UPDATE} returned — and two
 * sweep workers then both decremented {@code direct_committed}.
 *
 * <p>Injecting the boundary as its own bean is what makes the annotation real.
 * The transaction is the unit of correctness here, so it gets a type of its own
 * rather than an annotation that silently does nothing.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class HoldExpiryWorker {

    private static final String EXPIRED = "EXPIRED";
    private static final String ENTITY = "reservation";
    private static final String EXPIRED_ACTION = "reservation.expired";
    private static final String HOLD_EXPIRY_REASON = "Request hold expired (S13)";

    /** Doc 54 §4 — the terminal values {@code salesStatus} freezes at. */
    private static final Set<String> TERMINAL =
            Set.of("WON", "DECLINED", "CANCELLED", EXPIRED);

    private final HoldExpiryRepository holds;
    private final AuditLogger audit;

    public HoldExpiryWorker(HoldExpiryRepository holds, AuditLogger audit) {
        this.holds = holds;
        this.audit = audit;
    }

    /**
     * Expires one reservation's due holds.
     *
     * @return the number of hold nights expired, zero if another transaction got there first
     */
    @Transactional
    public int expireOne(UUID reservationId) {
        // THE RESERVATION ROW FIRST. Win, decline and cancel all open with
        // SELECT … FOR UPDATE on this same row, so taking it here makes the
        // reservation the single point where every terminal transition
        // serialises — including two sweep workers against each other.
        //
        // Locking only the inventory rows is not enough, and a test proved it: in
        // READ COMMITTED an UPDATE that blocks on a row lock re-evaluates its
        // predicate for the TARGET table only. The decrement joins
        // inventory_hold, so after unblocking it could still read a hold as
        // ACTIVE from a stale snapshot and decrement a second time. The
        // direct_committed >= 0 CHECK caught that rather than letting the
        // property be credited with a room nobody returned.
        String from = holds.lockSalesStatus(reservationId).orElse(null);
        if (from == null) {
            // An OTA reservation, or one deleted since the batch was selected.
            // Neither has a sales lifecycle to expire.
            return 0;
        }

        holds.lockNightsOfExpiredHolds(reservationId);
        holds.releaseExpiredFromDirectCommitted(reservationId);
        int expired = holds.expireHolds(reservationId, HOLD_EXPIRY_REASON);
        if (expired == 0) {
            // Another worker swept it, or a win or cancel took the holds, while
            // this transaction waited for the lock. Nothing was decremented here,
            // so nothing is owed.
            return 0;
        }

        // Doc 55 §5.1 — the reservation moves only when its last REQUEST hold has
        // gone. Counted after the expiry, so a still-live hold keeps it open.
        if (holds.activeRequestHoldCount(reservationId) == 0) {
            expireReservation(reservationId, from, expired);
        }
        return expired;
    }

    /**
     * S13's status transition, applied only where doc 54 permits it.
     *
     * <p>The status was read under {@code FOR UPDATE} above, and the update
     * carries the terminal exclusion itself. A reservation that reached WON,
     * DECLINED or CANCELLED first keeps that value: doc 54 freezes
     * {@code salesStatus} at its terminal value, and a sweep is not an exception.
     * The history and audit rows are written only when the update actually moved
     * something, so the trail never records a transition that did not happen.
     */
    private void expireReservation(UUID reservationId, String from, int expiredNights) {
        if (TERMINAL.contains(from)) {
            return;
        }
        if (holds.expireReservation(reservationId) == 0) {
            return;
        }

        holds.insertExpiryHistory(reservationId, from,
                "Request hold expired without resolution. " + expiredNights
                        + " hold night(s) expired (S13).");

        // actorId and actorRole are null: doc 54 gives S13 the actor "Y". A timer
        // did this, and the audit row says so rather than naming a person.
        audit.record(new AuditEvent(
                null, null, EXPIRED_ACTION, ENTITY, reservationId,
                Map.of("salesStatus", from),
                Map.of("salesStatus", EXPIRED, "holdNightsExpired", expiredNights),
                null, null, null, CorrelationId.current(), "SYSTEM"));
    }
}
