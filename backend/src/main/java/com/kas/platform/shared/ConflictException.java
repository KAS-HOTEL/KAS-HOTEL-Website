package com.kas.platform.shared;

/** 409. One of the three conflict codes frozen by doc 58 §2.1. */
public class ConflictException extends KasException {

    private ConflictException(ApiErrorCode code, String message) {
        super(code, message);
    }

    /** Optimistic concurrency failure on a MASTER update ({@code If-Match} / {@code version}). */
    public static ConflictException versionConflict(String resource) {
        return new ConflictException(ApiErrorCode.VERSION_CONFLICT,
                resource + " was modified by someone else. Reload and reapply your change.");
    }

    /** A repeated {@code (channel, otaReference)} pair — doc 58 §11. */
    public static ConflictException duplicateReference(String reference) {
        return new ConflictException(ApiErrorCode.DUPLICATE_REFERENCE,
                "Reference '" + reference + "' is already recorded.");
    }

    /** Customer registration attempted with an email that already has an account. */
    public static ConflictException accountAlreadyExists() {
        return new ConflictException(ApiErrorCode.ACCOUNT_ALREADY_EXISTS,
                "This email is already registered. Please sign in or use another email.");
    }

    /**
     * A state machine guard refused the transition.
     *
     * <p>The two lifecycles are independent and are never collapsed into a
     * generic status (doc 52 §4 R13). Callers name which lifecycle refused.
     */
    /**
     * The key was reused for a different request — doc 117 §24.1.
     *
     * <p>The message names neither the stored fingerprint nor the original
     * reservation: the caller proved only that it holds the key, not that it
     * made the first request.
     */
    public static ConflictException idempotencyKeyReused() {
        return new ConflictException(ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
                "This Idempotency-Key was already used for a different request. "
                        + "Use a new key, or resend the original request unchanged.");
    }

    /**
     * V50: the database refused a second VERIFIED payment for one booking, or one bank
     * transaction reference confirming two bookings.
     */
    public static ConflictException paymentAlreadyVerified(boolean byTransactionReference) {
        return new ConflictException(ApiErrorCode.ILLEGAL_TRANSITION, byTransactionReference
                ? "This transaction reference already confirms another booking."
                : "This booking already has a verified payment.");
    }

    public static ConflictException illegalTransition(String lifecycle, String from, String to) {
        return new ConflictException(ApiErrorCode.ILLEGAL_TRANSITION,
                lifecycle + " cannot move from " + from + " to " + to + ".");
    }
}
