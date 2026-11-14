package com.kas.platform.reservation;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.api.ReservationDetailView;
import com.kas.platform.reservation.api.ReservationPageView;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guest contact is gated on {@code customer.view}, and logged when disclosed —
 * doc 59:148.
 *
 * <h2>Why this is a unit test and not an integration one</h2>
 *
 * {@code RoleCatalogue} grants {@code ADMIN} both {@code reservation.view} and
 * {@code customer.view}, and permissions come from the role bundle rather than
 * per user, so <strong>no session this application can create holds one without
 * the other</strong>. There is no HTTP request that exercises the withheld
 * branch. Stubbing the repository is the only way to reach it — and the branch
 * still deserves a test, because the day a narrower role is introduced this is
 * the assertion that says whether the gate was ever real.
 *
 * <p>The stub returns real record shapes and asserts on the service's own
 * output; nothing about the scope predicate is mocked away, because nothing here
 * is about the scope predicate. {@code ReservationSearchIT} covers that against
 * a live database.
 */
class ReservationGuestDisclosureTest {

    private static final UUID RESERVATION_ID = UUID.randomUUID();
    private static final String REFERENCE = "KAS-260908-TEST";

    @Test
    @DisplayName("without customer.view the detail withholds the guest block entirely")
    void detailWithholdsGuestWithoutPermission() {
        RecordingAudit audit = new RecordingAudit();
        ReservationSearchService service = new ReservationSearchService(new StubRepository(), audit);

        ReservationDetailView view = service.detail(REFERENCE, actor(false), "en");

        // Absent, not empty: a Guest record full of nulls would suggest the
        // reservation has no contact details rather than that this caller may not
        // read them.
        assertThat(view.guest()).isNull();
        // The name stays, for the same reason the sales queue carries it: a
        // reservation nobody can be identified in cannot be worked.
        assertThat(view.summary().guestName()).isEqualTo("Nguyen Van An");
        assertThat(view.summary().guestPhone()).isNull();
        assertThat(view.summary().guestEmail()).isNull();
        // Nothing was disclosed, so nothing is logged. An audit row for a
        // non-disclosure would make the trail describe reads that never happened.
        assertThat(audit.events).isEmpty();
    }

    @Test
    @DisplayName("with customer.view the detail discloses the guest and logs that it did")
    void detailDisclosesAndAudits() {
        RecordingAudit audit = new RecordingAudit();
        ReservationSearchService service = new ReservationSearchService(new StubRepository(), audit);

        ReservationDetailView view = service.detail(REFERENCE, actor(true), "en");

        assertThat(view.guest()).isNotNull();
        assertThat(view.guest().phone()).isEqualTo("0901234567");
        assertThat(view.guest().email()).isEqualTo("an@example.invalid");
        assertThat(view.summary().guestPhone()).isEqualTo("0901234567");

        assertThat(audit.events).singleElement()
                .satisfies(event -> {
                    assertThat(event.action()).isEqualTo("reservation.guest_contact_viewed");
                    assertThat(event.entityId()).isEqualTo(RESERVATION_ID);
                    assertThat(event.after()).containsEntry("reference", REFERENCE);
                });
    }

