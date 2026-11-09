package com.kas.platform.property;

import java.math.BigDecimal;
import java.util.List;

/**
 * A room type as a guest sees it.
 *
 * <p>Carries occupancy and dimensions, and nothing about inventory. Doc 58 §3.2
 * permits exactly one inventory figure on the public surface —
 * {@code availableQuantity}, computed per date range — and this type has no
 * field able to hold {@code total}, {@code reserved}, {@code otaAllotment} or a
 * buffer. Availability arrives with the availability endpoint, not with the
 * room description.
 *
 * <p>No {@code id}, no room number, no floor, no unit id.
 */
public record PublishedRoomType(
        String slug,
        String name,
        int maxAdults,
        int maxChildren,
        int maxOccupancy,
        BigDecimal areaSqm,
        String viewType,

        /**
         * Whether smoking is permitted. Added in STEP I: it is a
         * {@code NOT NULL} column on the row this query already reads, and it is
         * one of the first things a guest checks before choosing a room.
         */
        boolean smoking,

        /**
         * The Partner's own one-line description for this locale, when written.
         * {@code null} rather than a stand-in: a room with no description shows
         * its facts, not a sentence somebody else composed.
         */
        String shortDescription,

        /**
         * The bed arrangements, in the Partner's order. Empty when none has been
         * recorded — which is a real state for a room type mid-onboarding, and
         * not one to paper over with "1 giường".
         */
        List<PublishedBed> beds,
        /** The website's own id for this room type (h01-r1 …); null for one it never had. */
        String frontendKey,
        String bedDescription,
        Boolean breakfastIncluded,
        String longDescription) {
}
