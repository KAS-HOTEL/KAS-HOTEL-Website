package com.kas.platform.onboarding.api;

import com.kas.platform.property.FacilityTranslation;
import com.kas.platform.property.FacilityType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Creating or updating a facility.
 *
 * <h2>What this deliberately does not carry</h2>
 *
 * <p>Doc 23 §5's block has three more fields, and none can be accepted without
 * choosing something no frozen document has chosen:
 *
 * <ul>
 *   <li>{@code images[]} — {@code MediaOwnerType} records that
 *       <em>"FACILITY has no API yet"</em>, and there are no image bytes to
 *       attach regardless (OQ-106).</li>
 *   <li>{@code openingHours} — doc 23 §5 says only <em>"structured"</em>. The
 *       column is {@code jsonb} and nothing gives the shape, so a writer would be
 *       inventing one.</li>
 *   <li>{@code highlights[]} — no column exists for it in either table.</li>
 * </ul>
 *
 * <p>{@code type} is required on create and <strong>ignored on update</strong>:
 * the type is what the block is, and changing it would keep the pool's words
 * while claiming to be a meeting room. See {@code FacilityService}.
 */
public record FacilityRequest(
        @NotNull(message = "a facility type is required")
        FacilityType type,

        /**
         * Per-locale name and description, keyed by {@code vi} or {@code en}.
         *
         * <p>Bounded at two because doc 25 freezes two locales; the schema's
         * {@code facility_tr_locale} check enforces the same pair.
         */
        @Size(max = 2, message = "only 'vi' and 'en' are supported")
        Map<String, FacilityTranslationRequest> translations,

        /** Optional tri-state: {@code true}, {@code false}, or unstated. */
        Boolean openToNonResidents,

        Integer sortOrder) {

    public FacilityRequest {
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
    public Map<String, FacilityTranslation> asTranslations() {
        Map<String, FacilityTranslation> out = new LinkedHashMap<>();
        translations.forEach((locale, text) ->
                out.put(locale, new FacilityTranslation(text.name(), text.description())));
        return out;
    }
}
