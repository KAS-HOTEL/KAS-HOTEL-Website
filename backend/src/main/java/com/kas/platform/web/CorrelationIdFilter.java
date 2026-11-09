package com.kas.platform.web;

import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

/**
 * Puts a correlation id on every request, response and log line.
 *
 * <p>Doc 58 §10 requires a correlation ID on every response; doc 58 §2 puts it
 * in the error body. It is the handle that lets the response body stay free of
 * diagnostics while support can still find the exact request in the log.
 *
 * <p>Runs first, so a failure anywhere later is still correlated.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    /**
     * An inbound correlation id is accepted only in canonical UUID form.
     *
     * <p>The header is caller-controlled and lands in every log line for the
     * request. Without this check a caller could inject newlines or control
     * characters and forge log entries. Anything that does not match is replaced
     * rather than sanitised, because a forged-but-plausible id is worse than a
     * fresh one.
     */
    private static final Pattern CANONICAL_UUID = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String correlationId = resolve(request.getHeader(CorrelationId.HEADER));
        MDC.put(CorrelationId.MDC_KEY, correlationId);
        response.setHeader(CorrelationId.HEADER, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            // Threads are pooled: leaving this set would attribute the next
            // request on this thread to the wrong correlation id.
            MDC.remove(CorrelationId.MDC_KEY);
        }
    }

    private static String resolve(String inbound) {
        return inbound != null && CANONICAL_UUID.matcher(inbound).matches()
                ? inbound
                : CorrelationId.generate();
    }
}
