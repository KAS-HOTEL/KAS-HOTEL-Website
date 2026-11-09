/**
 * Partner — the management / ownership organisation above one or more
 * properties (doc 85 §3.1).
 *
 * <p>Deliberately minimal: identity and ownership only. There is no commission,
 * billing, payout, KYC, contract or onboarding concept here, and adding one
 * would introduce the marketplace that doc 85 §2.3 explicitly excludes.
 *
 * <p>Visibility is <strong>internal only</strong>. {@code partnerId},
 * {@code partnerCode}, {@code partnerName} and {@code partner} are on the public
 * response denylist (doc 58 §9) — a guest has no reason to learn which
 * organisation owns a hotel.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Partner",
        allowedDependencies = {"shared"})
package com.kas.platform.partner;
