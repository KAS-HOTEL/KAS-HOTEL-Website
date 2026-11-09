package com.kas.platform.security.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Login credentials.
 *
 * <p>A request type only — it is never returned, and no response type in this
 * package has a password field. {@link #toString()} is redacted so the password
 * cannot reach a log through a validation failure, a debug statement or an
 * exception message that interpolates the bound object.
 *
 * <p>The length bound is a denial-of-service guard, not a password policy: doc
 * 06 §5.1 requires "a strong password policy and breach-list checking" at
 * registration, and neither the policy nor the breach list exists yet, so
 * nothing here judges password quality. Rejecting a login for weakness would
 * also lock out any account created before the policy landed.
 */
public record LoginRequest(

        @NotBlank
        @Email
        @Size(max = 320)
        String email,

        @NotBlank
        @Size(max = 512)
        String password) {

    @Override
    public String toString() {
        return "LoginRequest[email=<redacted>, password=<redacted>]";
    }
}
