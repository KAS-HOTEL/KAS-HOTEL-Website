package com.kas.platform.reservation.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The internal-note body — doc 58 §5,
 * {@code POST /sales/requests/{reference}/notes · sales.request.manage}.
 *
 * <h2>One field, because the table has one</h2>
 *
 * {@code reservation_note} carries {@code body}, plus an {@code admin_id} and a
 * {@code created_at} the server supplies. Nothing else is accepted: a note that
 * could name someone else as its author, or claim a time it was not written, is
 * not a record. {@code spring.jackson.fail-on-unknown-properties} makes any
 * attempt a <strong>400</strong> rather than a silently ignored field.
 *
 * <p>No category, priority, tag, mention or visibility flag. Doc 58 defines none,
 * and V14 keeps guest-visible messages in a <em>separate table</em> precisely so
 * that no flag on this one can make a note guest-facing.
 *
 * <h2>Validation</h2>
 *
 * {@code @NotBlank} mirrors the table's own
 * {@code CHECK (length(btrim(body)) > 0)} — a whitespace-only note passes "a
 * field was sent" and records nothing, and the constraint would refuse it anyway;
 * catching it at the edge turns a 500 into a 400 naming the field.
 *
 * <p>The length cap is a storage bound rather than a business rule: the column is
 * {@code text} and unbounded, and no document sets a limit. It matches the cap
 * {@link ContactRequestBody} already applies to its notes, so one internal free
 * text field is not treated differently from another.
 */
public record NoteRequestBody(
        @NotBlank
        @Size(max = 4000)
        String body) {
}
