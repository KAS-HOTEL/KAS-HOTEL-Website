package com.kas.platform.property;

/**
 * The nine facility kinds — the {@code facility_type} enum V1 froze, and the
 * same list doc 23 §5 gives for {@code FacilityBlock.type}.
 *
 * <p>The vocabulary is closed on purpose. Doc 23 §5's whole argument is that a
 * facility block is <em>"a typed block available to every property"</em> — the
 * mechanism that lets Milestone stand out by <em>having</em> more rather than by
 * the system <em>permitting</em> it more. A free-text type would let one property
 * invent a block kind the others cannot have, which is the failure mode the rule
 * exists to prevent.
 */
public enum FacilityType {
    RESTAURANT,
    BAR,
    ROOFTOP,
    GYM,
    POOL,
    SPA,
    MEETING,
    LOUNGE,
    TERRACE
}
