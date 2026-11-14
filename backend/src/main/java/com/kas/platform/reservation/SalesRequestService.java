package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.api.SalesRequestDetailView;
import com.kas.platform.reservation.api.SalesRequestNoteView;
import com.kas.platform.reservation.api.SalesRequestSummaryView;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Reservation state changes follow manual hotel review; no stock is read or changed. */
@Service
public class SalesRequestService {

    /** Doc 59:148 — the action name for a logged read of guest data. */
    private static final String GUEST_ACCESS = "reservation.guest_contact_viewed";

    /** Only used to satisfy the scoped read; no translated field is returned. */
    private static final String DEFAULT_LOCALE = "en";
    private static final String ENTITY = "reservation";

    /** Doc 54's audit events, one per transition. */
    private static final String DECLINED_ACTION = "reservation.declined";
    private static final String CANCELLED_ACTION = "reservation.cancelled";
    private static final String CONTACTED_ACTION = "reservation.contacted";
    private static final String ASSIGNED_ACTION = "reservation.assigned";
    private static final String CHECKED_ACTION = "reservation.availability_checked";
    private static final String WON_ACTION = "reservation.won";
    private static final String CONFIRMED_ACTION = "reservation.confirmed";
    private static final String PAYMENT_REQUESTED_ACTION = "reservation.payment_requested";
    private static final String ALTERNATIVE_OFFERED_ACTION = "reservation.alternative_offered";
    private static final String PAYMENT_VERIFIED_ACTION = "reservation.payment_verified";

    private static final String REQUESTED = "REQUESTED";
    private static final String ASSIGNED = "ASSIGNED";
    private static final String AVAILABILITY_CHECK = "AVAILABILITY_CHECK";
    private static final String WON = "WON";
    private static final String CONFIRMED = "CONFIRMED";
    private static final String DECLINED = "DECLINED";
    private static final String CANCELLED = "CANCELLED";
    private static final String CUSTOMER_CONTACTED = "CUSTOMER_CONTACTED";
    private static final String PAYMENT_PENDING = "PAYMENT_PENDING";
    private static final String ALTERNATIVE_OFFERED = "ALTERNATIVE_OFFERED";

    /** The {@code sales_status} enum, V1:49. */
    private static final java.util.Set<String> SALES_STATUSES = java.util.Set.of(
            REQUESTED, ASSIGNED, AVAILABILITY_CHECK, CUSTOMER_CONTACTED,
            "ALTERNATIVE_OFFERED", PAYMENT_PENDING, WON, DECLINED, CANCELLED, "EXPIRED");

    /** The {@code lead_source} enum, V1:39. */
    private static final java.util.Set<String> LEAD_SOURCES = java.util.Set.of(
            "WEBSITE", "FACEBOOK", "ZALO", "TIKTOK", "INSTAGRAM",
            "PHONE", "WALK_IN", "REFERRAL", "RETURNING_CUSTOMER", "OTHER");

    /**
     * The one SLA band with a frozen definition. "within" and "approaching" are
     * named by doc 69 §127 but separated by no frozen threshold.
     */
    private static final String BREACHED = "breached";
    private static final int DEFAULT_PAGE_SIZE = 25;
    private static final java.util.Set<String> SLA_STATES = java.util.Set.of(BREACHED);

    private static final String AVAILABLE = "AVAILABLE";
    private static final String UNAVAILABLE = "UNAVAILABLE";

    private static final String DECLINE_RELEASE_REASON = "Reservation declined (S11)";
    private static final String CANCEL_RELEASE_REASON = "Reservation cancelled (S12)";
    private static final String SELF_ASSIGN_REASON = "Implicit self-assignment (S4)";
    private static final String CONVERT_REASON = "Hold made firm on win (S10)";
    private static final String SUPERSEDED_REASON = "Superseded by the accepted hold (S10)";

    /**
     * Doc 54 §4: <em>"salesStatus freezes at its terminal value"</em>, and "any
     * transition out of a terminal state" is prohibited. These are the terminal values
     * of the {@code sales_status} enum. {@code ALTERNATIVE_OFFERED} joined them on
     * 2026-11-07 (owner decision): proposing another stay ends the request; the guest
     * sends a new request on the website if they want it.
     */
    private static final java.util.Set<String> TERMINAL =
            java.util.Set.of(WON, DECLINED, CANCELLED, "EXPIRED", ALTERNATIVE_OFFERED);

