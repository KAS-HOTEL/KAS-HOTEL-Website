package com.kas.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * Per-IP request limits on the public endpoints that are worth abusing: sign-in,
 * registration, the account-email flows, booking requests and the public receipt.
 *
 * <p>A fixed window per (rule, client address), counted in memory. That is enough for
 * one backend instance; several instances each count on their own, and a CDN/WAF rule
 * remains the stronger guard. Account lockout (5 wrong passwords) still applies on top.
 *
 * <p>The client address is {@link HttpServletRequest#getRemoteAddr()}, which
 * {@code forward-headers-strategy: framework} takes from {@code X-Forwarded-For}. The
 * website's proxy ({@code frontend/server.js}) replaces that header with the address its
 * own trusted proxy reported, so a value typed by the client does not reach this filter.
 * The RFC 7239 {@code Forwarded} header is ignored altogether ({@link ProxyAddressConfig}).
 *
 * <p>Limits are per window ({@code kas.rate-limit.window}, default one minute) and
 * configurable; {@code kas.rate-limit.enabled=false} removes the filter (tests do).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@ConditionalOnProperty(name = "kas.rate-limit.enabled", havingValue = "true", matchIfMissing = true)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final int PRUNE_EVERY = 1000;

    record Rule(String name, String method, Pattern path, int limit) {
        boolean matches(String requestMethod, String requestPath) {
            return method.equals(requestMethod) && path.matcher(requestPath).matches();
        }
    }

    private static final class Window {
        private long startedAtMillis;
        private int count;
    }

    private final List<Rule> rules;
    private final long windowMillis;
    private final Clock clock;
    private final ObjectMapper json;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicLong seen = new AtomicLong();

    @Autowired
    public RateLimitFilter(Environment config, Clock clock, ObjectMapper json) {
        this(rules(config), config.getProperty("kas.rate-limit.window", Duration.class, Duration.ofMinutes(1)), clock, json);
    }

    RateLimitFilter(List<Rule> rules, Duration window, Clock clock, ObjectMapper json) {
        this.rules = List.copyOf(rules);
        this.windowMillis = window.toMillis();
        this.clock = clock;
        this.json = json;
    }

    static List<Rule> rules(Environment config) {
        return List.of(
                rule(config, "login", "POST", "/api/v1/public/auth/login", 20),
                rule(config, "register", "POST", "/api/v1/public/auth/customer-register", 5),
                rule(config, "account-email", "POST",
                        "/api/v1/public/auth/(forgot-password|resend-verification|verify-email|reset-password)", 10),
                rule(config, "booking", "POST", "/api/v1/public/reservations/requests", 10),
                // Each call can send an email: keep it as tight as the password-reset form.
                rule(config, "cancel-link", "POST", "/api/v1/public/cancellations/link", 10),
                rule(config, "receipt", "GET", "/api/v1/public/reservations/requests/[^/]+/sent", 30));
    }

    private static Rule rule(Environment config, String name, String method, String path, int defaultLimit) {
        int limit = config.getProperty("kas.rate-limit." + name, Integer.class, defaultLimit);
        return new Rule(name, method, Pattern.compile(path), limit);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        Rule rule = null;
        for (Rule candidate : rules) {
            if (candidate.matches(request.getMethod(), path)) { rule = candidate; break; }
        }
        if (rule == null || rule.limit() <= 0) {
            chain.doFilter(request, response);
            return;
        }
        long now = clock.millis();
        long retryAfterMillis = admit(rule.name() + "|" + request.getRemoteAddr(), rule.limit(), now);
        if (retryAfterMillis < 0) {
            chain.doFilter(request, response);
            return;
        }
        log.info("rate limited rule={} correlationId={}", rule.name(), MDC.get(CorrelationId.MDC_KEY));
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(Math.max(1, (retryAfterMillis + 999) / 1000)));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), ApiError.of(ApiErrorCode.RATE_LIMITED,
                "Too many requests. Please wait a moment and try again.", MDC.get(CorrelationId.MDC_KEY)));
    }

    /** -1 when admitted; otherwise the milliseconds until the window reopens. */
    long admit(String key, int limit, long now) {
        if (seen.incrementAndGet() % PRUNE_EVERY == 0) prune(now);
        Window window = windows.computeIfAbsent(key, k -> new Window());
        synchronized (window) {
            if (now - window.startedAtMillis >= windowMillis) {
                window.startedAtMillis = now;
                window.count = 0;
            }
            window.count++;
            return window.count <= limit ? -1 : window.startedAtMillis + windowMillis - now;
        }
    }

    private void prune(long now) {
        windows.entrySet().removeIf(entry -> {
            synchronized (entry.getValue()) {
                return now - entry.getValue().startedAtMillis >= windowMillis;
            }
        });
    }
}
