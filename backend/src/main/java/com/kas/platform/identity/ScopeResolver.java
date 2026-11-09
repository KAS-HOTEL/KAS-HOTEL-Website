package com.kas.platform.identity;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Turns a user's active role assignments into one {@link ResolvedActor}.
 *
 * <p>Doc 59 §7.1 — deny by default — is the governing rule here. A user with no
 * active assignment resolves to zero permissions and {@code OWN} scope, which
 * reaches nothing. There is no branch that produces a default grant.
 */
@Component
public class ScopeResolver {

    public ResolvedActor resolve(AppUser user, Collection<RoleAssignment> assignments) {
        List<RoleAssignment> active = assignments.stream()
                .filter(RoleAssignment::isActive)
                .toList();

        Set<UserRole> roles = active.stream()
                .map(RoleAssignment::role)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());

        Set<String> permissions = new HashSet<>();
        for (UserRole role : roles) {
            permissions.addAll(RoleCatalogue.permissionsFor(role));
        }

        return new ResolvedActor(user.id(), user.email(), roles,
                Set.copyOf(permissions), widestScope(user.id(), active));
    }

    /**
     * The broadest scope held: {@code GLOBAL > PARTNER > PROPERTY > OWN}.
     *
     * <p>Holding assignments across two partners is refused rather than
     * silently narrowed or silently widened. V1 has exactly one partner
     * (doc 85 §1), so this cannot occur legitimately; if it ever does, it is a
     * data defect and must be visible.
     */
    private AuthorizationScope widestScope(UUID actorId, List<RoleAssignment> active) {
        if (active.stream().anyMatch(a -> a.scopeKind() == ScopeKind.GLOBAL)) {
            return AuthorizationScope.global(actorId);
        }

        Set<UUID> partners = active.stream()
                .filter(a -> a.scopeKind() == ScopeKind.PARTNER)
                .map(RoleAssignment::partnerId)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());

        if (partners.size() > 1) {
            throw new IllegalStateException(
                    "User " + actorId + " holds PARTNER scope for " + partners.size()
                            + " partners. Cross-partner scope is not modelled (doc 85 §1: V1 has one "
                            + "partner). Refusing to resolve rather than guess which partner applies.");
        }
        if (partners.size() == 1) {
            return AuthorizationScope.partner(actorId, partners.iterator().next());
        }

        Set<UUID> properties = active.stream()
                .filter(a -> a.scopeKind() == ScopeKind.PROPERTY)
                .flatMap(a -> a.propertyIds().stream())
                .collect(java.util.stream.Collectors.toUnmodifiableSet());

        if (!properties.isEmpty()) {
            return AuthorizationScope.property(actorId, properties);
        }

        return AuthorizationScope.own(actorId);
    }
}
