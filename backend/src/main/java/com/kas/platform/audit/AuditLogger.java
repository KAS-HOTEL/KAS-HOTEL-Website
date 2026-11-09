package com.kas.platform.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * Writes the append-only audit trail.
 *
 * <p>Every snapshot passes through {@link SensitiveKeyRedactor} first. Because
 * the table rejects UPDATE and DELETE, anything written here is permanent — a
 * secret recorded by accident could not later be removed.
 */
@Service
public class AuditLogger {

    private static final Logger log = LoggerFactory.getLogger(AuditLogger.class);

    private static final String INSERT = """
            INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id,
                                   before_state, after_state, reason, ip, user_agent, created_at)
            VALUES (:id, :actorId, CAST(:actorRole AS user_role), :action, :entityType, :entityId,
                    CAST(:before AS jsonb), CAST(:after AS jsonb), :reason,
                    CAST(:ip AS inet), :userAgent, now())
            """;

    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;

    public AuditLogger(JdbcClient jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /**
     * Records {@code event} and returns the new audit row id.
     *
     * <p>The id is also logged with the correlation id and resolved scope, which
     * are the two fields the frozen schema cannot yet hold (see
     * {@link AuditEvent}). Until the follow-up migration lands, the log line is
     * what joins an audit row to the request that produced it.
     */
    public UUID record(AuditEvent event) {
        UUID id = UUID.randomUUID();

        jdbc.sql(INSERT)
                .param("id", id)
                .param("actorId", event.actorId())
                .param("actorRole", event.actorRole())
                .param("action", event.action())
                .param("entityType", event.entityType())
                .param("entityId", event.entityId())
                .param("before", toJson(SensitiveKeyRedactor.redact(event.before())))
                .param("after", toJson(SensitiveKeyRedactor.redact(event.after())))
                .param("reason", event.reason())
                .param("ip", event.ip())
                .param("userAgent", event.userAgent())
                .update();

        // Structured fields only. No before/after payload reaches the log: it may
        // legitimately contain guest personal data, which doc 58 §10 keeps out of logs.
        log.info("audit auditId={} action={} entityType={} entityId={} actorId={} scope={} correlationId={}",
                id, event.action(), event.entityType(), event.entityId(),
                event.actorId(), event.scope(), event.correlationId());

        return id;
    }

    private String toJson(Map<String, Object> value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            // Losing the snapshot is preferable to losing the audit row.
            log.warn("audit snapshot could not be serialised for action={}; recording without it",
                    value.getClass().getSimpleName(), e);
            return null;
        }
    }
}
