package com.kas.platform.reservation;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.api.ReservationDetailView;
import com.kas.platform.reservation.api.ReservationPageView;
import com.kas.platform.reservation.api.ReservationSummaryView;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The reservation workspace — doc 58 §6, {@code /admin/ops/reservations}.
 *
 * <h2>What this is, next to the sales queue</h2>
 *
 * {@link SalesRequestService} works the DIRECT sales lifecycle: a queue ordered
 * oldest-first because a request model fails by neglect, with the transitions
 * doc 54 defines. This service answers a different question — <em>find me this
 * booking</em> — across every channel, newest first, and performs no transition
 * at all. The two are separate because {@code sales_status} is DIRECT-only and
 * {@code stay_status} is not; merging them would need a status vocabulary that
 * doc 53 deliberately refuses to create.
 *
 * <h2>Filter values are checked before they reach SQL</h2>
 *
 * Each enum parameter is validated against the frozen database enum it names, so
 * an unknown value is a <strong>400 naming the parameter</strong> rather than a
 * 500 from a failed cast — and never a filter silently dropped, which would show
 * the operator a list they did not ask for.
 *
 * <h2>Guest contact, and the audit that goes with it</h2>
 *
 * Doc 59:148 gates guest data behind {@code customer.view} and requires that
 * <em>"staff access to guest data is logged"</em>. Both surfaces here honour it:
 * the detail logs the reservation it disclosed, and a search that returns
 * contact details logs one row for the search — not one per result, which would
 * turn an ordinary lookup into a hundred audit rows and make the log unreadable
 * exactly when it matters.
 *
 * <p>A caller without the permission is not refused. They get the same list and
 * the same document with the contact fields absent, and their search term is
 * matched only against the reference and the guest's name — so search cannot be
 * used to confirm a phone number they are not allowed to read.
 */
@Service
public class ReservationSearchService {

    /** Doc 59:148 — the audit action for a disclosure of guest contact data. */
    private static final String GUEST_ACCESS = "reservation.guest_contact_viewed";

    /** The same obligation, discharged once for a list rather than once per row. */
    private static final String GUEST_SEARCH = "reservation.guest_contact_searched";

    private static final String ENTITY = "reservation";

    /** {@code stay_status}, V1:54. The operational lifecycle, on every channel. */
    private static final Set<String> STAY_STATUSES = Set.of(
            "CONFIRMED", "CHECK_IN_READY", "CHECKED_IN", "CHECKED_OUT",
            "COMPLETED", "CANCELLED", "NO_SHOW");

    /** {@code channel_type}, V1:37. */
    private static final Set<String> CHANNEL_TYPES = Set.of("DIRECT", "OTA");

    /** Twenty rows fill a screen without a scroll on the smallest supported width. */
    static final int DEFAULT_SIZE = 20;

    /**
     * The largest page the server will serve.
     *
     * <p>An unbounded {@code size} would make the pagination decorative: a caller
     * could ask for every reservation in one request and the screen would be back
     * to loading a year of history. A request for more is clamped rather than
     * refused, because asking for a big page is not an error.
     */
    static final int MAX_SIZE = 100;

    private final ReservationSearchRepository reservations;
    private final AuditLogger audit;

    public ReservationSearchService(ReservationSearchRepository reservations, AuditLogger audit) {
        this.reservations = reservations;
        this.audit = audit;
    }

    /**
     * One page of reservations.
     *
     * <p>Transactional because it may write the audit row doc 59:148 requires:
     * the disclosure and its record must not be able to diverge.
     */
    @Transactional
    public ReservationPageView search(ReservationSearchCriteria criteria, ResolvedActor actor,
                                      String locale) {
        AuthorizationScope scope = actor.scope();
        boolean maySeeContact = actor.has(Permissions.CUSTOMER_VIEW);

        ReservationSearchRepository.ReservationSearchFilter filter = criteria.toFilter(maySeeContact);
        int size = pageSize(criteria.size());
        int page = pageIndex(criteria.page());

        List<ReservationSummaryView> items =
                reservations.search(scope, locale, filter, size, page * size).stream()
                        .map(row -> summary(row, maySeeContact))
                        .toList();

        // The count runs under the same predicate and the same scope filter, so
        // it can only ever describe rows this caller could page to.
        long total = reservations.count(scope, filter);

        if (maySeeContact && !items.isEmpty()) {
            // One row for the search, naming how much was disclosed and whether a
            // term was used — enough to answer "who looked up guest data, and how
            // widely" without a row per reservation drowning the log.
            audit.record(new AuditEvent(
                    actor.userId(), highestRole(actor), GUEST_SEARCH, ENTITY, null,
                    null,
                    Map.of("disclosed", items.size(),
                           "matched", total,
                           "searched", filter.term() != null),
                    null, null, null, CorrelationId.current(), scope.toString()));
        }

        return new ReservationPageView(items, page, size, total);
    }

