package com.kas.platform.identity;

import com.kas.platform.shared.scope.AuthorizationScope;

import java.util.Set;
import java.util.UUID;

/**
 * Everything authorisation needs about the current actor, resolved once per
 * request: who they are, what they may do, and how far they reach.
 *
 * @param permissions the union of the actor's role bundles. Empty means the
 *                    actor may do nothing — which is the correct outcome for a
 *                    user holding no active role assignment.
 */
public record ResolvedActor(
        UUID userId,
        String email,
        Set<UserRole> roles,
        Set<String> permissions,
        AuthorizationScope scope) {

    public ResolvedActor {
        roles = Set.copyOf(roles);
        permissions = Set.copyOf(permissions);
    }

    public boolean has(String permission) {
        return permissions.contains(permission);
    }

    /**
     * Never include permissions or the email in a message that could reach a
     * guest — doc 58 §9 denylists {@code permissions[]} and {@code roleAssignments}.
     */
    @Override
    public String toString() {
        return "actor[" + userId + " roles=" + roles + " " + scope + "]";
    }
}
