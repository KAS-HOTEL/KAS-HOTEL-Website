package com.kas.platform.db;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two owner decisions Step 16A Phase E3 applied — doc 117 §2 rows 1 and 2.
 *
 * <pre>
 *   SALES_FIRST_CONTACT_SLA      = PT24H   (A6)
 *   DIRECT_REQUEST_HOLD_DURATION = PT24H   (B2)
 * </pre>
 *
 * <p>Applied by a guarded {@code UPDATE … WHERE value IS NULL}, never by a
 * migration — doc 99 §6: <em>"a migration would push one owner's business
 * decision into every environment from source control"</em>.
 *
 * <p>These tests assert the applied state and the safety of the mechanism. They
 * assert nothing about reservations: no endpoint exists, and E4/E5/E6 have not
 * started.
 *
 * <p>The two write-probing tests run inside a transaction that is rolled back,
 * so the stored configuration is never actually altered by this class.
 */
@EnabledIf("com.kas.platform.db.OwnerConfigurationIT#databaseIsReachable")
class OwnerConfigurationIT {

    private static final String A6 = "SALES_FIRST_CONTACT_SLA";
    private static final String B2 = "DIRECT_REQUEST_HOLD_DURATION";
    private static final String B1 = "DIRECT_ALTERNATIVE_HOLD_DURATION";

    /** The exact statement Phase E3 ran, and the only one it is allowed to run. */
    private static final String GUARDED_UPDATE =
            "UPDATE system_setting SET value = ? WHERE key = ? AND value IS NULL";

    static boolean databaseIsReachable() {
        return LocalDatabase.isReachable();
    }

    private static Connection openWritable() throws SQLException {
        Connection connection = DriverManager.getConnection(
                LocalDatabase.URL, LocalDatabase.USER, LocalDatabase.password());
        connection.setAutoCommit(false);
        return connection;
    }

    @Test
    @DisplayName("A6 is PT24H, and it parses to the 24 hours the SLA promises")
    void salesFirstContactSlaIsApplied() throws SQLException {
        assertThat(value(A6))
                .as("doc 117 §9 — sla_due_at = requested_at + PT24H")
                .isEqualTo("PT24H");

        // The same parse SystemSettingService.requireDuration performs.
        assertThat(Duration.parse(value(A6))).isEqualTo(Duration.ofHours(24));
    }

    @Test
    @DisplayName("B2 is PT24H, and it parses to the 24 hours the request hold lives")
    void directRequestHoldDurationIsApplied() throws SQLException {
        assertThat(value(B2))
                .as("doc 117 §10 — inventory_hold.expires_at = requested_at + PT24H")
                .isEqualTo("PT24H");

        assertThat(Duration.parse(value(B2))).isEqualTo(Duration.ofHours(24));
    }

