package com.kas.platform.identity;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Session persistence — the revocation authority for doc 59 §8.
 *
 * <p>Two things about the shape of this class are load-bearing:
 *
 * <ul>
 *   <li><strong>Ownership is a SQL predicate, never a Java comparison.</strong>
 *       {@link #revokeOwned} and {@link #findOwned} carry {@code user_id = :userId}
 *       in the statement itself. A caller cannot revoke or read another user's
 *       session by supplying its id, because the row is never fetched in the
 *       first place — doc 58 §10: "a reference is an identifier, never a
 *       credential". This is the OWN-scope equivalent of what
 *       {@code PropertyRepository} does for PARTNER scope.</li>
 *   <li><strong>Revocation is an UPDATE, never a DELETE.</strong> A revoked
 *       session stays visible to audit.</li>
 * </ul>
 */
@Repository
public class UserSessionRepository {

    private static final String COLUMNS =
            "id, user_id, device, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at";

    private final JdbcClient jdbc;

    public UserSessionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** {@code refreshTokenHash} is a digest; the token itself never reaches this method. */
    public UUID create(UUID userId, String refreshTokenHash, Instant expiresAt,
                       String device, String ip, String userAgent) {
        return jdbc.sql("""
                        INSERT INTO user_session
                            (user_id, refresh_token_hash, device, ip, user_agent, expires_at)
                        VALUES (:userId, :hash, :device, CAST(:ip AS inet), :userAgent, :expiresAt)
                        RETURNING id
                        """)
                .param("userId", userId)
                .param("hash", refreshTokenHash)
                .param("device", device)
                .param("ip", ip)
                .param("userAgent", userAgent)
                .param("expiresAt", java.sql.Timestamp.from(expiresAt))
                .query(UUID.class)
                .single();
    }

    /**
     * Looks a session up by the digest of a presented refresh token.
     *
     * <p>The expiry and revocation checks are in the WHERE clause rather than in
     * the caller, so an expired or revoked session simply does not exist as far
     * as the application is concerned.
     */
    public Optional<UserSession> findActiveByRefreshHash(String refreshTokenHash, Instant now) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM user_session "
                        + "WHERE refresh_token_hash = :hash AND revoked_at IS NULL AND expires_at > :now")
                .param("hash", refreshTokenHash)
                .param("now", java.sql.Timestamp.from(now))
                .query(UserSessionRepository::map)
                .optional();
    }

    public Optional<UserSession> findActiveById(UUID sessionId, Instant now) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM user_session "
                        + "WHERE id = :id AND revoked_at IS NULL AND expires_at > :now")
                .param("id", sessionId)
                .param("now", java.sql.Timestamp.from(now))
                .query(UserSessionRepository::map)
                .optional();
    }

    /** OWN scope: the session must belong to {@code userId} or it is not found. */
    public Optional<UserSession> findOwned(UUID sessionId, UUID userId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM user_session "
                        + "WHERE id = :id AND user_id = :userId")
                .param("id", sessionId)
                .param("userId", userId)
                .query(UserSessionRepository::map)
                .optional();
    }

    /** Every active session for the caller — {@code GET /me/sessions}, doc 58 §4. */
    public List<UserSession> listActive(UUID userId, Instant now) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM user_session "
                        + "WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > :now "
                        + "ORDER BY last_seen_at DESC")
                .param("userId", userId)
                .param("now", java.sql.Timestamp.from(now))
                .query(UserSessionRepository::map)
                .list();
    }

    /**
     * Rotates the refresh token on an existing session — doc 59 §8.
     *
     * <p>Deliberately an UPDATE of the same row rather than revoke-and-recreate.
     * The row <em>is</em> the device entry that {@code GET /me/sessions} lists
     * with its {@code device} and {@code last_seen_at}; recreating it on every
     * refresh would turn one signed-in phone into a new "session" every fifteen
     * minutes and make the list useless for spotting an intruder.
     *
     * @return true when the session was still active and the token was rotated
     */
    public boolean rotateRefreshToken(UUID sessionId, String previousHash,
                                      String newHash, Instant now) {
        // The previous hash is part of the predicate, so two concurrent refreshes
        // presenting the same token cannot both succeed.
        return jdbc.sql("""
                        UPDATE user_session
                           SET refresh_token_hash = :newHash, last_seen_at = :now
                         WHERE id = :id AND refresh_token_hash = :previousHash
                           AND revoked_at IS NULL AND expires_at > :now
                        """)
                .param("id", sessionId)
                .param("previousHash", previousHash)
                .param("newHash", newHash)
                .param("now", java.sql.Timestamp.from(now))
                .update() > 0;
    }

    public void revoke(UUID sessionId, Instant now) {
        jdbc.sql("UPDATE user_session SET revoked_at = :now WHERE id = :id AND revoked_at IS NULL")
                .param("id", sessionId)
                .param("now", java.sql.Timestamp.from(now))
                .update();
    }

    /**
     * OWN scope, enforced in SQL.
     *
     * @return true when a session was revoked. False means it does not exist
     *         <em>or</em> belongs to someone else — deliberately
     *         indistinguishable, so the caller maps both to 404.
     */
    public boolean revokeOwned(UUID sessionId, UUID userId, Instant now) {
        return jdbc.sql("""
                        UPDATE user_session SET revoked_at = :now
                         WHERE id = :id AND user_id = :userId AND revoked_at IS NULL
                        """)
                .param("id", sessionId)
                .param("userId", userId)
                .param("now", java.sql.Timestamp.from(now))
                .update() > 0;
    }

    /** "Sign out everywhere" — doc 58 §4, and offboarding revocation — doc 59 §8. */
    public int revokeAllForUser(UUID userId, Instant now) {
        return jdbc.sql("UPDATE user_session SET revoked_at = :now "
                        + "WHERE user_id = :userId AND revoked_at IS NULL")
                .param("userId", userId)
                .param("now", java.sql.Timestamp.from(now))
                .update();
    }

    public void touch(UUID sessionId, Instant now) {
        jdbc.sql("UPDATE user_session SET last_seen_at = :now WHERE id = :id")
                .param("id", sessionId)
                .param("now", java.sql.Timestamp.from(now))
                .update();
    }

    private static UserSession map(ResultSet rs, int rowNum) throws SQLException {
        return new UserSession(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("device"),
                rs.getString("ip"),
                rs.getString("user_agent"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant());
    }
}
