package com.kas.platform.shared;

/**
 * The stable machine-readable error codes frozen by doc 58 §2.1.
 *
 * <p>This enum is the complete V1 set. Adding a code is an API contract change
 * and must be reflected in doc 58 first — the contract is authoritative, not
 * this file.
 */
public enum ApiErrorCode {

    /** 400 — field-level detail carried in {@code details[]}. */
    VALIDATION_FAILED(400),

    /** 401 — no valid session. */
    UNAUTHENTICATED(401),

    /** 403 — permission or scope refusal, where existence is not itself a secret. */
    FORBIDDEN(403),

    /**
     * 404 — also returned <em>instead of</em> 403 for records the caller may not
     * know exist. Doc 59 §7.8 and doc 85 §6.3: cross-partner access returns 404
     * so another partner's records are not disclosed by their absence.
     */
    NOT_FOUND(404),

    /** 409 — optimistic concurrency failure on a MASTER update. */
    VERSION_CONFLICT(409),

    /** 409 — repeated {@code (channel, otaReference)}. */
    DUPLICATE_REFERENCE(409),

    /** 409 — a customer registration email is already attached to an account. */
    ACCOUNT_ALREADY_EXISTS(409),

    /**
     * 409 — the same {@code Idempotency-Key} was replayed with a DIFFERENT
     * canonical request body.
     *
     * <p>Frozen by doc 117 §24.1. This is a misuse conflict, not a retry: an
     * honest retry carries the same body and returns the original result with
     * no 409 at all. Distinct from {@link #DUPLICATE_REFERENCE}, which stays
     * OTA-only and is keyed on {@code (channel, otaReference)}.
     */
    IDEMPOTENCY_KEY_REUSED(409),

    /** 409 — a state machine guard refused the transition. */
    ILLEGAL_TRANSITION(409),

    /** 410 — the property is closed. */
    PROPERTY_CLOSED(410),

    /** 422 — no availability; the response carries alternatives. */
    NO_AVAILABILITY(422),

    /** 422 — requested occupancy exceeds the room type maximum. */
    OCCUPANCY_EXCEEDED(422),

    /** 422 — the requested dates fall outside the inventory horizon. */
    HORIZON_EXCEEDED(422),

    /**
     * 422 — a required business configuration value has not been supplied.
     *
     * <p>Doc 58 §2 makes this first class, and doc 51 §6 rule 2 requires that a
     * missing setting fails loudly <em>naming the setting</em> rather than
     * silently defaulting. This is the mechanism that keeps invented business
     * values out of the system.
     */
    CONFIG_MISSING(422),

    /** 429 — rate limited. */
    RATE_LIMITED(429),

    /** 500 — unexpected. The response body never carries diagnostics. */
    INTERNAL_ERROR(500),

    /**
     * 503 — availability could not be determined.
     *
     * <p>Doc 58 §2.1: "Never a guessed number". Availability fails closed.
     */
    AVAILABILITY_UNAVAILABLE(503);

    private final int httpStatus;

    ApiErrorCode(int httpStatus) {
        this.httpStatus = httpStatus;
    }

    public int httpStatus() {
        return httpStatus;
    }
}
