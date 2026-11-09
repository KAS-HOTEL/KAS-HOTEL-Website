package com.kas.platform.reservation.api;

import com.kas.platform.shared.Money;

import java.time.LocalTime;
import java.util.List;

/**
 * One reservation, opened — doc 58 §6, <em>"Full detail, any channel"</em>.
 *
 * <h2>Any channel, one shape</h2>
 *
 * A DIRECT reservation and an OTA reservation are the same entity (doc 53), so
 * they are the same document here. What differs between them differs in the
 * <em>values</em> — {@code channelType}, {@code otaReference}, and a
 * {@code stayStatus} that an OTA row has from the moment it is recorded — never
 * in the fields.
 *
 * <h2>No sales lifecycle, and no actions</h2>
 *
 * There is no {@code salesStatus}, no {@code allowedTransitions}, no
 * {@code canCancel}. This is a read: doc 58 §6's mutations are separate routes
 * that are not implemented, and the DIRECT sales transitions belong to
 * {@code /admin/sales/requests} where their guards live. Advertising an action
 * the server would refuse is worse than showing none.
 *
 * <h2>Guest contact is conditional, and audited when present</h2>
 *
 * {@link #guest} is <strong>null unless the caller holds
 * {@code customer.view}</strong>, and the read that returns it writes an
 * {@code audit_log} row naming the actor and the reservation — doc 59:148.
 * A caller without the permission gets the same document with the guest block
 * absent rather than a refusal, because the rest of it is legitimately theirs.
 *
 * <h2>Still absent</h2>
 *
 * The price snapshot, rule identifiers and idempotency key — doc 58 §9's
 * INTERNAL denylist. And <strong>no payment</strong>: V15's table exists but no
 * repository, service or route reads it, so a payment block here would be a
 * field this application cannot fill.
 */
public record ReservationDetailView(
        ReservationSummaryView summary,
        List<Line> lines,
        /** The authoritative breakdown, from the reservation's own columns. */
        Amounts amounts,
        /** Null when the caller does not hold {@code customer.view}. */
        Guest guest,
        List<Event> timeline) {

    /**
     * One booked room type, from the line's own name and price snapshot.
     *
     * <p>A reservation for two Deluxe rooms and one Double is <strong>two</strong>
     * lines with quantities 2 and 1 — V12's {@code reservation_line_unique} makes
     * one line per room type, and the quantity is the count. Collapsing them into
     * a single "room" would misreport what was booked.
     *
     * <p>The name is {@code room_type_name_snapshot}: a booking made in September
     * shows the September name even after a rename, which is the entire reason
     * the column exists.
     */
    public record Line(
            String roomTypeName,
            int quantity,
            /**
             * The line's nightly rate, or <strong>null when the nights differ</strong>
             * — doc 125 §9. A null is the honest record that one figure cannot
             * represent the stay, and must never be shown as a zero.
             */
            Money nightly,
            Money lineTotal) {
    }

    /**
     * What the stay costs, as the reservation records it.
     *
     * <p>Every figure is a column. Nothing here is summed, and a client must not
     * sum them either: doc 125 makes the reservation the authority, and a screen
     * that recomputed a total could disagree with the record it is displaying.
     *
     * <p>{@code tax} and {@code serviceCharge} are null on the reservations this
     * application creates — doc 99 §12 puts tax outside V1 and
     * {@code TaxIsOutOfScopeForV1Test} enforces it. Null is that absence, not a
     * zero charge.
     */
    public record Amounts(
            Money subtotal,
            Money tax,
            Money serviceCharge,
            Money discount,
            Money total) {
    }

    /**
     * The guest, as they submitted themselves.
     *
     * <p>{@code customerId} is intentionally not exposed. Anonymous bookings
     * leave {@code reservation.customer_id} NULL, while authenticated bookings
     * can link it to the customer's account; in both cases the contact details
     * on the reservation are the booking-time guest record.
     */
    public record Guest(
            String fullName,
            String email,
            String phone,
            String country,
            String preferredChannel,
            /** {@code arrival_time_est}, when the guest gave one. */
            LocalTime arrivalTimeEst,
            String specialRequests,
            /**
             * One age per child, or null when none was recorded.
             *
             * <p>V12's {@code reservation_children_ages_match} makes the array's
             * length equal {@code children}, so this is never a partial list.
             */
            List<Integer> childrenAges) {
    }

    /**
     * One recorded transition — a row of {@code reservation_status_history}.
     *
     * <p>{@code field} is {@code SALES} or {@code STAY}: a reservation carries two
     * status machines and doc 54 never conflates them, so neither does the
     * timeline. {@code fromStatus} is null on the first row of a lifecycle — a
     * reservation did not come from somewhere, it began.
     *
     * <p>{@code actorType} and no actor id. {@code app_user} has no name column,
     * its only human-readable identifier is an email address, and no frozen
     * document permits disclosing staff identity between colleagues (doc 134 §5).
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
}