    @Test
    @DisplayName("without customer.view the search neither returns nor matches contact fields")
    void searchWithholdsContactWithoutPermission() {
        StubRepository repository = new StubRepository();
        RecordingAudit audit = new RecordingAudit();
        ReservationSearchService service = new ReservationSearchService(repository, audit);

        ReservationPageView page = service.search(criteria("0901234567"), actor(false), "en");

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.guestPhone()).isNull();
            assertThat(item.guestEmail()).isNull();
        });
        // The query itself never touched the contact columns. Without this the
        // search box would answer "does this phone number appear in your
        // portfolio?" for a caller forbidden to read the number — the same
        // disclosure by a slower route.
        assertThat(repository.lastFilter.searchContact()).isFalse();
        assertThat(audit.events).isEmpty();
    }

    @Test
    @DisplayName("a search that discloses contact details logs once, not once per row")
    void searchAuditsOnceForThePage() {
        StubRepository repository = new StubRepository();
        RecordingAudit audit = new RecordingAudit();
        ReservationSearchService service = new ReservationSearchService(repository, audit);

        ReservationPageView page = service.search(criteria("Nguyen"), actor(true), "en");

        assertThat(page.items()).hasSize(1);
        assertThat(repository.lastFilter.searchContact()).isTrue();
        // One row per search rather than one per result: a hundred audit rows for
        // one lookup makes the log unreadable exactly when it matters.
        assertThat(audit.events).singleElement().satisfies(event -> {
            assertThat(event.action()).isEqualTo("reservation.guest_contact_searched");
            assertThat(event.after()).containsEntry("disclosed", 1);
            assertThat(event.after()).containsEntry("searched", true);
        });
    }

    @Test
    @DisplayName("an empty page discloses nothing, so it logs nothing")
    void emptyPageIsNotAudited() {
        StubRepository repository = new StubRepository();
        repository.rows = List.of();
        RecordingAudit audit = new RecordingAudit();
        ReservationSearchService service = new ReservationSearchService(repository, audit);

        assertThat(service.search(criteria(null), actor(true), "en").items()).isEmpty();
        assertThat(audit.events).isEmpty();
    }

    // ---------------------------------------------------------------- helpers

    private static ReservationSearchService.ReservationSearchCriteria criteria(String q) {
        return new ReservationSearchService.ReservationSearchCriteria(
                q, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static ResolvedActor actor(boolean mayViewCustomers) {
        Set<String> permissions = mayViewCustomers
                ? Set.of(Permissions.RESERVATION_VIEW, Permissions.CUSTOMER_VIEW)
                : Set.of(Permissions.RESERVATION_VIEW);

        return new ResolvedActor(UUID.randomUUID(), "agent@test.invalid",
                Set.of(UserRole.ADMIN), permissions,
                AuthorizationScope.partner(UUID.randomUUID(), UUID.randomUUID()));
    }

    /** Collects what was recorded, so the assertions can read it back. */
    private static final class RecordingAudit extends AuditLogger {

        private final List<AuditEvent> events = new ArrayList<>();

        private RecordingAudit() {
            super(null, null);
        }

        @Override
        public UUID record(AuditEvent event) {
            events.add(event);
            return UUID.randomUUID();
        }
    }

    /**
     * Returns one fixed reservation and remembers the filter it was asked for.
     *
     * <p>Hand-written rather than mocked: this repository has no test double
     * framework behind it anywhere in the project, and a stub that returns real
     * record types keeps the compiler checking the shapes.
     */
    private static final class StubRepository extends ReservationSearchRepository {

        private List<ReservationRow> rows = List.of(row());
        private ReservationSearchFilter lastFilter;

        private StubRepository() {
            super(null);
        }

        @Override
        public List<ReservationRow> search(AuthorizationScope scope, String locale,
                                           ReservationSearchFilter criteria, int limit, int offset) {
            lastFilter = criteria;
            return rows;
        }

        @Override
        public long count(AuthorizationScope scope, ReservationSearchFilter criteria) {
            return rows.size();
        }

        @Override
        public Optional<ReservationRow> byReference(String reference, AuthorizationScope scope,
                                                    String locale) {
            return Optional.of(row());
        }

        @Override
        public List<ReservationLineRow> lines(UUID reservationId, AuthorizationScope scope) {
            return List.of(new ReservationLineRow("Deluxe", 1, 1_250_000L, 2_500_000L));
        }

        @Override
        public Optional<ReservationAmountRow> amounts(UUID reservationId, AuthorizationScope scope) {
            return Optional.of(new ReservationAmountRow(
                    "VND", 2_500_000L, null, null, 0L, 2_500_000L));
        }

        @Override
        public Optional<GuestContactRow> guestContact(String reference, AuthorizationScope scope) {
            return Optional.of(new GuestContactRow(
                    "an@example.invalid", "0901234567", "VN", "PHONE", null, null, null, null));
        }

        @Override
        public List<StatusEventRow> history(UUID reservationId, AuthorizationScope scope) {
            return List.of(new StatusEventRow("SALES", null, "REQUESTED", "CUSTOMER", null, null,
                    OffsetDateTime.now()));
        }

        private static ReservationRow row() {
            return new ReservationRow(
                    RESERVATION_ID, REFERENCE, "DIRECT", null, null,
                    LocalDate.now().plusDays(10), LocalDate.now().plusDays(12), 2, 0,
                    "Nguyen Van An", "0901234567", "an@example.invalid",
                    "VND", 2_500_000L, OffsetDateTime.now(),
                    "kas-elegance-hotel", "KAS Elegance", 1);
        }
    }
}
