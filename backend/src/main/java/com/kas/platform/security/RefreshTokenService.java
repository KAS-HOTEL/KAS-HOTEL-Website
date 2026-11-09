package com.kas.platform.security;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Generates opaque refresh tokens and the digests stored against them.
 *
 * <p>The token is 256 bits of {@link SecureRandom}. It carries no structure, so
 * there is nothing in it to parse, forge or reason about — the only thing that
 * makes it valid is the presence of its digest in {@code user_session}.
 *
 * <p><strong>Only the digest is ever persisted.</strong> Doc 58 §9 denylists
 * {@code refreshTokenHash}, and the column is named for the hash rather than the
 * token for the same reason: a database disclosure must not hand over live
 * sessions. SHA-256 is correct here rather than Argon2 — the input already has
 * full entropy, so there is nothing for a slow hash to protect against, and the
 * digest is on the hot path of every refresh.
 */
@Service
public class RefreshTokenService {

    private static final int TOKEN_BYTES = 32;

    private final SecureRandom random = new SecureRandom();

    /** A fresh token. Returned once, to be set as a cookie, and never stored. */
    public String generate() {
        byte[] token = new byte[TOKEN_BYTES];
        random.nextBytes(token);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(token);
    }

    /** The value to store, and to look up a presented token by. */
    public String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the platform; its absence is not recoverable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
