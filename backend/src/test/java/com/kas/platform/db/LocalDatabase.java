package com.kas.platform.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * Connection details for the dedicated integration-test database
 * {@code kas_web_test}, kept separate from the development database
 * {@code kas_web_dev} so test fixtures never land in development data. Both live
 * in the Docker container published on {@code 127.0.0.1:5433}.
 *
 * <p><strong>Hard-coded on purpose.</strong> The legacy {@code kas_dev},
 * {@code kas_test} and {@code kas_app} are strictly out of scope, and a suite
 * that took its target from a mutable property could be pointed at one by a
 * stray environment variable. Only the credential is external.
 *
 * <h2>How the password is resolved — and why nothing reads it</h2>
 *
 * <p>If {@code KAS_DB_PASSWORD} is set, it is used. Otherwise the password is
 * passed as {@code null}, which hands resolution to the PostgreSQL JDBC driver:
 * pgjdbc 42.7 reads {@code PGPASSWORD}, then the pgpass file
 * ({@code PGPASSFILE}, or {@code %APPDATA%\postgresql\pgpass.conf} on Windows) —
 * the same standard mechanism psql uses.
 *
 * <p>Note that {@code null} and {@code ""} behave differently: an empty string
 * is sent as an empty password and SCRAM rejects it. Only {@code null} triggers
 * the driver's own resolution. That distinction is why
 * {@code spring.datasource.password: ${KAS_DB_PASSWORD:}} works locally —
 * Spring Boot converts a blank password to {@code null}.
 *
 * <p>The consequence that matters: this class never opens, reads, logs or
 * asserts on the pgpass file. The driver resolves the credential inside its own
 * process and it never enters the test code, the build output or the repository.
 */
public final class LocalDatabase {

    static final String URL = "jdbc:postgresql://127.0.0.1:5433/kas_web_test?currentSchema=kas";
    static final String USER = "kas_web_app";
    static final String PASSWORD_VARIABLE = "KAS_DB_PASSWORD";

    private LocalDatabase() {
    }

    /**
     * The password, or {@code null} to let the driver resolve it.
     *
     * <p>Blank is normalised to {@code null} deliberately: passing {@code ""}
     * would fail SCRAM instead of falling through to pgpass.
     */
    static String password() {
        String fromEnvironment = System.getenv(PASSWORD_VARIABLE);
        return fromEnvironment == null || fromEnvironment.isBlank() ? null : fromEnvironment;
    }

    /**
     * Whether the integration suite can run.
     *
     * <p>Deliberately a live reachability check rather than "is an environment
     * variable set": the credential may legitimately come from pgpass, and a
     * gate on the variable alone would skip a suite that could have run — a
     * false clean bill of health.
     */
    public static boolean isReachable() {
        try (Connection connection = open()) {
            return connection.isValid(3);
        } catch (SQLException e) {
            return false;
        }
    }

    /** Read-only: nothing in the Phase 7.3 integration suite writes. */
    static Connection open() throws SQLException {
        Connection connection = DriverManager.getConnection(URL, USER, password());
        connection.setReadOnly(true);
        return connection;
    }
}
