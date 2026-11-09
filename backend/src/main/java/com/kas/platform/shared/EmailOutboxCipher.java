package com.kas.platform.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/** Encrypts queued mail payloads, which can contain one-use action links. */
@Component
public class EmailOutboxCipher {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final String encodedKey;
    private final String signingSecret;

    public EmailOutboxCipher(@Value("${kas.email.outbox.encryption-key:}") String encodedKey,
                             @Value("${kas.security.signing-secret:}") String signingSecret) {
        this.encodedKey = encodedKey;
        this.signingSecret = signingSecret;
    }

    /** A malformed dedicated key stops startup instead of failing a guest's request later. */
    @jakarta.annotation.PostConstruct
    void validateDedicatedKey() {
        if (encodedKey != null && !encodedKey.isBlank()) {
            try {
                key();
            } catch (IllegalArgumentException ex) {
                throw new IllegalStateException("KAS_EMAIL_OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
            }
        }
    }

    public Encrypted encrypt(byte[] plaintext) {
        try {
            byte[] nonce = new byte[12];
            RANDOM.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, nonce));
            return new Encrypted(nonce, cipher.doFinal(plaintext));
        } catch (Exception ex) {
            throw new IllegalStateException("Email outbox encryption is not configured", ex);
        }
    }

    public byte[] decrypt(byte[] nonce, byte[] ciphertext) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, nonce));
            return cipher.doFinal(ciphertext);
        } catch (Exception ex) {
            throw new IllegalStateException("Email outbox payload could not be decrypted", ex);
        }
    }

    private SecretKeySpec key() {
        byte[] bytes;
        if (encodedKey != null && !encodedKey.isBlank()) {
            bytes = Base64.getDecoder().decode(encodedKey);
        } else {
            if (signingSecret == null || signingSecret.isBlank()) {
                throw new IllegalStateException("KAS_EMAIL_OUTBOX_ENCRYPTION_KEY is required when no signing secret is configured");
            }
            try {
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(signingSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
                bytes = mac.doFinal("KAS_EMAIL_OUTBOX_ENCRYPTION_KEY_V1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (Exception ex) {
                throw new IllegalStateException("Could not derive the email outbox encryption key", ex);
            }
        }
        if (bytes.length != 32) {
            throw new IllegalStateException("KAS_EMAIL_OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
        }
        return new SecretKeySpec(bytes, "AES");
    }

    public record Encrypted(byte[] nonce, byte[] ciphertext) { }
}
