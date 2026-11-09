package com.kas.platform.property;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One of the eight KAS hotels.
 *
 * <p><strong>No field here is capable of holding a physical room identity.</strong>
 * Doc 52 §6 excludes {@code PhysicalRoom} from V1 on the grounds that "room
 * numbers cannot leak if they do not exist", and doc 88 invariant 21 verified
 * structurally that no {@code room_number}, {@code floor} or {@code unit_id}
 * column exists anywhere in the schema.
 *
 * <p>This is the internal domain record. It is never returned from a public
 * endpoint: {@code partnerId} is on the public response denylist (doc 58 §9), so
 * public responses use a separate type with no field able to carry it.
 *
 * <p>The display name is deliberately absent. It is per-locale and lives in
 * {@code property_translation}, so it cannot be a scalar here without silently
 * picking one of the two frozen locales — see
 * {@link PropertyRepository#findNames}.
 *
 * @param city     never null; the schema requires it
 * @param district nullable until the Partner fills it in — {@code PropertyCompletenessChecker}
 *                 treats a blank one as a submission blocker rather than an error
 * @param ward     nullable, as above
 * @param phone    nullable; the hotel's own contact number, not a person's
 * @param version  optimistic concurrency for MASTER updates — doc 58 §2
 *                 ({@code If-Match} / {@code version} → 409 on conflict)
 */
public record Property(
        UUID id,
        UUID partnerId,
        String slug,
        PropertyLifecycleState lifecycleState,
        boolean isFlagship,
        String collection,
        String district,
        String ward,
        String city,
        String phone,
        /**
         * Doc 23 §3.3's {@code coordinates — lat/lng}. Nullable, and null means
         * the Partner has not supplied a point — never a city centre standing in
         * for one. {@code numeric(9,6)} in V3, with the range checks
         * {@code property_lat_range} and {@code property_lng_range}.
         */
        BigDecimal latitude,
        BigDecimal longitude,
        int sortOrder,
        int version,
        Instant publishedAt,
        Instant createdAt,
        Instant updatedAt) {
}
