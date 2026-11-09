package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.Size;

/**
 * One locale's text for a facility.
 *
 * <p>{@code name} is not annotated {@code @NotBlank} here: the service reports it
 * as {@code translations.{locale}.name}, which names the offending locale, where
 * a bean-validation message on the nested record would not.
 */
public record FacilityTranslationRequest(
        @Size(max = 120, message = "a facility name is at most 120 characters")
        String name,
        String description) {
}
