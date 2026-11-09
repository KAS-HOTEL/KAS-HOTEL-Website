package com.kas.platform.property;

/**
 * Matches the PostgreSQL enum {@code kas.property_lifecycle_state}.
 *
 * <p>Doc 52 §3.1 lifecycle:
 * {@code DRAFT → COMING_SOON → OPEN → TEMPORARILY_CLOSED → CLOSED}.
 */
public enum PropertyLifecycleState {

    DRAFT,
    COMING_SOON,
    OPEN,
    TEMPORARILY_CLOSED,
    CLOSED;

    /**
     * Whether a property in this state appears on the public site.
     *
     * <p>Doc 52 §3.1: public when {@code OPEN}, {@code COMING_SOON} or
     * {@code TEMPORARILY_CLOSED}. Doc 58 §3.1 excludes {@code DRAFT} and
     * {@code CLOSED} from {@code GET /public/properties}.
     */
    public boolean isPubliclyVisible() {
        return this == OPEN || this == COMING_SOON || this == TEMPORARILY_CLOSED;
    }
}
