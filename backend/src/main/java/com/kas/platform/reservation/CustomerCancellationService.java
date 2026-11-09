package com.kas.platform.reservation;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.MissingConfigurationException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.ApiErrorCode;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.math.BigDecimal;
import java.math.RoundingMode;

/** Customer cancellation, including hotel-quoted fees for late requests. */
@Service
public class CustomerCancellationService {

    private static final ZoneId HOTEL_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final String PENDING = "PENDING_HOTEL_FEE";
    private static final String QUOTED = "QUOTED";
    private final JdbcClient jdbc;
    private final AuditLogger audit;
    private final Clock clock;
    private final CancellationRequestExpiryService expiry;

    public CustomerCancellationService(JdbcClient jdbc, AuditLogger audit, Clock clock,
                                      CancellationRequestExpiryService expiry) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
        this.expiry = expiry;
    }

    /**
     * Cancels free and immediately inside the guest's applicable cutoff, unless the booking
     * is already paid: then, as outside the cutoff, it becomes a request the hotel answers.
     */
    @Transactional
    public CancellationResult request(String reference, ResolvedActor actor) {
        UUID customerId = requireCustomer(actor);
        StayRow stay = lockOwnedStay(reference, actor.userId())
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        OffsetDateTime requestedAt = OffsetDateTime.now(clock);
        expiry.expireDueRequests(stay.id(), requestedAt);
        ensureCancelable(stay, requestedAt);

        CancellationRequest open = openRequest(stay.id(), true);
        if (open != null) {
            return result(stay, open.status(), open.feeMinor(), open.currency(), open.id());
        }

        // A paid booking is never cancelled on the spot, even inside the free window: there
        // is no automated refund, so the hotel must handle the money first (owner rule
        // 2026-11-07). It goes to the hotel as a cancellation request instead.
        if (isWithinFreeWindow(stay, requestedAt) && !hasVerifiedPayment(stay.id())) {
            cancelReservation(stay, actor.userId(), requestedAt,
                    "Customer cancellation within the free-cancellation window.");
            audit.record(event(actor, "reservation.customer_cancelled", stay.id(),
                    Map.of("status", stay.currentStatus()),
                    Map.of("status", "CANCELLED", "feeMinor", 0), null));
            return result(stay, "CANCELLED", 0L, stay.currency(), null);
        }

        UUID requestId = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO reservation_cancellation_request
                            (id, reservation_id, customer_id, status, created_at, updated_at)
                        VALUES (:id, :reservation, :customer, 'PENDING_HOTEL_FEE', :at, :at)
                        """)
                .param("id", requestId).param("reservation", stay.id())
                .param("customer", customerId).param("at", requestedAt).update();
        audit.record(event(actor, "reservation.cancellation_requested", stay.id(),
                Map.of("status", stay.currentStatus()),
                Map.of("cancellationRequestId", requestId, "status", PENDING), null));
        return result(stay, PENDING, null, null, requestId);
    }

    /** Accepts or declines the hotel's quoted cancellation fee. */
    @Transactional
    public CancellationResult decide(String reference, boolean accept, ResolvedActor actor) {
        requireCustomer(actor);
        StayRow stay = lockOwnedStay(reference, actor.userId())
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        OffsetDateTime decidedAt = OffsetDateTime.now(clock);
        expiry.expireDueRequests(stay.id(), decidedAt);
        ensureCancelable(stay, decidedAt);
        CancellationRequest request = openRequest(stay.id(), true);
        if (request == null || !QUOTED.equals(request.status())) {
            throw ConflictException.illegalTransition("cancellationRequest",
                    request == null ? latestRequestStatus(stay.id()) : request.status(), "CUSTOMER_DECISION");
        }

        if (!accept) {
            jdbc.sql("""
                            UPDATE reservation_cancellation_request
                               SET status = 'DECLINED', customer_decided_at = :at, updated_at = :at
                             WHERE id = :id AND status = 'QUOTED'
                            """)
                    .param("id", request.id()).param("at", decidedAt).update();
            audit.record(event(actor, "reservation.cancellation_fee_declined", stay.id(),
                    Map.of("cancellationRequestId", request.id(), "status", QUOTED),
                    Map.of("status", "DECLINED"), null));
            return result(stay, "DECLINED", request.feeMinor(), request.currency(), request.id());
        }

        cancelReservation(stay, actor.userId(), decidedAt,
                "Customer accepted the hotel-quoted cancellation fee.");
        jdbc.sql("""
                        UPDATE reservation_cancellation_request
                           SET status = 'COMPLETED', customer_decided_at = :at, updated_at = :at
                         WHERE id = :id AND status = 'QUOTED'
                        """)
                .param("id", request.id()).param("at", decidedAt).update();
        audit.record(event(actor, "reservation.customer_cancelled_after_quote", stay.id(),
                Map.of("cancellationRequestId", request.id(), "feeMinor", request.feeMinor()),
                Map.of("stayStatus", "CANCELLED"), null));
        return result(stay, "CANCELLED", request.feeMinor(), request.currency(), request.id());
    }

    /** Hotel staff supplies the fee; the booking remains active until acceptance. */
    @Transactional
    public CancellationResult quoteFee(String reference, UUID requestId, long feeMinor,
                                       String note, ResolvedActor actor) {
        return quoteFee(reference, requestId, feeMinor, null, note, actor);
    }

    @Transactional
    public CancellationResult quoteFee(String reference, UUID requestId, Long amountMinor,
                                       BigDecimal percentage, String note, ResolvedActor actor) {
        if ((amountMinor == null) == (percentage == null)) {
            throw invalidFee("feeMinor", "Supply either feeMinor or percentage");
        }
        if (amountMinor != null && amountMinor < 0) {
            throw invalidFee("feeMinor", "feeMinor must be non-negative");
        }
        if (percentage != null && (percentage.signum() < 0
                || percentage.compareTo(BigDecimal.valueOf(100)) > 0
                || percentage.stripTrailingZeros().scale() > 2)) {
            throw invalidFee("percentage", "percentage must be between 0 and 100 with at most two decimal places");
        }
        OffsetDateTime quotedAt = OffsetDateTime.now(clock);
        expiry.expireDueRequest(requestId, quotedAt);
        ScopedRequest request = lockScopedRequest(reference, requestId, actor.scope())
                .orElseThrow(() -> NotFoundException.outOfScope("Cancellation request"));
        String currentRequestStatus = latestStatus(request.id());
        if (!PENDING.equals(currentRequestStatus)) {
            throw ConflictException.illegalTransition("cancellationRequest", currentRequestStatus, QUOTED);
        }
        if (percentage != null && (request.totalMinor() == null || request.totalMinor() < 0)) {
            throw invalidFee("percentage", "Reservation total is required for percentage fees");
        }
        long feeMinor = percentage == null ? amountMinor : BigDecimal.valueOf(request.totalMinor())
                .multiply(percentage).movePointLeft(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
        jdbc.sql("""
                        UPDATE reservation_cancellation_request
                           SET status = 'QUOTED', fee_amount_minor = :fee,
                               fee_currency = :currency, fee_note = :note,
                               quoted_by = :actor, quoted_at = :at, updated_at = :at
                         WHERE id = :id AND status = 'PENDING_HOTEL_FEE'
                        """)
                .param("fee", feeMinor).param("currency", request.currency())
                .param("note", note == null || note.isBlank() ? null : note.trim())
                .param("actor", actor.userId()).param("at", quotedAt)
                .param("id", requestId).update();
        Map<String, Object> feeDetails = new java.util.HashMap<>();
        feeDetails.put("status", QUOTED);
        feeDetails.put("feeMinor", feeMinor);
        feeDetails.put("currency", request.currency());
        feeDetails.put("feeType", percentage == null ? "AMOUNT" : "PERCENTAGE");
        if (percentage != null) {
            feeDetails.put("percentage", percentage);
            feeDetails.put("baseTotalMinor", request.totalMinor());
        }
        audit.record(event(actor, "reservation.cancellation_fee_quoted", request.reservationId(),
                Map.of("cancellationRequestId", requestId, "status", PENDING),
                feeDetails, null));
        return new CancellationResult(reference, QUOTED, requestId, feeMinor,
                request.currency(), false);
    }

    /** Caller-visible validation errors use the API's standard 400 envelope. */
    private static KasException invalidFee(String field, String message) {
        return new KasException(ApiErrorCode.VALIDATION_FAILED, message,
                List.of(new KasException.ErrorDetail(field, "INVALID", message)));
    }

    /** Queue visible to staff within their partner/property scope. */
    public List<PendingCancellation> pendingHotelQuotes(AuthorizationScope scope) {
        expiry.expireDueRequests(OffsetDateTime.now(clock));
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.addAll(filter.parameters());
        return jdbc.sql("""
                        SELECT cr.id, r.reference, p.slug AS property_slug, pt.name AS property_name,
                               r.guest_name, r.check_in, r.check_out, cr.created_at, r.currency, r.total_minor
                          FROM reservation_cancellation_request cr
                          JOIN reservation r ON r.id = cr.reservation_id
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN property_translation pt
                                 ON pt.property_id = p.id AND pt.locale = 'vi'
                         WHERE cr.status = 'PENDING_HOTEL_FEE' AND %s
                         ORDER BY cr.created_at, cr.id
                        """.formatted(filter.sql()))
                .params(params)
                .query((rs, row) -> new PendingCancellation(
                        rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getString("property_slug"), rs.getString("property_name"),
                        rs.getString("guest_name"), rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getString("currency"),
                        (Long) rs.getObject("total_minor")))
                .list();
    }

    /** Expires due requests even when no customer or hotel operator opens them. */
    public int expireDueRequests() {
        return expiry.expireDueRequests(OffsetDateTime.now(clock));
    }

    private String latestRequestStatus(UUID reservationId) {
        return jdbc.sql("""
                        SELECT status::text FROM reservation_cancellation_request
                         WHERE reservation_id = :reservation
                         ORDER BY created_at DESC, id DESC LIMIT 1
                        """)
                .param("reservation", reservationId).query(String.class).optional().orElse("NONE");
    }

    private String latestStatus(UUID requestId) {
        return jdbc.sql("SELECT status::text FROM reservation_cancellation_request WHERE id = :id")
                .param("id", requestId).query(String.class).optional().orElse("NONE");
    }

    private UUID requireCustomer(ResolvedActor actor) {
        if (!actor.roles().contains(com.kas.platform.identity.UserRole.CUSTOMER)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "A customer account is required.");
        }
        return jdbc.sql("SELECT id FROM customer WHERE user_id = :user AND merged_into_id IS NULL")
                .param("user", actor.userId()).query(UUID.class).optional()
                .orElseThrow(() -> NotFoundException.outOfScope("Customer"));
    }

    private java.util.Optional<StayRow> lockOwnedStay(String reference, UUID userId) {
        return jdbc.sql("""
                        SELECT r.id, r.reference, r.customer_id, r.property_id,
                               r.sales_status::text AS sales_status,
                               r.stay_status::text AS stay_status, r.check_in, r.currency,
                               p.check_in_time,
                               COALESCE(ls.member_eligible_at_booking, false) AS member_at_booking
                          FROM reservation r
                          JOIN customer c ON c.id = r.customer_id
                          JOIN property p ON p.id = r.property_id
                          LEFT JOIN reservation_loyalty_snapshot ls ON ls.reservation_id = r.id
                         WHERE r.reference = :reference AND c.user_id = :userId
                           AND c.merged_into_id IS NULL
                         FOR UPDATE OF r
                        """)
                .param("reference", reference).param("userId", userId)
                .query((rs, row) -> new StayRow(
                        rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getObject("customer_id", UUID.class), rs.getObject("property_id", UUID.class),
                        rs.getString("sales_status"), rs.getString("stay_status"),
                        rs.getObject("check_in", LocalDate.class), rs.getString("currency"),
                        rs.getBoolean("member_at_booking"), rs.getObject("check_in_time", LocalTime.class)))
                .optional();
    }

    /** Money received and not reversed: a VERIFIED payment on this reservation (V50: at most one). */
    private boolean hasVerifiedPayment(UUID reservationId) {
        return jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id = :id AND status = 'VERIFIED'")
                .param("id", reservationId).query(Long.class).single() > 0;
    }

    private void ensureCancelable(StayRow stay, OffsetDateTime at) {
        LocalDateTime localNow = at.atZoneSameInstant(HOTEL_ZONE).toLocalDateTime();
        if (!localNow.isBefore(stay.checkIn().atTime(LocalTime.NOON))) {
            throw ConflictException.illegalTransition("stayStatus", "CANCELLATION_WINDOW_EXPIRED", "CANCELLED");
        }
        boolean pending = stay.salesStatus() != null
                // ALTERNATIVE_OFFERED is terminal since 2026-11-07: that request already ended.
                && List.of("REQUESTED", "ASSIGNED", "AVAILABILITY_CHECK",
                           "CUSTOMER_CONTACTED").contains(stay.salesStatus())
                && stay.stayStatus() == null;
        boolean confirmed = "WON".equals(stay.salesStatus())
                && List.of("CONFIRMED", "CHECK_IN_READY").contains(stay.stayStatus());
        if (!pending && !confirmed) {
            throw ConflictException.illegalTransition("reservation",
                    stay.currentStatus(), "CANCELLED");
        }
    }

    private boolean isWithinFreeWindow(StayRow stay, OffsetDateTime at) {
        LocalDateTime cutoff = stay.memberAtBooking()
                ? stay.checkIn().atTime(LocalTime.NOON)
                : stay.checkIn().atTime(stay.checkInTimeOrFail()).minusHours(24);
        return at.atZoneSameInstant(HOTEL_ZONE).toLocalDateTime().isBefore(cutoff);
    }

    private CancellationRequest openRequest(UUID reservationId, boolean lock) {
        String suffix = lock ? " FOR UPDATE" : "";
        return jdbc.sql("""
                        SELECT id, status::text AS status, fee_amount_minor, fee_currency
                          FROM reservation_cancellation_request
                         WHERE reservation_id = :reservation
                           AND status IN ('PENDING_HOTEL_FEE', 'QUOTED')
                         ORDER BY created_at DESC, id DESC LIMIT 1
                        """ + suffix)
                .param("reservation", reservationId)
                .query((rs, row) -> new CancellationRequest(
                        rs.getObject("id", UUID.class), rs.getString("status"),
                        (Long) rs.getObject("fee_amount_minor"), rs.getString("fee_currency")))
                .optional().orElse(null);
    }

    private java.util.Optional<ScopedRequest> lockScopedRequest(String reference, UUID requestId,
                                                                 AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(reference);
        params.addAll(filter.parameters());
        UUID reservationId = jdbc.sql("""
                        SELECT r.id
                          FROM reservation r
                          JOIN property p ON p.id = r.property_id
                         WHERE r.reference = ? AND %s
                         FOR UPDATE OF r
                        """.formatted(filter.sql()))
                .params(params)
                .query(UUID.class).optional().orElse(null);
        if (reservationId == null) {
            return java.util.Optional.empty();
        }
        return jdbc.sql("""
                        SELECT cr.id, cr.reservation_id, cr.status::text AS status,
                               r.currency, r.check_in, r.total_minor
                          FROM reservation_cancellation_request cr
                          JOIN reservation r ON r.id = cr.reservation_id
                         WHERE cr.id = :requestId AND cr.reservation_id = :reservationId
                         FOR UPDATE OF cr
                        """)
                .param("requestId", requestId).param("reservationId", reservationId)
                .query((rs, row) -> new ScopedRequest(rs.getObject("id", UUID.class),
                        rs.getObject("reservation_id", UUID.class), rs.getString("status"),
                        rs.getString("currency"), rs.getObject("check_in", LocalDate.class),
                        (Long) rs.getObject("total_minor")))
                .optional();
    }

    private void cancelReservation(StayRow stay, UUID actorId, OffsetDateTime at, String reason) {
        // Decision 153: cancellation changes reservation state, never room stock.
        if (stay.stayStatus() == null) {
            jdbc.sql("""
                            UPDATE reservation
                               SET sales_status = 'CANCELLED', cancelled_at = :at,
                                   cancellation_reason = :reason, updated_at = :at, version = version + 1
                             WHERE id = :id AND sales_status = CAST(:fromStatus AS sales_status) AND stay_status IS NULL
                            """)
                    .param("id", stay.id()).param("fromStatus", stay.salesStatus())
                    .param("reason", reason).param("at", at).update();
            insertHistory(stay.id(), "SALES", stay.salesStatus(), "CANCELLED", actorId, reason);
        } else {
            jdbc.sql("""
                            UPDATE reservation
                               SET stay_status = 'CANCELLED', cancelled_at = :at,
                                   cancellation_reason = :reason, updated_at = :at, version = version + 1
                             WHERE id = :id AND sales_status = 'WON' AND stay_status = CAST(:fromStatus AS stay_status)
                            """)
                    .param("id", stay.id()).param("fromStatus", stay.stayStatus())
                    .param("reason", reason).param("at", at).update();
            insertHistory(stay.id(), "STAY", stay.stayStatus(), "CANCELLED", actorId, reason);
        }
    }

    private void insertHistory(UUID reservationId, String field, String from, String to,
                               UUID actorId, String reason) {
        jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_id,
                             actor_type, reason, note, created_at)
                        VALUES (:reservation, CAST(:field AS status_field), :fromStatus,
                                :toStatus, :actor, 'CUSTOMER', :reason,
                                'Customer cancellation workflow.', clock_timestamp())
                        """)
                .param("reservation", reservationId).param("field", field)
                .param("fromStatus", from).param("toStatus", to).param("actor", actorId)
                .param("reason", reason).update();
    }

    private CancellationResult result(StayRow stay, String status, Long feeMinor,
                                      String currency, UUID requestId) {
        boolean cancelled = "CANCELLED".equals(status);
        return new CancellationResult(stay.reference(), status, requestId, feeMinor,
                currency == null ? stay.currency() : currency, cancelled);
    }

    private AuditEvent event(ResolvedActor actor, String action, UUID reservationId,
                             Map<String, Object> before, Map<String, Object> after, String reason) {
        String role = actor.roles().contains(com.kas.platform.identity.UserRole.SUPER_ADMIN)
                ? "SUPER_ADMIN"
                : actor.roles().contains(com.kas.platform.identity.UserRole.ADMIN)
                    ? "ADMIN" : "CUSTOMER";
        return new AuditEvent(actor.userId(), role, action, "reservation", reservationId,
                before, after, reason, null, null, CorrelationId.current(), actor.scope().toString());
    }

    public record CancellationResult(String reference, String status, UUID requestId,
                                     Long feeMinor, String currency, boolean cancelled) { }
    public record PendingCancellation(UUID requestId, String reference, String propertySlug,
                                     String propertyName, String guestName, LocalDate checkIn,
                                     LocalDate checkOut, OffsetDateTime requestedAt, String currency,
                                     Long totalMinor) { }
    private record StayRow(UUID id, String reference, UUID customerId, UUID propertyId,
                           String salesStatus, String stayStatus, LocalDate checkIn,
                           String currency, boolean memberAtBooking, LocalTime checkInTime) {
        String currentStatus() { return stayStatus == null ? salesStatus : stayStatus; }
        LocalTime checkInTimeOrFail() {
            if (checkInTime == null) {
                throw new MissingConfigurationException("property.check_in_time");
            }
            return checkInTime;
        }
    }
    private record CancellationRequest(UUID id, String status, Long feeMinor, String currency) { }
    private record ScopedRequest(UUID id, UUID reservationId, String status, String currency,
                                 LocalDate checkIn, Long totalMinor) { }
}
