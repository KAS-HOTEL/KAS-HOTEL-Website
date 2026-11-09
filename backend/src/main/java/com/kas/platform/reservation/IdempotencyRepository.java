package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * The durable idempotency record of V24 — doc 117 §5 and §24.1.
 *
 * <p>The PRIMARY KEY on {@code idempotency_key} is the concurrency mechanism, not
 * a decoration: two simultaneous first requests with the same key cannot both
 * insert, so one transaction rolls back in full and re-reads the winner's row.
 * There is no lock, no sleep and no retry loop.
 */
@Repository
public class IdempotencyRepository {

    private final JdbcClient jdbc;

    public IdempotencyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** What a key already recorded, if anything. */
    public Optional<StoredRequest> find(String idempotencyKey) {
        return jdbc.sql("""
                        SELECT idempotency_key, request_fingerprint, reservation_id,
                               response_snapshot::text AS response_snapshot
                          FROM reservation_request_idempotency
                         WHERE idempotency_key = :key
                        """)
                .param("key", idempotencyKey)
                .query((rs, rowNum) -> new StoredRequest(
                        rs.getString("idempotency_key"),
                        rs.getString("request_fingerprint"),
                        rs.getObject("reservation_id", UUID.class),
                        rs.getString("response_snapshot")))
                .optional();
    }


    /**
     * The receipt a reference was issued, if that request is still recorded.
     *
     * <h2>The stored body, not a rebuilt one</h2>
     *
     * <p>Returns the exact JSON the {@code 201} returned. A receipt rebuilt from
     * the reservation row today could differ from the one the guest was shown —
     * config A6 can be re-set, a total can be corrected — and a confirmation
     * screen that quietly changes is worse than one that cannot be reopened.
     * This is the same snapshot {@code find} replays on an honest retry, reached
     * by the reference the guest actually has.
     *
     * <p>The join is what {@code reservation_request_idempotency_reservation_idx}
     * exists for, so no new table and no new column were needed.
     *
     * <p><strong>Deliberately not scoped.</strong> The endpoint is public and the
     * receipt carries no guest detail — reference, status literal, response
     * promise and the estimate the guest already saw. Doc 58 §3 gives the route
     * a bare {@code {reference}} and no token; the durable, tokenised surface is
     * {@code /public/track/{signedToken}}, which is OQ-162 and not this.
     */
    public Optional<String> findReceiptByReference(String reference) {
        return jdbc.sql("""
                        SELECT i.response_snapshot::text AS response_snapshot
                          FROM reservation_request_idempotency i
                          JOIN reservation r ON r.id = i.reservation_id
                         WHERE r.reference = :reference
                        """)
                .param("reference", reference)
                .query(String.class)
                .optional();
    }

    /**
     * Claims the key. Throws {@link org.springframework.dao.DuplicateKeyException}
     * if another transaction already committed it — which is the signal that this
     * request lost the race, not an error to swallow.
     */
    public void insert(String idempotencyKey, String fingerprint, UUID reservationId,
                       String responseJson) {
        jdbc.sql("""
                        INSERT INTO reservation_request_idempotency
                               (idempotency_key, request_fingerprint, reservation_id,
                                response_snapshot)
                        VALUES (:key, :fingerprint, :reservationId, CAST(:response AS jsonb))
                        """)
                .param("key", idempotencyKey)
                .param("fingerprint", fingerprint)
                .param("reservationId", reservationId)
                .param("response", responseJson)
                .update();
    }

    /** One recorded request: the key, what it was for, and what it answered. */
    public record StoredRequest(String idempotencyKey, String requestFingerprint,
                                UUID reservationId, String responseSnapshotJson) {
    }
}
