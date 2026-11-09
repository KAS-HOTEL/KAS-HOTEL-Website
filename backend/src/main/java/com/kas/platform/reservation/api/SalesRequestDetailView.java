package com.kas.platform.reservation.api;

import com.kas.platform.shared.Money;

import java.util.List;

/**
 * One direct request, opened — doc 58 §5 <em>"Full workspace"</em>.
 *
 * <h2>Guest contact is conditional, and audited when present</h2>
 *
 * {@link #guest} is <strong>null unless the caller holds {@code customer.view}</strong>.
 * Doc 59:148 is explicit — <em>"{@code customer.view} … <strong>Audited</strong> —
 * staff access to guest data is logged"</em> — so the field is not simply
 * permission-gated: the read that returns it writes an {@code audit_log} row
 * naming the actor and the reservation. A caller without the permission gets the
 * same request with the guest block absent, rather than a refusal, because the
 * rest of the workspace is legitimately theirs to see.
 *
 * <h2>Still absent</h2>
 *
 * The price snapshot, rule identifiers, idempotency key and request fingerprint.
 * The snapshot is the reservation's internal commercial record (doc 125) and is
 * not a partner-facing document; the rest are on doc 58 §9's INTERNAL denylist or
 * are submission credentials.
 *
 * <h2>The timeline carries no actor identity</h2>
 *
 * {@link Event} reports {@code actorType} — whether a person or the system moved
 * the request — and never the {@code actor_id} the history stores.
 * {@code app_user} has no name column, its only human-readable identifier is an
 * email address, and no frozen document permits disclosing staff identity between
 * colleagues. Doc 134 §5 recorded that as an open question when it blocked the
 * assignment UI, and this view does not settle it by the back door.
 *
 * <h2>No actions</h2>
 *
 * There is no {@code allowedTransitions}, no {@code canAccept} and no
 * {@code canDecline}. What a caller may do next is decided by the server when
 * they try it, and advertising an action it would refuse is worse than showing
 * none.
 */
public record SalesRequestDetailView(
        SalesRequestSummaryView summary,
        List<Line> lines,
        /** Null when the caller does not hold {@code customer.view}. */
        Guest guest,
        List<Event> timeline,
        /** The latest alternative stay proposed for this request, or null (2026-11-07). */
        AlternativeOffer alternativeOffer) {

    /** The pre-2026-11-07 shape, without the alternative offer. */
    public SalesRequestDetailView(SalesRequestSummaryView summary, List<Line> lines, Guest guest,
                                  List<Event> timeline) {
        this(summary, lines, guest, timeline, null);
    }

    /**
     * What KAS suggested when it could not take the request. Informational only: nothing
     * is held, and the guest sends a new request on the website to take it up.
     */
    public record AlternativeOffer(
            String propertyName,
            String roomTypeName,
            java.time.LocalDate checkIn,
            java.time.LocalDate checkOut,
            int quantity,
            Money total,
            String message,
            java.time.OffsetDateTime sentAt) {
    }

    /**
     * One recorded transition — a row of {@code reservation_status_history}.
     *
     * <p>{@code field} is {@code SALES} or {@code STAY}: a reservation carries two
     * status machines and doc 54 never conflates them. {@code fromStatus} is null
     * on the first row of a lifecycle — a request did not come from somewhere, it
     * began.
     *
     * <p>{@code actorType} and no actor id, for the reason above.
     */
    public record Event(
            String field,
            String fromStatus,
            String toStatus,
            String actorType,
            String reason,
            String note,
            java.time.OffsetDateTime at) {
    }

    /** One requested room type, from the line's own name and price snapshot. */
    public record Line(
            String roomTypeName,
            int quantity,
            /**
             * The line's nightly rate, or <strong>null when the nights differ</strong>
             * — doc 125 §9. A null here is the honest record that one figure cannot
             * represent the stay, never a missing value.
             */
            Money nightly,
            Money lineTotal) {
    }

    /**
     * The guest, as they submitted themselves.
     *
     * <p>{@code customerId} is intentionally not exposed. Anonymous bookings may
     * leave the reservation link NULL, while authenticated bookings may link a
     * customer account; guest contact details remain the booking-time record.
     */
    public record Guest(
            String fullName,
            String email,
            String phone,
            String country,
            String preferredChannel,
            String specialRequests) {
    }
}
