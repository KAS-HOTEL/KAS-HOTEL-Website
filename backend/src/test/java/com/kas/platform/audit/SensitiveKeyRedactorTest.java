package com.kas.platform.audit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Audit rows cannot be updated or deleted (doc 88 §5.6), so a secret written
 * into one could never be removed. Redaction therefore has to be right on the
 * way in.
 */
class SensitiveKeyRedactorTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "password", "passwordHash", "password_hash", "newPassword",
            "refreshTokenHash", "accessToken", "apiKey", "api_key",
            "clientSecret", "authorization", "cvc", "cvv", "cardNumber",
            "privateKey", "sessionId", "otpCode"})
    @DisplayName("credential and card key names are recognised in every casing and separator style")
    void sensitiveNamesAreRecognised(String key) {
        assertThat(SensitiveKeyRedactor.isSensitive(key)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"email", "fullName", "checkIn", "salesStatus", "reference", "quantity"})
    @DisplayName("ordinary business fields are left alone")
    void ordinaryNamesAreNotRedacted(String key) {
        assertThat(SensitiveKeyRedactor.isSensitive(key)).isFalse();
    }

    @Test
    @DisplayName("values are replaced, and the key is kept so the change is still legible")
    void sensitiveValuesAreReplaced() {
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("email", "guest@example.test");
        before.put("passwordHash", "$argon2id$v=19$m=16384,t=2,p=1$abc$def");

        Map<String, Object> redacted = SensitiveKeyRedactor.redact(before);

        assertThat(redacted).containsEntry("email", "guest@example.test");
        assertThat(redacted).containsEntry("passwordHash", SensitiveKeyRedactor.REDACTED);
        assertThat(redacted.toString()).doesNotContain("argon2id");
    }

    @Test
    @DisplayName("nested maps are redacted too")
    void nestedMapsAreRedacted() {
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("refreshToken", "eyJhbGciOi.secret.value");
        Map<String, Object> outer = new LinkedHashMap<>();
        outer.put("session", inner);

        Map<String, Object> redacted = SensitiveKeyRedactor.redact(outer);

        assertThat(redacted.toString()).doesNotContain("eyJhbGciOi");
        @SuppressWarnings("unchecked")
        Map<String, Object> nested = (Map<String, Object>) redacted.get("session");
        assertThat(nested).containsEntry("refreshToken", SensitiveKeyRedactor.REDACTED);
    }

    @Test
    @DisplayName("null snapshots stay null — a read has no before or after")
    void nullIsPreserved() {
        assertThat(SensitiveKeyRedactor.redact(null)).isNull();
    }
}
