package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Creating a property draft.
 *
 * <p>There is no {@code partnerId} field. Ownership comes from the caller's
 * scope, so the request has no way to express "create this under another
 * partner" — doc 85 §10 control 5, applied at the point a record is born rather
 * than only when it is read.
 *
 * <p>{@code name} is Partner-authored free text. {@code slug} is constrained to
 * the {@code property_slug_format} CHECK so a bad value fails at the boundary
 * with a field-level message instead of as a database error.
 */
public record CreatePropertyRequest(

        @NotBlank
        @Size(max = 120)
        @Pattern(regexp = "^[a-z0-9][a-z0-9-]*$",
                message = "must be lower-case letters, digits and hyphens")
        String slug,

        @NotBlank
        @Size(max = 200)
        String name) {
}
