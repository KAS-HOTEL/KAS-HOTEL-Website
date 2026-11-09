package com.kas.platform.db;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Connectivity and the Phase 7.2 guarantees, re-checked from the application's
 * own JDBC connection rather than from psql.
 *
 * <p>Doc 88 verified these through psql. That proved the schema is correct; it
 * did not prove the application reaches the same schema as the same role. This
 * closes that gap, read-only.
 *
 * <p>Skips, loudly, when no database is reachable — so the same suite runs in CI
 * against a container and locally against the developer's PostgreSQL, without
 * either configuration being special-cased.
 */
@EnabledIf("com.kas.platform.db.DatabaseConnectivityIT#databaseIsReachable")
class DatabaseConnectivityIT {

    static boolean databaseIsReachable() {
        return LocalDatabase.isReachable();
    }

    @Test
    @DisplayName("the application connects as kas_web_app to kas_web_test on schema kas")
    void connectsWithTheExpectedIdentity() throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT current_database(), current_user, current_schema()")) {

            assertThat(rs.next()).isTrue();
            assertThat(rs.getString(1)).isEqualTo("kas_web_test");
            assertThat(rs.getString(2))
                    .as("the runtime role must not be the postgres superuser")
                    .isEqualTo("kas_web_app");
            assertThat(rs.getString(3))
                    .as("no silent fallback to public")
                    .isEqualTo("kas");
        }
    }

    @Test
    @DisplayName("the runtime role holds no elevated privilege")
    void runtimeRoleIsLeastPrivilege() throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("""
                     SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
                     FROM pg_roles WHERE rolname = current_user
                     """)) {

            assertThat(rs.next()).isTrue();
            for (int column = 1; column <= 5; column++) {
                assertThat(rs.getBoolean(column))
                        .as("role flag %d must be false", column)
                        .isFalse();
            }
        }
    }

    @Test
    @DisplayName("the frozen domain schema is present and unchanged in shape")
    void frozenSchemaIsIntact() throws SQLException {
        // flyway_schema_history is excluded from both counts. It is migration
        // infrastructure created by the Option C adoption (doc 89 §6), not part
        // of the frozen domain schema, and counting it would make every future
        // Flyway change look like a domain change.
        // Asserts that nothing was REMOVED, not that nothing was added. Migrations
        // are additive by rule, so the frozen tables are named and checked for
        // presence, rather than total counts pinned with an exclusion list that
        // every later migration (V22 onwards) had to extend.
        assertThat(PHASE_7_2_TABLES).as("doc 88 §1 froze 53 domain tables").hasSize(53);
        assertThat(tableNames())
                .as("the 53 Phase 7.2 domain tables, per doc 88 §1, all still present")
                .containsAll(PHASE_7_2_TABLES);

        assertThat(count("""
                SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname='kas' AND c.conrelid::regclass::text NOT LIKE '%flyway%'
                """))
                .as("at least the 314 now present — 305 from doc 88 §1, plus V24, less the hold_unique constraint V26 turned into a partial index — none dropped")
                .isGreaterThanOrEqualTo(314);

        assertThat(count("""
                SELECT count(*) FROM pg_indexes
                 WHERE schemaname='kas' AND tablename <> 'flyway_schema_history'
                """))
                .as("at least the 141 now present — 135 from doc 88 §1 plus V24/V26 — none dropped")
                .isGreaterThanOrEqualTo(141);
    }

    /**
     * The keys the owner has explicitly answered, and when.
     *
     * <p>Phase 7.5E-DECISION, 2026-08-18 — {@code INVENTORY_HORIZON_MONTHS},
     * {@code MAX_ROOMS_PER_REQUEST}.
     *
     * <p>Phase 7.5F Step 16A, 2026-08-26 — {@code SALES_FIRST_CONTACT_SLA} and
     * {@code DIRECT_REQUEST_HOLD_DURATION}, both {@code PT24H}, frozen by doc 117
     * §2 rows 1 and 2. Applied by a guarded {@code UPDATE … WHERE value IS NULL},
     * never by a migration — doc 99 §6.
     *
     * <p>Every other key must still be NULL — a value appearing against any of
     * them would mean something was invented.
     *
     * <p>This list is the whole point of the test: it is short, it is named, and
     * adding to it is a visible act. Relaxing the assertion to "some values may be
     * set" would have thrown away the guarantee instead of recording an exception
     * to it.
     */
    private static final List<String> OWNER_ANSWERED_KEYS =
            List.of("INVENTORY_HORIZON_MONTHS", "MAX_ROOMS_PER_REQUEST",
                    "SALES_FIRST_CONTACT_SLA", "DIRECT_REQUEST_HOLD_DURATION",
                    // Step 16A.9 owner decision 2 — B12 / OQ-017 option A,
                    // pay-at-hotel permitted in V1.
                    "DEPOSIT_REQUIRED_TO_CONFIRM",
                    // V45 — A5 / OQ-045, no-show from 23:59 on the check-in date.
                    "NO_SHOW_CUTOFF");

    @Test
    @DisplayName("no business configuration has been invented — only owner-answered keys hold values")
    void noConfigurationValueWasInvented() throws SQLException {
        assertThat(count("SELECT count(*) FROM system_setting"))
                .as("the registry of outstanding business inputs, doc 88 §11")
                .isEqualTo(18);

        String answered = OWNER_ANSWERED_KEYS.stream()
                .map(key -> "'" + key + "'")
                .collect(java.util.stream.Collectors.joining(", "));

        assertThat(count("SELECT count(*) FROM system_setting "
                + "WHERE value IS NOT NULL AND key NOT IN (" + answered + ")"))
                .as("a supplied value outside the owner-answered keys would mean "
                        + "something was invented")
                .isZero();

        assertThat(count("SELECT count(*) FROM system_setting WHERE value IS NULL"))
                .as("the business inputs still outstanding, once the owner-answered keys are excluded")
                .isEqualTo(18 - OWNER_ANSWERED_KEYS.size());
    }

    @Test
    @DisplayName("no column anywhere can hold a physical room identity")
    void noPhysicalRoomColumnExists() throws SQLException {
        assertThat(count("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='kas'
                  AND column_name IN ('room_number','floor','unit_id','building_section','assigned_room')
                """))
                .as("doc 52 §6: room numbers cannot leak if they do not exist")
                .isZero();
    }

    @Test
    @DisplayName("the reservation carries two named lifecycles, never a generic status")
    void reservationHasNoGenericStatusOrSource() throws SQLException {
        assertThat(count("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='kas' AND table_name='reservation'
                  AND column_name IN ('status','source')
                """))
                .as("doc 52 §4 R13 and the doc 29 channel correction")
                .isZero();

        assertThat(count("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='kas' AND table_name='reservation'
                  AND column_name IN ('sales_status','stay_status')
                """))
                .as("both lifecycles present and separate")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("customer is platform-level — never partner- or property-scoped")
    void customerIsPlatformLevel() throws SQLException {
        assertThat(count("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='kas' AND table_name='customer'
                  AND column_name IN ('partner_id','property_id')
                """))
                .as("doc 85 §3.3: a customer is a person, not a partner's asset")
                .isZero();
    }

    /** The 53 tables V2–V20 created — the domain schema doc 88 §1 froze. */
    private static final List<String> PHASE_7_2_TABLES = List.of(
            "partner", "app_user",                                                   // V2
            "property", "property_translation", "property_policy",                  // V3
            "property_policy_translation", "property_landmark",
            "property_landmark_translation", "property_experience",
            "property_experience_translation",
            "amenity", "amenity_translation", "property_amenity",                   // V4
            "facility", "facility_translation",
            "room_type", "room_type_translation", "room_type_bed_config",           // V5
            "room_type_amenity",
            "distribution_channel",                                                 // V6
            "role_assignment", "user_session", "customer", "customer_consent",      // V7
            "customer_identity_match",
            "media_asset", "media_asset_translation", "media_link",                 // V8
            "rate_rule", "tax_rule", "ota_safety_buffer_rule",                      // V9
            "room_type_inventory_day",                                              // V10
            "sales_inquiry",                                                        // V11
            "reservation", "reservation_line",                                      // V12
            "inventory_hold",                                                       // V13
            "reservation_status_history", "reservation_contact_log",               // V14
            "reservation_note", "reservation_message", "reservation_change",
            "payment",                                                              // V15
            "review", "review_photo", "review_reply", "review_report",              // V16
            "voucher", "voucher_redemption",                                        // V17
            "notification", "email_log", "email_suppression",                       // V18
            "audit_log",                                                            // V19
            "system_setting");                                                      // V20

    private static List<String> tableNames() throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("""
                     SELECT table_name FROM information_schema.tables
                      WHERE table_schema='kas' AND table_type='BASE TABLE'
                     """)) {
            List<String> names = new java.util.ArrayList<>();
            while (rs.next()) {
                names.add(rs.getString(1));
            }
            return names;
        }
    }

    private static long count(String sql) throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }
}
