package com.kas.platform.reservation.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The contact-log body — doc 58 §5:
 * {@code POST /sales/requests/{reference}/contact · sales.request.manage · }<em>"Log a contact"</em>.
 *
 * <p>The four fields are doc 54 S5's side effect — <em>"contact recorded:
 * channel, direction, outcome"</em> — plus the notes doc 29:275 and doc 21:591
 * both list alongside them: <em>"channel, direction, outcome, notes, timestamp,
 * agent"</em>. Timestamp and agent are not here: the first is the column's own
 * {@code DEFAULT now()} and the second is the authenticated caller. Accepting
 * either from a client would let an agent log a conversation at a time it did
 * not happen, or in someone else's name.
 *
 * <h2>Required exactly where the column is</h2>
 *
 * {@code reservation_contact_log} (V14:32) makes {@code channel} and
 * {@code direction} {@code NOT NULL} and leaves {@code outcome} and
 * {@code notes} nullable. The validation mirrors that and nothing more, so a
 * caller cannot be refused for omitting something the record does not require.
 *
 * <h2>Why {@code @Pattern} and not a Java enum</h2>
 *
 * The values are the {@code contact_channel} and {@code contact_direction} enums
 * from V1:89-91, verbatim. Listing them here turns a bad value into a
 * <strong>400</strong> naming the field, in the same shape every other
 * field-level problem takes (doc 58 §2.1). A Java enum would fail during
 * deserialisation instead, and the message a failed enum bind produces carries
 * the type's name.
 *
 * <p><strong>No outcome vocabulary is invented.</strong> The column is free text
 * and no frozen document enumerates outcomes, so this does not either. The
 * length caps are there so a log entry cannot be used as unbounded storage.
 */
public record ContactRequestBody(
        @NotBlank
        @Pattern(regexp = "PHONE|EMAIL|ZALO|SMS|IN_PERSON")
        String channel,

        @NotBlank
        @Pattern(regexp = "OUTBOUND|INBOUND")
        String direction,

        @Size(max = 200)
        String outcome,

        @Size(max = 2000)
        String notes) {
}
