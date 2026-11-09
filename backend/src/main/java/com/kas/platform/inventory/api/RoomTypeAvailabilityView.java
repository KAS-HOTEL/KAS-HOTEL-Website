package com.kas.platform.inventory.api;

import com.kas.platform.inventory.StayAvailability;
import com.kas.platform.shared.Money;

/**
 * Doc 58 §3.2's availability response, field for field:
 *
 * <pre>{@code
 * {
 *   "roomTypeSlug": "deluxe-room",
 *   "name": "Deluxe Room",
 *   "availableQuantity": 6,               // the ONLY inventory figure exposed
 *   "maxQuantitySelectable": 5,           // min(available, config B15)
 *   "nightlyFrom": { "amountMinor": 1850000, "currency": "VND", "exponent": 0 },
 *   "availableForWholeStay": true
 * }
 * }</pre>
 *
 * <p>Doc 58 §3.2, CONFIRMED: "No {@code total}, no {@code maintenance}, no
 * buffer, no commitments, no holds, no room numbers." Every one of those names is
 * on the doc 58 §9 INVENTORY denylist, and {@code PublicResponseDenylistTest}
 * scans this type to prove none of them can appear — including through a nested
 * field added later.
 *
 * <p>The room type <strong>id</strong> is absent too. Doc 58 identifies public
 * resources by slug, and an internal identifier is of no use to a guest.
 */
public record RoomTypeAvailabilityView(
        String roomTypeSlug,
        String name,
        int availableQuantity,
        int maxQuantitySelectable,
        Money nightlyFrom,
        boolean availableForWholeStay) {

    static RoomTypeAvailabilityView of(StayAvailability availability) {
        return new RoomTypeAvailabilityView(
                availability.roomTypeSlug(),
                availability.name(),
                availability.availableQuantity(),
                availability.maxQuantitySelectable(),
                availability.nightlyFrom(),
                availability.availableForWholeStay());
    }
}
