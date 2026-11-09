package com.kas.platform.onboarding.api;

import com.kas.platform.property.PolicyType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Creates the next version of a policy type.
 *
 * <p>There is no {@code version} field. The platform assigns it — a
 * client-chosen number could collide with an existing version or silently
 * supersede one, and the uniqueness constraint would then surface as an opaque
 * database error rather than a decision.
 *
 * <p>There is no {@code status} field either: every version starts {@code DRAFT}
 * and is activated through its own endpoint, after the text exists.
 */
public record CreatePolicyRequest(

        @NotNull
        PolicyType type,

        /** The date this version starts applying. May be in the future. */
        @NotNull
        LocalDate effectiveFrom) {
}
