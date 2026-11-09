package com.kas.platform.media.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Alt text and caption for one locale.
 *
 * <p>Doc 62 §5 makes alt text a publish gate, and doc 62 §5 also separates the
 * two fields deliberately: "alt text describes the image; caption adds editorial
 * context… a caption is not a substitute for alt text." So {@code altText} is
 * mandatory and {@code caption} is not.
 */
public record MediaTranslationRequest(

        @NotBlank
        @Pattern(regexp = "en|vi", message = "must be one of the frozen locales")
        String locale,

        @NotBlank
        @Size(max = 500)
        String altText,

        @Size(max = 1000)
        String caption) {
}
