package com.kas.platform.property;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One version of one policy, at one of three scopes.
 *
 * <p><strong>There are no numeric fields, and that is the model, not an
 * omission.</strong> {@code property_policy} carries no percentage, amount, day
 * count or age limit — policy content is editorial text in
 * {@code property_policy_translation}. Commercial parameters (deposit
 * percentage, cancellation charge, review window) live in {@code system_setting}
 * as doc 51 §6 specifies, where a missing value fails loudly.
 *
 * <p>That separation is what keeps this phase to policy <em>data</em>: there is
 * nowhere here for a refund calculation to hide.
 *
 * <h2>Scope is the pair, not one field</h2>
 *
 * <p>V32 added {@code partner_id}, and the two id columns together say who a
 * policy is for:
 *
 * <table>
 *   <caption>The three scopes</caption>
 *   <tr><th>partnerId</th><th>propertyId</th><th>meaning</th></tr>
 *   <tr><td>null</td><td>null</td><td>platform — PRIVACY, TERMS, COOKIES</td></tr>
 *   <tr><td>set</td><td>null</td><td>shared across the partner's portfolio</td></tr>
 *   <tr><td>set</td><td>set</td><td>one hotel, overriding the shared one</td></tr>
 * </table>
 *
 * @param partnerId null only for a platform policy — V32's
 *        {@code property_policy_scope_valid} makes it mandatory whenever
 *        {@code propertyId} is set
 * @param propertyId null for a shared or platform policy
 * @param effectiveFrom the date this version starts applying. Together with
 *        {@code version} it is how "the current policy" is resolved
 */
public record PropertyPolicy(
        UUID id,
        UUID partnerId,
        UUID propertyId,
        PolicyType policyType,
        int version,
        LocalDate effectiveFrom,
        PolicyStatus status) {

    /** Applies to every property of {@link #partnerId}, and is stored once. */
    public boolean isShared() {
        return partnerId != null && propertyId == null;
    }

    /** Applies to {@link #propertyId} alone, overriding the shared policy of its type. */
    public boolean isPropertySpecific() {
        return propertyId != null;
    }
}
