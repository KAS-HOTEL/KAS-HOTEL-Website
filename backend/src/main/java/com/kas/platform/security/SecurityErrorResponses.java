package com.kas.platform.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.web.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Renders filter-chain refusals in the same body shape as every other error.
 *
 * <p>Spring Security refuses inside the filter chain, before the dispatcher, so
 * {@code @RestControllerAdvice} never sees a 401 or a filter-level 403. Without
 * this, those two — the most common responses an unauthorised caller will ever
 * see — would be the only ones not matching the frozen contract in doc 58 §2.
 *
 * <p>Both messages are constants. Neither says whether the account exists, the
 * password was wrong, the token expired, or which permission was missing.
 */
@Component
public class SecurityErrorResponses {

    private final ObjectMapper objectMapper;

    public SecurityErrorResponses(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AuthenticationEntryPoint entryPoint() {
        return (request, response, authException) ->
                write(response, ApiErrorCode.UNAUTHENTICATED, "Authentication is required.");
    }

    public AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) ->
                write(response, ApiErrorCode.FORBIDDEN,
                        "You do not have permission to perform this action.");
    }

    private void write(HttpServletResponse response, ApiErrorCode code, String message)
            throws IOException {
        if (response.isCommitted()) {
            return;
        }
        String correlationId = CorrelationId.current();
        response.setStatus(code.httpStatus());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.setHeader(CorrelationId.HEADER, correlationId);
        objectMapper.writeValue(response.getOutputStream(),
                ApiError.of(code, message, correlationId));
    }
}
