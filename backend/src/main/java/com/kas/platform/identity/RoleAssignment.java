package com.kas.platform.identity;

import com.kas.platform.shared.scope.ScopeKind;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * One grant of a role within a scope — doc 85 §4.4.
 *
 * <p>The database already enforces the scope/column consistency with a CHECK
 * constraint. This record repeats it so the failure surfaces on read as well as
 * on write, which matters because a row could predate a constraint change.
 */
public record RoleAssignment(
        UUID id,
        UUID userId,
        UserRole role,
        ScopeKind scopeKind,
        UUID partnerId,
        Set<UUID> propertyIds,
        Instant grantedAt,
        Instant revokedAt) {

    public RoleAssignment {
        propertyIds = propertyIds == null ? Set.of() : Set.copyOf(propertyIds);

        boolean consistent = switch (scopeKind) {
            case GLOBAL, OWN -> partnerId == null && propertyIds.isEmpty();
            case PARTNER -> partnerId != null && propertyIds.isEmpty();
            case PROPERTY -> partnerId == null;
        };
        if (!consistent) {
            throw new IllegalStateException(
                    "role_assignment " + id + " violates the scope consistency rule for " + scopeKind);
        }
    }

    /** Doc 59 §8: offboarding revokes; a revoked assignment grants nothing. */
    public boolean isActive() {
        return revokedAt == null;
    }
}
