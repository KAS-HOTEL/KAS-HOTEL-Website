package com.kas.platform.security;

import com.kas.platform.identity.RoleCatalogue;
import com.kas.platform.identity.UserRole;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.util.Set;
import java.util.function.Supplier;

/**
 * URL-level gate for {@code /api/v1/admin/**}: the caller must be authenticated and hold
 * at least one permission that is not in the customer's self-service bundle.
 *
 * <p>This is a coarse first layer, decided from permissions (doc 59 §1: "permission
 * checks, never hard-coded role names"). It only stops non-staff accounts before request
 * binding; every handler still checks its exact permission with {@code @PreAuthorize},
 * and repositories still apply the authorization scope.
 */
final class ConsoleAccess {

    private static final Set<String> CUSTOMER_PERMISSIONS = RoleCatalogue.permissionsFor(UserRole.CUSTOMER);

    private ConsoleAccess() {
    }

    static AuthorizationManager<RequestAuthorizationContext> manager() {
        return ConsoleAccess::check;
    }

    static AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {
        Authentication auth = authentication.get();
        if (auth == null || !auth.isAuthenticated()
                || auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken) {
            return new AuthorizationDecision(false);
        }
        for (GrantedAuthority authority : auth.getAuthorities()) {
            if (!CUSTOMER_PERMISSIONS.contains(authority.getAuthority())) return new AuthorizationDecision(true);
        }
        return new AuthorizationDecision(false);
    }
}
