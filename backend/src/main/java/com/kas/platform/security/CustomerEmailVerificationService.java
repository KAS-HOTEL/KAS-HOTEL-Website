package com.kas.platform.security;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.EmailOutboxService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.UUID;

/** One-use, short-lived email ownership code. */
@Service
public class CustomerEmailVerificationService {
    private final JdbcClient jdbc;
    private final EmailOutboxService outbox;
    private final byte[] hashKey;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int CODE_TTL_MINUTES = 30;

    public CustomerEmailVerificationService(JdbcClient jdbc, EmailOutboxService outbox,
            @org.springframework.beans.factory.annotation.Value("${kas.security.signing-secret}") String signingSecret) {
        this.jdbc = jdbc; this.outbox = outbox; this.hashKey = signingSecret.getBytes(StandardCharsets.UTF_8);
    }

    @Transactional
    public void request(String email) {
        var guest = jdbc.sql("""
                SELECT u.id, c.full_name, c.email::text, c.country
                  FROM app_user u JOIN customer c ON c.user_id=u.id
                 WHERE lower(u.email::text)=lower(:email) AND u.status='ACTIVE'
                   AND u.email_verified_at IS NULL AND c.merged_into_id IS NULL
                 FOR UPDATE OF u
                """).param("email", email.trim()).query((rs, n) -> new Guest(rs.getObject("id", UUID.class),
                        rs.getString("full_name"), rs.getString("email"), rs.getString("country"))).optional().orElse(null);
        if (guest == null) return;
        boolean recent = jdbc.sql("SELECT EXISTS(SELECT 1 FROM customer_email_verification_token WHERE user_id=:user AND created_at > now()-interval '1 minute')")
                .param("user", guest.id()).query(Boolean.class).single();
        if (recent) return;
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        // A six-digit code repeats. The token id keeps the unique token_hash and the
        // outbox event key distinct when the same code is drawn again for this account.
        UUID tokenId = UUID.randomUUID();
        String codeHash = hash(tokenId, guest.email(), code);
        jdbc.sql("UPDATE customer_email_verification_token SET invalidated_at=now() WHERE user_id=:user AND used_at IS NULL AND invalidated_at IS NULL")
                .param("user", guest.id()).update();
        jdbc.sql("INSERT INTO customer_email_verification_token(id,user_id,token_hash,expires_at) VALUES(:id,:user,:hash,:expires)")
                .param("id", tokenId).param("user", guest.id()).param("hash", codeHash)
                .param("expires", OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(CODE_TTL_MINUTES)).update();
        // Brevo template MEMBER_EMAIL_VERIFICATION_{VI|EN}; the language follows the guest's country.
        outbox.template("member-email-verification-" + tokenId, "MEMBER_EMAIL_VERIFICATION", guest.country(),
                guest.email(), guest.name(), java.util.Map.of("firstName", guest.name() == null ? "" : guest.name(),
                        "code", code, "expiresInMinutes", String.valueOf(CODE_TTL_MINUTES)));
    }

    @Transactional(noRollbackFor = KasException.class)
    public UUID verify(String email, String code) {
        if (email == null || email.isBlank() || code == null || !code.matches("\\d{6}")) throw invalid();
        UUID user = jdbc.sql("""
                SELECT u.id FROM app_user u JOIN customer c ON c.user_id=u.id
                 WHERE lower(u.email::text)=lower(:email) AND u.status='ACTIVE'
                   AND u.email_verified_at IS NULL AND c.merged_into_id IS NULL
                 FOR UPDATE OF u
                """).param("email", email.trim()).query(UUID.class).optional().orElseThrow(CustomerEmailVerificationService::invalid);
        var active = jdbc.sql("""
                SELECT id, token_hash, failed_attempts FROM customer_email_verification_token
                 WHERE user_id=:user AND used_at IS NULL AND invalidated_at IS NULL AND expires_at>now()
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE
                """).param("user", user).query((rs, n) -> new Verification(rs.getObject("id", UUID.class),
                rs.getString("token_hash"), rs.getInt("failed_attempts"))).optional().orElseThrow(CustomerEmailVerificationService::invalid);
        if (active.attempts() >= 5) throw invalid();
        String codeHash = hash(active.id(), email, code);
        if (!MessageDigest.isEqual(active.hash().getBytes(StandardCharsets.UTF_8), codeHash.getBytes(StandardCharsets.UTF_8))) {
            jdbc.sql("UPDATE customer_email_verification_token SET failed_attempts=failed_attempts+1 WHERE id=:id")
                    .param("id", active.id()).update();
            throw invalid();
        }
        int consumed = jdbc.sql("UPDATE customer_email_verification_token SET used_at=now() WHERE id=:id AND used_at IS NULL AND invalidated_at IS NULL AND expires_at>now()")
                .param("id", active.id()).update();
        if (consumed != 1) throw invalid();
        jdbc.sql("UPDATE app_user SET email_verified_at=now(),updated_at=now() WHERE id=:user AND email_verified_at IS NULL")
                .param("user", user).update();
        jdbc.sql("UPDATE customer_email_verification_token SET invalidated_at=now() WHERE user_id=:user AND used_at IS NULL AND invalidated_at IS NULL")
                .param("user", user).update();
        return user;
    }

    private String hash(UUID tokenId, String email, String code) {
        String value = tokenId + ":" + email.trim().toLowerCase(java.util.Locale.ROOT) + ":" + code;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hashKey, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException(ex); }
    }
    private static KasException invalid() { return new KasException(ApiErrorCode.VALIDATION_FAILED, "Verification code is invalid, expired or already used."); }
    private record Guest(UUID id, String name, String email, String country) { }
    private record Verification(UUID id, String hash, int attempts) { }
}
