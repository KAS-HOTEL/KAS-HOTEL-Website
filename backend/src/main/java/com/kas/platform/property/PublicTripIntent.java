package com.kas.platform.property;

import java.util.List;

/** A guest-facing editorial grouping and its currently visible hotels. */
public record PublicTripIntent(
        String code,
        String label,
        String description,
        List<String> propertySlugs) {

    public PublicTripIntent {
        propertySlugs = propertySlugs == null ? List.of() : List.copyOf(propertySlugs);
    }
}
