package com.kas.platform.property;

/**
 * A property as a guest sees it.
 *
 * <p>Deliberately <strong>not</strong> {@link Property}: doc 58 §9 layer 2
 * requires separate response types rather than a filtered domain record, so that
 * leaking is impossible rather than merely unlikely. There is no {@code id} and
 * no {@code partnerId} here — {@code partnerId} is on the denylist (PARTNER
 * group), and a guest addresses a property by slug.
 *
 * <p>{@code lifecycleState} is public on purpose: doc 03 §8 lists
 * {@code COMING_SOON} with a teaser and {@code TEMPORARILY_CLOSED} as "listed,
 * marked unavailable", so the guest needs it to understand what they are seeing.
 * {@code DRAFT} and {@code CLOSED} never reach this type.
 */
public record PublishedProperty(
        String slug,
        String name,
        String city,
        String district,
        boolean isFlagship,
        String lifecycleState) {
}
