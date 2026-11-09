package com.kas.platform.db;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * One-time Flyway history adoption — Option C, approved by the owner.
 *
 * <p>Schema {@code kas} was applied by psql in Phase 7.2 and has no
 * {@code flyway_schema_history}. This tool records V1–V21 and the repeatable
 * migration as already applied, so Flyway becomes the migration authority
 * <strong>with full checksum validation retained</strong> — the property that
 * Option B (baseline at 21) would have given up.
 *
 * <h2>What it does, and what it deliberately does not</h2>
 *
 * <p><strong>Adds</strong> one table, {@code kas.flyway_schema_history}, holding
 * 22 rows. <strong>Touches nothing else.</strong> No DROP, no TRUNCATE, no
 * ALTER, no reset, no role or database change. A schema fingerprint over every
 * pre-existing table, constraint and index is taken before and after and must
 * match exactly.
 *
 * <p>The history table is created by Flyway's own {@code baseline()}, not by
 * hand-written DDL, so its shape is whatever the Flyway version in use expects.
 * The placeholder baseline row is then replaced, inside a single transaction,
 * by the 22 real rows. Version, description, script, type and checksum are read
 * from {@code flyway.info()} — Flyway's own resolution — so nothing is derived
 * from a filename by this code and cannot drift from what validation compares.
 *
 * <h2>Safety</h2>
 *
 * <ul>
 *   <li><strong>Dry run by default.</strong> Pass {@code --apply} to execute.</li>
 *   <li>Refuses unless connected to {@code kas_web_dev} / {@code kas_web_app} /
 *       {@code kas}, and refuses outright if the URL mentions a legacy name.</li>
 *   <li>Refuses if a history table already exists — it can never run twice.</li>
 *   <li>Refuses if the schema does not already hold the expected 53 tables.</li>
 *   <li>If the row insert fails after the table was created, the table this tool
 *       created is dropped, restoring the exact prior state.</li>
 * </ul>
 *
 * <p>Retained in the repository for auditability rather than deleted: the guards
 * make re-running impossible, and the operation it performed should be
 * inspectable later. It is test-scoped and never enters the application jar.
 *
 * <p>Recorded in {@code docs/kas/89-phase-7-3-backend-foundation.md} §6.
 */
public final class FlywayHistoryAdoption {

    private static final int EXPECTED_DOMAIN_TABLES = 53;
    private static final int EXPECTED_MIGRATIONS = 22;

    /**
     * Fingerprints every column, constraint and index in schema {@code kas},
     * excluding the history table itself. Identical before and after is the
     * proof that adoption altered nothing that already existed.
     */
    private static final String FINGERPRINT_SQL = """
            SELECT md5(string_agg(entry, E'\\n' ORDER BY entry)) FROM (
              SELECT 'C:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable
                     ||':'||coalesce(column_default,'-') AS entry
                FROM information_schema.columns
               WHERE table_schema='kas' AND table_name <> 'flyway_schema_history'
              UNION ALL
              SELECT 'K:'||c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid)
                FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
               WHERE n.nspname='kas' AND c.conrelid::regclass::text NOT LIKE '%flyway%'
              UNION ALL
              SELECT 'I:'||indexname||':'||indexdef
                FROM pg_indexes
               WHERE schemaname='kas' AND tablename <> 'flyway_schema_history'
            ) fingerprint_source
            """;

    private FlywayHistoryAdoption() {
    }

