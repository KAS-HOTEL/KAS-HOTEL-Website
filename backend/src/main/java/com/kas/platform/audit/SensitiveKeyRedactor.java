package com.kas.platform.audit;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Strips credentials and card data from before/after snapshots before they are
 * written anywhere durable.
 *
 * <p>An audit snapshot is a generic map of whatever an entity happened to hold,
 * which makes it the most likely accidental route for a secret into permanent,
 * append-only storage. Because {@code audit_log} cannot be updated or deleted
 * (doc 88 §5.6), a secret written here could never be removed — so the filter
 * runs on the way in, not as a later clean-up.
 *
 * <p>Doc 52 §3.9 is absolute on the payment side: "No card or credential data
 * may ever be stored." Doc 58 §9 denylists {@code passwordHash} and
 * {@code refreshTokenHash}.
 *
 * <p>Matching is on a normalised key name and is substring-based, so
 * {@code passwordHash}, {@code password_hash} and {@code newPassword} are all
 * caught. It deliberately errs towards over-redaction.
 */
final class SensitiveKeyRedactor {

    static final String REDACTED = "<redacted>";

    private static final List<String> FORBIDDEN_FRAGMENTS = List.of(
            "password", "passwd", "secret", "token", "credential",
            "apikey", "authorization", "cvc", "cvv", "cardnumber", "pan",
            "privatekey", "sessionid", "otp");

    private SensitiveKeyRedactor() {
    }

    static Map<String, Object> redact(Map<String, Object> source) {
        if (source == null) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (isSensitive(key)) {
                result.put(key, REDACTED);
            } else if (value instanceof Map<?, ?> nested) {
                @SuppressWarnings("unchecked")
                Map<String, Object> cast = (Map<String, Object>) nested;
                result.put(key, redact(cast));
            } else {
                result.put(key, value);
            }
        });
        return result;
    }

    static boolean isSensitive(String key) {
        if (key == null) {
            return false;
        }
        String normalised = key.toLowerCase(Locale.ROOT).replace("_", "").replace("-", "");
        return FORBIDDEN_FRAGMENTS.stream().anyMatch(normalised::contains);
    }
}
