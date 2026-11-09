package com.kas.platform.identity;

/**
 * The V1 role catalogue — doc 59 §3. Matches the PostgreSQL enum
 * {@code kas.user_role} exactly.
 *
 * <p>Three roles ship in V1. {@code SALES}, {@code RESERVATIONS_STAFF},
 * {@code CONTENT_MANAGER}, {@code HOTEL_MANAGER}, {@code RECEPTIONIST} and
 * {@code ACCOUNTANT} are <strong>deliberately absent</strong>: doc 59 §3 notes
 * that KAS has not supplied its team structure (config B24, B25), and
 * "creating roles before knowing who fills them produces roles nobody holds".
 * Their permissions already exist in {@link Permissions}, so introducing a role
 * later is configuration rather than engineering.
 */
public enum UserRole {

    /** OWN scope. Guest with an account. */
    CUSTOMER,

    /**
     * PARTNER scope in V1 — doc 85 §5.2 supersedes the earlier
     * {@code propertyScope = ALL}. Resolves to the single KAS partner and
     * therefore all eight properties.
     */
    ADMIN,

    /** GLOBAL scope. Users, roles, settings, audit, all partners. */
    SUPER_ADMIN
}