    public static void main(String[] args) throws Exception {
        boolean apply = args.length > 0 && "--apply".equals(args[0]);

        line("KAS — Flyway history adoption (Option C)");
        line(apply ? "MODE: APPLY" : "MODE: DRY RUN  (pass --apply to execute)");
        line("");

        refuseLegacyTarget();

        Identity identity = readIdentity();
        line("connected     : " + identity.database() + " / " + identity.role()
                + " / " + identity.schema());
        require("kas_web_dev".equals(identity.database()), "database must be kas_web_dev");
        require("kas_web_app".equals(identity.role()), "role must be kas_web_app");
        require("kas".equals(identity.schema()), "schema must be kas");

        require(!historyExists(), "flyway_schema_history already exists — adoption has already run");

        long domainTables = scalarLong("""
                SELECT count(*) FROM information_schema.tables
                 WHERE table_schema='kas' AND table_type='BASE TABLE'
                   AND table_name <> 'flyway_schema_history'
                """);
        line("domain tables : " + domainTables);
        require(domainTables == EXPECTED_DOMAIN_TABLES,
                "expected " + EXPECTED_DOMAIN_TABLES + " domain tables, found " + domainTables);

        String fingerprintBefore = scalarString(FINGERPRINT_SQL);
        line("fingerprint   : " + fingerprintBefore + "  (before)");
        line("");

        List<Row> rows = resolveMigrations();
        require(rows.size() == EXPECTED_MIGRATIONS,
                "expected " + EXPECTED_MIGRATIONS + " migrations, resolved " + rows.size());

        line("Rows to be written:");
        line(String.format("  %-5s %-14s %-46s %-8s %s", "RANK", "VERSION", "SCRIPT", "TYPE", "CHECKSUM"));
        for (Row row : rows) {
            line(String.format("  %-5d %-14s %-46s %-8s %s",
                    row.installedRank(),
                    row.version() == null ? "(repeatable)" : row.version(),
                    row.script(), row.type(), row.checksum()));
        }
        line("");

        if (!apply) {
            line("DRY RUN — nothing was written. Re-run with --apply to adopt.");
            return;
        }

        boolean tableCreatedHere = false;
        try {
            // Flyway creates the history table with its own DDL, so its shape is
            // exactly what this Flyway version expects. The placeholder row is
            // replaced below; baselining at 0 keeps it unambiguous if anything
            // inspects the table between these two steps.
            baselineFlyway();
            tableCreatedHere = true;
            line("history table : created by Flyway baseline()");

            writeHistoryAtomically(rows);
            line("history rows  : " + rows.size() + " written, placeholder removed (one transaction)");

        } catch (Exception e) {
            if (tableCreatedHere) {
                dropHistoryTableCreatedHere();
                line("ROLLED BACK   : the history table this tool created was dropped; "
                        + "the schema is exactly as it was");
            }
            throw e;
        }

        String fingerprintAfter = scalarString(FINGERPRINT_SQL);
        line("fingerprint   : " + fingerprintAfter + "  (after)");
        require(fingerprintBefore.equals(fingerprintAfter),
                "SCHEMA FINGERPRINT CHANGED — adoption altered an existing object");
        line("fingerprint   : IDENTICAL — no pre-existing object was altered");
        line("");

        Flyway flyway = flyway();
        flyway.validate();
        line("flyway validate : PASS — all " + EXPECTED_MIGRATIONS + " checksums match");

        long pending = java.util.Arrays.stream(flyway.info().all())
                .filter(info -> info.getState() != null && info.getState().isFailed())
                .count();
        require(pending == 0, "migrations reported a failed state after adoption");

        line("");
        line("ADOPTION COMPLETE. Flyway is now the migration authority for schema kas.");
    }

    // ---------------------------------------------------------------- steps

    private static void baselineFlyway() {
        Flyway.configure()
                .dataSource(LocalDatabase.URL, LocalDatabase.USER, LocalDatabase.password())
                .schemas("kas")
                .defaultSchema("kas")
                .locations("classpath:db/migration")
                .cleanDisabled(true)
                .baselineVersion("0")
                .baselineDescription("<< placeholder, replaced by history adoption >>")
                .load()
                .baseline();
    }

