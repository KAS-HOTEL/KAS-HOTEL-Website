package com.kas.platform.db;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The post-adoption contract: Flyway is the migration authority for schema
 * {@code kas}, and checksum validation covers every frozen migration.
 *
 * <p>Option C was adopted (doc 89 §6) precisely so this file could exist. Under
 * Option B — baseline at 21 — V1–V21 would sit below the baseline, Flyway would
 * hold no checksum for them, and {@code validate()} could never detect an edit
 * to a frozen migration. Every assertion below would have been unwritable.
 *
 * <p>This is the test that makes "STOP on checksum mismatch" an enforceable rule
 * rather than an intention: change one byte of any V1–V21 file and
 * {@link #checksumValidationPasses()} fails.
 */
@EnabledIf("com.kas.platform.db.FlywayHistoryIT#databaseIsReachable")
class FlywayHistoryIT {

    /** V1–V66, two repeatables (distribution channels, amenities) and Flyway's schema row. */
    private static final int EXPECTED_MIGRATIONS = 69;

    /**
     * The highest versioned migration. V24–V26 were added in Phase 7.5F Step 16A;
     * V28 in STEP G, giving {@code app_user} the name and phone that partner
     * self-registration collects; V29 in STEP H, adding {@code rate_day} so the
     * rate calendar can price one date without authoring a rule; V30 in STEP Q,
     * adding {@code message_template} and the two columns on
     * {@code reservation_message} that make an automated message exactly-once.
     * V47 adds {@code customer_avatar}, the profile photo stored with the account.
     * V48/V49 change membership tiers and cashback rates; V50 adds the hotel bank
     * details and the one-verified-payment-per-booking guard; V51 the shared KAS
     * payment account; V52 renames the Silver tier to Classic; V53 adds surcharges; V54 removes the Find Your KAS image slots; V55 aligns the website image slots with Homepage V3 and the Guidebook.
     * V61 SePay IPN log; V62 VAT 8%; V63/V64 cancellation fee rules and the manual refund workflow; V65 voucher holds;
     * V66 payment deadline, SePay checkout sessions and unmatched-payment follow-up.
     */
    private static final int HIGHEST_VERSION = 66;

    static boolean databaseIsReachable() {
        return LocalDatabase.isReachable();
    }

    @Test
    @DisplayName("checksum validation passes for all 30 migrations")
    void checksumValidationPasses() {
        // Throws on any mismatch, missing migration or out-of-order application.
        flyway().validate();
    }

    @Test
    @DisplayName("the schema history holds one row per migration, all successful")
    void historyIsComplete() throws SQLException {
        assertThat(scalarLong("SELECT count(*) FROM kas.flyway_schema_history"))
                .isEqualTo(EXPECTED_MIGRATIONS);
        assertThat(scalarLong("SELECT count(*) FROM kas.flyway_schema_history WHERE NOT success"))
                .as("a failed row would block every future migration")
                .isZero();
    }

    @Test
    @DisplayName("no BASELINE row exists — this is history adoption, not a baseline")
    void noBaselineRow() throws SQLException {
        // The distinction that matters: a BASELINE row would mean the migrations
        // below it are permanently unvalidated (doc 89 §6.3, Option B).
        assertThat(scalarLong("SELECT count(*) FROM kas.flyway_schema_history WHERE type = 'BASELINE'"))
                .isZero();
        assertThat(scalarLong("SELECT count(*) FROM kas.flyway_schema_history WHERE checksum IS NULL AND type <> 'SCHEMA'"))
                .as("every row carries a checksum, so every migration is validated")
                .isZero();
    }

    @Test
    @DisplayName("every versioned migration V1 to V29 is recorded, with both repeatables")
    void everyFrozenMigrationIsRecorded() throws SQLException {
        List<String> versions = new ArrayList<>();
        int repeatables = 0;

        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT version FROM kas.flyway_schema_history WHERE type <> 'SCHEMA' ORDER BY installed_rank")) {
            while (rs.next()) {
                String version = rs.getString(1);
                if (version == null) {
                    repeatables++;
                } else {
                    versions.add(version);
                }
            }
        }

        // Asserted as a SET, not a sequence. A repeatable migration re-runs
        // whenever its file changes and takes a fresh installed_rank at the end,
        // so the rank order interleaves repeatables with versioned migrations and
        // is not a stable thing to assert on.
        List<String> expected = new ArrayList<>();
        for (int version = 1; version <= HIGHEST_VERSION; version++) {
            expected.add(String.valueOf(version));
        }

        assertThat(versions).containsExactlyInAnyOrderElementsOf(expected);
        assertThat(repeatables).as("distribution channels and amenities").isEqualTo(2);
    }

    @Test
    @DisplayName("nothing is pending, failed or out of order")
    void nothingIsPending() {
        MigrationInfo[] all = flyway().info().all();

        assertThat(all).hasSize(EXPECTED_MIGRATIONS);
        assertThat(all).allSatisfy(info -> {
            assertThat(info.getState().isFailed())
                    .as("%s is in a failed state", info.getScript())
                    .isFalse();
            assertThat(info.getState().isApplied())
                    .as("%s is not recorded as applied", info.getScript())
                    .isTrue();
        });
    }

    @Test
    @DisplayName("clean is disabled — flyway:clean can never run")
    void cleanIsDisabled() {
        // Asserted on the configuration, never by calling clean(): if this
        // property were wrong, calling it to find out would drop the schema.
        assertThat(flyway().getConfiguration().isCleanDisabled())
                .as("doc 89 §6.4 — clean-disabled is a standing guard, not a default")
                .isTrue();
    }

    @Test
    @DisplayName("the 53 Phase 7.2 domain tables are intact alongside later additions")
    void domainSchemaIsUntouched() throws SQLException {
        assertThat(scalarLong("""
                SELECT count(*) FROM information_schema.tables
                 WHERE table_schema='kas' AND table_type='BASE TABLE'
                   AND table_name NOT IN ('flyway_schema_history', 'property_submission',
                                        'reservation_request_idempotency',
                                        'reservation_assignment',
                                        'reservation_availability_check',
                                        'rate_day', 'message_template')
                """))
                .as("migrations may add tables; they must never remove one")
                .isGreaterThanOrEqualTo(53);
    }

    private static Flyway flyway() {
        return Flyway.configure()
                .dataSource(LocalDatabase.URL, LocalDatabase.USER, LocalDatabase.password())
                .schemas("kas")
                .defaultSchema("kas")
                .locations("classpath:db/migration")
                .baselineOnMigrate(false)
                .validateOnMigrate(true)
                .cleanDisabled(true)
                .outOfOrder(false)
                .load();
    }

    private static long scalarLong(String sql) throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }
}
