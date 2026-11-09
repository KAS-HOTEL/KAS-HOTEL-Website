package com.kas.platform.reservation.api;

import com.kas.platform.shared.Money;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * One row of the direct sales queue — doc 58 §5, doc 69 §4.2.
 *
 * <h2>What is deliberately absent</h2>
 *
 * No reservation {@code id}: doc 85 §11 row 7 makes the <strong>reference</strong>
 * the addressable identifier, and exposing the surrogate key would invite a
 * second way to address a record that the ownership check would then have to
 * cover twice.
 *
 * <p>No {@code priceSnapshot}, no {@code ruleId}, no {@code appliedRuleIds}, no
 * idempotency key and no request fingerprint. Those are internal — doc 58 §9
 * puts the rate identifiers on the INTERNAL denylist, and the idempotency key
 * and fingerprint are credentials of a submission, not facts about a booking.
 *
 * <p><strong>No guest contact detail.</strong> The queue carries the guest's
 * name because a queue without one cannot be worked, and nothing else. Doc
 * 59:148 gates guest data behind {@code customer.view} and requires that access
 * be logged; that obligation belongs to the detail read, which discloses it —
 * see {@link SalesRequestDetailView}.
 *
 * <p>No {@code salesOwner}: the assignment transition (S2) is not implemented,
 * so the field would be NULL on every row and would suggest a control that does
 * not exist.
 */
public record SalesRequestSummaryView(
        String reference,
        /** The frozen {@code salesStatus}, guest-free vocabulary — {@code REQUESTED} at S1. */
        String salesStatus,

        /**
         * Where the enquiry came from — {@code lead_source} (V1:39).
         *
         * <p>Doc 69 §4.2 makes it <em>"a first-class column, not a detail"</em>:
         * <em>"an agent should see at a glance where the morning's enquiries came
         * from."</em>
         *
         * <p><strong>Never null on this surface.</strong> V12's
         * {@code reservation_channel_invariant} requires
         * {@code channel_type = 'DIRECT' AND lead_source IS NOT NULL}, and doc 58
         * §5 scopes this API to DIRECT at the data layer, so every row it can
         * return carries one.
         *
         * <p>Doc 58 §9 lists {@code leadSource} among INTERNAL fields — internal
         * to the <strong>guest</strong>. The public denylist enforces that against
         * the public packages; this is the partner's own workspace, where doc 69
         * puts it on the front page. The same list contains {@code salesStatus},
         * which this view has always returned for the same reason.
         */
        String leadSource,
        String propertySlug,
        String propertyName,
        LocalDate checkIn,
        LocalDate checkOut,
        int nights,
        int adults,
        int children,
        /** Total rooms across every line — doc 69 §4.2's "Rooms" column. */
        int rooms,
        String guestName,
        OffsetDateTime requestedAt,
        /**
         * {@code requested_at + A6}. The deadline itself, never the config value:
         * doc 117 §9 makes A6 the single source and the client renders, it does
         * not recompute.
         */
        OffsetDateTime slaDueAt,
        /** The reservation's own total. Null only if the row predates a priced request. */
        Money total) {
}
