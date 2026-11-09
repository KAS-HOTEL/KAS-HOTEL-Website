package com.kas.platform.shared;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/** Stores a uniquely keyed, encrypted mail command in the caller's transaction. */
@Service
public class EmailOutboxService {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final EmailOutboxCipher cipher;

    public EmailOutboxService(JdbcClient jdbc, ObjectMapper json, EmailOutboxCipher cipher) {
        this.jdbc = jdbc;
        this.json = json;
        this.cipher = cipher;
    }

    @Transactional
    public boolean template(String eventKey, String templateKey, String country, String recipient,
                           String name, Map<String, Object> params) {
        return templateForReservation(null, eventKey, templateKey, country, recipient, name, params);
    }

    @Transactional
    public boolean templateForReservation(String reference, String eventKey, String templateKey, String country,
                                          String recipient, String name, Map<String, Object> params) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", "TEMPLATE");
        payload.put("templateKey", templateKey);
        payload.put("country", country);
        payload.put("recipient", recipient);
        payload.put("name", name);
        payload.put("params", params);
        return enqueue(reference, eventKey, payload);
    }

    @Transactional
    public boolean inline(String eventKey, String recipient, String name, String subject, String html) {
        return inlineForReservation(null, eventKey, recipient, name, subject, html);
    }

    @Transactional
    public boolean inlineForReservation(String reference, String eventKey, String recipient, String name,
                                        String subject, String html) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", "INLINE");
        payload.put("recipient", recipient);
        payload.put("name", name);
        payload.put("subject", subject);
        payload.put("html", html);
        return enqueue(reference, eventKey, payload);
    }

    /** Records that nobody could be addressed, so staff see it instead of silence. */
    @Transactional
    public void recordUndeliverable(String reference, String eventKey, String code) {
        jdbc.sql("""
                INSERT INTO email_delivery_outbox (aggregate_reference, event_key, status, last_error_code)
                VALUES (:reference, :key, 'FAILED', :code)
                ON CONFLICT (event_key) DO NOTHING
                """).param("reference", reference).param("key", eventKey).param("code", code).update();
    }

    private boolean enqueue(String reference, String eventKey, Map<String, Object> payload) {
        if (eventKey == null || eventKey.isBlank()) {
            throw new IllegalArgumentException("A stable email event key is required");
        }
        try {
            EmailOutboxCipher.Encrypted encrypted = cipher.encrypt(json.writeValueAsBytes(payload));
            return jdbc.sql("""
                    INSERT INTO email_delivery_outbox
                        (aggregate_reference, event_key, payload_nonce, payload_ciphertext, status, attempts, next_attempt_at)
                    VALUES (:reference, :key, :nonce, :ciphertext, 'PENDING', 0, now())
                    ON CONFLICT (event_key) DO NOTHING
                    """)
                    .param("reference", reference).param("key", eventKey.trim()).param("nonce", encrypted.nonce())
                    .param("ciphertext", encrypted.ciphertext()).update() == 1;
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Email outbox payload could not be serialized", ex);
        }
    }
}
