package com.kas.platform.security.api;

import com.kas.platform.identity.UserSession;

import java.time.Instant;
import java.util.UUID;

/**
 * One session, as its owner sees it — doc 58 §4, "Session list with device and
 * last-seen" (doc 06 §5.3).
 *
 * <p>The point of the feature is that a person can spot a session they do not
 * recognise, so device, address and last-seen are exactly what must be shown.
 * This is the caller's own data, returned only to the caller.
 *
 * <p><strong>Absent, deliberately:</strong> the refresh token, its digest,
 * {@code userId}, and anything about roles or permissions. Doc 58 §9 denylists
 * {@code refreshTokenHash}, {@code permissions[]} and {@code roleAssignments};
 * none of them has a field here to occupy.
 *
 * <p><strong>{@code expiresAt} is also absent</strong>, and that one was found by
 * the denylist test rather than by inspection. The name is denylisted for hold
 * mechanics (doc 58 §9, INVENTORY group; doc 52 §7 "Hold rows, {@code expiresAt},
 * hold mechanics — internal only"). A session expiry is a different thing that
 * happens to share the name, so it could have been justified as an exception —
 * but the field earns nothing here that {@code lastSeenAt} does not already
 * give, and one documented name exception in the denylist ({@code total} as
 * Money) is enough. Dropping the field was cheaper than weakening the rule.
 *
 * @param current whether this is the session making the request, so the UI can
 *                warn before someone signs out the device they are holding
 */
public record SessionView(
        UUID id,
        String device,
        String ip,
        Instant createdAt,
        Instant lastSeenAt,
        boolean current) {

    static SessionView of(UserSession session, boolean current) {
        return new SessionView(
                session.id(),
                session.device(),
                session.ip(),
                session.createdAt(),
                session.lastSeenAt(),
                current);
    }
}
