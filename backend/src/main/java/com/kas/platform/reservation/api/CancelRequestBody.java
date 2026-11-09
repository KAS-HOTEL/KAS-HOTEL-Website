package com.kas.platform.reservation.api;

import jakarta.validation.constraints.NotBlank;

/**
 * The cancellation body — doc 58 §5:
 * {@code POST /sales/requests/{reference}/cancel · reservation.cancel · }<strong>Reason required</strong>.
 *
 * <p>Doc 58 §5 puts {@code /decline} and {@code /cancel} on one row, under one
 * permission and one guard, so this record is the same shape as
 * {@link DeclineRequestBody}. They are kept as two types rather than one shared
 * one because {@code spring.jackson.fail-on-unknown-properties} makes each
 * route's body a pinned contract, and a single type would let a field added for
 * one transition silently become acceptable on the other.
 *
 * <p>{@code @NotBlank} rather than {@code @NotNull}: doc 54 S12's guard is
 * "reason required", and a whitespace-only reason satisfies "a reason was
 * supplied" while telling the guest and the next agent nothing. The blank
 * arrives as a <strong>400</strong> at the edge, before anything is locked or
 * released.
 *
 * <p><strong>No reason vocabulary is invented here.</strong> Doc 54 does not
 * enumerate cancellation reasons, offer a code list or give any of them an
 * operational meaning, so this is free text — exactly as the decline is.
 */
public record CancelRequestBody(
        @NotBlank
        String reason,
        /**
         * Who asked for the cancellation (2026-11-07): {@code GUEST} (the guest withdrew) or
         * {@code KAS} (KAS / the hotel decided). Optional for older clients; absent means
         * not stated. Recorded in the history and audit beside the staff member who did it.
         */
        @jakarta.validation.constraints.Pattern(regexp = "GUEST|KAS")
        String requestedBy,
        /**
         * Staff confirm they checked the bank account. Required only when the guest has
         * already reported a transfer for this request; otherwise ignored.
         */
        Boolean paymentChecked) {

    /** The pre-2026-11-07 shape: reason only. */
    public CancelRequestBody(String reason) {
        this(reason, null, null);
    }
}
