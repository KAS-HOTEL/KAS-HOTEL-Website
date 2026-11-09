package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.Size;

/**
 * One locale's text for a signature experience.
 *
 * <p>{@code title} is not annotated {@code @NotBlank}: the service reports it as
 * {@code translations.{locale}.title}, which names the offending locale, where a
 * bean-validation message on the nested record would not.
 *
 * <p>{@code description} is optional and unbounded here — the column is
 * {@code text} and doc 23 §5 sets no limit. Doc 67 §1 describes the section as
 * editorial rather than a caption, so a length cap invented at this layer would
 * truncate the one field meant to carry the story.
 */
public record ExperienceTranslationRequest(
        @Size(max = 160, message = "an experience title is at most 160 characters")
        String title,
        String description) {
}
