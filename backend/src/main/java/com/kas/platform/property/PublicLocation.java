package com.kas.platform.property;

import java.math.BigDecimal;

/**
 * One property as a point on a map — doc 58 §3.1's {@code GET /public/locations},
 * <em>"Map data — all properties"</em>.
 *
 * <h2>Where the shape comes from</h2>
 *
 * <p>Doc 58 gives the row no notes, so the fields are the ones already frozen
 * elsewhere rather than ones chosen here: {@code slug} is the identifier every
 * public surface addresses a property by (never the id), {@code name} is that
 * property resolved for the reader's locale as on the portfolio list, and doc 23
 * §3.3 lists <em>{@code address, district, ward} — localised text</em> and
 * <em>{@code coordinates} — lat/lng</em> among a property's location fields.
 *
 * <h2>Coordinates are nullable, and stay that way</h2>
 *
 * <p>{@code property.latitude} and {@code longitude} are nullable in V3 and no
 * property has them: V23 says coordinates are <strong>deliberately unseeded</strong>
 * — <em>"Inventing them would be manufacturing production data for eight real
 * hotels"</em> — and doc 03 §5 makes them part of the content gap OQ-030 / doc 51
 * A1–A2.
 *
 * <p>So a location can arrive with {@code null} coordinates, and nothing here
 * substitutes a city centre for them. A marker that cannot be placed is not
 * placed; a marker placed at a guessed point is a lie about where a hotel is.
 *
 * <h2>What is absent</h2>
 *
 * <p>No {@code id}, no {@code isFlagship}, no {@code lifecycleState}. A map
 * answers <em>where</em>; the portfolio list and the property page already answer
 * <em>whether</em>, and doc 58 gives this row no field list to justify carrying
 * more.
 */
public record PublicLocation(
        String slug,
        String name,
        String city,
        String district,
        /** Null when the coordinate has not been supplied — never a default. */
        BigDecimal latitude,
        BigDecimal longitude) {
}