    /**
     * Replaces the placeholder with the real history in one transaction, so the
     * table is never left half-populated. A half-populated history would be
     * worse than none: Flyway would believe some migrations were applied and try
     * to apply the rest against objects that already exist.
     */
    private static void writeHistoryAtomically(List<Row> rows) throws SQLException {
        try (Connection connection = writableConnection()) {
            connection.setAutoCommit(false);
            try {
                try (Statement statement = connection.createStatement()) {
                    statement.executeUpdate("DELETE FROM kas.flyway_schema_history");
                }
                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO kas.flyway_schema_history
                            (installed_rank, version, description, type, script,
                             checksum, installed_by, installed_on, execution_time, success)
                        VALUES (?, ?, ?, ?, ?, ?, current_user, now(), 0, true)
                        """)) {
                    for (Row row : rows) {
                        insert.setInt(1, row.installedRank());
                        insert.setString(2, row.version());
                        insert.setString(3, row.description());
                        insert.setString(4, row.type());
                        insert.setString(5, row.script());
                        if (row.checksum() == null) {
                            insert.setNull(6, java.sql.Types.INTEGER);
                        } else {
                            insert.setInt(6, row.checksum());
                        }
                        insert.addBatch();
                    }
                    insert.executeBatch();
                }
                connection.commit();
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            }
        }
    }

    /**
     * Restores the prior state after a failed insert.
     *
     * <p>Safe because this drops only the table this run created moments earlier,
     * and only after confirming it holds no adopted rows. It is never reachable
     * once adoption has succeeded.
     */
    private static void dropHistoryTableCreatedHere() {
        try (Connection connection = writableConnection();
             Statement statement = connection.createStatement()) {
            try (ResultSet rs = statement.executeQuery(
                    "SELECT count(*) FROM kas.flyway_schema_history WHERE type <> 'BASELINE'")) {
                rs.next();
                if (rs.getLong(1) > 0) {
                    line("REFUSING to drop the history table: it holds adopted rows. "
                            + "Inspect kas.flyway_schema_history manually.");
                    return;
                }
            }
            statement.executeUpdate("DROP TABLE kas.flyway_schema_history");
        } catch (SQLException e) {
            line("Rollback drop failed: " + e.getMessage()
                    + " — inspect kas.flyway_schema_history manually.");
        }
    }

    /** Every field validation compares comes from Flyway's own resolution. */
    private static List<Row> resolveMigrations() {
        List<Row> rows = new ArrayList<>();
        int rank = 1;
        for (MigrationInfo info : flyway().info().all()) {
            rows.add(new Row(
                    rank++,
                    info.getVersion() == null ? null : info.getVersion().toString(),
                    info.getDescription(),
                    info.getType().name(),
                    info.getScript(),
                    info.getChecksum()));
        }
        return rows;
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

    // ---------------------------------------------------------------- helpers

    private static void refuseLegacyTarget() {
        String url = LocalDatabase.URL.toLowerCase(java.util.Locale.ROOT);
        for (String legacy : new String[]{"kas_dev", "kas_test", "kas_app"}) {
            // kas_web_dev contains none of these as whole tokens; a bare match means
            // the target was changed to a legacy database.
            require(!url.matches(".*[/=]" + legacy + "([?&].*)?$"),
                    "target URL names the legacy database " + legacy);
        }
    }

    private static boolean historyExists() throws SQLException {
        return scalarLong("""
                SELECT count(*) FROM information_schema.tables
                 WHERE table_schema='kas' AND table_name='flyway_schema_history'
                """) > 0;
    }

    private static Identity readIdentity() throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT current_database(), current_user, current_schema()")) {
            rs.next();
            return new Identity(rs.getString(1), rs.getString(2), rs.getString(3));
        }
    }

    private static Connection writableConnection() throws SQLException {
        return java.sql.DriverManager.getConnection(
                LocalDatabase.URL, LocalDatabase.USER, LocalDatabase.password());
    }

    private static long scalarLong(String sql) throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static String scalarString(String sql) throws SQLException {
        try (Connection connection = LocalDatabase.open();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalStateException("REFUSING TO PROCEED: " + message);
        }
    }

    private static void line(String message) {
        System.out.println(message);
    }

    private record Identity(String database, String role, String schema) {
    }

    private record Row(int installedRank, String version, String description,
                       String type, String script, Integer checksum) {
    }
}
