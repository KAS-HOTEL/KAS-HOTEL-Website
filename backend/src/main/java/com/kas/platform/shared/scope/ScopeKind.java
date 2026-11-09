package com.kas.platform.shared.scope;

/**
 * The four authorisation scope kinds frozen by doc 59 §2 and doc 85 §5.1.
 *
 * <p>These labels match the PostgreSQL enum {@code kas.scope_kind} exactly. The
 * database CHECK on {@code role_assignment} already refuses an inconsistent
 * combination; {@link AuthorizationScope} refuses the same combinations in the
 * application so the failure surfaces before a write is attempted.
 *
 * <p>{@code PARTNER} is a <em>scope kind, not a role</em> (doc 59 §2). No role
 * was added, renamed or removed to introduce it.
 */
public enum ScopeKind {

    /** The whole platform. {@code SUPER_ADMIN}. */
    GLOBAL,

    /**
     * One partner's properties, resolved as
     * {@code properties WHERE partner_id = assignment.partner_id}.
     * {@code ADMIN} holds this in V1 (doc 85 §5.2).
     */
    PARTNER,

    /**
     * Explicitly assigned properties. Held by no V1 role; modelled from day one
     * so future property-scoped roles are additive rather than a query audit.
     */
    PROPERTY,

    /** The actor's own records. {@code CUSTOMER}. */
    OWN
}
