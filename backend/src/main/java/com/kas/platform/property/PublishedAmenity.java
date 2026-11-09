package com.kas.platform.property;

/**
 * One amenity a hotel actually offers, as a guest sees it.
 *
 * <p>Doc 03 §6 makes amenities a <strong>shared, controlled vocabulary</strong>
 * across all properties rather than free text per hotel — that is what makes
 * comparison and consistent iconography possible — and gives the structure as
 * {@code AmenityCategory → Amenity} with per-property assignment.
 *
 * <p>{@code code} is the catalogue's stable identifier and {@code name} is that
 * code resolved for the requested locale, so a guest reads words and a client
 * can still match on something that does not move when the wording is edited.
 *
 * <p>{@code isHighlight} is the property's own flag from
 * {@code property_amenity}, not the catalogue's: the same amenity can be a
 * headline feature at one hotel and ordinary at another.
 *
 * <p><strong>Absent:</strong> the amenity {@code id}, {@code propertyId},
 * {@code sortOrder} and {@code archivedAt}. A guest needs the words and the
 * grouping; ordering is already applied by the query, so exposing the sort key
 * would only invite a second, disagreeing sort. {@code icon} is absent too —
 * the column is nullable, nothing renders one, and shipping an unused field
 * invites a client to invent artwork for a value the contract does not define.
 */
public record PublishedAmenity(
        String code,
        String name,
        String category,
        boolean isHighlight) {
}
