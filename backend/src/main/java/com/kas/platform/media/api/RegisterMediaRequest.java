package com.kas.platform.media.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/**
 * Registers an asset in the partner's library.
 *
 * <p><strong>There is no {@code storageKey} field, and no {@code partnerId}
 * field.</strong> Doc 62 §3: "the platform assigns its own storage_key" — a
 * client-supplied key is a path-traversal and object-overwrite vector, so the
 * request has no way to express one. The partner comes from the caller's scope,
 * so an asset cannot be filed into another partner's library.
 *
 * <p>{@code category} is validated against the frozen {@code media_category}
 * enum. No value was added to it: doc 62 §2 fixed the list, and the phase brief
 * forbids extending an enum to suit a UI idea.
 *
 * <p>Dimensions and size are optional metadata about a file the platform has not
 * yet received — the pre-signed upload of doc 62 §4 delivers the bytes directly
 * to object storage. No numeric bound is applied here; doc 62 §4 says "bounded
 * per category" without giving numbers (OQ-107).
 */
public record RegisterMediaRequest(

        @NotBlank
        @Pattern(regexp = "image/(jpeg|png|webp|avif)",
                message = "must be a supported raster image type")
        String mimeType,

        @NotBlank
        @Pattern(regexp = "EXTERIOR|LOBBY|ROOM|DINING|FACILITY|ROOFTOP|NEIGHBOURHOOD|DETAIL|STAFF|EVENT|DOCUMENT",
                message = "must be a frozen media category")
        String category,

        @Positive Integer width,
        @Positive Integer height,
        @Positive Long sizeBytes) {
}
