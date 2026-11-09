package com.kas.platform.shared.scope;

import java.util.Set;
import java.util.UUID;

/**
 * The resolved reach of the current actor.
 *
 * <p>Doc 59 §7.3 and doc 85 §5.4: scope is applied <em>at the data layer</em>,
 * not only in controllers, so a forgotten controller check cannot leak another
 * partner's or property's data.
 *
 * <p>The validation below mirrors the {@code role_assignment} CHECK constraint
 * in doc 85 §4.4 exactly, so an inconsistent scope is refused in the
 * application as well as in the database. Two independent layers.
 *
 * @param kind        which scope kind resolved
 * @param partnerId   set only when {@code kind == PARTNER}
 * @param propertyIds set only when {@code kind == PROPERTY}; may be empty, which
 *                    legitimately reaches nothing
 * @param actorId     the acting user, always present
 */
public record AuthorizationScope(ScopeKind kind, UUID partnerId, Set<UUID> propertyIds, UUID actorId) {

    public AuthorizationScope {
        if (actorId == null) {
            throw new IllegalArgumentException("actorId is required on every scope");
        }
        propertyIds = propertyIds == null ? Set.of() : Set.copyOf(propertyIds);

        switch (kind) {
            case GLOBAL, OWN -> {
                if (partnerId != null || !propertyIds.isEmpty()) {
                    throw new IllegalArgumentException(
                            kind + " scope carries neither a partner nor properties");
                }
            }
            case PARTNER -> {
                if (partnerId == null || !propertyIds.isEmpty()) {
                    throw new IllegalArgumentException(
                            "PARTNER scope requires a partnerId and no explicit properties");
                }
            }
            case PROPERTY -> {
                if (partnerId != null) {
                    throw new IllegalArgumentException(
                            "PROPERTY scope carries explicit properties, not a partnerId");
                }
            }
        }
    }

    public static AuthorizationScope global(UUID actorId) {
        return new AuthorizationScope(ScopeKind.GLOBAL, null, Set.of(), actorId);
    }

    public static AuthorizationScope partner(UUID actorId, UUID partnerId) {
        return new AuthorizationScope(ScopeKind.PARTNER, partnerId, Set.of(), actorId);
    }

    public static AuthorizationScope property(UUID actorId, Set<UUID> propertyIds) {
        return new AuthorizationScope(ScopeKind.PROPERTY, null, propertyIds, actorId);
    }

    public static AuthorizationScope own(UUID actorId) {
        return new AuthorizationScope(ScopeKind.OWN, null, Set.of(), actorId);
    }

    /**
     * Whether this scope can reach property-owned records at all.
     *
     * <p>{@code OWN} cannot: a customer reaches their own reservations through
     * ownership checks, never through the property-scoped admin path.
     */
    public boolean reachesProperties() {
        return kind != ScopeKind.OWN;
    }

    /**
     * Never log or serialise a scope into a guest-facing response — doc 58 §9
     * lists {@code permissions[]} and {@code roleAssignments} on the denylist.
     * This rendering exists for audit records and internal diagnostics only.
     */
    @Override
    public String toString() {
        return switch (kind) {
            case GLOBAL -> "scope[GLOBAL]";
            case PARTNER -> "scope[PARTNER partner=" + partnerId + "]";
            case PROPERTY -> "scope[PROPERTY properties=" + propertyIds.size() + "]";
            case OWN -> "scope[OWN]";
        };
    }
}
