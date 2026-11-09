package com.kas.platform.property;

import java.time.Instant;
import java.util.UUID;

/**
 * One facility of one property — doc 23 §5's {@code FacilityBlock}, as far as the
 * schema and the frozen documents actually define it.
 *
 * <h2>What is deliberately absent</h2>
 *
 * Doc 23 §5 lists three more fields on the block, and none of them can be carried
 * yet without inventing something:
 *
 * <ul>
 *   <li>{@code images[]} — {@link com.kas.platform.media.MediaOwnerType} says it
 *       itself: <em>"FACILITY has no API yet"</em>. The owner kind exists in the
 *       database enum, but nothing resolves a facility to a partner for the scope
 *       filter, and there are no image bytes to show regardless (OQ-106).</li>
 *   <li>{@code openingHours} — doc 23 §5 says only <em>"structured"</em>. The
 *       column is {@code jsonb} and no frozen document gives the shape, so any
 *       writer would be choosing one.</li>
 *   <li>{@code highlights[]} — neither {@code facility} nor
 *       {@code facility_translation} has a column for it, and no document says
 *       where it would live.</li>
 * </ul>
 *
 * <p>Everything else is fully specified: the type vocabulary is a database enum,
 * the name and description are per-locale rows, {@code openToNonResidents} is a
 * nullable boolean, and {@code sortOrder} is the operator's own ordering.
 *
 * <p>{@code archivedAt} is how a facility is removed. The row is kept for the same
 * reason an archived room type is: a facility that was on the page yesterday is
 * part of what a guest saw, and deleting it would erase that.
 */
public record Facility(
        UUID id,
        UUID propertyId,
        FacilityType type,
        /** Null when the operator has not said. Not the same as {@code false}. */
        Boolean openToNonResidents,
        int sortOrder,
        Instant archivedAt) {

    public boolean isArchived() {
        return archivedAt != null;
    }
}
