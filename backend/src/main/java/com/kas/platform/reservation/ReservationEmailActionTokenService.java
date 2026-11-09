package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/** Issues short-lived, single-use bearer tokens for explicit email actions. */
@Service
public class ReservationEmailActionTokenService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient jdbc;

    public ReservationEmailActionTokenService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public String issue(UUID reservationId, String action, String recipientEmail, Duration lifetime) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.sql("""
                INSERT INTO reservation_email_action_token
                    (reservation_id, action, token_hash, recipient_email, expires_at)
                VALUES (:reservationId, CAST(:action AS reservation_email_action), :hash,
                        :recipient, now() + (:seconds * interval '1 second'))
                """)
                .param("reservationId", reservationId)
                .param("action", action)
                .param("hash", hash(raw))
                .param("recipient", recipientEmail)
                .param("seconds", lifetime.toSeconds())
                .update();
        return raw;
    }

    public static String hash(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
