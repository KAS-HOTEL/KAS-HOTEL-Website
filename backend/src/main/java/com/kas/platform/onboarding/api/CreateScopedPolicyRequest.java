package com.kas.platform.onboarding.api;

import com.kas.platform.property.PolicyType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Creates the next version of a policy type from the partner's policy module,
 * at the scope the body names.
 *
 * <p>{@link CreatePolicyRequest} plus one field: on the property route the
 * property is in the path, here it is not. As there, the platform assigns the
 * version and every version starts {@code DRAFT}.
 */
public record CreateScopedPolicyRequest(

        /** The hotel this version overrides for; {@code null} for a shared policy. */
        UUID propertyId,

        @NotNull
        PolicyType type,

        /** The date this version starts applying. May be in the future. */
        @NotNull
        LocalDate effectiveFrom) {
}
