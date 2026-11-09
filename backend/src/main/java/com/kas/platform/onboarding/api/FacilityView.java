package com.kas.platform.onboarding.api;

import com.kas.platform.property.Facility;
import com.kas.platform.property.FacilityTranslation;
import com.kas.platform.property.FacilityType;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * A facility on the admin surface.
 *
 * <p>The text is returned as well as accepted — doc 101 §2's OQ-132 lesson: a
 * client that cannot read what it just wrote cannot show a Partner their own
 * draft.
 *
 * <p>{@code archived} is a boolean rather than the timestamp. The console needs
 * to know whether the block is live, and the exact moment it was withdrawn is
 * internal history no screen renders.
 */
public record FacilityView(
        UUID id,
        FacilityType type,
        /** Name per locale. Always present; a facility cannot exist without one. */
        Map<String, String> names,
        /** Description per locale. A locale appears only when it has one. */
        Map<String, String> descriptions,
        /** Null when the operator has not said — not the same as {@code false}. */
        Boolean openToNonResidents,
        int sortOrder,
        boolean archived) {

    public FacilityView {
        names = names == null ? Map.of() : Map.copyOf(names);
        descriptions = descriptions == null ? Map.of() : Map.copyOf(descriptions);
    }

    static FacilityView of(Facility facility, Map<String, FacilityTranslation> translations) {
        Map<String, String> names = new LinkedHashMap<>();
        Map<String, String> descriptions = new LinkedHashMap<>();
        translations.forEach((locale, text) -> {
            names.put(locale, text.name());
            if (text.description() != null) {
                descriptions.put(locale, text.description());
            }
        });

        return new FacilityView(
                facility.id(),
                facility.type(),
                names,
                descriptions,
                facility.openToNonResidents(),
                facility.sortOrder(),
                facility.isArchived());
    }
}
