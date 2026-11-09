package com.kas.platform.property;

/**
 * A facility on the guest surface — doc 58 §3.1's <em>"Includes facilities"</em>
 * and the dedicated {@code GET /public/properties/{slug}/facilities}.
 *
 * <p>No id: doc 62 §6's rule that internal identifiers stay server-side applies
 * here for the same reason it applies to media. A guest needs the words and the
 * kind, and nothing addresses a facility by id on the public surface.
 *
 * <p>No {@code sortOrder} either — the order of the list <em>is</em> the order,
 * and echoing the number would invite a client to re-sort by it and disagree
 * with the operator.
 */
public record PublicFacilityView(
        FacilityType type,
        String name,
        /** Optional. Absent when the operator has not written one in this locale. */
        String description,
        /** Null when unstated, which is not the same as "residents only". */
        Boolean openToNonResidents) {
}