    /**
     * One reservation, any channel.
     *
     * @throws NotFoundException when the reference does not exist <em>or</em> lies
     *         outside the caller's scope — doc 85 §6.3 makes those one answer, so
     *         a reference cannot be used to confirm that a booking exists
     */
    @Transactional
    public ReservationDetailView detail(String reference, ResolvedActor actor, String locale) {
        AuthorizationScope scope = actor.scope();
        boolean maySeeContact = actor.has(Permissions.CUSTOMER_VIEW);

        ReservationSearchRepository.ReservationRow row =
                reservations.byReference(reference, scope, locale)
                        .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        List<ReservationDetailView.Line> lines =
                reservations.lines(row.reservationId(), scope).stream()
                        .map(line -> new ReservationDetailView.Line(
                                line.roomTypeName(),
                                line.quantity(),
                                money(line.nightlyPriceMinor(), row.currency()),
                                money(line.lineTotalMinor(), row.currency())))
                        .toList();

        ReservationDetailView.Amounts amounts =
                reservations.amounts(row.reservationId(), scope)
                        .map(ReservationSearchService::amounts)
                        .orElse(null);

        ReservationDetailView.Guest guest = maySeeContact ? disclose(row, actor, scope) : null;

        List<ReservationDetailView.Event> timeline =
                reservations.history(row.reservationId(), scope).stream()
                        .map(event -> new ReservationDetailView.Event(
                                event.field(), event.fromStatus(), event.toStatus(),
                                event.actorType(), event.reason(), event.note(), event.at()))
                        .toList();

        return new ReservationDetailView(summary(row, maySeeContact), lines, amounts, guest,
                timeline);
    }

    /**
     * The request's raw parameters, before validation.
     *
     * <p>Held as a record so the controller states the contract and this class
     * states what each value must be — rather than a method with a dozen
     * positional {@code String}s that could be transposed without a compiler
     * noticing.
     */
    public record ReservationSearchCriteria(
            String q, String stayStatus, String channelType, String property, String roomType,
            LocalDate checkInFrom, LocalDate checkInTo,
            LocalDate checkOutFrom, LocalDate checkOutTo,
            LocalDate bookedFrom, LocalDate bookedTo,
            Integer page, Integer size) {

        /**
         * Validates every value and returns the filter the repository accepts.
         *
         * @param maySeeContact whether the caller holds {@code customer.view} —
         *        supplied by the service from the session, never from the request
         */
        ReservationSearchRepository.ReservationSearchFilter toFilter(boolean maySeeContact) {
            requireOrdered("checkInFrom", checkInFrom, "checkInTo", checkInTo);
            requireOrdered("checkOutFrom", checkOutFrom, "checkOutTo", checkOutTo);
            requireOrdered("bookedFrom", bookedFrom, "bookedTo", bookedTo);

            return new ReservationSearchRepository.ReservationSearchFilter(
                    blankToNull(q),
                    maySeeContact,
                    allOf("stayStatus", stayStatus, STAY_STATUSES),
                    oneOf("channelType", channelType, CHANNEL_TYPES),
                    // Neither slug is validated against the database: one that does
                    // not exist, or belongs to another partner, matches nothing once
                    // the scope filter applies. Refusing it would tell the caller
                    // which slugs are real.
                    blankToNull(property),
                    blankToNull(roomType),
                    checkInFrom, checkInTo, checkOutFrom, checkOutTo, bookedFrom, bookedTo);
        }
    }

