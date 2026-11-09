package com.kas.platform.property;

/**
 * Matches the PostgreSQL enum {@code kas.room_type_status}, and doc 52 §3.2:
 * {@code DRAFT → PUBLISHED → UNLISTED → ARCHIVED}.
 */
public enum RoomTypeStatus {
    DRAFT,
    PUBLISHED,
    UNLISTED,
    ARCHIVED;

    /**
     * Doc 52 §3.2: a room type is public only when PUBLISHED.
     *
     * <p>Visible is not the same as bookable. A published room type appears on
     * the property page; whether it can be booked depends on inventory and rates,
     * which are Phase 7.5E. Nothing here implies availability.
     */
    public boolean isPubliclyVisible() {
        return this == PUBLISHED;
    }

    /**
     * Doc 52 §3.2 lifecycle: {@code DRAFT → PUBLISHED → UNLISTED → ARCHIVED}.
     *
     * <p>{@code UNLISTED} can return to {@code PUBLISHED} — that is what makes it
     * different from {@code ARCHIVED}, which is terminal. Archiving is the only
     * one-way door, and it is deliberately not reversible: an archived room type
     * may still be referenced by historical reservation lines, so bringing it
     * back would change what those lines appear to mean.
     */
    public boolean canTransitionTo(RoomTypeStatus target) {
        if (this == target) {
            return false;
        }
        return switch (this) {
            case DRAFT -> target == PUBLISHED || target == ARCHIVED;
            case PUBLISHED -> target == UNLISTED || target == ARCHIVED;
            case UNLISTED -> target == PUBLISHED || target == ARCHIVED;
            case ARCHIVED -> false;
        };
    }

    /**
     * Whether a Partner may make this transition on their own.
     *
     * <p><strong>A Partner may never publish.</strong> Withdrawing a room type
     * ({@code UNLISTED}, {@code ARCHIVED}) only ever removes it from the public
     * site, so it is safe to do unilaterally. Publishing adds content to a live
     * property, and doing that without review would route around the Phase 7.5A
     * approval workflow entirely — on an already-approved property a Partner
     * could otherwise publish arbitrary new rooms with nobody looking.
     *
     * <p>Publication therefore happens only through property approval, which is
     * where a reviewer sees the rooms. This is also what keeps OQ-098 from
     * getting worse: room editing cannot widen what is publicly visible.
     */
    public boolean isPartnerPermittedTransition(RoomTypeStatus target) {
        return canTransitionTo(target) && target != PUBLISHED;
    }
}
