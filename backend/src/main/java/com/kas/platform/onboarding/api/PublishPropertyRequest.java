package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.NotNull;

/**
 * The body of {@code POST /admin/properties/{id}/publish}.
 *
 * <p>One field, and it is required for the same reason
 * {@link UpdatePropertyRequest} requires it: doc 58 §2 puts
 * {@code If-Match} / {@code version} on every MASTER update, and publishing is
 * the most consequential update a property has — it is what makes the hotel
 * bookable. Without it, an operator could publish over an edit they never saw.
 *
 * <p>Carried in the body rather than as a header for the same reason as the
 * update contract: {@code version} is already the domain's concurrency token,
 * and an {@code If-Match} header would additionally require an {@code ETag} on
 * every {@code GET}.
 *
 * <p><strong>No lifecycle field.</strong> The target state is not the caller's
 * to choose — publishing means {@code OPEN} and nothing else, so accepting a
 * state would invite a caller to ask for one this endpoint does not perform.
 */
public record PublishPropertyRequest(

        @NotNull(message = "must be supplied so a concurrent edit cannot be overwritten")
        Integer version) {
}
