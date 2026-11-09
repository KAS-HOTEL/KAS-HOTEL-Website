package com.kas.platform.property;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;

/**
 * One published hotel as the public website lists it — {@code GET
 * /api/v1/public/properties/catalogue}.
 *
 * <p>The website renders its hotel list, Find Your KAS groups and saved-hotel cards from
 * this, so a hotel hidden, closed or added in the console appears or disappears there
 * without a code change. It is a separate type from {@link PublishedProperty} on purpose:
 * that list's shape is frozen by its own tests, and this one carries the card fields
 * (address, rating, tags, intents, times, order) the website needs.
 *
 * <p>Same publication rule as every public read: {@code DRAFT} and {@code CLOSED} never
 * appear. No id, no partner, no contact details.
 */
public record PublishedPropertyCard(
        String slug,
        String name,
        String city,
        String district,
        boolean isFlagship,
        String lifecycleState,
        /** The website's own id for this hotel (hotel-01 …); null for a hotel it never had. */
        String frontendKey,
        String addressLine,
        /** Card text, localised; null when unwritten in this locale. */
        String shortDescription,
        Integer starRating,
        /** The operator-entered Trip.com score (0–10) and review count; null until entered. */
        BigDecimal tripRating,
        Integer tripReviewCount,
        List<String> quickSearchTags,
        /** Trip intent codes (family, slow, business, long …) in the operator's order. */
        List<String> tripIntents,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        /** The operator's display order. */
        int displayOrder) {

    public PublishedPropertyCard {
        quickSearchTags = quickSearchTags == null ? List.of() : List.copyOf(quickSearchTags);
        tripIntents = tripIntents == null ? List.of() : List.copyOf(tripIntents);
    }
}
