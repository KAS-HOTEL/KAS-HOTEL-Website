package com.kas.platform.audit;

import java.util.Map;
import java.util.UUID;

/**
 * One privileged action, as the application sees it.
 *
 * <p>{@code actorRole} is a plain string rather than the {@code identity} enum
 * so this module stays dependency-free: an audit record must survive a role
 * being renamed or retired, and it is written for humans reading history, not
 * for code to branch on.
 *
 * <p><strong>Two fields are not yet persisted.</strong> {@code correlationId}
 * and {@code scope} have no column in the frozen schema (V19). They are carried
 * on the structured log line alongside the audit write and are recorded in doc
 * 89 §8.2 as the content of the first Flyway-managed migration, once the
 * adoption decision in §6 is taken. Adding a column before Flyway is the
 * migration authority would repeat exactly the problem that decision exists to
 * close.
 *
 * @param before state before the change, or null for a creation or a read
 * @param after  state after the change, or null for a deletion or a read
 */
public record AuditEvent(
        UUID actorId,
        String actorRole,
        String action,
        String entityType,
        UUID entityId,
        Map<String, Object> before,
        Map<String, Object> after,
        String reason,
        String ip,
        String userAgent,
        String correlationId,
        String scope) {

    public AuditEvent {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("audit action is required");
        }
        if (entityType == null || entityType.isBlank()) {
            throw new IllegalArgumentException("audit entityType is required");
        }
    }
}
