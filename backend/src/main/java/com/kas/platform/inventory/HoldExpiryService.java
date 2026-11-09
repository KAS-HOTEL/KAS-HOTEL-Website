package com.kas.platform.inventory;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * S13 — the expiry sweep. Doc 55 §5.1, doc 54 §4 S13.
 *
 * <h2>The frozen algorithm, in order</h2>
 *
 * Doc 55 §5.1 states it as pseudocode and this follows it step for step: select
 * the expired ACTIVE holds, group by reservation, and for each group open a
 * transaction that locks the affected inventory nights in
 * {@code (room_type_id, date)} order, decrements {@code direct_committed}, marks
 * the holds {@code EXPIRED} with a {@code released_at}, and — <em>"if this was
 * the last REQUEST hold on a reservation"</em> — moves the sales status to
 * {@code EXPIRED}. The per-reservation half is {@link HoldExpiryWorker}.
 *
 * <h2>One transaction per reservation, not one per sweep</h2>
 *
 * The grouping is the unit of work doc 55 specifies, and it is what keeps the
 * sweep safe: one reservation whose transaction fails does not roll back the
 * others, and no single transaction holds locks across unrelated properties
 * while it works.
 *
 * <h2>Nothing is sent</h2>
 *
 * Doc 55 §5.1 ends with <em>"after commit: notify guest and sales owner"</em>,
 * and doc 54 S13's notification column adds a warning before expiry. Neither is
 * delivered here. Doc 117 §8.1 freezes that a transition owes the business
 * effect and the durable record but <strong>not</strong> delivery, which is
 * <strong>OQ-162</strong> — still open, with no mail sender in the codebase. The
 * record this writes is what a notifier would later read; nothing here claims
 * anything was sent.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class HoldExpiryService {

    /**
     * How many reservations one pass may touch.
     *
     * <p>Doc 55 §5.1 says "batch" without a number. This is a memory bound, not a
     * business rule: the sweep runs again on the next tick and picks up whatever
     * it did not reach, because the predicate is time-based and self-renewing.
     * Deliberately not a setting — no owner input is owed for it.
     */
    private static final int BATCH_LIMIT = 500;

    private final HoldExpiryRepository holds;
    private final HoldExpiryWorker worker;

    public HoldExpiryService(HoldExpiryRepository holds, HoldExpiryWorker worker) {
        this.holds = holds;
        this.worker = worker;
    }

    /**
     * One sweep pass.
     *
     * <p>Deliberately <strong>not</strong> {@code @Transactional}: the selection
     * is a plain read and each reservation gets its own transaction inside
     * {@link HoldExpiryWorker}. A single transaction spanning the whole batch
     * would hold every affected property's inventory locks until the last one
     * finished.
     *
     * <p>The worker is injected rather than being a method here, because a
     * self-invocation would bypass Spring's proxy and the transaction would not
     * exist at all — see {@link HoldExpiryWorker}.
     *
     * @return the number of reservations whose holds were expired
     */
    public int sweep() {
        List<UUID> reservations = holds.reservationsWithExpiredHolds(BATCH_LIMIT);
        int swept = 0;
        for (UUID reservationId : reservations) {
            if (worker.expireOne(reservationId) > 0) {
                swept++;
            }
        }
        return swept;
    }
}
