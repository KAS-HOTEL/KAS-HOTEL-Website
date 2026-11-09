package com.kas.platform.onboarding.api;

import com.kas.platform.property.Experience;
import com.kas.platform.property.ExperienceTranslation;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * A signature experience on the admin surface.
 *
 * <p>The text is returned as well as accepted — doc 101 §2's OQ-132 lesson: a
 * client that cannot read what it just wrote cannot show a Partner their own
 * draft.
 *
 * <p>Carries no {@code timeOfDay}, no image, no status and no timestamps. The
 * first two are out of V1 scope by Step 16A.47's decision; the last two have no
 * column and nothing to say. What is here is what a Partner can change.
 */
public record ExperienceView(
        UUID id,
        /** Title per locale. Always present; an experience cannot exist without one. */
        Map<String, String> titles,
        /** Description per locale. A locale appears only when it has one. */
        Map<String, String> descriptions,
        int sortOrder) {

    public ExperienceView {
        titles = titles == null ? Map.of() : Map.copyOf(titles);
        descriptions = descriptions == null ? Map.of() : Map.copyOf(descriptions);
    }

    static ExperienceView of(Experience experience, Map<String, ExperienceTranslation> translations) {
        Map<String, String> titles = new LinkedHashMap<>();
        Map<String, String> descriptions = new LinkedHashMap<>();
        translations.forEach((locale, text) -> {
            titles.put(locale, text.title());
            if (text.description() != null) {
                descriptions.put(locale, text.description());
            }
        });

        return new ExperienceView(
                experience.id(),
                titles,
                descriptions,
                experience.sortOrder());
    }
}
