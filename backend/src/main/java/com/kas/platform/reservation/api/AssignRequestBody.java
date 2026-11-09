package com.kas.platform.reservation.api;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * The assignment body — doc 58 §5:
 * {@code POST /sales/requests/{reference}/assign · }<strong>{@code sales.request.assign}</strong>.
 *
 * <p>The permission is owner decision 4 of Step 16A.9, which settled a
 * contradiction between three frozen documents:
 * doc 14:168 names {@code lead.assign}, which was never built;
 * doc 54:66 names {@code sales.inquiry.manage}, which exists but names
 * <em>inquiries</em>; doc 58 §5 names {@code sales.request.assign}, and that is
 * the one the owner selected.
 *
 * <h2>Two fields, and only the first is required</h2>
 *
 * <p>{@code salesOwnerId} is the user who will own the request. It is
 * {@code @NotNull} rather than {@code @NotBlank} because it is a uuid: a
 * malformed one never reaches validation at all, it fails to deserialise and
 * arrives as a <strong>400</strong> like any other type error.
 *
 * <p>A well-formed uuid that is not an assignable user is a different refusal
 * and is decided in SQL, not here — see
 * {@code SalesRequestRepository.isAssignableOwner}. A nonexistent user, a
 * suspended one and another partner's agent all answer identically, so this
 * endpoint cannot be used to enumerate user ids.
 *
 * <p>{@code reason} is optional. Doc 21:585 asks for <em>"reassign with
 * reason"</em>, and doc 29:73 lists "why" among the facts the history keeps —
 * but no frozen document makes it a guard the way doc 54 S11 makes the decline
 * reason one. Requiring it here would be inventing a rule; the column holds it
 * when it is given.
 */
public record AssignRequestBody(
        @NotNull
        UUID salesOwnerId,

        String reason) {
}
