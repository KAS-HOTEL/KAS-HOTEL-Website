package com.kas.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Forces the CSRF token to be issued on every response.
 *
 * <p>Spring Security 6 loads the CSRF token lazily, so the {@code XSRF-TOKEN}
 * cookie is only written once something reads the token. Without this, a client
 * that has never made a request which happened to touch it would have no token
 * to submit, and its first {@code POST /api/v1/public/auth/login} would be
 * refused with 403.
 *
 * <p>The alternative was to exempt login from CSRF. That was rejected: doc 58
 * §10 requires anti-CSRF on state-changing requests without carving out
 * exceptions, and doc 58 defines no endpoint whose purpose is handing out a
 * token. Reading the token here costs one call and keeps the rule absolute.
 */
class CsrfCookieFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (token != null) {
            // Rendering the token is what causes the repository to write the cookie.
            token.getToken();
        }
        chain.doFilter(request, response);
    }
}
