package com.kas.platform.security;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * Parses {@code kas.cors.allowed-origins} ({@code KAS_CORS_ALLOWED_ORIGINS}): a comma
 * separated list of exact browser origins.
 *
 * <p>Credentials (the session cookies) are allowed cross-origin, so a wildcard or a
 * malformed entry would widen access silently; such a value stops the application at
 * startup instead. Only {@code http} for loopback hosts and {@code https} everywhere
 * else are accepted, without path, query or trailing slash.
 */
final class CorsOrigins {

    private CorsOrigins() {
    }

    static List<String> parse(String raw) {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        if (raw == null) return List.of();
        for (String part : raw.split(",")) {
            String value = part.trim();
            if (value.isEmpty()) continue;
            origins.add(validate(value));
        }
        return new ArrayList<>(origins);
    }

    private static String validate(String value) {
        if (value.contains("*")) {
            throw invalid(value, "wildcards are not allowed while credentials are enabled");
        }
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException e) {
            throw invalid(value, "not a URI");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        if (host == null || uri.getUserInfo() != null) {
            throw invalid(value, "expected scheme://host[:port]");
        }
        if ((uri.getRawPath() != null && !uri.getRawPath().isEmpty())
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw invalid(value, "an origin has no path, query or trailing slash");
        }
        boolean loopback = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]");
        if (!scheme.equals("https") && !(scheme.equals("http") && loopback)) {
            throw invalid(value, "only https (or http for localhost) is allowed");
        }
        return scheme + "://" + host.toLowerCase(Locale.ROOT) + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
    }

    private static IllegalStateException invalid(String value, String reason) {
        return new IllegalStateException("KAS_CORS_ALLOWED_ORIGINS entry '" + value + "' is invalid: " + reason);
    }
}
