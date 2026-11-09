package com.kas.platform.reservation.api;

import jakarta.validation.constraints.NotBlank;

/**
 * The decline body — doc 58 §5:
 * {@code POST /sales/requests/{reference}/decline · reservation.cancel · }<strong>Reason required</strong>.
 *
 * <p>One field, because the contract names one. Doc 54 S11's guard is exactly
 * "Reason required" — it does not enumerate reasons, offer a code list or make
 * any of them mean something operationally, so this is free text and
 * <strong>no reason vocabulary is invented here</strong>.
 *
 * <p>{@code @NotBlank} rather than {@code @NotNull}: a whitespace-only reason
 * satisfies "a reason was supplied" while telling the guest and the next agent
 * nothing, which is the failure mode the guard exists to prevent. The blank
 * arrives as a <strong>400</strong> at the edge, the same shape every other
 * field-level problem takes (doc 58 §2.1).
 */
public record DeclineRequestBody(
        @NotBlank
        String reason) {
}
