package com.kas.platform.security;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;

/**
 * Authentication failed. <strong>One exception for every cause.</strong>
 *
 * <p>Unknown email, wrong password, missing credential, suspended account,
 * disabled account, locked account and expired refresh token all raise this,
 * with the same message and the same
 * {@code UNAUTHENTICATED} code.
 *
 * <p>That uniformity is the point. A response that distinguished "no such
 * account" from "wrong password" would turn the login endpoint into an account
 * enumeration oracle, letting an attacker confirm which of a list of email
 * addresses are KAS guests before attacking any of them.
 *
 * <p>The real reason is logged server-side against the correlation id, so
 * support can still diagnose a genuine login problem.
 */
public class InvalidCredentialsException extends KasException {

    /** Identical for every cause. Never names the account, the field or the reason. */
    private static final String MESSAGE = "Those credentials are not valid.";

    private final transient String serverSideReason;

    public InvalidCredentialsException(String serverSideReason) {
        super(ApiErrorCode.UNAUTHENTICATED, MESSAGE);
        this.serverSideReason = serverSideReason;
    }

    /** For the log only. Must never reach a response body. */
    public String serverSideReason() {
        return serverSideReason;
    }
}
