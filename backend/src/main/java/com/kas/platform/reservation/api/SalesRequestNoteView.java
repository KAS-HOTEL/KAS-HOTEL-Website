package com.kas.platform.reservation.api;

import java.time.OffsetDateTime;

/**
 * One internal note — doc 58 §5,
 * {@code GET /sales/requests/{reference}/notes}: <em>"Internal. No guest surface
 * exists"</em>.
 *
 * <h2>Two fields, because two are all that may be said</h2>
 *
 * {@code reservation_note} stores an {@code admin_id} on every row and this view
 * returns none of it. {@code app_user} has no name column, its only
 * human-readable identifier is an email address, and no frozen document permits
 * disclosing staff identity between colleagues — doc 134 §5 recorded that as an
 * open question. The authorship is kept in the record and withheld from the
 * response until there is a ruling; the status timeline made the same call for
 * the same reason.
 *
 * <h2>Never guest-visible</h2>
 *
 * V14's own comment is emphatic: <em>"INTERNAL. NEVER guest-visible. A separate
 * table from {@code reservation_message} by design, not a visibility flag."</em>
 * There is therefore no field here that could turn a note guest-facing, and this
 * type is reachable only from the admin controller. Doc 21 §604 states the rule
 * it protects: <strong>the public customer must never see internal notes</strong>.
 */
public record SalesRequestNoteView(
        String body,
        OffsetDateTime createdAt) {
}
