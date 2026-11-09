package com.kas.platform.inventory;

/** Matches the PostgreSQL enum {@code kas.buffer_type}. */
public enum BufferType {

    /** An absolute number of rooms withheld from direct sale. */
    FIXED_ROOMS,

    /**
     * A percentage of {@code total}, rounded <strong>up</strong>.
     *
     * <p>Doc 13 §3.4c ¶3 and doc 55 §6.1 both state the rounding direction and
     * the reason: "under-buffering is the costlier error". A fraction of a room
     * cannot be withheld, and rounding down would quietly expose the room the
     * buffer exists to protect.
     */
    PERCENTAGE
}
