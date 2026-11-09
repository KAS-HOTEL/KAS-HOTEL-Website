package com.kas.platform.security;

import java.util.Locale;

/**
 * Which host a request reached the API through (server separation, doc 156).
 *
 * <p>The public website ({@code kasluxuryhotel.com}, {@code frontend/server.js}) and the
 * staff console ({@code admin.kasluxuryhotel.com}, Next.js {@code src/proxy.ts}) both
 * forward {@code /api/v1} to this one backend. Each proxy <em>overwrites</em>
 * {@value #HEADER} with its own surface, so a browser cannot choose it. The backend is
 * not reachable from the internet except through those proxies (Render private
 * network; webdemo internal Docker network).
 *
 * <p>The surface only narrows who may sign in where: staff accounts sign in on the
 * console, customers on the website. A request without the header (direct calls in
 * tests and local development) keeps the behaviour from before the separation.
 * Authorization never depends on it: {@code ConsoleAccess}, {@code @PreAuthorize} and
 * the repository scope still decide every request.
 */
public enum ClientSurface {
    /** The public customer website. */
    CUSTOMER_SITE,
    /** The staff console (Admin / Super Admin). */
    CONSOLE,
    /** No surface declared: direct API call, test or local development. */
    UNSPECIFIED;

    public static final String HEADER = "X-KAS-Surface";

    /** {@code customer} or {@code console}; anything else is {@link #UNSPECIFIED}. */
    public static ClientSurface fromHeader(String value) {
        if (value == null) return UNSPECIFIED;
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "customer" -> CUSTOMER_SITE;
            case "console" -> CONSOLE;
            default -> UNSPECIFIED;
        };
    }
}
