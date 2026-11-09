package com.kas.platform.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;

/**
 * Readiness: is the application connected to the <em>right</em> database, as the
 * <em>right</em> role, on the <em>right</em> schema?
 *
 * <p>A plain connection check is not enough here. Three specific mistakes would
 * each pass a connectivity probe while being seriously wrong:
 *
 * <ul>
 *   <li>connecting as {@code postgres} instead of {@code kas_web_app} — the
 *       Phase 7.3 brief forbids the superuser as the runtime account;</li>
 *   <li>resolving to schema {@code public} instead of {@code kas} — the brief
 *       forbids a silent fallback;</li>
 *   <li>pointing at one of the legacy databases {@code kas_dev},
 *       {@code kas_test} or {@code kas_app}, which are strictly out of scope.</li>
 * </ul>
 *
 * <p>This indicator asserts the expected identity rather than reporting whatever
 * it finds, so a misconfiguration shows as {@code DOWN} instead of quietly
 * serving traffic against the wrong data.
 */
@Component("kasSchema")
public class DatabaseSchemaHealthIndicator implements HealthIndicator {

    private static final Logger log = LoggerFactory.getLogger(DatabaseSchemaHealthIndicator.class);

    static final String EXPECTED_DATABASE = "kas_web_dev";
    static final String EXPECTED_ROLE = "kas_web_app";
    static final String EXPECTED_SCHEMA = "kas";

    private final JdbcClient jdbc;
    private final String expectedDatabase;
    private final String expectedRole;

    /**
     * The expected names default to kas_web_dev / kas_web_app (kas_web_test under the
     * web-test profile). A deployment whose database or role is named differently, for
     * example production, states its names explicitly with KAS_EXPECTED_DB_NAME and
     * KAS_EXPECTED_DB_ROLE; the probe still refuses any identity it was not told about.
     */
    public DatabaseSchemaHealthIndicator(JdbcClient jdbc, Environment environment) {
        this.jdbc = jdbc;
        // Test-web access is intentional only under this explicit runtime profile.
        String profileDefault = environment.matchesProfiles("web-test") ? "kas_web_test" : EXPECTED_DATABASE;
        this.expectedDatabase = nonBlank(environment.getProperty("kas.health.expected-database"), profileDefault);
        this.expectedRole = nonBlank(environment.getProperty("kas.health.expected-role"), EXPECTED_ROLE);
    }

    private static String nonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    @Override
    public Health health() {
        try {
            Identity identity = jdbc
                    .sql("SELECT current_database() AS db, current_user AS usr, current_schema() AS sch")
                    .query((rs, rowNum) -> new Identity(
                            rs.getString("db"), rs.getString("usr"), rs.getString("sch")))
                    .single();

            Health.Builder builder = expectedDatabase.equals(identity.database())
                    && expectedRole.equals(identity.role())
                    && EXPECTED_SCHEMA.equals(identity.schema())
                    ? Health.up()
                    : Health.down().withDetail("reason", "connected identity is not the expected one");

            return builder
                    .withDetail("database", identity.database())
                    .withDetail("role", identity.role())
                    .withDetail("schema", identity.schema())
                    .build();

        } catch (RuntimeException e) {
            // The message can carry a JDBC URL. It is logged, never published.
            log.warn("schema readiness probe failed", e);
            return Health.down().withDetail("reason", "database unreachable").build();
        }
    }

    private record Identity(String database, String role, String schema) {
    }
}
