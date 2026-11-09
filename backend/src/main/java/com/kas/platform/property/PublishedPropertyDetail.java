package com.kas.platform.property;

import java.util.List;

/**
 * One published property, opened — doc 58 §3.1's <em>property detail</em>.
 *
 * <h2>Why the detail is its own type</h2>
 *
 * <p>Doc 58 §3.1 draws the line itself: {@code GET /public/properties} is
 * <em>"The 8 properties"</em>, while {@code GET /public/properties/{slug}} is
 * <em>"Property detail — includes facilities, amenities, landmarks, gallery,
 * policies"</em>. The list and the detail are different contracts, so folding
 * amenities into {@link PublishedProperty} would put an empty array on every row
 * of the list, where an empty array would mean "the list does not carry them"
 * rather than "this hotel has none" — two different things wearing one shape.
 *
 * <p>Every key {@link PublishedProperty} carries is carried here too, so this is
 * additive for a client: the detail response gained {@code amenities} and lost
 * nothing.
 *
 * <p><strong>Still absent: the gallery</strong>, which is OQ-106 — there are no
 * image bytes to serve. Facilities have their own frozen route
 * ({@code /public/properties/{slug}/facilities}); amenities and landmarks are
 * carried here, because doc 58 §3.1 puts them on the detail and gives them no
 * route of their own. The gallery is not stubbed: a key that is always empty is
 * worse than a key that is honestly missing.
 */
public record PublishedPropertyDetail(
        String slug,
        String name,
        String city,
        String district,
        boolean isFlagship,
        String lifecycleState,
        /**
         * Doc 23 §3.2 — the one-line editorial hook, ≤ 90 chars, localised.
         *
         * <p>Doc 52 §3.1 makes it a publish invariant and doc 67 §1 puts it in
         * the guest property hero, yet until this repair the public contract
         * discarded it: the detail was composed from the portfolio row, which
         * never carried it. {@code null} when unwritten in this locale — the
         * column is nullable and nothing is substituted for it.
         */
        String signatureLine,
        /** Doc 23 §3.2 — card and meta text, ≤ 220 chars, localised. Same nullability. */
        String shortDescription,
        /** What this hotel actually offers — never the whole catalogue. */
        List<PublishedAmenity> amenities,
        /** Doc 23 §3.3 — named places with verified distances, in the operator's order. */
        List<PublishedLandmark> landmarks,
        /**
         * Doc 67 §1's section 5, in the operator's order.
         *
         * <p>Doc 58 §3.1's detail list — <em>"facilities, amenities, landmarks,
         * gallery, policies"</em> — does not name experiences, because doc 58
         * never mentions them at all. Step 16A.47 put that gap to the owner and
         * the ruling was to carry them on this existing surface rather than open
         * a route of their own, which is also where landmarks sit and where doc
         * 67 §1 puts the section on the page.
         */
        List<PublishedExperience> experiences) {

    public PublishedPropertyDetail {
        amenities = List.copyOf(amenities);
        landmarks = List.copyOf(landmarks);
        experiences = List.copyOf(experiences);
    }

    public static PublishedPropertyDetail of(PublishedPropertyContent content,
                                             List<PublishedAmenity> amenities,
                                             List<PublishedLandmark> landmarks,
                                             List<PublishedExperience> experiences) {
        PublishedProperty property = content.summary();
        return new PublishedPropertyDetail(
                property.slug(),
                property.name(),
                property.city(),
                property.district(),
                property.isFlagship(),
                property.lifecycleState(),
                content.signatureLine(),
                content.shortDescription(),
                amenities,
                landmarks,
                experiences);
    }
}
