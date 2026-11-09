package com.kas.platform.identity;

import java.util.UUID;

/**
 * An Argon2id password hash, loaded only for verification.
 *
 * <p>Package-private accessors are not possible on a record component, so the
 * protections are: this type is never referenced outside the {@code identity}
 * and {@code security} modules (asserted by {@code CredentialContainmentTest}),
 * and {@link #toString()} is redacted so it cannot reach a log line through an
 * interpolated message.
 */
public record StoredCredential(UUID userId, String passwordHash) {

    @Override
    public String toString() {
        return "StoredCredential[userId=" + userId + ", passwordHash=<redacted>]";
    }
}
