package com.kas.platform.onboarding.api;

import com.kas.platform.property.ExperienceTranslation;
import jakarta.validation.constraints.Size;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Creating or updating a signature experience.
 *
 * <p>Three fields, exactly the V1 contract Step 16A.47 confirmed: a localised
 * title, an optional localised description, and an ordering.
 *
 * <p><strong>No {@code timeOfDay} and no {@code image}.</strong> Both appear in
 * doc 23 §5's PROPOSED list and neither is buildable: the enum has no members
 * anywhere in the documents, and {@code media_owner_type} has no
 * {@code EXPERIENCE}. Because {@code spring.jackson.fail-on-unknown-properties}
 * is on, a client that sends either gets a {@code 400} naming the field rather
 * than having it silently dropped — which is the honest answer while they are out
 * of scope.
 */
public record ExperienceRequest(
        /**
         * Per-locale title and description, keyed by {@code vi} or {@code en}.
         *
         * <p>Bounded at two because doc 25 freezes two locales; the schema's
         * {@code property_experience_tr_locale} check enforces the same pair.
         */
        @Size(max = 2, message = "only 'vi' and 'en' are supported")
        Map<String, ExperienceTranslationRequest> translations,

        Integer sortOrder) {

    public ExperienceRequest {
        // A caller that omits translations entirely is refused by the service
        // with a field error, not silently accepted with an empty map.
        translations = translations == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(translations));
    }

    public int sortOrderOrDefault() {
        return sortOrder == null ? 0 : sortOrder;
    }

    /** The domain shape, so the service never handles an API record. */
    public Map<String, ExperienceTranslation> asTranslations() {
        Map<String, ExperienceTranslation> out = new LinkedHashMap<>();
        translations.forEach((locale, text) ->
                out.put(locale, new ExperienceTranslation(text.title(), text.description())));
        return out;
    }
}
