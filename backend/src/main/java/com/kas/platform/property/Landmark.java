package com.kas.platform.property;

import java.util.UUID;

/**
 * One nearby landmark of one property — doc 23 §3.3's {@code nearbyLandmarks[]},
 * <em>{@code { name (localised), type, distanceMetres, walkingMinutes }}</em>,
 * stored in {@code property_landmark} since V3.
 *
 * <p>The doc's four fields map onto the schema one for one, and the schema adds
 * {@code description} per locale and {@code sortOrder}. Nothing here is invented:
 * doc 03 §5.2 wants <em>"named places with real walking distance"</em> — "Ben
 * Thanh Market — 6 min walk" — and these are exactly the parts of that sentence.
 *
 * <p><strong>{@code type} is free text, deliberately.</strong> The column is bare
 * {@code text} with no check constraint and doc 23 §3.3 lists {@code type} as a
 * plain field rather than an enum — unlike {@code SignatureExperience.timeOfDay},
 * which doc 23 §5 calls an enum and never enumerates. Inventing a landmark
 * vocabulary would exclude a real place for want of a category.
 *
 * <p>There is no {@code archived_at} column, so removal is a delete. That is the
 * schema's own answer: unlike a facility, a landmark carries no history a guest
 * saw — it is a fact about the neighbourhood, and a wrong one should leave.
 */
public record Landmark(
        UUID id,
        UUID propertyId,
        /** Null when the operator has not categorised it. */
        String type,
        /** Null when unmeasured. Never negative — {@code property_landmark_dist_nonneg}. */
        Integer distanceMetres,
        /** Null when unmeasured. Never negative — {@code property_landmark_walk_nonneg}. */
        Integer walkingMinutes,
        int sortOrder) {
}
