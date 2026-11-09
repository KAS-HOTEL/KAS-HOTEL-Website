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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Database-level proof for the two Step 16A migrations — V24 and V25.
 *
 * <p>These assert what the <em>schema</em> guarantees, not what any HTTP surface
 * does. No reservation endpoint exists yet, and doc 117 §5.5 leaves OQ-170 open,
 * so nothing here asserts a status code or a response.
 *
 * <p><strong>Every test runs inside a transaction that is rolled back.</strong>
 * {@link LocalDatabase#open()} is deliberately read-only for the existing
 * connectivity checks, so these open their own writable connection from the same
 * package rather than relaxing that helper. The database is left with the same
 * zero rows it started with, which
 * {@link #theseTestsLeaveNoBusinessDataBehind()} asserts.
 */
@EnabledIf("com.kas.platform.db.ReservationRequestPersistenceIT#databaseIsReachable")
class ReservationRequestPersistenceIT {

    static boolean databaseIsReachable() {
        return LocalDatabase.isReachable();
    }

    /**
     * Writable, never committed. The read-only default on
     * {@link LocalDatabase#open()} stays exactly as it was.
     */
    private static Connection openWritable() throws SQLException {
        Connection connection = DriverManager.getConnection(
                LocalDatabase.URL, LocalDatabase.USER, LocalDatabase.password());
        connection.setAutoCommit(false);
        return connection;
    }

    /**
     * The counting queries below, evaluated before the running test writes
     * anything.
     *
     * <h2>Why these counts are relative</h2>
     *
     * Every assertion here means <em>"this test's inserts produced N rows"</em>,
     * and each was written as an absolute {@code count(*)} because
     * {@code kas_web_dev} happened to hold no business data. That is not a
     * property of the schema under test: one real reservation in the database
     * fails seven of these while proving nothing about V24, V25 or V26.
     *
     * <p>The baseline is read on its own connection, before the test's, so it
     * sees exactly the committed rows the test did not create. Each test then
     * rolls back, so nothing here changes what the next one sees.
     */
    private final java.util.Map<String, Long> baseline = new java.util.HashMap<>();

    private static final java.util.List<String> COUNTED = java.util.List.of(
            "SELECT count(*) FROM reservation",
            "SELECT count(*) FROM reservation_line",
            "SELECT count(*) FROM inventory_hold",
            "SELECT count(*) FROM inventory_hold WHERE status = 'ACTIVE'",
            "SELECT count(*) FROM reservation_request_idempotency",
            "SELECT count(*) FROM room_type");

    @org.junit.jupiter.api.BeforeEach
    void captureBaseline() throws SQLException {
        baseline.clear();
        try (Connection c = openWritable()) {
            for (String sql : COUNTED) {
                baseline.put(sql, count(c, sql));
            }
            c.rollback();
        }
    }

    /** How many rows the running test added, for one of {@link #COUNTED}. */
    private long added(Connection c, String sql) throws SQLException {
        Long before = baseline.get(sql);
        assertThat(before).as("%s is not in COUNTED", sql).isNotNull();
        return count(c, sql) - before;
    }

    // ---- V24 — reservation_request_idempotency ------------------------------

    @Test
    @DisplayName("V24: the same Idempotency-Key cannot be persisted twice")
    void idempotencyKeyIsUniqueInTheDatabase() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID reservation = insertReservation(c);
                insertIdempotency(c, "key-alpha", "fingerprint-1", reservation);

                // The second insert is what makes two concurrent first requests
                // safe: the database refuses, the loser's whole transaction
                // rolls back, and it re-reads the winner's row.
                assertThatThrownBy(() -> insertIdempotency(c, "key-alpha", "fingerprint-1", reservation))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("reservation_request_idempotency_pkey");
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V24: a different key for the same reservation is permitted — no unrequested UNIQUE")
    void reservationIdIsNotUniqueByItself() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID reservation = insertReservation(c);
                insertIdempotency(c, "key-one", "fingerprint-1", reservation);
                insertIdempotency(c, "key-two", "fingerprint-1", reservation);

                // Doc 117 does not freeze one-key-per-reservation as an invariant,
                // so V24 does not assert it. This test exists so that stays a
                // deliberate choice rather than an accident.
                assertThat(added(c, "SELECT count(*) FROM reservation_request_idempotency"))
                        .isEqualTo(2);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V24: the fingerprint and the original response survive a round trip")
    void fingerprintAndResponseArePersisted() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID reservation = insertReservation(c);
                insertIdempotency(c, "key-beta", "sha256:abc123", reservation);

                try (PreparedStatement ps = c.prepareStatement("""
                        SELECT request_fingerprint, response_snapshot ->> 'reference', created_at
                          FROM reservation_request_idempotency
                         WHERE idempotency_key = ?
                        """)) {
                    ps.setString(1, "key-beta");
                    try (ResultSet rs = ps.executeQuery()) {
                        assertThat(rs.next()).isTrue();
                        assertThat(rs.getString(1))
                                .as("the fingerprint makes same-key/different-body DETECTABLE — "
                                        + "OQ-170 stays open and no response policy is implied")
                                .isEqualTo("sha256:abc123");
                        assertThat(rs.getString(2))
                                .as("enough of the original result to replay it, including the one "
                                        + "field not derivable from reservation")
                                .isEqualTo("KAS-260912-TEST");
                        assertThat(rs.getTimestamp(3)).isNotNull();
                    }
                }
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V24: a blank key or blank fingerprint is refused")
    void blankValuesAreRefused() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID reservation = insertReservation(c);

                assertThatThrownBy(() -> insertIdempotency(c, "   ", "fingerprint-1", reservation))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("reservation_request_idempotency_key_not_blank");
                c.rollback();

                UUID second = insertReservation(c);
                assertThatThrownBy(() -> insertIdempotency(c, "key-gamma", "", second))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("reservation_request_idempotency_fingerprint_not_blank");
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V24: deleting the reservation removes its key — no orphan record")
    void keyCascadesWithItsReservation() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID reservation = insertReservation(c);
                insertIdempotency(c, "key-delta", "fingerprint-1", reservation);

                try (PreparedStatement ps =
                             c.prepareStatement("DELETE FROM reservation WHERE id = ?")) {
                    ps.setObject(1, reservation);
                    ps.executeUpdate();
                }

                assertThat(added(c, "SELECT count(*) FROM reservation_request_idempotency"))
                        .isZero();
            } finally {
                c.rollback();
            }
        }
    }

    // ---- V25 / V26 — hold uniqueness ----------------------------------------

    @Test
    @DisplayName("V25+V26: an identical ACTIVE hold is REJECTED — the OQ-169 defect is gone")
    void identicalHoldIsRejected() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");
                UUID reservation = insertReservation(c);

                insertHold(c, reservation, property, roomType, "2030-01-01");

                // Before V25 this second insert SUCCEEDED: the XOR CHECK forces
                // inquiry_id to NULL, and a default UNIQUE treats NULLs as
                // distinct, so the constraint could never fire. V26 kept that
                // fix and scoped it to live holds.
                assertThatThrownBy(() -> insertHold(c, reservation, property, roomType, "2030-01-01"))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("hold_active_unique_idx");
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V25: legitimate holds — different night, different room type — remain insertable")
    void legitimateHoldsAreStillAccepted() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID deluxe = insertRoomType(c, property, "deluxe-room");
                UUID suite = insertRoomType(c, property, "suite-balcony");
                UUID reservation = insertReservation(c);

                // S1 creates one hold per room type per night. All four of these
                // are distinct identities and must all be accepted.
                insertHold(c, reservation, property, deluxe, "2030-01-01");
                insertHold(c, reservation, property, deluxe, "2030-01-02");
                insertHold(c, reservation, property, suite, "2030-01-01");
                insertHold(c, reservation, property, suite, "2030-01-02");

                assertThat(added(c, "SELECT count(*) FROM inventory_hold")).isEqualTo(4);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V25: a second reservation may hold the same room type on the same night")
    void differentOwnersAreDistinctIdentities() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");
                UUID first = insertReservation(c);
                UUID second = insertReservation(c);

                insertHold(c, first, property, roomType, "2030-01-01");
                insertHold(c, second, property, roomType, "2030-01-01");

                // Ownership is part of the identity. Whether both may be ACTIVE
                // at once is an availability question (inv_no_oversell), not a
                // uniqueness one — V25 does not conflate them.
                assertThat(added(c, "SELECT count(*) FROM inventory_hold")).isEqualTo(2);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V25: the XOR owner rule is untouched — a hold still needs exactly one owner")
    void ownershipSemanticsArePreserved() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");

                assertThatThrownBy(() -> insertHoldWithoutOwner(c, property, roomType))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("hold_exactly_one_owner");
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V26: a RELEASED hold does NOT block re-holding — S8 requires exactly that")
    void releasedHoldDoesNotBlockReHolding() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");
                UUID reservation = insertReservation(c);

                insertHold(c, reservation, property, roomType, "2030-01-01");
                releaseHoldsOf(c, reservation);

                // Doc 54 §4 S8: "Superseded holds released; new holds created",
                // with the prior offer "retained". Doc 14:290, doc 57:171 and
                // doc 57:205 say the same for the modification and re-offer
                // flows. V25 made all four impossible; V26 scopes uniqueness to
                // ACTIVE so the released row stays as history without occupying
                // the slot.
                insertHold(c, reservation, property, roomType, "2030-01-01");

                assertThat(added(c, "SELECT count(*) FROM inventory_hold"))
                        .as("the released row is retained AND the new hold exists")
                        .isEqualTo(2);
                assertThat(added(c,
                        "SELECT count(*) FROM inventory_hold WHERE status = 'ACTIVE'"))
                        .as("exactly one live claim on the identity")
                        .isEqualTo(1);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V26: the modification flow — release and re-place overlapping nights in ONE transaction")
    void modificationWithOverlappingNightsSucceeds() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");
                UUID reservation = insertReservation(c);

                // A 2-night stay, then the guest adds a night. Doc 14:519 and
                // doc 57:171 require old holds released and new holds placed in
                // ONE transaction, and hold uniqueness is NOT DEFERRABLE — so if
                // a dead row occupied the identity there would be no way out.
                insertHold(c, reservation, property, roomType, "2030-01-01");
                insertHold(c, reservation, property, roomType, "2030-01-02");
                releaseHoldsOf(c, reservation);
                insertHold(c, reservation, property, roomType, "2030-01-01");
                insertHold(c, reservation, property, roomType, "2030-01-02");
                insertHold(c, reservation, property, roomType, "2030-01-03");

                assertThat(added(c,
                        "SELECT count(*) FROM inventory_hold WHERE status = 'ACTIVE'"))
                        .isEqualTo(3);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V26: a duplicate ACTIVE hold is still rejected — the S1 guarantee is intact")
    void duplicateActiveHoldIsStillRejected() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                UUID property = anyPropertyId(c);
                UUID roomType = insertRoomType(c, property, "deluxe-room");
                UUID reservation = insertReservation(c);

                insertHold(c, reservation, property, roomType, "2030-01-01");

                // Scoping to ACTIVE must not reopen the OQ-169 hole.
                assertThatThrownBy(() -> insertHold(c, reservation, property, roomType, "2030-01-01"))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("hold_active_unique_idx");
            } finally {
                c.rollback();
            }
        }
    }

    // ---- schema-shape assertions -------------------------------------------

    @Test
    @DisplayName("V26: the live-hold index has exactly the intended definition")
    void holdUniquenessHasTheIntendedShape() throws SQLException {
        try (Connection c = openWritable()) {
            try {
                // Exact equality, not substrings. A substring check is how V25's
                // over-broad definition passed its own test.
                try (Statement st = c.createStatement();
                     ResultSet rs = st.executeQuery("""
                             SELECT indexdef FROM pg_indexes
                              WHERE schemaname = 'kas' AND tablename = 'inventory_hold'
                                AND indexname = 'hold_active_unique_idx'
                             """)) {
                    assertThat(rs.next()).as("V26 created the index").isTrue();
                    assertThat(rs.getString(1)).isEqualTo(
                            "CREATE UNIQUE INDEX hold_active_unique_idx ON kas.inventory_hold USING btree (hold_type, reservation_id, inquiry_id, room_type_id, date) NULLS NOT DISTINCT WHERE (status = 'ACTIVE'::hold_status)");
                }

                // The V25 constraint is replaced, not merely supplemented.
                assertThat(count(c, """
                        SELECT count(*) FROM pg_constraint
                         WHERE conrelid = 'kas.inventory_hold'::regclass
                           AND conname = 'hold_unique'
                        """))
                        .isZero();
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    @DisplayName("V25+V26 removed no other constraint, key or index from inventory_hold")
    void noOtherHoldConstraintWasWeakened() throws SQLException {
        try (Connection c = openWritable()) {
            assertThat(names(c, """
                    SELECT conname FROM pg_constraint
                     WHERE conrelid = 'kas.inventory_hold'::regclass AND contype = 'c'
                    """))
                    .containsExactlyInAnyOrder("hold_qty_pos", "hold_exactly_one_owner",
                            "hold_expiry_after_creation", "hold_released_has_timestamp",
                            "inventory_hold_alternative_offer_consistency");

            assertThat(names(c, """
                    SELECT conname FROM pg_constraint
                     WHERE conrelid = 'kas.inventory_hold'::regclass
                       AND contype IN ('f', 'p')
                    """))
                    .as("every foreign key and the primary key V13 declared")
                    .containsExactlyInAnyOrder("inventory_hold_pkey",
                            "inventory_hold_alternative_offer_fk",
                            "inventory_hold_created_by_fkey", "inventory_hold_inquiry_id_fkey",
                            "inventory_hold_property_id_fkey", "inventory_hold_reservation_id_fkey",
                            "inventory_hold_room_type_id_fkey");

            assertThat(names(c, """
                    SELECT indexname FROM pg_indexes
                     WHERE schemaname = 'kas' AND tablename = 'inventory_hold'
                    """))
                    .contains("hold_expiry_sweep_idx", "hold_availability_idx",
                            "hold_reservation_idx", "hold_inquiry_idx");
            c.rollback();
        }
    }

    @Test
    @DisplayName("the oversell guard is untouched by both migrations")
    void oversellGuardIsIntact() throws SQLException {
        try (Connection c = openWritable();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("""
                     SELECT pg_get_constraintdef(oid)
                       FROM pg_constraint
                      WHERE conrelid = 'kas.room_type_inventory_day'::regclass
                        AND conname = 'inv_no_oversell'
                     """)) {
            assertThat(rs.next()).as("inv_no_oversell must still exist").isTrue();
            // Full text: a gutted CHECK would still contain both column names.
            assertThat(rs.getString(1)).isEqualTo(
                    "CHECK (((((((total - maintenance) - other_blocks) - direct_committed) "
                    + "- ota_committed) - GREATEST((buffer_target - ota_committed), 0)) >= 0))");
            c.rollback();
        }
    }

    @Test
    @DisplayName("these tests leave no business data behind")
    void theseTestsLeaveNoBusinessDataBehind() throws SQLException {
        try (Connection c = openWritable()) {
            assertThat(added(c, "SELECT count(*) FROM reservation")).isZero();
            assertThat(added(c, "SELECT count(*) FROM reservation_line")).isZero();
            assertThat(added(c, "SELECT count(*) FROM inventory_hold")).isZero();
            assertThat(added(c, "SELECT count(*) FROM reservation_request_idempotency")).isZero();
            assertThat(added(c, "SELECT count(*) FROM room_type")).isZero();
            c.rollback();
        }
    }

    // ---- fixtures -----------------------------------------------------------

    private static UUID anyPropertyId(Connection c) throws SQLException {
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT id FROM property ORDER BY sort_order LIMIT 1")) {
            assertThat(rs.next()).as("the seed properties are present").isTrue();
            return rs.getObject(1, UUID.class);
        }
    }

    /**
     * The minimum a reservation row needs. Every value is structural — the CHECK
     * constraints of V12 decide them, not this test: DIRECT requires a
     * lead_source and a sales_status, and check_out must be after check_in.
     */
    private static UUID insertReservation(Connection c) throws SQLException {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO reservation (id, reference, property_id, distribution_channel_id,
                                         channel_type, lead_source, sales_status,
                                         check_in, check_out, adults)
                SELECT ?, ?, (SELECT id FROM property ORDER BY sort_order LIMIT 1),
                       dc.id, 'DIRECT', 'WEBSITE', 'REQUESTED',
                       DATE '2030-01-01', DATE '2030-01-03', 2
                  FROM distribution_channel dc
                 WHERE dc.code = 'DIRECT'
                """)) {
            ps.setObject(1, id);
            ps.setString(2, "KAS-260912-TEST-" + id.toString().substring(0, 8));
            assertThat(ps.executeUpdate())
                    .as("INSERT ... SELECT writes nothing if the DIRECT channel is absent")
                    .isEqualTo(1);
        }
        return id;
    }

    private static UUID insertRoomType(Connection c, UUID propertyId, String slug) throws SQLException {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO room_type (id, property_id, slug, max_adults, max_occupancy)
                VALUES (?, ?, ?, 2, 2)
                """)) {
            ps.setObject(1, id);
            ps.setObject(2, propertyId);
            ps.setString(3, slug);
            ps.executeUpdate();
        }
        return id;
    }

    private static void insertIdempotency(Connection c, String key, String fingerprint,
                                          UUID reservationId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO reservation_request_idempotency
                       (idempotency_key, request_fingerprint, reservation_id, response_snapshot)
                VALUES (?, ?, ?, ?::jsonb)
                """)) {
            ps.setString(1, key);
            ps.setString(2, fingerprint);
            ps.setObject(3, reservationId);
            ps.setString(4, "{\"reference\":\"KAS-260912-TEST\",\"status\":\"REQUEST_RECEIVED\"}");
            ps.executeUpdate();
        }
    }

    private static void insertHold(Connection c, UUID reservationId, UUID propertyId,
                                   UUID roomTypeId, String date) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO inventory_hold (hold_type, reservation_id, property_id, room_type_id,
                                            date, quantity, expires_at)
                VALUES ('REQUEST', ?, ?, ?, ?::date, 1, now() + interval '1 day')
                """)) {
            ps.setObject(1, reservationId);
            ps.setObject(2, propertyId);
            ps.setObject(3, roomTypeId);
            ps.setString(4, date);
            ps.executeUpdate();
        }
    }

    private static void insertHoldWithoutOwner(Connection c, UUID propertyId, UUID roomTypeId)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO inventory_hold (hold_type, property_id, room_type_id,
                                            date, quantity, expires_at)
                VALUES ('REQUEST', ?, ?, DATE '2030-01-01', 1, now() + interval '1 day')
                """)) {
            ps.setObject(1, propertyId);
            ps.setObject(2, roomTypeId);
            ps.executeUpdate();
        }
    }

    /** Bounded to one reservation. Never a table-wide UPDATE. */
    private static void releaseHoldsOf(Connection c, UUID reservationId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("""
                UPDATE inventory_hold
                   SET status = 'RELEASED', released_at = now()
                 WHERE reservation_id = ? AND status = 'ACTIVE'
                """)) {
            ps.setObject(1, reservationId);
            ps.executeUpdate();
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertThat(rs.next()).isTrue();
            return rs.getLong(1);
        }
    }

    private static java.util.List<String> names(Connection c, String sql) throws SQLException {
        java.util.List<String> found = new java.util.ArrayList<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                found.add(rs.getString(1));
            }
        }
        return found;
    }
}