    /** Doc 54 S3 and S4 — the only two states a re-check may run from. */
    private static final java.util.Set<String> CHECKABLE_FROM =
            java.util.Set.of(REQUESTED, ASSIGNED);

    /**
     * Doc 54 S10's source states, verbatim. {@code REQUESTED} is deliberately
     * absent — owner decision 3 kept the frozen prohibition rather than adding a
     * shortcut, which is why S4 exists.
     */
    private static final java.util.Set<String> WINNABLE_FROM = java.util.Set.of(PAYMENT_PENDING);

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */
    private static final java.util.Set<String> CONTACTABLE_FROM =
            java.util.Set.of(ASSIGNED, AVAILABILITY_CHECK);

    private final SalesRequestRepository requests;
    private final AuditLogger audit;
    private final ObjectMapper json;
    private final ReservationEmailActionService bookingDecisions;
    private final SePayProperties sePay;

    public SalesRequestService(SalesRequestRepository requests, AuditLogger audit, ObjectMapper json,
                               ReservationEmailActionService bookingDecisions, SePayProperties sePay) {
        this.requests = requests;
        this.audit = audit;
        this.json = json;
        this.bookingDecisions = bookingDecisions;
        this.sePay = sePay;
    }

    /** The queue. Carries no guest contact detail, so it incurs no audit obligation. */
    public List<SalesRequestSummaryView> queue(AuthorizationScope scope, String locale,
                                               SalesRequestRepository.SalesQueueFilter criteria) {
        return queue(scope, locale, criteria, null, null);
    }

    /**
     * The queue, optionally one page of it. Both {@code page} (from 0) and {@code size}
     * (1–100) absent returns every row, exactly as before; the totals per view come
     * from {@link #queueCounts}.
     */
    public List<SalesRequestSummaryView> queue(AuthorizationScope scope, String locale,
                                               SalesRequestRepository.SalesQueueFilter criteria,
                                               Integer page, Integer size) {
        SalesRequestRepository.QueuePage window = null;
        if (page != null || size != null) {
            int p = page == null ? 0 : page;
            int s = size == null ? DEFAULT_PAGE_SIZE : size;
            if (p < 0 || s < 1 || s > 100) {
                throw new KasException(ApiErrorCode.VALIDATION_FAILED, "That page is not available.",
                        List.of(new KasException.ErrorDetail(p < 0 ? "page" : "size", "Range",
                                "page must be 0 or more; size must be between 1 and 100")));
            }
            window = new SalesRequestRepository.QueuePage(p, s);
        }
        return requests.queue(scope, locale, criteria, window).stream()
                .map(SalesRequestService::summary)
                .toList();
    }

    /**
     * Validates the queue's filter values before they reach SQL.
     *
     * <p>Each is checked against the frozen enum it names — {@code sales_status}
     * (V1:49) and {@code lead_source} (V1:39). An unknown value is a
     * <strong>400</strong> naming the parameter, never a 500 from a failed cast
     * and never a silently ignored filter that would show the agent a list they
     * did not ask for.
     *
     * <p>{@code slaState} accepts only {@code breached}. Doc 69 §127 names three
     * bands but freezes no threshold between "within" and "approaching", so those
     * two are refused rather than guessed at — a filter is a stronger commitment
     * than a colour on a badge.
     *
     * <p>{@code property} is not validated here: a slug that does not exist, or
     * belongs to another partner, simply matches nothing once the scope filter is
     * applied. Refusing it would tell the caller which slugs are real.
     */
    public static SalesRequestRepository.SalesQueueFilter filter(
            String salesStatus, String leadSource, String slaState, String property) {
        return filter(salesStatus, leadSource, slaState, property, null);
    }

