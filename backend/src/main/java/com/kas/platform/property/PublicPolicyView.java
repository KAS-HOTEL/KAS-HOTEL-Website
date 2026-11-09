package com.kas.platform.property;

/**
 * A policy as a guest sees it.
 *
 * <p>Carries {@code version} deliberately: doc 58 §3.1 says the public policy
 * endpoint "returns {@code version} for {@code termsVersion}", because a
 * reservation pins the exact policy version the guest agreed to. Without it the
 * guest could not be shown what they accepted.
 *
 * <p>Absent: the policy id, {@code propertyId}, {@code partnerId},
 * {@code status}, {@code effectiveFrom} and every timestamp. A guest needs the
 * words and the version, not the editorial state — and {@code status} in
 * particular would disclose that a newer draft exists.
 */
public record PublicPolicyView(
        PolicyType type,
        int version,
        String summary,
        String body) {
}
