package com.kas.platform.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * A platform user. One table serves customers and staff, differentiated by role
 * assignment — doc 52 §3.17.
 *
 * <p><strong>This record deliberately has no {@code passwordHash} field.</strong>
 * Doc 58 §9 lists {@code passwordHash} on the public response denylist, and doc
 * 58 §9 layer 2 states the enforcement style: "the field does not exist".
 * Credentials are loaded only by {@link IdentityRepository#findCredential}, into
 * {@link StoredCredential}, which never leaves this module.
 *
 * @param lockedUntil progressive lockout, doc 58 §10. The threshold is a
 *                    security control rather than a business value, so it is set
 *                    by the authentication service when that ships in a later
 *                    phase — not invented here.
 */
public record AppUser(
        UUID id,
        String email,
        UserStatus status,
        boolean twoFactorEnabled,
        String locale,
        Instant emailVerifiedAt,
        Instant lockedUntil) {

    /** True when the account may currently authenticate at all. */
    public boolean isActive(Instant now) {
        return status.mayAuthenticate() && (lockedUntil == null || lockedUntil.isBefore(now));
    }
}
