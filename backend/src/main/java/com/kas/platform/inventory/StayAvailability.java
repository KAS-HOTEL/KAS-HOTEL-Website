package com.kas.platform.inventory;

import com.kas.platform.shared.Money;

import java.util.UUID;

/**
 * Whole-stay availability and price for one room type.
 *
 * <p>Internal to the {@code inventory} module. The guest-facing shape is
 * {@code inventory.api.RoomTypeAvailabilityView}, which is what doc 58 §3.2
 * freezes and what the doc 58 §9 denylist scanner checks; this type carries the
 * room type id and so must never be returned from a public endpoint.
 *
 * @param maxQuantitySelectable doc 58 §3.2 — {@code min(available, config B15)}
 * @param nightlyFrom the lowest nightly rate across the stay. Never null on a
 *                    sellable room type: {@link AvailabilityService} drops any
 *                    room type it cannot price, because an unpriced room is not
 *                    sellable (doc 56 §9, config B6 OPEN)
 */
public record StayAvailability(
        UUID roomTypeId,
        String roomTypeSlug,
        String name,
        int availableQuantity,
        int maxQuantitySelectable,
        Money nightlyFrom,
        boolean availableForWholeStay,
        int maxAdults,
        int maxChildren,
        int maxOccupancy) {

    static StayAvailability of(RoomTypeAvailability availability, String name, Money nightlyFrom,
                               int maxRoomsPerRequest) {
        return new StayAvailability(
                availability.roomTypeId(),
                availability.roomTypeSlug(),
                name,
                availability.availableQuantity(),
                Math.min(availability.availableQuantity(), maxRoomsPerRequest),
                nightlyFrom,
                availability.availableForWholeStay(),
                availability.maxAdults(),
                availability.maxChildren(),
                availability.maxOccupancy());
    }
}