    /**
     * The queue's views. {@code awaiting}: not yet answered by the hotel, and therefore
     * still within its deadline — overdue ones are moved to {@code EXPIRED} by
     * {@link SalesRequestExpiryService}, which uses the same set. {@code expired}: the
     * deadline passed unanswered. {@code accepted}: the hotel accepted — awaiting
     * payment or won. {@code alternative}: closed with an alternative stay proposed
     * (terminal, so it is in neither {@code awaiting} nor {@code expired}). Every other
     * status is only in the unfiltered list.
     */
    public static final java.util.Map<String, java.util.Set<String>> QUEUE_VIEWS = java.util.Map.of(
            "awaiting", SalesRequestExpiryService.EXPIRABLE,
            "expired", java.util.Set.of("EXPIRED"),
            "accepted", java.util.Set.of(PAYMENT_PENDING, WON),
            "alternative", java.util.Set.of(ALTERNATIVE_OFFERED));

    public static SalesRequestRepository.SalesQueueFilter filter(
            String salesStatus, String leadSource, String slaState, String property, String queue) {
        return filter(salesStatus, leadSource, slaState, property, queue, null, null);
    }

    /**
     * {@code q}: part of a reference or guest name. {@code sort}: {@code newest}
     * (the default — the most recently sent request first) or {@code oldest}.
     */
    public static SalesRequestRepository.SalesQueueFilter filter(
            String salesStatus, String leadSource, String slaState, String property, String queue,
            String q, String sort) {

        String view = oneOf("queue", queue, QUEUE_VIEWS.keySet());
        String order = oneOf("sort", sort, java.util.Set.of("newest", "oldest"));
        String search = blankToNull(q);
        if (search != null && search.length() > 100) {
            search = search.substring(0, 100);
        }
        return new SalesRequestRepository.SalesQueueFilter(
                oneOf("salesStatus", salesStatus, SALES_STATUSES),
                oneOf("leadSource", leadSource, LEAD_SOURCES),
                blankToNull(property),
                BREACHED.equals(oneOf("slaState", slaState, SLA_STATES)),
                view == null ? null : QUEUE_VIEWS.get(view),
                search,
                "oldest".equals(order));
    }

    /** Counts for every queue view, for the caller's scope and an optional hotel slug. */
    public SalesRequestRepository.QueueCounts queueCounts(AuthorizationScope scope, String property) {
        return queueCounts(scope, property, null);
    }

    public SalesRequestRepository.QueueCounts queueCounts(AuthorizationScope scope, String property, String q) {
        String search = blankToNull(q);
        if (search != null && search.length() > 100) {
            search = search.substring(0, 100);
        }
        return requests.queueCounts(scope, blankToNull(property), search, QUEUE_VIEWS.get("awaiting"),
                QUEUE_VIEWS.get("expired"), QUEUE_VIEWS.get("accepted"), QUEUE_VIEWS.get("alternative"));
    }

