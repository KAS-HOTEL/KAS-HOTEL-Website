package com.kas.platform.shared;

import java.util.List;
import java.util.Objects;

/**
 * Base class for every exception that maps to a defined API error code.
 *
 * <p>The message on this exception is <em>caller-facing</em>. It must never
 * carry SQL, stack frames, file paths, credentials or guest personal data —
 * see doc 58 §9 and the logging rules in doc 89 §10. Internal diagnostics
 * belong in the log, correlated by {@code correlationId}, never in the body.
 */
public class KasException extends RuntimeException {

    private final transient ApiErrorCode code;
    private final transient List<ErrorDetail> details;

    public KasException(ApiErrorCode code, String message) {
        this(code, message, List.of());
    }

    public KasException(ApiErrorCode code, String message, List<ErrorDetail> details) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
        this.details = List.copyOf(Objects.requireNonNull(details, "details"));
    }

    public ApiErrorCode code() {
        return code;
    }

    public List<ErrorDetail> details() {
        return details;
    }

    /** One entry of the {@code details[]} array in doc 58 §2. */
    public record ErrorDetail(String field, String code, String message) {
    }
}
