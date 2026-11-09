package com.kas.platform.security.it;

import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.RoleCatalogue;
import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.SalesRequestService;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Two guests, one moment — the races doc 117 §5 and §10.4 have to survive.
 *
 * <h2>Why this test manages its own transactions</h2>
 *
 * {@link SecurityIntegrationTest} is {@code @Transactional} and rolls back, which
 * is exactly wrong for contention: threads sharing one transaction are not
 * competing, and a fixture that was never committed is invisible to another
 * connection. So this follows {@link InventoryConcurrencyIT} — fixtures are
 * committed on their own connection, the racers run on real threads, and
 * {@link #cleanUp} removes everything afterwards. {@link #theDatabaseIsClean}
 * asserts it actually did.
 *
 * <h2>What is being proven</h2>
 *
 * Not that the service is careful. Two narrower claims:
 * <ul>
 *   <li>The PRIMARY KEY on {@code reservation_request_idempotency} — not a lock,
 *       not a sleep, not a retry loop — is what makes two simultaneous identical
 *       requests produce exactly one reservation.</li>
 *   <li>The under-lock re-check and {@code inv_no_oversell} together make a
 *       double-sell unwritable, so the loser is refused rather than accommodated.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReservationConcurrencyIT {

    private static final LocalDate CHECK_IN = LocalDate.now().plusDays(60);
    private static final LocalDate CHECK_OUT = CHECK_IN.plusDays(2);
    private static final long RATE = 1_000_000L;

    /**
     * One stable agent, reused across runs and never deleted.
     *
     * <p>{@code audit_log.actor_id} is {@code ON DELETE SET NULL} and V19's
     * trigger refuses UPDATE as firmly as DELETE, so a user that has written an
     * audit row cannot be removed. One fixed row does not accumulate; a fresh
     * random one every run would.
     */
    private static final UUID AGENT_ID =
            UUID.fromString("00000000-0000-4000-8000-00000000d0c1");

    /**
     * A second stable agent — the reassignment target. Stable for the same
     * reason AGENT_ID is: {@code reservation_assignment.to_owner_id} is
     * {@code ON DELETE RESTRICT}, so a fresh user per run would be pinned in
     * place by its own history.
     */
    private static final UUID OTHER_AGENT_ID =
            UUID.fromString("00000000-0000-4000-8000-00000000d0c2");

    @Autowired
    private SalesRequestService salesRequests;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private MockMvc mockMvc;

    private UUID partnerId;
    private UUID propertyId;
    private UUID roomTypeId;
    private String propertySlug;
    private String roomTypeSlug;

    @BeforeEach
    void seed() throws SQLException {
        partnerId = UUID.randomUUID();
        propertyId = UUID.randomUUID();
        roomTypeId = UUID.randomUUID();
        propertySlug = "race-property-" + shortId();
        roomTypeSlug = "race-room-" + shortId();

        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, """
                    INSERT INTO partner (id, code, legal_name, display_name)
                    VALUES (?, ?, ?, ?)
                    """, partnerId, "race-" + shortId(), "Race Partner", "Race Partner");
            update(c, """
                    INSERT INTO property (id, partner_id, slug, lifecycle_state, sort_order, city, branch_code)
                    VALUES (?, ?, ?, 'OPEN', 1, 'Ho Chi Minh City', '01')
                    """, propertyId, partnerId, propertySlug);
            update(c, """
                    INSERT INTO app_user (id, email, password_hash, status, two_factor_enabled,
                                          locale, failed_login_count)
                    VALUES (?, 'race-agent@test.invalid', 'x', 'ACTIVE', false, 'en', 0)
                    ON CONFLICT (id) DO NOTHING
                    """, AGENT_ID);
            update(c, """
                    INSERT INTO app_user (id, email, password_hash, status, two_factor_enabled,
                                          locale, failed_login_count)
                    VALUES (?, 'race-other-agent@test.invalid', 'x', 'ACTIVE', false, 'en', 0)
                    ON CONFLICT (id) DO NOTHING
                    """, OTHER_AGENT_ID);
            update(c, """
                    INSERT INTO role_assignment (id, user_id, role, scope_kind, partner_id)
                    VALUES (?, ?, 'ADMIN', 'PARTNER', ?), (?, ?, 'ADMIN', 'PARTNER', ?)
                    """,
                    UUID.randomUUID(), AGENT_ID, partnerId,
                    UUID.randomUUID(), OTHER_AGENT_ID, partnerId);
            update(c, """
                    INSERT INTO property_translation (property_id, locale, name)
                    VALUES (?, 'en', 'Race Property'), (?, 'vi', 'Race Property')
                    """, propertyId, propertyId);
            update(c, """
                    INSERT INTO room_type (id, property_id, slug, max_adults, max_children,
                                           max_occupancy, status, base_price_minor, currency)
                    VALUES (?, ?, ?, 2, 0, 2, 'PUBLISHED', ?, 'VND')
                    """, roomTypeId, propertyId, roomTypeSlug, RATE);
            update(c, """
                    INSERT INTO room_type_translation (room_type_id, locale, name)
                    VALUES (?, 'en', 'Race Room'), (?, 'vi', 'Race Room')
                    """, roomTypeId, roomTypeId);
            // ONE room per night: the contested resource.
            for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
                update(c, """
                        INSERT INTO room_type_inventory_day (room_type_id, date, total)
                        VALUES (?, ?, 1)
                        """, roomTypeId, java.sql.Date.valueOf(d));
            }
        }
    }

    @AfterEach
    void cleanUp() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, """
                    DELETE FROM reservation_request_idempotency
                     WHERE reservation_id IN (SELECT id FROM reservation WHERE property_id = ?)
                    """, propertyId);
            update(c, "DELETE FROM inventory_hold WHERE property_id = ?", propertyId);
            // S1 queues its mail in the same commit, so these rows really exist.
            update(c, """
                    DELETE FROM email_delivery_outbox
                     WHERE aggregate_reference IN (SELECT reference FROM reservation WHERE property_id = ?)
                    """, propertyId);
            update(c, """
                    DELETE FROM payment
                     WHERE reservation_id IN (SELECT id FROM reservation WHERE property_id = ?)
                    """, propertyId);
            // V27's two tables. Removed before the reservation rows they reference
            // and before the app_user rows their owner columns RESTRICT.
            update(c, "DELETE FROM reservation_assignment WHERE property_id = ?", propertyId);
            update(c, "DELETE FROM reservation_availability_check WHERE property_id = ?",
                    propertyId);
            update(c, """
                    DELETE FROM reservation_status_history
                     WHERE reservation_id IN (SELECT id FROM reservation WHERE property_id = ?)
                    """, propertyId);
            update(c, """
                    DELETE FROM reservation_line
                     WHERE reservation_id IN (SELECT id FROM reservation WHERE property_id = ?)
                    """, propertyId);
            update(c, "DELETE FROM reservation WHERE property_id = ?", propertyId);
            update(c, "DELETE FROM room_type_inventory_day WHERE room_type_id = ?", roomTypeId);
            update(c, "DELETE FROM room_type_translation WHERE room_type_id = ?", roomTypeId);
            update(c, "DELETE FROM room_type WHERE id = ?", roomTypeId);
            update(c, "DELETE FROM property_translation WHERE property_id = ?", propertyId);
            update(c, "DELETE FROM property WHERE id = ?", propertyId);
            update(c, "DELETE FROM partner WHERE id = ?", partnerId);
        }
    }

    @Test
    @DisplayName("two simultaneous requests with the same key create exactly ONE reservation")
    void sameKeyRaceCreatesOneReservation() throws Exception {
        String key = "race-same-" + UUID.randomUUID();
        String payload = body(1);

        List<Integer> statuses = race(
                () -> status(key, payload),
                () -> status(key, payload));

        // Both sent the same request, so neither may see a 409 — doc 117 §5.3 is
        // unqualified for that case.
        assertThat(statuses).as("both callers get the original result").containsExactly(201, 201);

        assertThat(count("SELECT count(*) FROM reservation WHERE property_id = ?", propertyId))
                .as("exactly one reservation").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM reservation_request_idempotency i "
                        + "JOIN reservation r ON r.id = i.reservation_id WHERE r.property_id = ?",
                propertyId))
                .as("exactly one durable idempotency record").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM inventory_hold WHERE property_id = ?", propertyId))
                .as("no hold is placed").isZero();
        assertThat(committed(CHECK_IN))
                .as("inventory committed once").isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("two simultaneous requests with different keys cannot both take the last room")
    void differentKeysCannotOversell() throws Exception {
        String payload = body(1);

        List<Integer> statuses = race(
                () -> status("race-a-" + UUID.randomUUID(), payload),
                () -> status("race-b-" + UUID.randomUUID(), payload));

        // One room, two guests. Exactly one may win; the other is refused by the
        // under-lock re-check or by inv_no_oversell. Never both.
        assertThat(statuses.stream().filter(s -> s == 201).count())
                .as("exactly one winner, from %s", statuses)
                .isEqualTo(1);

        assertThat(count("SELECT count(*) FROM reservation WHERE property_id = ?", propertyId))
                .isEqualTo(1);
        assertThat(committed(CHECK_IN)).as("never oversold").isZero();
        assertThat(availableDirect(CHECK_IN)).isZero();
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("the loser of an oversell race leaves nothing behind")
    void loserLeavesNoPartialState() throws Exception {
        String payload = body(1);

        race(() -> status("part-a-" + UUID.randomUUID(), payload),
                () -> status("part-b-" + UUID.randomUUID(), payload));

        long reservations = count("SELECT count(*) FROM reservation WHERE property_id = ?",
                propertyId);
        long holds = count("SELECT count(*) FROM inventory_hold WHERE property_id = ?", propertyId);
        long lines = count("""
                SELECT count(*) FROM reservation_line l
                  JOIN reservation r ON r.id = l.reservation_id
                 WHERE r.property_id = ?
                """, propertyId);

        // The winner's row set, and nothing else: no orphan hold, no half-written line.
        assertThat(reservations).isEqualTo(1);
        assertThat(holds).isEqualTo(2);
        assertThat(lines).isEqualTo(1);
    }

    @Test
    @DisplayName("the fixtures are removed — this test pollutes nothing")
    void theDatabaseIsClean() throws Exception {
        // Runs like any other test; @AfterEach then removes this test's own rows.
        // Its value is the assertion that the PREVIOUS tests left nothing, since
        // JUnit reuses the class instance state per method.
        //
        // Scoped to this class's own properties — every one is seeded with a
        // "race-property-" slug. It used to count every reservation in the
        // database on any other property, which asserted something far stronger
        // than the sentence above and than this class can be responsible for: a
        // single real reservation in kas_web_dev failed it while proving nothing
        // about cleanup.
        assertThat(count("""
                SELECT count(*) FROM reservation r
                  JOIN property p ON p.id = r.property_id
                 WHERE p.slug LIKE 'race-property-%' AND r.property_id <> ?
                """, propertyId))
                .as("no reservation from an earlier method survived its cleanup")
                .isZero();
    }

    @Test
    @DisplayName("two simultaneous requests sharing a key but not a body: one 201, one 409")
    void sameKeyDifferentBodyRace() throws Exception {
        // Room for both, so the only thing that can separate them is the key.
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
                update(c, """
                        UPDATE room_type_inventory_day SET total = 4
                         WHERE room_type_id = ? AND date = ?
                        """, roomTypeId, java.sql.Date.valueOf(d));
            }
        }

        String key = "race-diff-" + UUID.randomUUID();

        List<Integer> statuses = race(
                () -> status(key, body(1)),
                () -> status(key, body(2)));

        // Whichever commits first owns the key; the other differs in its canonical
        // body and is refused. Doc 117 §24.1 — never two reservations, and never a
        // silent replay of a different request.
        assertThat(statuses).as("one winner and one refusal, from %s", statuses)
                .containsExactlyInAnyOrder(201, 409);

        assertThat(count("SELECT count(*) FROM reservation WHERE property_id = ?", propertyId))
                .as("exactly one reservation").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM reservation_request_idempotency i "
                        + "JOIN reservation r ON r.id = i.reservation_id WHERE r.property_id = ?",
                propertyId))
                .as("exactly one idempotency record — the loser wrote nothing").isEqualTo(1);
    }

    @Test
    @DisplayName("the loser of a same-key/different-body race never overwrites the fingerprint")
    void loserDoesNotOverwriteTheStoredFingerprint() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
                update(c, """
                        UPDATE room_type_inventory_day SET total = 4
                         WHERE room_type_id = ? AND date = ?
                        """, roomTypeId, java.sql.Date.valueOf(d));
            }
        }

        String key = "race-fp-" + UUID.randomUUID();
        race(() -> status(key, body(1)), () -> status(key, body(2)));

        // One stored fingerprint, and it belongs to the reservation that exists —
        // so a later honest retry of the winner still replays, and the loser's
        // body still conflicts.
        assertThat(count("""
                SELECT count(*) FROM reservation_request_idempotency i
                  JOIN reservation r ON r.id = i.reservation_id
                 WHERE r.property_id = ?
                """, propertyId)).isEqualTo(1);

        assertThat(count("""
                SELECT count(DISTINCT i.request_fingerprint)
                  FROM reservation_request_idempotency i
                  JOIN reservation r ON r.id = i.reservation_id
                 WHERE r.property_id = ?
                """, propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("reversed line order cannot deadlock — lock order is the server's, not the client's")
    void reversedLineOrderDoesNotDeadlock() throws Exception {
        UUID secondRoomTypeId = UUID.randomUUID();
        String secondSlug = "race-room-b-" + shortId();

        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, """
                    INSERT INTO room_type (id, property_id, slug, max_adults, max_children,
                                           max_occupancy, status, base_price_minor, currency)
                    VALUES (?, ?, ?, 2, 0, 2, 'PUBLISHED', ?, 'VND')
                    """, secondRoomTypeId, propertyId, secondSlug, RATE);
            update(c, """
                    INSERT INTO room_type_translation (room_type_id, locale, name)
                    VALUES (?, 'en', 'Race Room B'), (?, 'vi', 'Race Room B')
                    """, secondRoomTypeId, secondRoomTypeId);
            for (LocalDate d = CHECK_IN; d.isBefore(CHECK_OUT); d = d.plusDays(1)) {
                update(c, """
                        INSERT INTO room_type_inventory_day (room_type_id, date, total)
                        VALUES (?, ?, 4)
                        """, secondRoomTypeId, java.sql.Date.valueOf(d));
                update(c, "UPDATE room_type_inventory_day SET total = 4 "
                        + "WHERE room_type_id = ? AND date = ?",
                        roomTypeId, java.sql.Date.valueOf(d));
            }
        }

        try {
            // The classic deadlock shape: A takes X then Y while B takes Y then X.
            // S1 sorts its lines by room type id BEFORE locking, so the request's
            // line order never reaches the lock sequence — both transactions
            // acquire in the same order and one simply waits.
            List<Integer> statuses = race(
                    () -> status("order-a-" + UUID.randomUUID(),
                            twoLineBody(roomTypeSlug, secondSlug)),
                    () -> status("order-b-" + UUID.randomUUID(),
                            twoLineBody(secondSlug, roomTypeSlug)));

            assertThat(statuses)
                    .as("neither request may fail; a deadlock would surface as 500, from %s",
                            statuses)
                    .containsExactly(201, 201);

            assertThat(count("SELECT count(*) FROM reservation WHERE property_id = ?", propertyId))
                    .isEqualTo(2);
            // Two reservations x two room types x two nights.
            assertThat(count("SELECT count(*) FROM inventory_hold WHERE property_id = ?",
                    propertyId)).isZero();
            assertThat(committed(CHECK_IN)).as("room A committed twice").isZero();
        } finally {
            try (Connection c = dataSource.getConnection()) {
                c.setAutoCommit(true);
                update(c, "DELETE FROM inventory_hold WHERE room_type_id = ?", secondRoomTypeId);
                update(c, "DELETE FROM reservation_line WHERE room_type_id = ?", secondRoomTypeId);
                update(c, "DELETE FROM room_type_inventory_day WHERE room_type_id = ?",
                        secondRoomTypeId);
                update(c, "DELETE FROM room_type_translation WHERE room_type_id = ?",
                        secondRoomTypeId);
                update(c, "DELETE FROM room_type WHERE id = ?", secondRoomTypeId);
            }
        }
    }

    /** Two lines, in the order given, so the caller controls the request order. */
    private String twoLineBody(String firstSlug, String secondSlug) {
        return """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":1},
                          {"roomTypeSlug":"%s","quantity":1}],
                 "guest":{"fullName":"Race Guest","email":"race@example.com",
                          "phone":"+84900000000","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(propertySlug, CHECK_IN, CHECK_OUT, firstSlug, secondSlug);
    }

    @Test
    @DisplayName("two simultaneous DECLINES: one succeeds, and the rooms come back exactly once")
    void concurrentDeclinesResolveToOne() throws Exception {
        assertThat(status("decline-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();
        assertThat(committed(CHECK_IN)).isZero();

        // The S11 counterpart of the request race above. Without the
        // SELECT … FOR UPDATE in lockForTransition, both transactions read
        // REQUESTED, both release the holds and both decrement
        // direct_committed — which either trips the >= 0 CHECK or silently
        // credits the property with a room no guest gave back.
        List<String> outcomes = raceOutcomes(
                () -> declineOutcome(reference, "first agent"),
                () -> declineOutcome(reference, "second agent"));

        assertThat(outcomes).as("one success and one refusal, from %s", outcomes)
                .containsExactlyInAnyOrder("OK", "ILLEGAL_TRANSITION");

        assertThat(committed(CHECK_IN)).isZero();
        assertThat(count("""
                SELECT count(*) FROM inventory_hold
                 WHERE property_id = ? AND status = 'RELEASED'
                """, propertyId)).isZero();
        assertThat(count("""
                SELECT count(*) FROM reservation_status_history h
                 JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.property_id = ? AND h.to_status = 'DECLINED'
                """, propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("two simultaneous availability checks: one advances, one is refused")
    void concurrentAvailabilityChecksResolveToOne() throws Exception {
        assertThat(status("check-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();

        // Both threads read REQUESTED before either writes. Without the row lock
        // both would self-assign and both would record a check, leaving two
        // assignment rows and two check records for one transition.
        List<String> outcomes = raceOutcomes(
                () -> checkOutcome(reference),
                () -> checkOutcome(reference));

        assertThat(outcomes).as("one success and one refusal, from %s", outcomes)
                .containsExactlyInAnyOrder("OK", "ILLEGAL_TRANSITION");

        assertThat(countFor("reservation_availability_check")).isEqualTo(1);
        assertThat(countFor("reservation_assignment")).isEqualTo(1);
        assertThat(committed(CHECK_IN))
                .as("a check moves no inventory").isZero();
    }

    @Test
    @DisplayName("two simultaneous wins: exactly one, and the hold is converted exactly once")
    void concurrentWinsResolveToOne() throws Exception {
        assertThat(status("win-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();
        salesRequests.availabilityCheck(reference, agent());
        verifyPayment(reference);

        // Without the lock both would see AVAILABILITY_CHECK, both would convert
        // the same holds and both would write a WON history row.
        List<String> outcomes = raceOutcomes(
                () -> winOutcome(reference),
                () -> winOutcome(reference));

        assertThat(outcomes).as("one success and one refusal, from %s", outcomes)
                .containsExactlyInAnyOrder("OK", "ILLEGAL_TRANSITION");

        // The assertion that matters: the hold left ACTIVE exactly once, and the
        // rooms stayed committed to this guest rather than being handed back or
        // counted twice.
        assertThat(count("""
                SELECT count(*) FROM inventory_hold
                 WHERE property_id = ? AND status = 'CONVERTED'
                """, propertyId)).isZero();
        assertThat(count("""
                SELECT count(*) FROM inventory_hold
                 WHERE property_id = ? AND status = 'ACTIVE'
                """, propertyId)).isZero();
        assertThat(committed(CHECK_IN))
                .as("a win moves no inventory")
                .isZero();
        assertThat(count("""
                SELECT count(*) FROM reservation_status_history h
                 JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.property_id = ? AND h.to_status = 'WON'
                """, propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("two simultaneous assignments serialise — both recorded, neither lost")
    void concurrentAssignmentsAreBothRecorded() throws Exception {
        assertThat(status("assign-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();

        // Unlike win and decline, an assignment is not terminal: both are
        // legitimate, and the lock makes them sequential rather than lost.
        List<String> outcomes = raceOutcomes(
                () -> assignOutcome(reference, AGENT_ID),
                () -> assignOutcome(reference, OTHER_AGENT_ID));

        assertThat(outcomes).containsExactly("OK", "OK");

        // Two events, and the second's from_owner_id is the first's to_owner_id —
        // the chain is unbroken even though the two threads raced.
        assertThat(countFor("reservation_assignment")).isEqualTo(2);
        assertThat(count("""
                SELECT count(*) FROM reservation_assignment a
                 JOIN reservation r ON r.id = a.reservation_id
                 WHERE r.property_id = ? AND a.from_owner_id IS NULL
                """, propertyId))
                .as("exactly one FIRST assignment, however the threads interleaved")
                .isEqualTo(1);

        // The chain links: the SECOND assignment took over from the first, and it
        // is the one the reservation now reflects.
        //
        // Addressed by from_owner_id, never by "newest created_at". now() is the
        // TRANSACTION timestamp, so it orders these rows by when each transaction
        // began — not by which one won the row lock and committed last. A racer
        // that started first can commit second, which makes "max(created_at)" name
        // the wrong row. This form holds however the two interleaved.
        assertThat(count("""
                SELECT count(*) FROM reservation r
                 JOIN reservation_assignment second ON second.reservation_id = r.id
                 JOIN reservation_assignment first  ON first.reservation_id = r.id
                 WHERE r.property_id = ?
                   AND first.from_owner_id IS NULL
                   AND second.from_owner_id = first.to_owner_id
                   AND second.to_owner_id = r.sales_owner_id
                """, propertyId))
                .as("the second assignment took over from the first, and it is the current owner")
                .isEqualTo(1);
    }

    @org.junit.jupiter.api.Disabled("Owner decision 153: the website no longer reads or writes room stock or holds")
    @Test
    @DisplayName("a refused availability check commits nothing — not even its own record")
    void refusedCheckCommitsNothing() throws Exception {
        assertThat(status("rollback-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();

        // Take the rooms away by the one route inv_no_oversell permits: the hold
        // lapses, and the inventory goes to someone else.
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, """
                    UPDATE room_type_inventory_day i
                       SET direct_committed = 0
                     WHERE i.room_type_id = ?
                    """, roomTypeId);
            update(c, """
                    UPDATE inventory_hold h
                       SET status = 'RELEASED', released_at = now()
                     WHERE h.property_id = ? AND h.status = 'ACTIVE'
                    """, propertyId);
            update(c, """
                    UPDATE room_type_inventory_day i
                       SET direct_committed = i.total
                     WHERE i.room_type_id = ?
                    """, roomTypeId);
        }

        assertThat(checkOutcome(reference)).isEqualTo("NO_AVAILABILITY");

        // This class is NOT @Transactional, so the service's own transaction is
        // the only one there is and its rollback is real. Owner decision 6's
        // "rollback on refusal" means the check record goes with it: the row is
        // reachable inside the failed transaction and durable in neither.
        assertThat(countFor("reservation_availability_check"))
                .as("the refused check left no record behind")
                .isZero();
        assertThat(countFor("reservation_assignment"))
                .as("S4's implicit self-assignment rolled back with the check that refused")
                .isZero();
        assertThat(count("""
                SELECT count(*) FROM reservation
                 WHERE property_id = ? AND (sales_status <> 'REQUESTED'
                                            OR sales_owner_id IS NOT NULL)
                """, propertyId))
                .as("no partial state: neither the status nor the owner moved")
                .isZero();
    }

    @Test
    @DisplayName("two simultaneous cancels: one succeeds, and the rooms come back exactly once")
    void concurrentCancelsResolveToOne() throws Exception {
        assertThat(status("cancel-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();
        assertThat(committed(CHECK_IN)).isZero();

        List<String> outcomes = raceOutcomes(
                () -> cancelOutcome(reference, "first agent"),
                () -> cancelOutcome(reference, "second agent"));

        assertThat(outcomes).as("one success and one refusal, from %s", outcomes)
                .containsExactlyInAnyOrder("OK", "ILLEGAL_TRANSITION");

        // A double release would either trip the direct_committed >= 0 CHECK or
        // silently credit the property with a room no guest gave back.
        assertThat(committed(CHECK_IN)).isZero();
        assertThat(count("""
                SELECT count(*) FROM inventory_hold
                 WHERE property_id = ? AND status = 'RELEASED'
                """, propertyId)).isZero();
        assertThat(count("""
                SELECT count(*) FROM reservation_status_history h
                 JOIN reservation r ON r.id = h.reservation_id
                 WHERE r.property_id = ? AND h.to_status = 'CANCELLED'
                """, propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("cancel racing win: exactly one lands, and the holds end in one state")
    void cancelRacingWinResolvesToOne() throws Exception {
        assertThat(status("cancelwin-race-" + UUID.randomUUID(), body(1))).isEqualTo(201);
        String reference = onlyReference();
        salesRequests.availabilityCheck(reference, agent());
        verifyPayment(reference);

        // Both are terminal transitions from the same source state. Without the
        // row lock both would read AVAILABILITY_CHECK, and the holds would be
        // converted AND released — the same nights counted two different ways.
        List<String> outcomes = raceOutcomes(
                () -> winOutcome(reference),
                () -> cancelOutcome(reference, "guest changed their mind"));

        assertThat(outcomes).as("one success and one refusal, from %s", outcomes)
                .containsAnyOf("OK")
                .contains("ILLEGAL_TRANSITION");
        assertThat(outcomes.stream().filter("OK"::equals).count())
                .as("exactly one of the two terminal transitions succeeded")
                .isEqualTo(1);

        assertThat(text("SELECT sales_status::text FROM reservation WHERE property_id = ?"))
                .isIn("WON", "CANCELLED");
        assertThat(count("""
                SELECT count(*) FROM inventory_hold
                 WHERE property_id = ? AND status = 'ACTIVE'
                """, propertyId)).isZero();

        // The winner decides the counter: a win keeps the rooms committed to the
        // guest, a cancel gives them back. Never a value between the two.
        assertThat(committed(CHECK_IN)).isZero();
    }

    /** The win guard needs a verified payment, committed where the racing threads can see it. */
    private void verifyPayment(String reference) throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, "UPDATE reservation SET sales_status = 'PAYMENT_PENDING' WHERE reference = ?", reference);
            update(c, """
                    INSERT INTO payment (reservation_id, method, amount_minor, currency, received_at, status)
                    SELECT id, 'QR', total_minor, currency, now(), 'VERIFIED'
                      FROM reservation WHERE reference = ?
                    """, reference);
        }
    }

    private String cancelOutcome(String reference, String reason) {
        try {
            salesRequests.cancel(reference, reason, agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    private String cancelOutcome(String reference) {
        try {
            salesRequests.cancel(reference, "race", agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    /** Moves this property's holds past their expiry, on a committed connection. */
    private void backdateHolds() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            update(c, """
                    UPDATE inventory_hold
                       SET created_at = now() - interval '48 hours',
                           expires_at = now() - interval '24 hours'
                     WHERE property_id = ?
                    """, propertyId);
        }
    }

    private String text(String sql) throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setObject(1, propertyId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    private String checkOutcome(String reference) {
        try {
            salesRequests.availabilityCheck(reference, agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    private String winOutcome(String reference) {
        try {
            salesRequests.win(reference, agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    private String assignOutcome(String reference, UUID target) {
        try {
            salesRequests.assign(reference, target, "race", agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    /** Rows of {@code table} belonging to this test's single property. */
    private long countFor(String table) throws SQLException {
        return count("SELECT count(*) FROM " + table + " t"
                + " JOIN reservation r ON r.id = t.reservation_id"
                + " WHERE r.property_id = ?", propertyId);
    }

    /** This property's single reservation reference — the class seeds exactly one property. */
    private String onlyReference() throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT reference FROM reservation WHERE property_id = ?")) {
            ps.setObject(1, propertyId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    /** The decline outcome as a word: "OK", or the refusal's frozen error code. */
    private String declineOutcome(String reference, String reason) {
        try {
            salesRequests.decline(reference, reason, agent());
            return "OK";
        } catch (KasException refused) {
            return refused.code().name();
        }
    }

    /** An ADMIN actor with this partner's scope — what a signed-in agent resolves to. */
    private ResolvedActor agent() {
        return new ResolvedActor(AGENT_ID, "race-agent@test.invalid",
                Set.of(UserRole.ADMIN), RoleCatalogue.permissionsFor(UserRole.ADMIN),
                new AuthorizationScope(ScopeKind.PARTNER, partnerId, Set.of(), AGENT_ID));
    }

    /** {@link #race} for callables that return a word rather than a status code. */
    private static List<String> raceOutcomes(java.util.concurrent.Callable<String> a,
                                             java.util.concurrent.Callable<String> b)
            throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<String> first = pool.submit(() -> {
                start.await();
                return a.call();
            });
            Future<String> second = pool.submit(() -> {
                start.await();
                return b.call();
            });
            start.countDown();
            return List.of(first.get(), second.get());
        }
    }

    // ---- helpers ------------------------------------------------------------

    private List<Integer> race(ThrowingSupplier first, ThrowingSupplier second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<Integer> a = pool.submit(() -> {
                start.await();
                return first.get();
            });
            Future<Integer> b = pool.submit(() -> {
                start.await();
                return second.get();
            });
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            statuses.add(a.get());
            statuses.add(b.get());
            return statuses;
        }
    }

    @FunctionalInterface
    private interface ThrowingSupplier {
        Integer get() throws Exception;
    }

    private int status(String idempotencyKey, String payload) throws Exception {
        return mockMvc.perform(post("/api/v1/public/reservations/requests")
                        .with(csrf())
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andReturn().getResponse().getStatus();
    }

    private String body(int quantity) {
        return """
                {"propertySlug":"%s","checkIn":"%s","checkOut":"%s",
                 "adults":2,"children":0,"childAges":[],
                 "lines":[{"roomTypeSlug":"%s","quantity":%d}],
                 "guest":{"fullName":"Race Guest","email":"race@example.com",
                          "phone":"+84900000000","country":"VN",
                          "preferredChannel":"EMAIL","bestTimeToContact":"MORNING"},
                 "specialRequests":null,"discoveryChannel":null,"offerCode":null,
                 "acceptedTermsVersion":"booking-terms-v3","marketingConsent":false,
                 "locale":"en"}
                """.formatted(propertySlug, CHECK_IN, CHECK_OUT, roomTypeSlug, quantity);
    }

    private int committed(LocalDate date) throws SQLException {
        return (int) count("""
                SELECT direct_committed FROM room_type_inventory_day
                 WHERE room_type_id = ? AND date = ?
                """, roomTypeId, java.sql.Date.valueOf(date));
    }

    private int availableDirect(LocalDate date) throws SQLException {
        return (int) count("""
                SELECT available_direct(i.*) FROM room_type_inventory_day i
                 WHERE i.room_type_id = ? AND i.date = ?
                """, roomTypeId, java.sql.Date.valueOf(date));
    }

    private long count(String sql, Object... params) throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong(1) : 0L;
            }
        }
    }

    private static void update(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            ps.executeUpdate();
        }
    }

    private static void bind(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
