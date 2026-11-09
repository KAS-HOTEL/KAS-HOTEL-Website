package com.kas.platform.onboarding.api;

import com.kas.platform.property.Landmark;
import com.kas.platform.property.LandmarkTranslation;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * A landmark on the admin surface.
 *
 * <p>The text is returned as well as accepted — doc 101 §2's OQ-132 lesson: a
 * client that cannot read what it just wrote cannot show a Partner their own
 * draft.
 */
public record LandmarkView(
        UUID id,
        /** Free text; the column has no vocabulary and doc 23 §3.3 names none. */
        String type,
        /** Name per locale. Always present; a landmark cannot exist without one. */
        Map<String, String> names,
        /** Description per locale. A locale appears only when it has one. */
        Map<String, String> descriptions,
        /** Null when unmeasured — doc 03 §5.2 wants verified distances, not guesses. */
        Integer distanceMetres,
        Integer walkingMinutes,
        int sortOrder) {

    public LandmarkView {
        names = names == null ? Map.of() : Map.copyOf(names);
        descriptions = descriptions == null ? Map.of() : Map.copyOf(descriptions);
    }

    static LandmarkView of(Landmark landmark, Map<String, LandmarkTranslation> translations) {
        Map<String, String> names = new LinkedHashMap<>();
        Map<String, String> descriptions = new LinkedHashMap<>();
        translations.forEach((locale, text) -> {
            names.put(locale, text.name());
            if (text.description() != null) {
                descriptions.put(locale, text.description());
            }
        });

        return new LandmarkView(
                landmark.id(),
                landmark.type(),
                names,
                descriptions,
                landmark.distanceMetres(),
                landmark.walkingMinutes(),
                landmark.sortOrder());
    }
}
