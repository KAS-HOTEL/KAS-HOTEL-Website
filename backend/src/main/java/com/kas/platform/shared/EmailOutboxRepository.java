package com.kas.platform.shared;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class EmailOutboxRepository {
    private final JdbcClient jdbc;

    public EmailOutboxRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    public List<ClaimedEmail> claim(int limit, int maxAttempts) {
        jdbc.sql("""
                UPDATE email_delivery_outbox
                   SET status='FAILED', payload_nonce=NULL, payload_ciphertext=NULL,
                       last_error_code='LEASE_EXPIRED', locked_at=NULL, updated_at=now()
                 WHERE status='PROCESSING' AND locked_at < now()-interval '2 minutes' AND attempts >= :max
                """).param("max", maxAttempts).update();
        return jdbc.sql("""
                WITH ready AS (
                    SELECT id FROM email_delivery_outbox
                     WHERE attempts < :max
                       AND ((status IN ('PENDING','RETRY') AND next_attempt_at <= now())
                         OR (status='PROCESSING' AND locked_at < now()-interval '2 minutes'))
                     ORDER BY created_at, id
                     FOR UPDATE SKIP LOCKED
                     LIMIT :limit
                )
                UPDATE email_delivery_outbox o
                   SET status='PROCESSING', attempts=o.attempts+1, locked_at=now(), updated_at=now()
                  FROM ready WHERE o.id=ready.id
                RETURNING o.id, o.event_key, o.payload_nonce, o.payload_ciphertext, o.attempts, o.created_at
                """)
                .param("max", maxAttempts).param("limit", limit)
                .query((rs, row) -> new ClaimedEmail(rs.getObject("id", UUID.class),
                        rs.getString("event_key"), rs.getBytes("payload_nonce"),
                        rs.getBytes("payload_ciphertext"), rs.getInt("attempts"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .list();
    }

    @Transactional
    public void markSent(UUID id) {
        jdbc.sql("""
                UPDATE email_delivery_outbox
                   SET status='SENT', sent_at=now(), locked_at=NULL,
                       payload_nonce=NULL, payload_ciphertext=NULL, last_error_code=NULL, updated_at=now()
                 WHERE id=:id AND status='PROCESSING'
                """).param("id", id).update();
    }

    /** Keeps the mail for later and gives back the attempt: the cause is not this email. */
    @Transactional
    public void defer(UUID id, OffsetDateTime retryAt, String code) {
        jdbc.sql("""
                UPDATE email_delivery_outbox
                   SET status='RETRY', attempts=GREATEST(attempts-1, 0), next_attempt_at=:retryAt,
                       locked_at=NULL, last_error_code=:code, updated_at=now()
                 WHERE id=:id AND status='PROCESSING'
                """).param("retryAt", retryAt).param("code", code).param("id", id).update();
    }

    @Transactional
    public void markFailed(UUID id, int attempts, int maxAttempts, OffsetDateTime retryAt, String code) {
        boolean terminal = attempts >= maxAttempts;
        jdbc.sql("""
                UPDATE email_delivery_outbox
                   SET status=:status, next_attempt_at=:retryAt, locked_at=NULL,
                       payload_nonce=CASE WHEN :terminal THEN NULL ELSE payload_nonce END,
                       payload_ciphertext=CASE WHEN :terminal THEN NULL ELSE payload_ciphertext END,
                       last_error_code=:code, updated_at=now()
                 WHERE id=:id AND status='PROCESSING'
                """)
                .param("status", terminal ? "FAILED" : "RETRY").param("retryAt", retryAt)
                .param("terminal", terminal).param("code", code).param("id", id).update();
    }

    public List<EmailDeliveryStatus> statusForReservation(String reference) {
        return jdbc.sql("""
                SELECT event_key, status, attempts, next_attempt_at, sent_at, last_error_code
                  FROM email_delivery_outbox
                 WHERE aggregate_reference=:reference
                 ORDER BY created_at DESC, id DESC
                """)
                .param("reference", reference)
                .query((rs, row) -> new EmailDeliveryStatus(rs.getString("event_key"),
                        rs.getString("status"), rs.getInt("attempts"),
                        rs.getObject("next_attempt_at", OffsetDateTime.class),
                        rs.getObject("sent_at", OffsetDateTime.class), rs.getString("last_error_code")))
                .list();
    }

    public record ClaimedEmail(UUID id, String eventKey, byte[] nonce, byte[] ciphertext, int attempts,
                               OffsetDateTime createdAt) { }
    public record EmailDeliveryStatus(String eventKey, String status, int attempts,
                                      OffsetDateTime nextAttemptAt, OffsetDateTime sentAt,
                                      String lastErrorCode) { }
}
