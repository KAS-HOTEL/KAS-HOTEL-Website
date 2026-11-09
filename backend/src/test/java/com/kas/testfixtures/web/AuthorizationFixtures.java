package com.kas.testfixtures.web;

import com.kas.platform.security.PublicEndpoint;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Deliberately non-production controllers, used to prove the deny-by-default
 * rule actually catches a violation.
 *
 * <p>These live in {@code com.kas.testfixtures}, <strong>outside</strong>
 * {@code com.kas.platform}, so Spring's component scan never registers them and
 * no fixture route can reach a running application. They exist only as bytecode
 * for ArchUnit to inspect.
 */
public final class AuthorizationFixtures {

    private AuthorizationFixtures() {
    }

    /** Compliant: declares the permission it needs. */
    @RestController
    public static class MethodDeclaredController {

        @GetMapping("/fixture/method-declared")
        @PreAuthorize("hasAuthority('reservation.view')")
        public String handler() {
            return "";
        }
    }

    /** Compliant: the whole controller declares one permission. */
    @RestController
    @PreAuthorize("hasAuthority('inventory.view')")
    public static class ClassDeclaredController {

        @GetMapping("/fixture/class-declared")
        public String handler() {
            return "";
        }
    }

    /** Compliant: unauthenticated on purpose, with the reason written down. */
    @RestController
    public static class PublicDeclaredController {

        @GetMapping("/fixture/public-declared")
        @PublicEndpoint(reason = "Fixture standing in for the doc 58 §3 public surface")
        public String handler() {
            return "";
        }
    }

    /** <strong>Non-compliant.</strong> The rule must catch this one. */
    @RestController
    public static class UndeclaredController {

        @GetMapping("/fixture/undeclared")
        public String handler() {
            return "";
        }
    }
}