    @Test
    @DisplayName("both are GLOBAL scope with no property row — B2 has no V1 override path")
    void bothAreGlobalScopeOnly() throws SQLException {
        for (String key : new String[] {A6, B2}) {
            assertThat(scope(key))
                    .as("%s — the schema's CHECK is scope IN ('GLOBAL','PROPERTY'); "
                            + "GLOBAL is what system-level means here", key)
                    .isEqualTo("GLOBAL");
            assertThat(propertyId(key)).as("%s carries no property", key).isNull();
        }

        // Doc 117 §10.2 removed the per-property override from V1. The mechanism
        // exists in the schema; this asserts Phase E3 did not use it.
        assertThat(count("SELECT count(*) FROM system_setting WHERE key = '" + B2
                + "' AND scope = 'PROPERTY'"))
                .as("no per-property B2 row was created")
                .isZero();
        assertThat(count("SELECT count(*) FROM system_setting WHERE key = '" + B2 + "'"))
                .as("exactly one B2 row exists")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("B1 is a different setting and remains unset")
    void alternativeHoldDurationIsUntouched() throws SQLException {
        // Doc 117 §10.1: B2 governs the REQUEST hold at S1, B1 the
        // ALTERNATIVE_OFFER hold at S7. Applying B2 must not have touched B1.
        assertThat(value(B1))
                .as("B1 is not in Step 16A's scope and no value was invented for it")
                .isNull();
    }

    @Test
    @DisplayName("re-running the guarded update is a no-op — an applied value is never overwritten")
    void reapplyingDoesNotOverwrite() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                for (String key : new String[] {A6, B2}) {
                    try (PreparedStatement ps = c.prepareStatement(GUARDED_UPDATE)) {
                        ps.setString(1, "PT99H");
                        ps.setString(2, key);
                        assertThat(ps.executeUpdate())
                                .as("%s already holds a value, so the guard matches no row", key)
                                .isZero();
                    }
                }
            } finally {
                c.rollback();
            }
        }

        assertThat(value(A6)).isEqualTo("PT24H");
        assertThat(value(B2)).isEqualTo("PT24H");
    }

    @Test
    @DisplayName("an environment configured differently is left alone by the guard")
    void aDifferentExistingValueSurvives() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                // Simulate an environment where the owner set something else.
                try (PreparedStatement ps = c.prepareStatement(
                        "UPDATE system_setting SET value = 'PT36H' WHERE key = ?")) {
                    ps.setString(1, A6);
                    ps.executeUpdate();
                }

                try (PreparedStatement ps = c.prepareStatement(GUARDED_UPDATE)) {
                    ps.setString(1, "PT24H");
                    ps.setString(2, A6);
                    assertThat(ps.executeUpdate())
                            .as("value IS NULL is what makes the statement safe to re-run "
                                    + "anywhere, not just here")
                            .isZero();
                }

                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT value FROM system_setting WHERE key = ?")) {
                    ps.setString(1, A6);
                    try (ResultSet rs = ps.executeQuery()) {
                        assertThat(rs.next()).isTrue();
                        assertThat(rs.getString(1))
                                .as("the other environment's decision is untouched")
                                .isEqualTo("PT36H");
                    }
                }
            } finally {
                c.rollback();
            }
        }

        assertThat(value(A6)).as("rolled back").isEqualTo("PT24H");
    }

    @Test
    @DisplayName("the registry still holds 18 keys and no new one was invented")
    void noNewSettingKeyWasCreated() throws SQLException {
        assertThat(count("SELECT count(*) FROM system_setting"))
                .as("Step 16A added no configuration key — doc 117 §9 defers "
                        + "calendars and escalation rather than adding keys for them")
                .isEqualTo(18);
    }

    @Test
    @DisplayName("the settings still outstanding remain unset")
    void everythingElseIsStillUnset() throws SQLException {
        assertThat(count("SELECT count(*) FROM system_setting WHERE value IS NOT NULL"))
                .as("two from Phase 7.5E, two from Step 16A, B12 from Step 16A.9, and A5 from V45")
                .isEqualTo(6);
        assertThat(value("DEPOSIT_REQUIRED_TO_CONFIRM"))
                .as("owner decision 2 — pay-at-hotel is permitted in V1")
                .isEqualTo("false");
    }

    // ---- helpers ------------------------------------------------------------

    private static String value(String key) throws SQLException {
        return column(key, "value");
    }

    private static String scope(String key) throws SQLException {
        return column(key, "scope");
    }

    private static String propertyId(String key) throws SQLException {
        return column(key, "property_id::text");
    }

    private static String column(String key, String column) throws SQLException {
        try (Connection c = LocalDatabase.open();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT " + column + " FROM system_setting WHERE key = ?")) {
            ps.setString(1, key);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("%s exists in the registry", key).isTrue();
                return rs.getString(1);
            }
        }
    }

    private static long count(String sql) throws SQLException {
        try (Connection c = LocalDatabase.open();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(sql)) {
            assertThat(rs.next()).isTrue();
            return rs.getLong(1);
        }
    }
}
