package com.kas.platform.onboarding.api;

import com.kas.platform.property.PolicyScope;
import com.kas.platform.property.PolicyStatus;
import com.kas.platform.property.PolicyType;
import com.kas.platform.property.PropertyPolicy;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * A policy version on the admin surface.
 *
 * <p>Unlike the public view this carries {@code status} and
 * {@code effectiveFrom}: a Partner needs to see that a version is still a draft,
 * or dated for next month, to manage it at all. {@code translations} maps locale
 * to body so the both-locale activation gate is visible before it is hit.
 */
public record PolicyView(
        UUID id,
        PolicyType type,
        int version,
        LocalDate effectiveFrom,
        PolicyStatus status,
        /**
         * {@code SHARED} for a policy that applies to the whole portfolio,
         * {@code PROPERTY} for one hotel's override. Derived from the id pair,
         * never stored separately.
         */
        PolicyScope scope,
        /**
         * The hotel an override belongs to; null for a shared policy.
         *
         * <p>The id rather than the name: the console already holds the
         * partner's property list, so it resolves the name itself and no locale
         * has to be threaded through the policy routes to render one.
         */
        UUID propertyId,
        Map<String, String> translations) {

    static PolicyView of(PropertyPolicy policy, Map<String, String> translations) {
        return new PolicyView(
                policy.id(),
                policy.policyType(),
                policy.version(),
                policy.effectiveFrom(),
                policy.status(),
                PolicyScope.of(policy),
                policy.propertyId(),
                translations);
    }
}
