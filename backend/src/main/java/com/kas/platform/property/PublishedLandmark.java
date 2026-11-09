package com.kas.platform.property;

/**
 * A landmark as a guest sees it — doc 58 §3.1's <em>"property detail — includes
 * … landmarks"</em>, shaped by doc 23 §3.3's
 * {@code { name (localised), type, distanceMetres, walkingMinutes }}.
 *
 * <p>No id and no {@code sortOrder}: nothing on the public surface addresses a
 * landmark, and the order of the list <em>is</em> the order — echoing the number
 * would invite a client to re-sort by it and disagree with the operator.
 *
 * <p>Both measures are nullable because the schema allows a landmark with
 * neither. Doc 03 §5.2 asks for <strong>verified</strong> distances, so an
 * unmeasured one is absent rather than guessed at.
 */
public record PublishedLandmark(
        String name,
        String description,
        String type,
        Integer distanceMetres,
        Integer walkingMinutes) {
}