    private static String oneOf(String parameter, String value, java.util.Set<String> allowed) {
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

    /**
     * One request.
     *
     * <p>Transactional because it may write the audit row that doc 59:148
     * requires: the disclosure and its record must not be able to diverge.
     *
     * @throws NotFoundException when the reference does not exist <em>or</em> lies
     *         outside the caller's scope — doc 85 §6.3 makes those one answer
     */
    @Transactional
    public SalesRequestDetailView detail(String reference, ResolvedActor actor, String locale) {
        AuthorizationScope scope = actor.scope();
        SalesRequestRepository.SalesRequestRow row = requests.byReference(reference, scope, locale)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        List<SalesRequestDetailView.Line> lines =
                requests.lines(row.reservationId(), scope).stream()
                        .map(line -> new SalesRequestDetailView.Line(
                                line.roomTypeName(),
                                line.quantity(),
                                money(line.nightlyPriceMinor(), row.currency()),
                                money(line.lineTotalMinor(), row.currency())))
                        .toList();

        SalesRequestDetailView.Guest guest = actor.has(Permissions.CUSTOMER_VIEW)
                ? disclose(row, actor, scope)
                : null;

        // One extra scoped read rather than a join: the history has a different
        // cardinality from the lines, and joining both would multiply the rows.
        List<SalesRequestDetailView.Event> timeline =
                requests.history(row.reservationId(), scope).stream()
                        .map(event -> new SalesRequestDetailView.Event(
                                event.field(), event.fromStatus(), event.toStatus(),
                                event.actorType(), event.reason(), event.note(), event.at()))
                        .toList();

        // The reservation was already read under the caller's scope above.
        SalesRequestDetailView.AlternativeOffer alternative = requests.latestAlternativeOffer(row.reservationId(), scope)
                .map(o -> new SalesRequestDetailView.AlternativeOffer(o.propertyName(), o.roomName(),
                        o.checkIn(), o.checkOut(), o.quantity(), money(o.totalMinor(), o.currency()),
                        o.message(), o.sentAt()))
                .orElse(null);

        SalesRequestDetailView.Price price = requests.price(row.reservationId(), scope)
                .map(this::price).orElse(null);

        var payment = new SalesRequestDetailView.Payment(sePay.checkoutEnabled());
        return new SalesRequestDetailView(summary(row), lines, guest, timeline, alternative, price, payment);
    }

    /** The recorded breakdown; tax lines come from the S1 snapshot, amounts from the columns. */
    private SalesRequestDetailView.Price price(SalesRequestRepository.SalesRequestPriceRow p) {
        String currency = p.currency();
        List<SalesRequestDetailView.Price.Tax> taxes = new java.util.ArrayList<>();
        try {
            for (var t : json.readTree(p.taxesJson())) {
                taxes.add(new SalesRequestDetailView.Price.Tax(t.path("type").asText(),
                        t.path("ratePercent").decimalValue(),
                        money(t.path("amountMinor").asLong(), currency), t.path("inclusive").asBoolean()));
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException unreadable) {
            // A snapshot without readable taxes still shows the recorded tax total below.
        }
        if (taxes.isEmpty() && p.taxMinor() != null && p.taxMinor() > 0) {
            taxes.add(new SalesRequestDetailView.Price.Tax("TAX", null, money(p.taxMinor(), currency), false));
        }
        boolean voucher = p.voucherCode() != null;
        Long subtotal = p.subtotalMinor();
        return new SalesRequestDetailView.Price(
                money(subtotal, currency),
                voucher ? p.voucherCode() : null,
                voucher ? p.voucherName() : null,
                voucher && "PERCENTAGE".equals(p.voucherType()) ? p.voucherPercent() : null,
                money(p.discountMinor(), currency),
                subtotal == null ? null : money(subtotal - p.discountMinor() - p.memberDiscountMinor(), currency),
                taxes,
                money(p.totalMinor(), currency),
                p.memberDiscountMinor() > 0 ? p.tierCode() : null,
                p.memberDiscountMinor() > 0 ? p.memberPercent() : null,
                money(p.memberDiscountMinor(), currency),
                p.pointsUsed());
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */
    @Transactional
    public void decline(String reference, String reason, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked =
                requests.lockForTransition(reference, scope)
                        // Absent, another partner's, or an OTA reservation — one
                        // answer, so a reference cannot confirm a booking exists.
                        .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (TERMINAL.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition(
                    "salesStatus", locked.salesStatus(), DECLINED);
        }


        requests.updateSalesStatus(locked.reservationId(), DECLINED, scope);
        requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(), DECLINED,
                actor.userId(), reason,
                "Declined after manual hotel review.", scope);

        audit.record(terminalEvent(actor, DECLINED_ACTION, locked, DECLINED, reason,
                scope));
    }

    /**
     * The internal notes on one request — doc 58 §5
     * {@code GET /sales/requests/{reference}/notes}, permission
     * {@code sales.request.manage}, <em>"Internal. No guest surface exists"</em>.
     *
     * <p>Read-only and scoped, and it writes no audit row: doc 59:148 makes
     * <em>guest</em> data access auditable, and an internal note is the team's own
     * writing rather than the guest's. The 404 for an unreachable reservation is
     * the detail read's, unchanged.
     */
    @Transactional(readOnly = true)
    public List<SalesRequestNoteView> notes(String reference, AuthorizationScope scope) {
        return requests.notes(reservationIdOf(reference, scope), scope).stream()
                .map(note -> new SalesRequestNoteView(note.body(), note.createdAt()))
                .toList();
    }

    /**
     * Appends one internal note — doc 58 §5
     * {@code POST /sales/requests/{reference}/notes}.
     *
     * <h2>Informational, and nothing more</h2>
     *
     * A note moves no status, touches no hold, reads no availability, records no
     * contact and sends nothing. Doc 54 gives it no transition, and V14's own
     * comment calls the table <em>"INTERNAL. NEVER guest-visible."</em> — a
     * separate table from {@code reservation_message} by design rather than a
     * visibility flag, so there is no switch here that could make one guest-facing.
     *
     * <p>The author is the authenticated actor and the timestamp is the column's
     * default. Neither is accepted from the caller.
     *
     * <p>Notes are permitted in every state, including terminal ones: doc 54
     * freezes {@code salesStatus}, not the team's ability to write down what
     * happened afterwards.
     */
    @Transactional
    public void addNote(String reference, String body, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();
        UUID reservationId = reservationIdOf(reference, scope);

        int written = requests.insertNote(reservationId, actor.userId(), body, scope);
        if (written != 1) {
            throw new IllegalStateException("note not written for reservation " + reservationId);
        }
    }

    /**
     * The reservation this reference names, within the caller's scope.
     *
     * <p>Absent, another partner's, and an OTA reservation are one answer — doc 85
     * §6.3 — so a reference cannot be used to discover that a booking exists.
     */
    private UUID reservationIdOf(String reference, AuthorizationScope scope) {
        return requests.byReference(reference, scope, DEFAULT_LOCALE)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"))
                .reservationId();
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */
    @Transactional
    public void logContact(String reference, String channel, String direction, String outcome,
                           String notes, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (!CONTACTABLE_FROM.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition(
                    "salesStatus", locked.salesStatus(), CUSTOMER_CONTACTED);
        }

        int logged = requests.insertContactLog(locked.reservationId(), actor.userId(), channel,
                direction, outcome, notes, scope);
        if (logged != 1) {
            throw new IllegalStateException(
                    "contact log not written for reservation " + locked.reservationId());
        }

        requests.updateSalesStatus(locked.reservationId(), CUSTOMER_CONTACTED, scope);
        requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(),
                CUSTOMER_CONTACTED, actor.userId(), null,
                "Contact logged: " + direction + " via " + channel + ".", scope);

        audit.record(event(actor, CONTACTED_ACTION, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                // The channel and direction, which are operational facts. Never
                // the outcome or notes: those can carry whatever an agent typed,
                // including things a guest said.
                Map.of("salesStatus", CUSTOMER_CONTACTED, "channel", channel,
                        "direction", direction),
                null, scope));
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */
    @Transactional
    public void cancel(String reference, String reason, ResolvedActor actor) {
        cancel(reference, reason, null, false, actor);
    }

    /**
     * S12 with the 2026-11-07 additions: who asked ({@code GUEST} / {@code KAS}) is recorded
     * beside who did it, and a request whose guest already reported a bank transfer is not
     * cancelled until staff confirm they checked the account (no automated refund exists).
     */
    @Transactional
    public void cancel(String reference, String reason, String requestedBy, boolean paymentChecked,
                       ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                // Absent, another partner's, or an OTA reservation — one answer,
                // so a reference cannot confirm a booking exists.
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (TERMINAL.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition(
                    "salesStatus", locked.salesStatus(), CANCELLED);
        }


        if (!paymentChecked && requests.guestReportedPayment(locked.reservationId(), scope)) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.ILLEGAL_TRANSITION,
                    "The guest reported a bank transfer. Check the account and refund if needed before cancelling.",
                    java.util.List.of(new com.kas.platform.shared.KasException.ErrorDetail("paymentChecked",
                            "PAYMENT_REPORTED_CHECK_FIRST",
                            "The guest reported a bank transfer. Check the account before cancelling.")));
        }
        String requester = "GUEST".equals(requestedBy) ? "guest" : "KAS".equals(requestedBy) ? "KAS" : "not stated";

        requests.markCancelled(locked.reservationId(), reason, scope);
        requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(), CANCELLED,
                actor.userId(), reason,
                "Cancelled at the request of " + requester
                        + "; hotel staff manages room availability manually.", scope);

        audit.record(terminalEvent(actor, CANCELLED_ACTION, locked, CANCELLED, reason,
                scope));
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */


    /** The audit row S11 and S12 share the shape of. */
    private AuditEvent terminalEvent(ResolvedActor actor, String action,
                                     SalesRequestRepository.LockedRequest locked, String toStatus,
                                     String reason, AuthorizationScope scope) {
        return new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                Map.of("salesStatus", toStatus),
                reason, null, null, CorrelationId.current(), scope.toString());
    }

