package com.kas.platform.identity;

/** Matches the PostgreSQL enum {@code kas.user_status}. */
public enum UserStatus {
    UNVERIFIED,
    ACTIVE,
    SUSPENDED,
    /** Offboarded. Doc 59 §8: sessions are revoked immediately on disable. */
    DISABLED;

    /** Only an ACTIVE account may authenticate. Deny by default. */
    public boolean mayAuthenticate() {
        return this == ACTIVE;
    }
}
