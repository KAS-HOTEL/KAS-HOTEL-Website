package com.kas.platform.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Doc 59 §8 mandates Argon2id for password hashing. */
class PasswordEncoderTest {

    private final PasswordEncoder encoder = new SecurityConfig().passwordEncoder();

    @Test
    @DisplayName("hashes are Argon2id and self-describing")
    void hashesAreArgon2id() {
        String hash = encoder.encode("a-correct-horse-battery-staple");

        assertThat(hash).startsWith("{argon2}$argon2id$");
    }

    @Test
    @DisplayName("a correct password verifies; an incorrect one does not")
    void verificationWorks() {
        String hash = encoder.encode("a-correct-horse-battery-staple");

        assertThat(encoder.matches("a-correct-horse-battery-staple", hash)).isTrue();
        assertThat(encoder.matches("a-correct-horse-battery-stapl", hash)).isFalse();
    }

    @Test
    @DisplayName("the same password hashes differently every time — salting is per hash")
    void hashesAreSalted() {
        String first = encoder.encode("same-password");
        String second = encoder.encode("same-password");

        assertThat(first).isNotEqualTo(second);
        assertThat(encoder.matches("same-password", first)).isTrue();
        assertThat(encoder.matches("same-password", second)).isTrue();
    }

    @Test
    @DisplayName("an unprefixed stored hash is refused outright, not guessed at")
    void unprefixedHashIsRejected() {
        // A bare hash of unknown provenance must never be treated as plaintext or
        // as any particular algorithm. DelegatingPasswordEncoder raises rather
        // than returning false, which is the stronger behaviour: a malformed
        // credential row becomes a visible failure instead of a silent auth
        // rejection that looks like a wrong password. That default is left in place.
        assertThatThrownBy(() -> encoder.matches("anything", "5e884898da28047151d0e56f8dc629"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("prefix");
    }
}
