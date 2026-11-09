package com.kas.platform.web;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

/**
 * The single place an exception becomes an HTTP response.
 *
 * <p>The governing rule, from the Phase 7.3 brief and doc 58 §9: a public
 * response must never carry SQL, stack traces, credentials, internal paths or
 * sensitive data. Every handler below therefore chooses between two kinds of
 * message:
 *
 * <ul>
 *   <li><strong>Authored</strong> — written for the caller, safe by
 *       construction ({@link KasException} and the validation handlers).</li>
 *   <li><strong>Fixed</strong> — a constant string, with the real diagnosis sent
 *       to the log and joined to the response by {@code correlationId}.</li>
 * </ul>
 *
 * <p>No handler passes {@code exception.getMessage()} through to the body.
 * That is the single habit that leaks connection strings, table names and file
 * paths, so it is absent here rather than filtered.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Every domain failure with a defined code — validation, conflict, 422, config, not found. */
    @ExceptionHandler(KasException.class)
    public ResponseEntity<ApiError> handleKas(KasException e) {
        ApiErrorCode code = e.code();
        List<ApiError.Detail> details = e.details().stream().map(ApiError.Detail::from).toList();

        // 4xx are expected traffic and are not logged as errors; 5xx always are.
        if (code.httpStatus() >= 500) {
            log.error("code={} correlationId={}", code, CorrelationId.current(), e);
        } else {
            log.debug("code={} correlationId={}", code, CorrelationId.current(), e);
        }

        return respond(code, e.getMessage(), details);
    }

    /** {@code @Valid} on a request body — doc 58 §2.1 requires field-level detail. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleBodyValidation(MethodArgumentNotValidException e) {
        List<ApiError.Detail> details = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ApiError.Detail(fe.getField(), "INVALID", fe.getDefaultMessage()))
                .toList();
        return respond(ApiErrorCode.VALIDATION_FAILED, "The request failed validation.", details);
    }

    /** {@code @Validated} on parameters. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException e) {
        List<ApiError.Detail> details = e.getConstraintViolations().stream()
                .map(v -> new ApiError.Detail(
                        v.getPropertyPath() == null ? null : v.getPropertyPath().toString(),
                        "INVALID", v.getMessage()))
                .toList();
        return respond(ApiErrorCode.VALIDATION_FAILED, "The request failed validation.", details);
    }

    /**
     * A required header is missing.
     *
     * <p>Without this, an absent {@code Idempotency-Key} would reach the
     * catch-all and become a 500 — a client mistake reported as a server
     * fault. Doc 58 §2.1 puts field-level problems at 400 with the offending
     * name in {@code details[]}.
     */
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiError> handleMissingHeader(MissingRequestHeaderException e) {
        return respond(ApiErrorCode.VALIDATION_FAILED,
                "A required header is missing.",
                List.of(new ApiError.Detail(e.getHeaderName(), "REQUIRED",
                        "This header is required.")));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> handleMissingParameter(MissingServletRequestParameterException e) {
        return respond(ApiErrorCode.VALIDATION_FAILED, "A required parameter is missing.",
                List.of(new ApiError.Detail(e.getParameterName(), "REQUIRED", "This parameter is required.")));
    }

    /**
     * A parameter of the wrong type. Only the parameter <em>name</em> is echoed,
     * never the submitted value — doc 58 §10 keeps personal data out of logs and
     * responses, and a mistyped value can be personal data.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return respond(ApiErrorCode.VALIDATION_FAILED, "A parameter has the wrong type.",
                List.of(new ApiError.Detail(e.getName(), "INVALID", "This value could not be interpreted.")));
    }

    /**
     * Unparseable body. The parser's message quotes the offending payload, so it
     * is logged and not returned.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException e) {
        log.debug("unreadable request body correlationId={}", CorrelationId.current(), e);
        return respond(ApiErrorCode.VALIDATION_FAILED, "The request body could not be read.", List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException e) {
        return respond(ApiErrorCode.NOT_FOUND, "Not found.", List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return respond(ApiErrorCode.NOT_FOUND, "Not found.", List.of());
    }

    /**
     * Method-security refusal. Filter-chain refusals never reach here — they are
     * handled by {@code SecurityErrorResponses}, which writes the same shape.
     *
     * <p>An <em>anonymous</em> caller gets 401, not 403. Doc 58 §2.1 separates
     * "you have not identified yourself" from "you have, and may not", and
     * method security cannot tell them apart on its own: {@code @PreAuthorize}
     * raises the same exception either way. Without this check, an
     * unauthenticated request to a permitted-path endpoint that requires
     * authentication would report 403 while the identical request one path
     * along reported 401.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException e) {
        if (isAnonymous()) {
            return respond(ApiErrorCode.UNAUTHENTICATED, "Authentication is required.", List.of());
        }
        return respond(ApiErrorCode.FORBIDDEN, "You do not have permission to perform this action.",
                List.of());
    }

    private static boolean isAnonymous() {
        var authentication = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        return authentication == null || TRUST_RESOLVER.isAnonymous(authentication);
    }

    private static final org.springframework.security.authentication.AuthenticationTrustResolver
            TRUST_RESOLVER =
            new org.springframework.security.authentication.AuthenticationTrustResolverImpl();

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiError> handleAuthentication(AuthenticationException e) {
        return respond(ApiErrorCode.UNAUTHENTICATED, "Authentication is required.", List.of());
    }

    /**
     * Database failure.
     *
     * <p>Handled separately from {@link #handleUnexpected} for one reason: a
     * {@code DataAccessException} message routinely contains the failing SQL,
     * table and column names, and sometimes parameter values. It is logged in
     * full and never surfaced.
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiError> handleDataAccess(DataAccessException e) {
        log.error("data access failure correlationId={}", CorrelationId.current(), e);
        return respond(ApiErrorCode.INTERNAL_ERROR, "Something went wrong on our side.", List.of());
    }

    /**
     * A controller's own {@code ResponseStatusException} (404 "Customer profile
     * not found", 409 "already reviewed", 400 password rules…). It used to fall
     * through to the catch-all and reach the client as 500, so a staff account
     * opening the website — which has no customer profile — looked like a server
     * failure. The status is kept; the reason is a fixed text written by our own
     * code, so it is safe to return.
     */
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(org.springframework.web.server.ResponseStatusException e) {
        int status = e.getStatusCode().value();
        ApiErrorCode code = switch (status) {
            case 400 -> ApiErrorCode.VALIDATION_FAILED;
            case 401 -> ApiErrorCode.UNAUTHENTICATED;
            case 403 -> ApiErrorCode.FORBIDDEN;
            case 404 -> ApiErrorCode.NOT_FOUND;
            case 409 -> ApiErrorCode.VERSION_CONFLICT;
            default -> null;
        };
        if (code == null) {
            return handleUnexpected(e);
        }
        String reason = e.getReason();
        return respond(code, reason == null || reason.isBlank() ? "The request could not be completed." : reason, List.of());
    }

    /** The catch-all. The body is a constant; the diagnosis lives in the log. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception e) {
        log.error("unhandled exception correlationId={}", CorrelationId.current(), e);
        return respond(ApiErrorCode.INTERNAL_ERROR, "Something went wrong on our side.", List.of());
    }

    private ResponseEntity<ApiError> respond(ApiErrorCode code, String message,
                                             List<ApiError.Detail> details) {
        // The response header is set by CorrelationIdFilter, which runs first on
        // every request. Setting it again here would append a second value.
        return ResponseEntity.status(HttpStatus.valueOf(code.httpStatus()))
                .body(ApiError.of(code, message, details, CorrelationId.current()));
    }
}
