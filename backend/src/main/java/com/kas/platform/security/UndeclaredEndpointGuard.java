package com.kas.platform.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Runtime deny-by-default: a handler that declares no authorisation is refused.
 *
 * <p>Doc 59 §7.1 — "An endpoint with no declaration <strong>fails closed</strong>
 * and fails a CI check." {@code DenyByDefaultTest} is the CI check. This is the
 * fails-closed half.
 *
 * <h2>Why both</h2>
 *
 * <p>Phase 7.3 ended the filter chain in {@code denyAll()}, which made every
 * route unreachable until it was explicitly opened. Phase 7.4 had to open
 * {@code /api/v1/me/**} and {@code /api/v1/admin/**} to authenticated callers,
 * because that is where the real endpoints live — and that alone would mean a
 * newly added controller is reachable by <em>any</em> authenticated user until
 * someone remembers {@code @PreAuthorize}.
 *
 * <p>A build-time test catches that, but only for code that goes through the
 * build. This interceptor closes it at runtime as well, so the guarantee does
 * not depend on a test having been run. The phase brief is explicit that there
 * must be no implicit permission because "the controller exists".
 */
@Component
public class UndeclaredEndpointGuard implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(UndeclaredEndpointGuard.class);

    static final String DEFAULT_GUARDED_PACKAGE = "com.kas.platform";

    private final String guardedPackage;

    UndeclaredEndpointGuard() {
        this(DEFAULT_GUARDED_PACKAGE);
    }

    /** Package prefix constructor, so the guard can be exercised against fixtures. */
    UndeclaredEndpointGuard(String guardedPackage) {
        this.guardedPackage = guardedPackage;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if (handler instanceof HandlerMethod method && isGuarded(method) && !declaresAuthorization(method)) {
            log.error("REFUSED: {} {} resolved to {}, which declares neither @PreAuthorize nor "
                            + "@PublicEndpoint. Deny by default (doc 59 §7.1).",
                    request.getMethod(), request.getRequestURI(), method.getShortLogMessage());
            throw new AccessDeniedException("Endpoint declares no authorisation contract.");
        }
        return true;
    }

    /** Only KAS handlers. Actuator and framework endpoints have their own rules. */
    private boolean isGuarded(HandlerMethod method) {
        return method.getBeanType().getPackageName().startsWith(guardedPackage);
    }

    /**
     * A class-level declaration covers its methods — a legitimate way to say
     * "this whole controller requires this permission", which several of the doc
     * 58 admin route trees will use.
     */
    static boolean declaresAuthorization(HandlerMethod method) {
        return method.getMethodAnnotation(PreAuthorize.class) != null
                || method.getMethodAnnotation(PublicEndpoint.class) != null
                || method.getBeanType().isAnnotationPresent(PreAuthorize.class)
                || method.getBeanType().isAnnotationPresent(PublicEndpoint.class);
    }
}
