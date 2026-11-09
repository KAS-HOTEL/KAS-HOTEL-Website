package com.kas.platform.property;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The customer-facing room <em>product</em> — doc 52 §3.2. Not a physical room
 * and not a rate.
 *
 * <p>A property may have any number of these; nothing in the schema or here caps
 * it (phase brief §10).
 *
 * <p>The display name is deliberately absent from this record: it lives in
 * {@code room_type_translation} and is <strong>Partner-authored free text</strong>
 * (brief §10.1). "Deluxe King" is not an enum value, and forcing one would stop a
 * Partner naming a room the way they sell it.
 *
 * <p>No field here can hold a room number, a floor or a unit id — doc 52 §3.2:
 * "No field capable of holding a room number exists."
 */
public record RoomType(
        UUID id,
        UUID propertyId,
        String slug,
        RoomTypeStatus status,
        BigDecimal areaSqm,
        int maxAdults,
        int maxChildren,
        int maxOccupancy,
        String viewType,
        boolean smoking,
        int sortOrder,
        /**
         * Optimistic concurrency for MASTER updates — doc 58 §2.
         *
         * <p>The column has existed since V5 and {@code PATCH} has required a
         * matching value since Phase 7.5B, but it was never on this record — so
         * the token the update endpoint demanded could not be read by anyone who
         * had to supply it. Added when the authoring form needed it (Step 8).
         */
        int version) {
}
