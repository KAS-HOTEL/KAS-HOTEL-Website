package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Policy text for one locale.
 *
 * <p>{@code body} is the policy itself and is required; {@code summary} is the
 * short form a property page shows and is optional. Both are
 * <strong>Partner-authored free text</strong> — no frozen document supplies
 * policy wording, and doc 51 A4/A5 record the cancellation and no-show policies
 * as still unresolved business inputs, so nothing here defaults or suggests
 * content.
 */
public record PolicyTranslationRequest(

        @NotBlank
        @Pattern(regexp = "en|vi", message = "must be one of the frozen locales")
        String locale,

        @Size(max = 500)
        String summary,

        @NotBlank
        @Size(max = 20000)
        String body) {
}
