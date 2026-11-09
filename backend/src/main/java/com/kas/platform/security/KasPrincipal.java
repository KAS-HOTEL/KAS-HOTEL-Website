package com.kas.platform.security;

import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * The authenticated actor, as Spring Security sees them.
 *
 * <p>Authorities are the permission strings from doc 59 §4 verbatim — not
 * {@code ROLE_} names. Doc 59 §1 requires "permission checks, never hard-coded
 * role checks, wherever a future role might need the same capability", so
 * {@code @PreAuthorize("hasAuthority('inventory.adjust')")} is the only
 * supported form and {@code hasRole(...)} never appears.
 *
 * <p>Carries no password, no token and no hash — see
 * {@link com.kas.platform.identity.AppUser}.
 */
public record KasPrincipal(ResolvedActor actor, UUID sessionId) {

    /** For authorization tests and internal callers that have no HTTP session. */
    public KasPrincipal(ResolvedActor actor) {
        this(actor, null);
    }

    public UUID userId() {
        return actor.userId();
    }

    /** The reach applied at the repository boundary, doc 59 §7.3. */
    public AuthorizationScope scope() {
        return actor.scope();
    }

    public Set<String> permissions() {
        return actor.permissions();
    }

    public Collection<? extends GrantedAuthority> authorities() {
        return actor.permissions().stream()
                .map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast)
                .toList();
    }

    /** Never renders the email or the permission list — doc 58 §9. */
    @Override
    public String toString() {
        return "principal[" + actor.userId() + "]";
    }
}
