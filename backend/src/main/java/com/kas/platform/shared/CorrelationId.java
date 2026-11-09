package com.kas.platform.shared;

import org.slf4j.MDC;

import java.util.UUID;

/**
 * The correlation identifier carried on every response and every log line.
 *
 * <p>Doc 58 §10 requires a correlation ID on every response; doc 58 §2 puts it
 * in the error body. It is the only handle a support conversation needs — which
 * is what allows the response body to stay free of diagnostics.
 *
 * <p>Deliberately opaque and random: it is not derived from a user, session,
 * reservation reference or IP, so it carries no personal data into logs or
 * analytics (doc 58 §10).
 */
public final class CorrelationId {

    public static final String HEADER = "X-Correlation-Id";
    public static final String MDC_KEY = "correlationId";

    private CorrelationId() {
    }

    public static String generate() {
        return UUID.randomUUID().toString();
    }

    /** The current request's correlation ID, or {@code "unavailable"} outside a request. */
    public static String current() {
        String value = MDC.get(MDC_KEY);
        return value != null ? value : "unavailable";
    }
}
