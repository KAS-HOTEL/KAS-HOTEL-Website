package com.kas.platform.property;

/**
 * Who a policy applies to.
 *
 * <p>Derived from the {@code (partner_id, property_id)} pair V32 introduced
 * rather than stored: the columns are the truth, and a third column repeating
 * them could disagree with them.
 */
public enum PolicyScope {

    /** Applies to every property of the partner, stored once. */
    SHARED,

    /** Applies to one property, overriding the shared policy of the same type. */
    PROPERTY,

    /** PRIVACY, TERMS, COOKIES — owned by the platform, not by a partner. */
    PLATFORM;

    public static PolicyScope of(PropertyPolicy policy) {
        if (policy.propertyId() != null) {
            return PROPERTY;
        }
        return policy.partnerId() == null ? PLATFORM : SHARED;
    }
}
