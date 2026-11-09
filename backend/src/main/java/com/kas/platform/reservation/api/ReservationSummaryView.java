package com.kas.platform.reservation.api;

import com.kas.platform.shared.Money;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * One row of the reservation workspace — doc 58 §6,
 * {@code GET /admin/ops/reservations}.
 *
 * <h2>{@code stayStatus}, and deliberately no {@code salesStatus}</h2>
 *
 * Doc 58 §6 is explicit: <em>"All channels. Queries use {@code stayStatus}."</em>
 * V12 makes {@code sales_status} DIRECT-only and NULL for every OTA row, so a
 * {@code salesStatus} field here would be empty on half the list and would
 * invite a single "status" column that conflated two independent lifecycles —
 * the exact thing doc 53's <em>one entity, two lifecycles</em> forbids. The
 * sales lifecycle has its own surface, {@link SalesRequestSummaryView}.
 *
 * <p>{@code stayStatus} is <strong>null until the stay is confirmed</strong>,
 * which V12's own column comment states. A null is that fact, not a missing
 * value, and must not be rendered as a status.
 *
 * <h2>Guest contact is conditional</h2>
 *
 * {@link #guestPhone} and {@link #guestEmail} are <strong>null unless the caller
 * holds {@code customer.view}</strong>, and the search that returns them writes
 * one {@code audit_log} row — doc 59:148 requires that staff access to guest
 * data be logged. {@link #guestName} is always present, for the same reason the
 * sales queue carries it: a list of reservations nobody can be identified in
 * cannot be worked.
 *
 * <h2>What is absent</h2>
 *
 * No reservation {@code id}, no {@code propertyId}, no {@code priceSnapshot}, no
 * rule identifiers, no idempotency key. Doc 85 §11 row 7 makes the
 * <strong>reference</strong> the addressable identifier; the rest are on doc 58
 * §9's INTERNAL denylist or are submission credentials.
 */
public record ReservationSummaryView(
        String reference,
        /** {@code DIRECT} or {@code OTA} — the real {@code channel_type} column. */
        String channelType,
        /**
         * The partner's own reference at the OTA, or null.
         *
         * <p>Never null for an OTA row and always null for a DIRECT one: V12's
         * constraints 3 and 4 make both true at the database. It is the
         * operator's own booking number with their channel — the identifier they
         * would quote in a dispute — and carries no provider credential.
         */
        String otaReference,
        /** Null until the stay is confirmed. Not a status; the absence of one. */
        String stayStatus,
        String propertySlug,
        String propertyName,
        LocalDate checkIn,
        LocalDate checkOut,
        int nights,
        int adults,
        int children,
        /** Total rooms across every line — a multi-line reservation sums here, once. */
        int rooms,
        String guestName,
        /** Null unless the caller holds {@code customer.view}. */
        String guestPhone,
        /** Null unless the caller holds {@code customer.view}. */
        String guestEmail,
        /**
         * When the reservation was created in KAS.
         *
         * <p>The one booking timestamp every channel has: {@code requested_at} is
         * DIRECT's and {@code ota_received_at} is OTA's, and V12 leaves both
         * nullable. This is the column the list is ordered and date-filtered by,
         * so what the screen sorts on and what it shows are the same fact.
         */
        OffsetDateTime createdAt,
        /** The reservation's own total. Null only where the record has none. */
        Money total) {
}
