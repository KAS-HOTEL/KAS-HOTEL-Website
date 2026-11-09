package com.kas.platform.shared;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailOutboxCipherTest {
    private static final String KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    @Test
    void encryptsAndDecryptsPayloadWithRandomNonce() {
        var cipher = new EmailOutboxCipher(KEY, "");
        byte[] plaintext = "one-use-token".getBytes(StandardCharsets.UTF_8);

        var first = cipher.encrypt(plaintext);
        var second = cipher.encrypt(plaintext);

        assertThat(first.nonce()).hasSize(12).isNotEqualTo(second.nonce());
        assertThat(first.ciphertext()).isNotEqualTo(plaintext);
        assertThat(cipher.decrypt(first.nonce(), first.ciphertext())).isEqualTo(plaintext);
    }

    @Test
    void rejectsTamperedPayload() {
        var cipher = new EmailOutboxCipher(KEY, "");
        var encrypted = cipher.encrypt("secret".getBytes(StandardCharsets.UTF_8));
        byte[] tampered = encrypted.ciphertext().clone();
        tampered[0] ^= 1;

        assertThatThrownBy(() -> cipher.decrypt(encrypted.nonce(), tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aMalformedDedicatedKeyStopsStartup() {
        assertThatThrownBy(() -> new EmailOutboxCipher("not-base64", "").validateDedicatedKey())
                .isInstanceOf(IllegalStateException.class).hasMessageNotContaining("not-base64");
        new EmailOutboxCipher("", "signing-secret").validateDedicatedKey();
    }

    @Test
    void requiresAValidDedicatedKeyOrSigningSecret() {
        assertThatThrownBy(() -> new EmailOutboxCipher("", "").encrypt(new byte[]{1}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new EmailOutboxCipher("not-base64", "").encrypt(new byte[]{1}))
                .isInstanceOf(IllegalStateException.class);
    }
}
