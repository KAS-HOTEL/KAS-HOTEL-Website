package com.kas.platform.devsetup;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Builds and updates the dedicated integration-test database {@code kas_web_test}.
 *
 * <h2>Why a separate database</h2>
 *
 * <p>The integration suites target {@code kas_web_test}, so their fixtures never
 * land in the development data in {@code kas_web_dev}. The test profile disables
 * Flyway (unit tests must start with no database at all), so nothing migrates
 * this database implicitly: run this tool once after creating it, and again after
 * every new migration.
 *
 * <h2>Two independent locks</h2>
 *
 * <p>As with {@link DevPartnerAccountProvisioning}, the file name matches neither
 * the Surefire nor the Failsafe include pattern, so a normal {@code mvn test} or
 * {@code mvn verify} never runs it, and it refuses to run unless
 * {@code KAS_TEST_DB_MIGRATE} is set. {@code dry-run} only reports what is
 * pending; {@code apply} migrates and then loads the test-only settings fixture.
 *
 * <pre>
 * KAS_TEST_DB_MIGRATE=dry-run ./mvnw test \
 *     -Dtest=IntegrationDatabaseMigration -DfailIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>The password is {@code KAS_DB_PASSWORD}, the same {@code kas_web_app}
 * credential as the development database, because the role is cluster-wide.
 *
 * <p>Flyway is configured exactly as {@code application.yml} configures it for
 * the application: schema {@code kas}, no baseline, validation on, clean disabled.
 */
@EnabledIfEnvironmentVariable(named = "KAS_TEST_DB_MIGRATE", matches = "dry-run|apply")
class IntegrationDatabaseMigration {

    static final String URL = "jdbc:postgresql://127.0.0.1:5433/kas_web_test?currentSchema=kas";
    static final String USER = "kas_web_app";
    static final String EXPECTED_DATABASE = "kas_web_test";
    static final String FIXTURE = "/db/test-fixtures/owner-settings.sql";

    @Test
    @DisplayName("migrates kas_web_test to the latest migration and loads the test settings")
    void migrate() throws Exception {
        boolean apply = "apply".equals(System.getenv("KAS_TEST_DB_MIGRATE"));
        refuseUnexpectedTarget();

        Flyway flyway = Flyway.configure()
                .dataSource(URL, USER, password())
                .schemas("kas")
                .defaultSchema("kas")
                .locations("classpath:db/migration")
                .baselineOnMigrate(false)
                .validateOnMigrate(true)
                .cleanDisabled(true)
                .outOfOrder(false)
                .load();

        MigrationInfo[] pending = flyway.info().pending();
        System.out.println("[test-db] target=" + EXPECTED_DATABASE + " mode=" + (apply ? "APPLY" : "DRY RUN")
                + " pending=" + pending.length);
        Arrays.stream(pending).forEach(info ->
                System.out.println("[test-db]   pending " + info.getScript()));

        if (!apply) {
            return;
        }

        MigrateResult result = flyway.migrate();
        System.out.println("[test-db] applied=" + result.migrationsExecuted
                + " version=" + result.targetSchemaVersion);
        loadFixture();

        assertThat(flyway.info().pending()).as("nothing left pending after apply").isEmpty();
        assertThat(Arrays.stream(flyway.info().all()).filter(info -> info.getState().isFailed()))
                .as("no failed migration").isEmpty();
    }

    /** Refuses anything but kas_web_test as kas_web_app on schema kas. */
    private static void refuseUnexpectedTarget() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, USER, password());
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT current_database(), current_user")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getString(1)).as("target database").isEqualTo(EXPECTED_DATABASE);
            assertThat(rs.getString(2)).as("runtime role, never the superuser").isEqualTo(USER);
        }
    }

    private static void loadFixture() throws Exception {
        String sql;
        try (var in = Objects.requireNonNull(
                IntegrationDatabaseMigration.class.getResourceAsStream(FIXTURE), FIXTURE)) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        try (Connection connection = DriverManager.getConnection(URL, USER, password());
             Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
        System.out.println("[test-db] fixture loaded: " + FIXTURE);
    }

    /** Blank is normalised to null so the driver resolves the credential itself. */
    private static String password() {
        String fromEnvironment = System.getenv("KAS_DB_PASSWORD");
        return fromEnvironment == null || fromEnvironment.isBlank() ? null : fromEnvironment;
    }
}
