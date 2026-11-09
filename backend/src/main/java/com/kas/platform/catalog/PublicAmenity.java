package com.kas.platform.catalog;

/**
 * One entry of the shared amenity vocabulary, as a guest sees it — doc 58 §3.1's
 * {@code GET /public/amenities}, <em>"Amenity taxonomy"</em>.
 *
 * <p>Doc 03 §6 makes amenities a <strong>shared, controlled vocabulary</strong>
 * across all properties with per-property assignment, and gives the structure as
 * {@code AmenityCategory → Amenity}. This is the vocabulary itself; what a
 * particular hotel offers is {@code PublishedAmenity} on the property detail.
 *
 * <p><strong>No {@code isHighlight}.</strong> The catalogue column and
 * {@code property_amenity.is_highlight} are different facts wearing one name:
 * {@code PublishedAmenity} documents its flag as <em>"the property's own flag …
 * not the catalogue's"</em>. Carrying the catalogue's default here would invite a
 * client to treat the two as the same thing.
 *
 * <p><strong>No {@code id}, no {@code sortOrder}, no {@code icon}.</strong> The
 * API is addressed by {@code code}; the list arrives already ordered, so exposing
 * the sort key would only invite a second, disagreeing sort; and no frozen
 * document defines an icon set — the same reason Step 16A.31 refused to render
 * one.
 */
public record PublicAmenity(
        String code,
        String name,
        /** One of doc 03 §6's nine frozen categories. */
        String category) {
}
