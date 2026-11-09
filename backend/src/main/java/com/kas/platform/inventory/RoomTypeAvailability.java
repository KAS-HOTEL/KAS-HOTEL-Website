package com.kas.platform.inventory;

import java.util.UUID;

/**
 * How many rooms of one type can be sold for a whole stay.
 *
 * <p>Doc 55 §3.1: "Guest-facing availability for a stay is the <strong>minimum of
 * {@code availableDirect} across every night</strong> — never the first night,
 * never an average." Doc 15 §4.1 says the same and explains why: "Showing
 * anything else would advertise capacity that does not exist for the whole stay."
 *
 * @param coveredNights how many nights of the requested range have an inventory
 *                      row at all. Fewer than the nights requested means the
 *                      stay is not sellable — doc 15 §12, missing rows fail closed
 * @param availableForWholeStay already folded into {@code availableQuantity}; a
 *                      partial-coverage stay reports zero, not a partial number
 */
public record RoomTypeAvailability(
        UUID roomTypeId,
        String roomTypeSlug,
        int availableQuantity,
        int coveredNights,
        int requestedNights,
        int maxAdults,
        int maxChildren,
        int maxOccupancy) {

    public boolean availableForWholeStay() {
        return coveredNights == requestedNights && availableQuantity > 0;
    }
}
