package com.kas.platform.pricing;

/** Matches the PostgreSQL enum {@code kas.rate_scope}. */
public enum RateScope {

    /** Applies to every room type of a property. {@code property_id} is set. */
    PROPERTY,

    /** Applies to one room type. {@code room_type_id} is set. */
    ROOM_TYPE
}
