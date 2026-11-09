package com.kas.platform.media;

/**
 * Matches the PostgreSQL enum {@code kas.media_owner_type}.
 *
 * <p>All six values are modelled because the column holds them, but only
 * {@link #PROPERTY} and {@link #ROOM_TYPE} are {@linkplain #isPartnerManageable
 * manageable through the Partner API} in this phase. The others exist in the
 * schema for surfaces that do not yet have endpoints; accepting them here would
 * mean writing links whose ownership this module cannot yet resolve to a partner.
 */
public enum MediaOwnerType {

    PROPERTY,
    ROOM_TYPE,
    FACILITY,
    OFFER,
    PAGE_BLOCK,
    REVIEW;

    /**
     * Whether a Partner may attach media to this owner kind today.
     *
     * <p>Ownership must resolve to a partner for the scope filter to work.
     * {@code PROPERTY} resolves directly and {@code ROOM_TYPE} through its
     * property; {@code OFFER}, {@code PAGE_BLOCK} and {@code REVIEW} do not
     * belong to a partner at all, and {@code FACILITY} has no API yet.
     */
    public boolean isPartnerManageable() {
        return this == PROPERTY || this == ROOM_TYPE;
    }
}
