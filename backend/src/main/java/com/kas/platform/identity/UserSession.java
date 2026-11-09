package com.kas.platform.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * One authenticated session — the server-side half of the token pair.
 *
 * <p>Doc 59 §8 requires server-side revocation: "logout genuinely invalidates".
 * That is only possible because this row exists; a purely stateless token could
 * not be withdrawn before it expired.
 *
 * <p><strong>The refresh token itself is never held here.</strong> The table
 * stores {@code refresh_token_hash} only, so a database disclosure does not hand
 * over usable sessions. That is also why this record carries no token field:
 * there is nothing to expose.
 *
 * @param lastSeenAt drives the device list in {@code GET /me/sessions} (doc 58 §4)
 * @param revokedAt  non-null once withdrawn; revoked sessions are never deleted,
 *                   so "who signed out when" survives for audit
 */
public record UserSession(
        UUID id,
        UUID userId,
        String device,
        String ip,
        String userAgent,
        Instant createdAt,
        Instant lastSeenAt,
        Instant expiresAt,
        Instant revokedAt) {

    public boolean isActive(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    /** Never renders the id of a session alongside anything identifying. */
    @Override
    public String toString() {
        return "session[" + id + " user=" + userId + " active=" + (revokedAt == null) + "]";
    }
}
