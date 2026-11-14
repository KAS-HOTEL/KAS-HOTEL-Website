package com.kas.platform.shared;

/**
 * A mail command was stored in the outbox. Published inside the caller's transaction; the
 * dispatcher reacts after commit so the mail leaves at once instead of at the next poll.
 */
public record EmailQueuedEvent(String eventKey) {
}
