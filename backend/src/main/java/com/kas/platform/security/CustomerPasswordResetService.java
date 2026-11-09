package com.kas.platform.security;

import com.kas.platform.shared.EmailLanguage;
import com.kas.platform.shared.EmailOutboxService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

/** One-use, short-lived email password reset for customer accounts. */
@Service
public class CustomerPasswordResetService {
    private static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final EmailOutboxService outbox;
    private final String siteBase;

    public CustomerPasswordResetService(JdbcClient jdbc, PasswordEncoder passwords, EmailOutboxService outbox,
            @Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBase) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.outbox = outbox;
        this.siteBase = siteBase.replaceAll("/+$", "");
    }

    /** Always returns the same public response; unknown addresses are not disclosed. */
    @Transactional
    public void request(String email) {
        UUID userId = jdbc.sql("""
                SELECT u.id FROM app_user u JOIN customer c ON c.user_id = u.id
                 WHERE lower(u.email::text) = lower(:email) AND u.status = 'ACTIVE'
                 FOR UPDATE OF u
                """).param("email", email.trim()).query(UUID.class).optional().orElse(null);
        if (userId == null) return;

        // Serialize requests per account and bound inbox traffic. The public
        // endpoint still returns the same response for existing and unknown users.
        boolean recentlyRequested = jdbc.sql("SELECT EXISTS(SELECT 1 FROM customer_password_reset_token WHERE user_id=:user AND created_at > now()-interval '1 minute')")
                .param("user", userId).query(Boolean.class).single();
        if (recentlyRequested) return;

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash = sha256(token);
        jdbc.sql("DELETE FROM customer_password_reset_token WHERE user_id = :user AND used_at IS NULL")
                .param("user", userId).update();
        jdbc.sql("""
                INSERT INTO customer_password_reset_token (user_id, token_hash, expires_at)
                VALUES (:user, :hash, :expires)
                """).param("user", userId).param("hash", hash)
                .param("expires", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).plus(TOKEN_TTL)).update();
        String country = jdbc.sql("SELECT country FROM customer WHERE user_id=:user").param("user", userId)
                .query(String.class).optional().orElse(null);
        String resetUrl = siteBase + "/" + EmailLanguage.forCountry(country) + "/account/reset-password?token=" + token;
        send(email.trim(), resetUrl, country);
    }

    @Transactional
    public void reset(String token, String newPassword) {
        if (token == null || token.isBlank() || newPassword == null || newPassword.length() < 8) {
            throw invalidToken();
        }
        UUID userId = jdbc.sql("""
                SELECT user_id FROM customer_password_reset_token
                 WHERE token_hash = :hash AND used_at IS NULL AND expires_at > now()
                 FOR UPDATE
                """).param("hash", sha256(token)).query(UUID.class).optional().orElseThrow(
                        CustomerPasswordResetService::invalidToken);
        // A completed reset also lifts a lockout (doc 154): the owner of the inbox
        // has proved who they are, and the old password is gone.
        jdbc.sql("""
                UPDATE app_user SET password_hash = :hash, failed_login_count = 0, locked_until = NULL,
                                    updated_at = now()
                 WHERE id = :user
                """)
                .param("hash", passwords.encode(newPassword)).param("user", userId).update();
        jdbc.sql("UPDATE user_session SET revoked_at = now() WHERE user_id = :user AND revoked_at IS NULL")
                .param("user", userId).update();
        jdbc.sql("UPDATE customer_password_reset_token SET used_at = now() WHERE user_id = :user AND used_at IS NULL")
                .param("user", userId).update();
    }

    private void send(String email, String resetUrl, String country) {
        // Template PASSWORD_RESET_{VI|EN}; the language follows nationality.
        outbox.template("customer-password-reset-" + sha256(resetUrl), "PASSWORD_RESET", country, email, "",
                java.util.Map.of("resetUrl", resetUrl, "expiryMinutes", String.valueOf(TOKEN_TTL.toMinutes())));
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (Exception e) { throw new IllegalStateException("SHA-256 unavailable", e); }
    }

    private static com.kas.platform.shared.KasException invalidToken() {
        return new com.kas.platform.shared.KasException(
                com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, "Reset link is invalid or has expired.");
    }
}
