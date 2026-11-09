package com.kas.platform.property;

/**
 * Matches the PostgreSQL enum {@code kas.rule_status}, shared with rate and tax
 * rules.
 *
 * <p>{@code PAUSED} is what distinguishes this from the room-type lifecycle: a
 * policy can be temporarily withdrawn and brought back, whereas
 * {@code ARCHIVED} is terminal. That matters because a policy version may be
 * pinned by a reservation's {@code terms_version}, so its record must survive
 * even after it stops applying to new bookings.
 */
public enum PolicyStatus {

    DRAFT,
    ACTIVE,
    PAUSED,
    ARCHIVED;

    /** Only an ACTIVE policy can be the current one for a property. */
    public boolean isEffective() {
        return this == ACTIVE;
    }

    /**
     * Doc 52 §3.1-style lifecycle, read from the enum's own semantics:
     * {@code DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED}, with {@code ARCHIVED} terminal.
     *
     * <p>A policy is never deleted. Historical versions stay readable because a
     * reservation may have pinned one.
     */
    public boolean canTransitionTo(PolicyStatus target) {
        if (this == target) {
            return false;
        }
        return switch (this) {
            case DRAFT -> target == ACTIVE || target == ARCHIVED;
            case ACTIVE -> target == PAUSED || target == ARCHIVED;
            case PAUSED -> target == ACTIVE || target == ARCHIVED;
            case ARCHIVED -> false;
        };
    }
}
