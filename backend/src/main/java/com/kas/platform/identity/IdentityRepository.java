package com.kas.platform.identity;

import com.kas.platform.shared.scope.ScopeKind;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Reads identity and role assignments.
 *
 * <p>Every statement is parameterised — doc 58 §10 permits parameterised queries
 * only. Column lists are explicit rather than {@code SELECT *}, so a future
 * column cannot silently enter the application through a wildcard.
 */
@Repository
public class IdentityRepository {

    private static final String USER_COLUMNS =
            "id, email, status, two_factor_enabled, locale, email_verified_at, locked_until";

    private final JdbcClient jdbc;

    public IdentityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AppUser> findById(UUID id) {
        return jdbc.sql("SELECT " + USER_COLUMNS + " FROM app_user WHERE id = :id")
                .param("id", id)
                .query(IdentityRepository::mapUser)
                .optional();
    }

    /** {@code app_user.email} is {@code citext}, so this lookup is case-insensitive at the database. */
    public Optional<AppUser> findByEmail(String email) {
        return jdbc.sql("SELECT " + USER_COLUMNS + " FROM app_user WHERE email = :email")
                .param("email", email)
                .query(IdentityRepository::mapUser)
                .optional();
    }

    /**
     * Loads the Argon2id hash for verification.
     *
     * <p>Kept separate from {@link #findById} so a credential is never carried
     * along by a lookup that had no need of it.
     */
    public Optional<StoredCredential> findCredential(UUID userId) {
        return jdbc.sql("SELECT id, password_hash FROM app_user WHERE id = :id AND password_hash IS NOT NULL")
                .param("id", userId)
                .query((rs, rowNum) -> new StoredCredential(
                        rs.getObject("id", UUID.class), rs.getString("password_hash")))
                .optional();
    }

    /** Active assignments only. Doc 59 §8: a revoked assignment grants nothing, immediately. */
    public List<RoleAssignment> findActiveAssignments(UUID userId) {
        return jdbc.sql("""
                        SELECT id, user_id, role, scope_kind, partner_id, property_ids,
                               granted_at, revoked_at
                        FROM role_assignment
                        WHERE user_id = :userId AND revoked_at IS NULL
                        """)
                .param("userId", userId)
                .query(IdentityRepository::mapAssignment)
                .list();
    }

    /**
     * Clears the failed-attempt counter and stamps the login.
     *
     * <p>Doc 06 §6 pairs the counter with "progressive delay, then temporary
     * lock". The counter and {@code locked_until} are maintained here; the lock
     * threshold and duration are owner decisions (doc 154) passed in by the
     * caller — see {@link #recordFailedLoginWithLockout}. An operator-set
     * {@code locked_until} is still honoured on every login.
     */
    public void recordSuccessfulLogin(UUID userId, java.time.Instant at) {
        jdbc.sql("""
                        UPDATE app_user
                           SET last_login_at = :at, failed_login_count = 0, updated_at = :at
                         WHERE id = :id
                        """)
                .param("id", userId)
                .param("at", java.sql.Timestamp.from(at))
                .update();
    }

    /** Counts a failed attempt. Never records what was submitted. */
    public void recordFailedLogin(UUID userId, java.time.Instant at) {
        jdbc.sql("""
                        UPDATE app_user
                           SET failed_login_count = failed_login_count + 1, updated_at = :at
                         WHERE id = :id
                        """)
                .param("id", userId)
                .param("at", java.sql.Timestamp.from(at))
                .update();
    }

    /**
     * Counts a failed attempt and, on the {@code maxFailures}-th consecutive one,
     * locks the account until {@code at + lockDuration} and restarts the count.
     *
     * <p>One statement, so concurrent wrong attempts cannot slip past the
     * threshold between a read and a write. Never records what was submitted.
     *
     * @return whether this attempt locked the account
     */
    public boolean recordFailedLoginWithLockout(UUID userId, java.time.Instant at,
                                                int maxFailures, java.time.Duration lockDuration) {
        return jdbc.sql("""
                        UPDATE app_user
                           SET failed_login_count = CASE WHEN failed_login_count + 1 >= :max
                                                         THEN 0 ELSE failed_login_count + 1 END,
                               locked_until = CASE WHEN failed_login_count + 1 >= :max
                                                   THEN :until ELSE locked_until END,
                               updated_at = :at
                         WHERE id = :id
                        RETURNING locked_until IS NOT DISTINCT FROM :until
                        """)
                .param("id", userId)
                .param("at", java.sql.Timestamp.from(at))
                .param("max", maxFailures)
                .param("until", java.sql.Timestamp.from(at.plus(lockDuration)))
                .query(Boolean.class)
                .optional()
                .orElse(false);
    }

    private static AppUser mapUser(ResultSet rs, int rowNum) throws SQLException {
        return new AppUser(
                rs.getObject("id", UUID.class),
                rs.getString("email"),
                UserStatus.valueOf(rs.getString("status")),
                rs.getBoolean("two_factor_enabled"),
                rs.getString("locale"),
                instant(rs, "email_verified_at"),
                instant(rs, "locked_until"));
    }

    private static RoleAssignment mapAssignment(ResultSet rs, int rowNum) throws SQLException {
        return new RoleAssignment(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                UserRole.valueOf(rs.getString("role")),
                ScopeKind.valueOf(rs.getString("scope_kind")),
                rs.getObject("partner_id", UUID.class),
                uuidSet(rs.getArray("property_ids")),
                instant(rs, "granted_at"),
                instant(rs, "revoked_at"));
    }

    private static Set<UUID> uuidSet(Array array) throws SQLException {
        if (array == null) {
            return Set.of();
        }
        try {
            return Set.of((UUID[]) array.getArray());
        } finally {
            array.free();
        }
    }

    private static java.time.Instant instant(ResultSet rs, String column) throws SQLException {
        java.sql.Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}
