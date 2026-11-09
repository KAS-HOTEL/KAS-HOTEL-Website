package com.kas.platform.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Session and token configuration.
 *
 * <p>The lifetimes come from <strong>doc 06 §5.3</strong>, which is the only
 * frozen document that supplies numbers — doc 59 §8 requires "short access token
 * + rotating refresh" without values:
 *
 * <blockquote><strong>PROPOSED</strong> lifetimes: customer access 15 min /
 * refresh 30 days; staff access 15 min / refresh 12 h</blockquote>
 *
 * <p>They are set in {@code application.yml} with that citation beside them, not
 * defaulted in code, so changing them is a configuration decision rather than an
 * edit to a class. They are still marked PROPOSED upstream and should be
 * confirmed before production.
 *
 * <p>{@link #signingSecret} has <strong>no default</strong>. An unset secret
 * leaves the application unable to issue or verify a token, which
 * {@code AuthConfigurationHealthIndicator} reports as readiness DOWN. It is
 * never logged and never appears in a response.
 *
 * @param accessTokenTtl        applies to both audiences — doc 06 §5.3 gives 15 min for each
 * @param staffRefreshTtl       shorter than the customer's, per doc 59 §8
 * @param customerRefreshTtl    longer, per doc 06 §5.3
 * @param cookieSecure          false only for local plain-HTTP development
 * @param signingSecret         HMAC key for the access token; at least 32 bytes
 * @param lockoutMaxFailures    consecutive wrong passwords that lock an account (owner decision, doc 154)
 * @param lockoutDuration       how long that lock lasts (owner decision, doc 154)
 */
@ConfigurationProperties(prefix = "kas.security")
public record AuthenticationProperties(
        Duration accessTokenTtl,
        Duration staffRefreshTtl,
        Duration customerRefreshTtl,
        Boolean cookieSecure,
        String signingSecret,
        Integer lockoutMaxFailures,
        Duration lockoutDuration) {

    /** HS256 requires a key of at least 256 bits. */
    public static final int MINIMUM_SECRET_BYTES = 32;

    /**
     * Whether automatic lockout applies. Both values must be configured; an
     * unset threshold means no automatic lock, never an invented one.
     */
    public boolean lockoutEnabled() {
        return lockoutMaxFailures != null && lockoutMaxFailures > 0
                && lockoutDuration != null && !lockoutDuration.isNegative() && !lockoutDuration.isZero();
    }

    /** Whether every value needed to issue a token is present and usable. */
    public boolean isComplete() {
        return accessTokenTtl != null
                && staffRefreshTtl != null
                && customerRefreshTtl != null
                && hasUsableSecret();
    }

    public boolean hasUsableSecret() {
        return signingSecret != null
                && signingSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                >= MINIMUM_SECRET_BYTES;
    }

    public boolean secureCookies() {
        return cookieSecure == null || cookieSecure;
    }

    /**
     * Names the first missing item, for a readiness detail or a
     * {@code CONFIG_MISSING} error. Returns the property name only — never a
     * value, and never a hint about the secret's content.
     */
    public String firstMissingProperty() {
        if (accessTokenTtl == null) {
            return "kas.security.access-token-ttl";
        }
        if (staffRefreshTtl == null) {
            return "kas.security.staff-refresh-ttl";
        }
        if (customerRefreshTtl == null) {
            return "kas.security.customer-refresh-ttl";
        }
        if (signingSecret == null || signingSecret.isBlank()) {
            return "kas.security.signing-secret";
        }
        if (!hasUsableSecret()) {
            return "kas.security.signing-secret (must be at least "
                    + MINIMUM_SECRET_BYTES + " bytes)";
        }
        return null;
    }

    /** Never renders the secret. */
    @Override
    public String toString() {
        return "AuthenticationProperties[accessTokenTtl=" + accessTokenTtl
                + ", staffRefreshTtl=" + staffRefreshTtl
                + ", customerRefreshTtl=" + customerRefreshTtl
                + ", cookieSecure=" + cookieSecure
                + ", signingSecret=" + (signingSecret == null ? "<unset>" : "<redacted>")
                + ", lockoutMaxFailures=" + lockoutMaxFailures
                + ", lockoutDuration=" + lockoutDuration + "]";
    }
}
