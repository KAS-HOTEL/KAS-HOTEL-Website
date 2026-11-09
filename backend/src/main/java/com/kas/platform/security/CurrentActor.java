package com.kas.platform.security;

import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

/**
 * Reads the authenticated actor from the security context.
 *
 * <p>{@link #requireScope()} is the intended entry point for anything that
 * queries partner- or property-owned data. It throws rather than returning a
 * permissive default, so "no actor" can never resolve to "sees everything" —
 * the failure mode doc 59 §7.1 exists to prevent.
 */
public final class CurrentActor {

    private CurrentActor() {
    }

    public static Optional<KasPrincipal> find() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return Optional.empty();
        }
        return authentication.getPrincipal() instanceof KasPrincipal principal
                ? Optional.of(principal)
                : Optional.empty();
    }

    public static KasPrincipal require() {
        return find().orElseThrow(() ->
                new AccessDeniedException("No authenticated actor in the security context."));
    }

    /** The reach to pass to a {@code ScopedRepository}. */
    public static AuthorizationScope requireScope() {
        return require().scope();
    }
}
