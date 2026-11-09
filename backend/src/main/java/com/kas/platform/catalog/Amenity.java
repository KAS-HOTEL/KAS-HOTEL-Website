package com.kas.platform.catalog;

import java.util.UUID;

/**
 * One entry in the shared amenity vocabulary.
 *
 * <p>{@code code} is the stable identifier a Partner selects and the API accepts
 * — lower case, matching the {@code amenity_code_format} CHECK. The human label
 * lives in translations, so renaming an amenity in Vietnamese never changes what
 * a property is linked to.
 *
 * <p>{@code category} is one of the nine frozen doc 03 §6 categories, enforced
 * by the {@code amenity_category_valid} CHECK rather than by an enum here — the
 * catalog is data, and a Java enum would put a deployment between the business
 * and a new amenity.
 */
public record Amenity(
        UUID id,
        String code,
        String category,
        String icon,
        boolean isHighlight,
        int sortOrder) {
}
