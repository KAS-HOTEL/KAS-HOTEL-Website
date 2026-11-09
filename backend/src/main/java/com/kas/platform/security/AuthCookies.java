package com.kas.platform.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

/**
 * Reads and writes the token cookies.
 *
 * <p>Doc 59 §8 and doc 06 §5.3: "Tokens transported in {@code HttpOnly},
 * {@code Secure}, {@code SameSite} cookies — <strong>never
 * {@code localStorage}</strong>." Every cookie built here is {@code HttpOnly},
 * so no script can read a token even if one is injected into the page.
 *
 * <p>The refresh cookie is scoped to the auth path rather than {@code /}. It is
 * the long-lived credential — up to 30 days for a customer — and there is no
 * reason for it to ride along on every content and availability request, where
 * it would be exposed to a much larger surface.
 */
@Component
public class AuthCookies {

    static final String ACCESS_COOKIE = "kas_access";
    static final String REFRESH_COOKIE = "kas_refresh";

    /** Only the auth endpoints need the refresh token. */
    static final String REFRESH_PATH = "/api/v1/public/auth";

    private static final String SAME_SITE = "Lax";

    private final AuthenticationProperties properties;

    public AuthCookies(AuthenticationProperties properties) {
        this.properties = properties;
    }

    public ResponseCookie access(String token, Duration ttl) {
        return base(ACCESS_COOKIE, token, "/").maxAge(ttl).build();
    }

    public ResponseCookie refresh(String token, Duration ttl) {
        return base(REFRESH_COOKIE, token, REFRESH_PATH).maxAge(ttl).build();
    }

    /** Zero-age cookies with empty values, so logout clears them in the browser. */
    public ResponseCookie clearedAccess() {
        return base(ACCESS_COOKIE, "", "/").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie clearedRefresh() {
        return base(REFRESH_COOKIE, "", REFRESH_PATH).maxAge(Duration.ZERO).build();
    }

    public Optional<String> readAccess(HttpServletRequest request) {
        return read(request, ACCESS_COOKIE);
    }

    public Optional<String> readRefresh(HttpServletRequest request) {
        return read(request, REFRESH_COOKIE);
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, String path) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                // Off only for local plain-HTTP development; the base profile leaves it on.
                .secure(properties.secureCookies())
                .sameSite(SAME_SITE)
                .path(path);
    }

    private Optional<String> read(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return Optional.empty();
        }
        return Arrays.stream(request.getCookies())
                .filter(cookie -> name.equals(cookie.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }
}
