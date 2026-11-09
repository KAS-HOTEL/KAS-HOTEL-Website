package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.Size;

/**
 * One locale's text for a landmark.
 *
 * <p>{@code name} is not annotated {@code @NotBlank}: the service reports it as
 * {@code translations.{locale}.name}, which names the offending locale, where a
 * bean-validation message on the nested record would not.
 */
public record LandmarkTranslationRequest(
        @Size(max = 160, message = "a landmark name is at most 160 characters")
        String name,
        String description) {
}
