package com.kas.platform.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a handler as deliberately unauthenticated.
 *
 * <p>Doc 59 §7.1: "Every endpoint declares its required permission explicitly.
 * An endpoint with no declaration <strong>fails closed and fails a CI check</strong>."
 *
 * <p>{@code DenyByDefaultTest} enforces exactly that: every request-mapped
 * method must carry either {@code @PreAuthorize} or this annotation. The
 * mandatory {@link #reason()} makes "public" a decision someone wrote down,
 * rather than the result of forgetting an annotation — the two are otherwise
 * indistinguishable in review.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface PublicEndpoint {

    /** Why this endpoint is reachable without authentication. */
    String reason();
}
