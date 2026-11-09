package com.kas.platform.onboarding.api;

import com.kas.platform.property.LandmarkTranslation;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Creating or updating a landmark — doc 23 §3.3's
 * {@code { name (localised), type, distanceMetres, walkingMinutes }}, plus the
 * per-locale description and ordering the schema adds.
 *
 * <p>{@code type} is free text on purpose: {@code landmark_type} is bare
 * {@code text} with no check constraint, and doc 23 §3.3 lists it as a plain
 * field rather than an enum. Inventing a vocabulary would exclude a real place
 * for want of a category.
 *
 * <p>Both measurements are optional and independent. Doc 03 §5.2 asks for
 * <strong>verified</strong> walking times, so neither is derived from the other.
 */
public record LandmarkRequest(
        @Size(max = 60, message = "a landmark type is at most 60 characters")
        String type,

        /**
         * Per-locale name and description, keyed by {@code vi} or {@code en}.
         *
         * <p>Bounded at two because doc 25 freezes two locales; the schema's
         * {@code property_landmark_tr_locale} check enforces the same pair.
         */
        @Size(max = 2, message = "only 'vi' and 'en' are supported")
        Map<String, LandmarkTranslationRequest> translations,

        Integer distanceMetres,
        Integer walkingMinutes,
        Integer sortOrder) {

    public LandmarkRequest {
        // A caller that omits translations entirely is refused by the service
        // with a field error, not silently accepted with an empty map.
        translations = translations == null
                ? Map.of()
                : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(translations));
    }

    public int sortOrderOrDefault() {
        return sortOrder == null ? 0 : sortOrder;
    }

    /** The domain shape, so the service never handles an API record. */
    public Map<String, LandmarkTranslation> asTranslations() {
        Map<String, LandmarkTranslation> out = new LinkedHashMap<>();
        translations.forEach((locale, text) ->
                out.put(locale, new LandmarkTranslation(text.name(), text.description())));
        return out;
    }
}