    /**
     * A range whose end precedes its start is a mistake, not an empty result.
     *
     * <p>Returning nothing would look like "no reservations match" and send the
     * operator looking for a booking that is really there. A 400 naming the field
     * says which control is wrong.
     */
    private static void requireOrdered(String fromField, LocalDate from,
                                       String toField, LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The end of that range is before its start.",
                    List.of(new KasException.ErrorDetail(toField, "BeforeStart",
                            "Must not be earlier than " + fromField + ".")));
        }
    }

    /**
     * One or several allowed values, comma-separated.
     *
     * <h2>Why this exists</h2>
     *
     * The console offers four status groups rather than the seven states V1:54
     * has — "khách đã tới" is `CHECKED_IN`, `CHECKED_OUT` and `COMPLETED`, which
     * are one question to a receptionist and three rows to the schema. A single
     * value could not express that, and the alternatives were both worse than
     * widening this parameter: a second search endpoint, or filtering in the
     * client, which would have to read every page to know how many matched.
     *
     * <p><strong>The contract is unchanged for one value.</strong> A request
     * carrying {@code stayStatus=CANCELLED} behaves exactly as before, which is
     * what keeps the existing callers and their tests honest.
     *
     * <p>Every element is validated against the same frozen set, so a group is
     * not a way to smuggle an unknown status past the check — and the error
     * still names {@code stayStatus}, because that is the parameter the caller
     * sent.
     *
     * @return the distinct values in the order given, or null when nothing was
     *         supplied — never an empty list, which would mean "match nothing"
     *         to the repository rather than "do not filter"
     */
    private static List<String> allOf(String parameter, String value, Set<String> allowed) {
        String trimmed = blankToNull(value);
        if (trimmed == null) {
            return null;
        }
        List<String> values = java.util.Arrays.stream(trimmed.split(","))
                .map(String::trim)
                .filter(candidate -> !candidate.isEmpty())
                .distinct()
                .toList();

        if (values.isEmpty()) {
            // "stayStatus=,," — punctuation with nothing in it. Treated as absent
            // rather than as a filter matching nothing.
            return null;
        }
        for (String candidate : values) {
            oneOf(parameter, candidate, allowed);
        }
        return values;
    }

    private static String oneOf(String parameter, String value, Set<String> allowed) {
        String trimmed = blankToNull(value);
        if (trimmed == null) {
            return null;
        }
        if (!allowed.contains(trimmed)) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "That filter value is not recognised.",
                    List.of(new KasException.ErrorDetail(parameter, "NotAllowed",
                            "Expected one of: " + String.join(", ", new java.util.TreeSet<>(allowed)))));
        }
        return trimmed;
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Out-of-range values are clamped, not refused: a bad page is not an error. */
    private static int pageSize(Integer requested) {
        if (requested == null || requested < 1) {
            return DEFAULT_SIZE;
        }
        return Math.min(requested, MAX_SIZE);
    }

    private static int pageIndex(Integer requested) {
        return requested == null || requested < 0 ? 0 : requested;
    }

    private ReservationDetailView.Guest disclose(ReservationSearchRepository.ReservationRow row,
                                                 ResolvedActor actor,
                                                 AuthorizationScope scope) {
        ReservationSearchRepository.GuestContactRow contact =
                reservations.guestContact(row.reference(), scope).orElse(null);
        if (contact == null) {
            return null;
        }

        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), GUEST_ACCESS, ENTITY, row.reservationId(),
                null, Map.of("reference", row.reference()), null, null, null,
                CorrelationId.current(), scope.toString()));

        return new ReservationDetailView.Guest(
                row.guestName(), contact.email(), contact.phone(), contact.country(),
                contact.preferredChannel(), contact.arrivalTimeEst(), contact.specialRequests(),
                contact.childrenAges());
    }

    private static ReservationSummaryView summary(ReservationSearchRepository.ReservationRow row,
                                                  boolean maySeeContact) {
        return new ReservationSummaryView(
                row.reference(),
                row.channelType(),
                row.otaReference(),
                row.stayStatus(),
                row.propertySlug(),
                row.propertyName(),
                row.checkIn(),
                row.checkOut(),
                (int) ChronoUnit.DAYS.between(row.checkIn(), row.checkOut()),
                row.adults(),
                row.children(),
                row.rooms(),
                row.guestName(),
                maySeeContact ? row.guestPhone() : null,
                maySeeContact ? row.guestEmail() : null,
                row.createdAt(),
                money(row.totalMinor(), row.currency()));
    }

    private static ReservationDetailView.Amounts amounts(
            ReservationSearchRepository.ReservationAmountRow row) {
        return new ReservationDetailView.Amounts(
                money(row.subtotalMinor(), row.currency()),
                money(row.taxMinor(), row.currency()),
                money(row.serviceChargeMinor(), row.currency()),
                money(row.discountMinor(), row.currency()),
                money(row.totalMinor(), row.currency()));
    }

    /**
     * Null in, null out.
     *
     * <p>{@code nightly_price_minor} is deliberately NULL when a line's nights
     * differ (doc 125 §9), and {@code tax_minor} is NULL because V1 has no tax at
     * all. Substituting a zero would read as "free" and "no charge" — the two
     * things a null here never means.
     */
    private static Money money(Long amountMinor, String currency) {
        if (amountMinor == null || currency == null) {
            return null;
        }
        return new Money(amountMinor, currency, Money.VND.equals(currency) ? 0 : 2);
    }

    /**
     * {@code audit_log.actor_role} is a single {@code user_role}, so an actor
     * holding several is recorded at the most privileged — the authority the read
     * was actually made under. Mirrors {@code SalesRequestService}.
     */
    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) {
            return UserRole.SUPER_ADMIN.name();
        }
        if (actor.roles().contains(UserRole.ADMIN)) {
            return UserRole.ADMIN.name();
        }
        return UserRole.CUSTOMER.name();
    }
}