    /**
     * Returns the guest's contact detail <strong>and records that it was read</strong>.
     *
     * <p>The audit row is written before the value is returned, so a caller cannot
     * receive the data without the log existing. It carries the actor, the
     * reservation and the scope — never the contact values themselves: a log that
     * copies the email in order to record that someone read the email has doubled
     * the exposure it exists to control.
     */
    /**
     * S2 — assign, and reassign. Doc 54 §4 S2, doc 58 §5
     * {@code POST /sales/requests/{reference}/assign}, permission
     * {@code sales.request.assign} (owner decision 4).
     *
     * <h2>Two shapes, one endpoint</h2>
     *
     * <p>From {@code REQUESTED} this is the frozen transition
     * {@code REQUESTED → ASSIGNED} and the sales status moves. From any later
     * non-terminal state it is a <strong>reassignment</strong>, which owner
     * decision 5 requires to work <em>without</em> a status change — an
     * {@code AVAILABILITY_CHECK} request handed to another agent is still under
     * availability check. That is exactly why the assignment history is its own
     * table: {@code reservation_status_history} records which lifecycle moved
     * and to what, and here nothing moved.
     *
     * <h2>What makes a target valid</h2>
     *
     * <p>{@link SalesRequestRepository#isAssignableOwner} decides, in SQL, and
     * the answer is identical for a user that does not exist, one that is not
     * ACTIVE, and one whose scope does not reach this property. A caller cannot
     * use this endpoint to discover which user ids are real.
     */
    @Transactional
    public void assign(String reference, UUID targetOwnerId, String reason, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (TERMINAL.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", locked.salesStatus(), ASSIGNED);
        }
        if (targetOwnerId.equals(locked.salesOwnerId())) {
            // V27's assignment_owner_changed CHECK would refuse the history row.
            // Refusing here names the reason instead of surfacing a constraint.
            throw ConflictException.illegalTransition(
                    "salesOwner", "already " + targetOwnerId, targetOwnerId.toString());
        }
        if (!requests.isAssignableOwner(targetOwnerId, locked.reservationId(), scope)) {
            throw notAssignable();
        }

        applyAssignment(locked, targetOwnerId, reason, actor, scope);

        // REQUESTED is the only state S2 moves. A reassignment leaves the status
        // exactly where it was — the whole point of owner decision 5.
        if (REQUESTED.equals(locked.salesStatus())) {
            requests.updateSalesStatus(locked.reservationId(), ASSIGNED, scope);
            requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(), ASSIGNED,
                    actor.userId(), reason, "Assigned to a sales owner (S2).", scope);
        }
    }

    /**
     * S3 and S4 — the live availability re-check. Doc 54 §4 S3/S4, doc 58 §5
     * {@code POST /sales/requests/{reference}/availability-check}, permission
     * {@code sales.request.manage}.
     *
     * <h2>One endpoint, because the contract defines one destination</h2>
     *
     * <p>S3 is {@code ASSIGNED → AVAILABILITY_CHECK}. S4 is
     * {@code REQUESTED → AVAILABILITY_CHECK} whose side effects doc 54 states as
     * <em>"S2 + S3"</em> — the same check, preceded by an implicit
     * self-assignment. So the source state selects which one this is, and
     * nothing else differs.
     *
     * <p>Every other source state is refused. Doc 54 has no
     * {@code AVAILABILITY_CHECK → AVAILABILITY_CHECK} row, and inventing a
     * self-transition to allow re-checking would be adding a transition the
     * frozen contract does not have. S10 re-verifies under its own lock anyway.
     *
     * @return the room types that could not be satisfied, empty when the check passed
     */
    @Transactional
    public void availabilityCheck(String reference, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (!CHECKABLE_FROM.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition(
                    "salesStatus", locked.salesStatus(), AVAILABILITY_CHECK);
        }

        // S4's implicit self-assignment — doc 54 S4, "S2 + S3". The acting agent
        // becomes the owner, and it is recorded exactly as an explicit S2 is.
        boolean selfAssigned = REQUESTED.equals(locked.salesStatus());
        if (selfAssigned) {
            if (!requests.isAssignableOwner(actor.userId(), locked.reservationId(), scope)) {
                throw notAssignable();
            }
            applyAssignment(locked, actor.userId(), SELF_ASSIGN_REASON, actor, scope);
        }

        // Staff invokes this route only after checking the hotel's real inventory.
        // The application records that manual decision and does not run its own
        // availability search or place a hold.
        ObjectNode manualDecision = json.createObjectNode();
        manualDecision.put("method", "HOTEL_MANUAL_CHECK");
        manualDecision.put("available", true);
        requests.insertAvailabilityCheck(locked.reservationId(), actor.userId(), AVAILABLE,
                json.createArrayNode().add(manualDecision).toString(), scope);

        requests.updateSalesStatus(locked.reservationId(), AVAILABILITY_CHECK, scope);
        requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(),
                AVAILABILITY_CHECK, actor.userId(), null,
                selfAssigned
                        ? "Availability re-checked; self-assigned (S4)."
                        : "Availability re-checked (S3).",
                scope);

        audit.record(event(actor, CHECKED_ACTION, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                Map.of("salesStatus", AVAILABILITY_CHECK), null, scope));
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */
    @Transactional
    public void win(String reference, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();

        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        if (!WINNABLE_FROM.contains(locked.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", locked.salesStatus(), WON);
        }

        if (!requests.hasVerifiedPayment(locked.reservationId(), scope)) {
            throw ConflictException.illegalTransition("payment", "NOT_VERIFIED", "CONFIRMED");
        }

        requests.markWon(locked.reservationId(), scope);

        requests.insertStatusHistory(locked.reservationId(), locked.salesStatus(), WON,
                actor.userId(), null,
                "Hotel verified payment and confirmed the stay.",
                scope);
        requests.insertStatusHistory(SalesRequestRepository.STAY_FIELD, locked.reservationId(),
                null, CONFIRMED, actor.userId(), null,
                "Stay confirmed in the same transaction as the win (S10).", scope);

        audit.record(event(actor, WON_ACTION, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                Map.of("salesStatus", WON, "paymentVerified", true),
                null, scope));
        audit.record(event(actor, CONFIRMED_ACTION, locked.reservationId(),
                null, Map.of("stayStatus", CONFIRMED), null, scope));
    }

    /** Reservation state changes follow manual hotel review; no stock is read or changed. */


    // ----------------------------------- manual hotel decisions in the console
    //
    // Doc 152: the hotel checks real availability by hand, then either sends its
    // payment QR or proposes another stay, and confirms the stay only once it has
    // the money. These are the same decisions the email links make, available to
    // signed-in staff so the flow never depends on email delivery.

    /** Availability confirmed by hand: PAYMENT_PENDING; the caller emails the guest the QR. */
    @Transactional
    public ReservationEmailActionService.PaymentRequest approveAndRequestPayment(String reference,
                                                                                 ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();
        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        var request = bookingDecisions.approveForStaff(locked.reservationId(), actor.userId());
        audit.record(event(actor, PAYMENT_REQUESTED_ACTION, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                Map.of("salesStatus", PAYMENT_PENDING), null, scope));
        return request;
    }

    /**
     * No room as requested: the offer is stored and the request ENDS as ALTERNATIVE_OFFERED
     * (terminal); the caller queues the guest email. Only an open request can end this way.
     */
    @Transactional
    public ReservationEmailActionService.AlternativeProposal proposeAlternative(
            String reference, ReservationEmailActionService.AlternativeOfferInput input, ResolvedActor actor) {
        AuthorizationScope scope = actor.scope();
        SalesRequestRepository.LockedRequest locked = requests.lockForTransition(reference, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        var proposal = bookingDecisions.proposeForStaff(locked.reservationId(), actor.userId(), input);
        audit.record(event(actor, ALTERNATIVE_OFFERED_ACTION, locked.reservationId(),
                Map.of("salesStatus", locked.salesStatus()),
                Map.of("salesStatus", "ALTERNATIVE_OFFERED", "offerId", proposal.offerId().toString()),
                null, scope));
        return proposal;
    }

    // No "payment received" for staff (owner 2026-11-14): only SePay confirms a payment
    // (ReservationEmailActionService.confirmPaymentByGateway).

    /** Moves the owner and appends the history row, in that order. */
    private void applyAssignment(SalesRequestRepository.LockedRequest locked, UUID toOwnerId,
                                 String reason, ResolvedActor actor, AuthorizationScope scope) {
        requests.assignOwner(locked.reservationId(), toOwnerId, scope);

        // The history row is the point of owner decision 5. A refused insert must
        // take the owner update with it rather than leaving an unrecorded change.
        int recorded = requests.insertAssignment(locked.reservationId(), locked.salesOwnerId(),
                toOwnerId, actor.userId(), reason, scope);
        if (recorded != 1) {
            throw new IllegalStateException(
                    "assignment history not written for reservation " + locked.reservationId());
        }

        audit.record(event(actor, ASSIGNED_ACTION, locked.reservationId(),
                locked.salesOwnerId() == null
                        ? null
                        : Map.of("salesOwnerId", locked.salesOwnerId().toString()),
                Map.of("salesOwnerId", toOwnerId.toString()), reason, scope));
    }

    /**
     * One refusal for every reason a target can be rejected.
     *
     * <p>A user id that does not exist, one that is suspended, and one belonging
     * to another partner all answer the same way — the same reasoning doc 85 §6.3
     * applies to references, applied to a body field.
     */
    private static KasException notAssignable() {
        return new KasException(ApiErrorCode.VALIDATION_FAILED,
                "That user cannot be assigned to this reservation.",
                List.of(new KasException.ErrorDetail("salesOwnerId", "NotAssignable",
                        "Not an active user with access to this property.")));
    }

    private AuditEvent event(ResolvedActor actor, String action, java.util.UUID entityId,
                             Map<String, Object> before, Map<String, Object> after,
                             String reason, AuthorizationScope scope) {
        return new AuditEvent(actor.userId(), highestRole(actor), action, ENTITY, entityId,
                before, after, reason, null, null, CorrelationId.current(), scope.toString());
    }

    private String write(ArrayNode detail) {
        try {
            return json.writeValueAsString(detail);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("availability check detail is not serialisable", e);
        }
    }

    private SalesRequestDetailView.Guest disclose(SalesRequestRepository.SalesRequestRow row,
                                                  ResolvedActor actor,
                                                  AuthorizationScope scope) {
        SalesRequestRepository.GuestContactRow contact =
                requests.guestContact(row.reference(), scope).orElse(null);
        if (contact == null) {
            return null;
        }

        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), GUEST_ACCESS, ENTITY, row.reservationId(),
                null, Map.of("reference", row.reference()), null, null, null,
                CorrelationId.current(), scope.toString()));

        return new SalesRequestDetailView.Guest(
                row.guestName(), contact.email(), contact.phone(), contact.country(),
                contact.preferredChannel(), contact.specialRequests());
    }

    private static SalesRequestSummaryView summary(SalesRequestRepository.SalesRequestRow row) {
        return new SalesRequestSummaryView(
                row.reference(),
                row.salesStatus(),
                row.leadSource(),
                row.propertySlug(),
                row.propertyName(),
                row.checkIn(),
                row.checkOut(),
                (int) ChronoUnit.DAYS.between(row.checkIn(), row.checkOut()),
                row.adults(),
                row.children(),
                row.rooms(),
                row.guestName(),
                row.requestedAt(),
                row.slaDueAt(),
                money(row.totalMinor(), row.currency()));
    }

    /**
     * Null in, null out.
     *
     * <p>{@code nightly_price_minor} is deliberately NULL when a line's nights
     * differ (doc 125 §9), so this must not substitute a zero — a zero would read
     * as "free", which is the one thing it never means.
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
     * was actually made under. Mirrors {@code OnboardingService}.
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
