package com.kas.platform.reservation;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.pricing.CancellationFeeRuleService;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.MissingConfigurationException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Guest cancellation, the late-cancellation fee and the manual refund (owner rules 2026-11-07
 * and 2026-11-10).
 *
 * <h2>Free window — decided here, from the booking-time membership snapshot</h2>
 * A guest who was a KAS member when booking ({@code reservation_loyalty_snapshot
 * .member_eligible_at_booking}) cancels free until 12:00 on the check-in day; any other guest
 * until 24 hours before the hotel's check-in time. Hotel local time (Asia/Ho_Chi_Minh); the
 * instant itself is outside the window. Membership is never inferred from an email address.
 *
 * <h2>After the window</h2>
 * The fee comes from {@link CancellationFeeRuleService}: the guest sees the amount and the
 * refund and must confirm before anything is cancelled. With no rule configured the request
 * goes to SUPER_ADMIN, who quotes a fee by hand; no fee is guessed.
 *
 * <h2>Money</h2>
 * KAS never refunds automatically. A cancelled booking with a verified payment becomes a
 * REFUND_PENDING request; SUPER_ADMIN refunds outside KAS and records the amount and reference
 * (REFUNDED), or records why not (REFUND_REJECTED). Only that record moves the request on.
 */
@Service
public class CustomerCancellationService {

    private static final ZoneId HOTEL_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final String PENDING = "PENDING_HOTEL_FEE";
    private static final String QUOTED = "QUOTED";
    private static final String REFUND_PENDING = "REFUND_PENDING";
    public static final String MEMBER_POLICY = "MEMBER_NOON_CHECK_IN_DAY";
    public static final String GUEST_POLICY = "GUEST_24H_BEFORE_CHECK_IN";

    private final JdbcClient jdbc;
    private final AuditLogger audit;
    private final Clock clock;
    private final CancellationRequestExpiryService expiry;
    private final CancellationFeeRuleService feeRules;
    private final VoucherHoldService voucherHolds;

    public CustomerCancellationService(JdbcClient jdbc, AuditLogger audit, Clock clock,
                                       CancellationRequestExpiryService expiry,
                                       CancellationFeeRuleService feeRules, VoucherHoldService voucherHolds) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
        this.expiry = expiry;
        this.feeRules = feeRules;
        this.voucherHolds = voucherHolds;
    }

    // ================================================================ terms (what would happen)

    /** What cancelling now would mean, for the signed-in owner of the booking. Changes nothing. */
    @Transactional
    public CancellationTerms preview(String reference, ResolvedActor actor) {
        requireCustomer(actor);
        StayRow stay = lockOwnedStay(reference, actor.userId())
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        return terms(stay, OffsetDateTime.now(clock));
    }

    /** The same, for a guest holding a GUEST_CANCEL email link. */
    @Transactional
    public CancellationTerms previewForGuest(UUID reservationId) {
        StayRow stay = lockStay(reservationId).orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        return terms(stay, OffsetDateTime.now(clock));
    }

    /**
     * The frozen-at-this-instant terms. {@code outcome}: CANCEL_FREE (cancelled at once, nothing
     * paid), PAID_REVIEW (inside the window but paid: SUPER_ADMIN reviews first, owner rule
     * 2026-11-07 — no booking with money on it is cancelled on the spot), CONFIRM_FEE (guest must
     * accept the fee), MANUAL_REVIEW (no fee rule: SUPER_ADMIN decides), OPEN_REQUEST (a request
     * is already open), NOT_CANCELLABLE.
     */
    CancellationTerms terms(StayRow stay, OffsetDateTime at) {
        expiry.expireDueRequests(stay.id(), at);
        boolean member = stay.memberAtBooking();
        OffsetDateTime freeUntil = freeUntil(stay);
        long paid = paidAmount(stay.id());
        long total = stay.totalMinor() == null ? 0 : stay.totalMinor();
        String notCancellable = cancellableProblem(stay, at);
        CancellationRequest open = notCancellable == null ? openRequest(stay.id(), true) : null;
        if (notCancellable != null) {
            return new CancellationTerms(stay.reference(), member ? MEMBER_POLICY : GUEST_POLICY, freeUntil,
                    false, "NOT_CANCELLABLE", paid, total, null, null, null, 0, paid, stay.currency(),
                    null, null, notCancellable);
        }
        if (open != null) {
            return new CancellationTerms(stay.reference(), member ? MEMBER_POLICY : GUEST_POLICY, freeUntil,
                    at.isBefore(freeUntil), "OPEN_REQUEST", paid, total, null, null, null,
                    open.feeMinor() == null ? 0 : open.feeMinor(),
                    Math.max(0, paid - (open.feeMinor() == null ? 0 : open.feeMinor())), stay.currency(),
                    open.id(), open.status(), null);
        }
        if (at.isBefore(freeUntil)) {
            return new CancellationTerms(stay.reference(), member ? MEMBER_POLICY : GUEST_POLICY, freeUntil,
                    true, paid > 0 ? "PAID_REVIEW" : "CANCEL_FREE", paid, total, null, "NONE", null,
                    0, paid, stay.currency(), null, null, null);
        }
        Optional<CancellationFeeRuleService.Rule> rule = feeRules.activeFor(stay.propertyId());
        if (rule.isEmpty()) {
            return new CancellationTerms(stay.reference(), member ? MEMBER_POLICY : GUEST_POLICY, freeUntil,
                    false, "MANUAL_REVIEW", paid, total, null, null, null, 0, paid, stay.currency(),
                    null, null, null);
        }
        CancellationFeeRuleService.Fee fee = CancellationFeeRuleService.fee(rule.get(), total);
        return new CancellationTerms(stay.reference(), member ? MEMBER_POLICY : GUEST_POLICY, freeUntil,
                false, "CONFIRM_FEE", paid, total, rule.get().id(), rule.get().feeType(), rule.get().percent(),
                fee.feeMinor(), Math.max(0, paid - fee.feeMinor()), stay.currency(), null, null, null);
    }

    /** The instant the free window ends for this booking (exclusive). */
    OffsetDateTime freeUntil(StayRow stay) {
        LocalDateTime local = stay.memberAtBooking()
                ? stay.checkIn().atTime(LocalTime.NOON)
                : stay.checkIn().atTime(stay.checkInTimeOrFail()).minusHours(24);
        return local.atZone(HOTEL_ZONE).toOffsetDateTime();
    }

    // ================================================================ guest actions

    /**
     * The guest asks to cancel. Inside the free window: cancelled now (and a full refund queued
     * when paid). Outside it: a fee request the guest must confirm ({@code expectedFeeMinor}
     * guards against the fee having changed since it was shown), or a manual-review request.
     */
    @Transactional
    public CancellationResult request(String reference, ResolvedActor actor) {
        return request(reference, actor, null);
    }

    @Transactional
    public CancellationResult request(String reference, ResolvedActor actor, Long expectedFeeMinor) {
        UUID customerId = requireCustomer(actor);
        StayRow stay = lockOwnedStay(reference, actor.userId())
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        return requestFor(stay, customerId, actor.userId(), "ACCOUNT", expectedFeeMinor, actor);
    }

    /**
     * From a GUEST_CANCEL email link: request and, when a fee applies and the guest pressed
     * "confirm" on the page that showed it, accept it in the same step.
     */
    @Transactional
    public CancellationResult requestForGuest(UUID reservationId, boolean acceptFee, Long expectedFeeMinor) {
        StayRow stay = lockStay(reservationId).orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        CancellationResult result = requestFor(stay, stay.customerId(), null, "EMAIL_LINK", expectedFeeMinor, null);
        if (acceptFee && QUOTED.equals(result.status())) {
            return decideFor(stay, true, null, "EMAIL_LINK", null);
        }
        return result;
    }

    private CancellationResult requestFor(StayRow stay, UUID customerId, UUID userId, String via,
                                          Long expectedFeeMinor, ResolvedActor actor) {
        OffsetDateTime at = OffsetDateTime.now(clock);
        CancellationTerms t = terms(stay, at);
        switch (t.outcome()) {
            case "NOT_CANCELLABLE" -> throw ConflictException.illegalTransition("reservation",
                    t.notCancellableReason(), "CANCELLED");
            case "OPEN_REQUEST" -> {
                return result(stay, t.openRequestStatus(), t.feeMinor(), t.currency(), t.openRequestId(), t);
            }
            case "CANCEL_FREE" -> {
                cancelReservation(stay, userId, at, "Guest cancellation within the free-cancellation window.");
                record(actor, "reservation.customer_cancelled", stay.id(),
                        Map.of("status", stay.currentStatus()), Map.of("status", "CANCELLED", "feeMinor", 0));
                return result(stay, "CANCELLED", 0L, stay.currency(), null, t);
            }
            case "PAID_REVIEW" -> {
                // Owner rule 2026-11-07: a paid booking is never cancelled on the spot, even inside
                // the free window; SUPER_ADMIN reviews it (normally quoting a fee of 0), the guest
                // confirms, and the refund is then made by hand.
                UUID requestId = insertRequest(stay, customerId, via, t, PENDING, "FREE_WINDOW", at);
                record(actor, "reservation.cancellation_requested", stay.id(),
                        Map.of("status", stay.currentStatus()),
                        Map.of("cancellationRequestId", requestId, "status", PENDING, "paidInsideFreeWindow", true));
                return result(stay, PENDING, null, null, requestId, t);
            }
            case "MANUAL_REVIEW" -> {
                UUID requestId = insertRequest(stay, customerId, via, t, PENDING, null, at);
                record(actor, "reservation.cancellation_requested", stay.id(),
                        Map.of("status", stay.currentStatus()),
                        Map.of("cancellationRequestId", requestId, "status", PENDING));
                return result(stay, PENDING, null, null, requestId, t);
            }
            case "CONFIRM_FEE" -> {
                if (expectedFeeMinor != null && expectedFeeMinor != t.feeMinor()) {
                    throw new KasException(ApiErrorCode.VERSION_CONFLICT,
                            "The cancellation fee has changed. Please review it again.",
                            List.of(new KasException.ErrorDetail("feeMinor", "FEE_CHANGED", String.valueOf(t.feeMinor()))));
                }
                UUID requestId = insertRequest(stay, customerId, via, t, QUOTED, "RULE", at);
                record(actor, "reservation.cancellation_fee_calculated", stay.id(),
                        Map.of("status", stay.currentStatus()),
                        Map.of("cancellationRequestId", requestId, "status", QUOTED, "feeMinor", t.feeMinor(),
                                "refundDueMinor", t.refundDueMinor()));
                return result(stay, QUOTED, t.feeMinor(), stay.currency(), requestId, t);
            }
            default -> throw new IllegalStateException(t.outcome());
        }
    }

    /** The guest accepts or declines the fee on an open QUOTED request. */
    @Transactional
    public CancellationResult decide(String reference, boolean accept, ResolvedActor actor) {
        requireCustomer(actor);
        StayRow stay = lockOwnedStay(reference, actor.userId())
                .orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        return decideFor(stay, accept, actor.userId(), "ACCOUNT", actor);
    }

    /** From a GUEST_CANCEL link: accept or decline a fee SUPER_ADMIN or a rule quoted. */
    @Transactional
    public CancellationResult decideForGuest(UUID reservationId, boolean accept) {
        StayRow stay = lockStay(reservationId).orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        return decideFor(stay, accept, null, "EMAIL_LINK", null);
    }

    private CancellationResult decideFor(StayRow stay, boolean accept, UUID userId, String via, ResolvedActor actor) {
        OffsetDateTime at = OffsetDateTime.now(clock);
        expiry.expireDueRequests(stay.id(), at);
        String problem = cancellableProblem(stay, at);
        if (problem != null) {
            throw ConflictException.illegalTransition("reservation", problem, "CANCELLED");
        }
        CancellationRequest request = openRequest(stay.id(), true);
        if (request == null || !QUOTED.equals(request.status())) {
            throw ConflictException.illegalTransition("cancellationRequest",
                    request == null ? latestRequestStatus(stay.id()) : request.status(), "CUSTOMER_DECISION");
        }
        CancellationTerms t = terms(stay, at);
        if (!accept) {
            jdbc.sql("""
                    UPDATE reservation_cancellation_request
                       SET status = 'DECLINED', customer_decided_at = :at, updated_at = :at
                     WHERE id = :id AND status = 'QUOTED'
                    """).param("id", request.id()).param("at", at).update();
            record(actor, "reservation.cancellation_fee_declined", stay.id(),
                    Map.of("cancellationRequestId", request.id(), "status", QUOTED), Map.of("status", "DECLINED"));
            return result(stay, "DECLINED", request.feeMinor(), request.currency(), request.id(), t);
        }

        cancelReservation(stay, userId, at, "Guest accepted the cancellation fee.");
        long paid = paidAmount(stay.id());
        long fee = request.feeMinor() == null ? 0 : request.feeMinor();
        long refundDue = Math.max(0, paid - fee);
        // Paid: SUPER_ADMIN refunds by hand. Not paid: nothing to refund (the fee is not collected by KAS).
        String next = paid > 0 ? REFUND_PENDING : "COMPLETED";
        jdbc.sql("""
                UPDATE reservation_cancellation_request
                   SET status = CAST(:next AS cancellation_request_status), customer_decided_at = :at,
                       paid_amount_minor = :paid, refund_due_minor = :refundDue,
                       confirmed_by = :userId, confirmed_via = :via, updated_at = :at
                 WHERE id = :id AND status = 'QUOTED'
                """).param("next", next).param("at", at).param("paid", paid).param("refundDue", refundDue)
                .param("userId", userId).param("via", via).param("id", request.id()).update();
        record(actor, "reservation.customer_cancelled_after_fee", stay.id(),
                Map.of("cancellationRequestId", request.id(), "feeMinor", fee),
                Map.of("stayStatus", "CANCELLED", "status", next, "refundDueMinor", refundDue));
        return new CancellationResult(stay.reference(), next.equals(REFUND_PENDING) ? REFUND_PENDING : "CANCELLED",
                request.id(), fee, request.currency() == null ? stay.currency() : request.currency(), true,
                refundDue, paid, t.freeUntil(), t.policy());
    }

    // ================================================================ SUPER_ADMIN

    /**
     * SUPER_ADMIN releases the fee of a waiting request to the guest, who then decides. The fee
     * is the one the policy sets when there is one ({@link #policyFee}): 0 for a paid booking
     * cancelled inside the free window, the configured fee rule after it. Only with neither does
     * SUPER_ADMIN name the fee ({@code amountMinor} or {@code percentage}); with a policy both
     * may be omitted, and a different amount is refused.
     */
    @Transactional
    public CancellationResult quoteFee(String reference, UUID requestId, long feeMinor, String note, ResolvedActor actor) {
        return quoteFee(reference, requestId, feeMinor, null, note, actor);
    }

    @Transactional
    public CancellationResult quoteFee(String reference, UUID requestId, Long amountMinor,
                                       BigDecimal percentage, String note, ResolvedActor actor) {
        OffsetDateTime quotedAt = OffsetDateTime.now(clock);
        expiry.expireDueRequest(requestId, quotedAt);
        ScopedRequest request = lockScopedRequest(reference, requestId, actor.scope())
                .orElseThrow(() -> NotFoundException.outOfScope("Cancellation request"));
        String currentRequestStatus = latestStatus(request.id());
        if (!PENDING.equals(currentRequestStatus)) {
            throw ConflictException.illegalTransition("cancellationRequest", currentRequestStatus, QUOTED);
        }
        long total = request.totalMinor() == null ? 0 : request.totalMinor();
        // Owner rule 2026-11-14: the fee follows the policy. Inside the free window it is 0; after
        // it, the configured fee rule decides. SUPER_ADMIN names a fee only when neither applies.
        PolicyFee policy = policyFee(request.feeSource(), request.propertyId(), total);
        long feeMinor;
        if (policy != null) {
            if (percentage != null || (amountMinor != null && amountMinor != policy.feeMinor())) {
                throw invalidFee("feeMinor", "The fee for this request is set by the cancellation policy: "
                        + policy.feeMinor());
            }
            feeMinor = policy.feeMinor();
        } else {
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
            if (percentage != null && (request.totalMinor() == null || request.totalMinor() < 0)) {
                throw invalidFee("percentage", "Reservation total is required for percentage fees");
            }
            feeMinor = percentage == null ? amountMinor : BigDecimal.valueOf(total)
                    .multiply(percentage).movePointLeft(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
        }
        String feeSource = policy == null ? "STAFF" : policy.source();
        String feeType = policy != null ? policy.feeType() : percentage == null ? "FIXED_AMOUNT" : "PERCENT_OF_TOTAL";
        BigDecimal feePercent = policy != null ? policy.percent() : percentage;
        long paid = paidAmount(request.reservationId());
        jdbc.sql("""
                UPDATE reservation_cancellation_request
                   SET status = 'QUOTED', fee_amount_minor = :fee, fee_currency = :currency, fee_note = :note,
                       fee_source = :feeSource, fee_rule_id = :ruleId, fee_type = :feeType, fee_percent = :percent,
                       fee_base_minor = :base,
                       paid_amount_minor = :paid, refund_due_minor = :refundDue,
                       quoted_by = :actor, quoted_at = :at, updated_at = :at
                 WHERE id = :id AND status = 'PENDING_HOTEL_FEE'
                """)
                .param("fee", feeMinor).param("currency", request.currency())
                .param("note", note == null || note.isBlank() ? null : note.trim())
                .param("feeSource", feeSource).param("ruleId", policy == null ? null : policy.ruleId())
                .param("feeType", feeType)
                .param("percent", feePercent).param("base", total).param("paid", paid)
                .param("refundDue", Math.max(0, paid - feeMinor))
                .param("actor", actor.userId()).param("at", quotedAt).param("id", requestId).update();
        Map<String, Object> feeDetails = new HashMap<>();
        feeDetails.put("status", QUOTED);
        feeDetails.put("feeMinor", feeMinor);
        feeDetails.put("currency", request.currency());
        feeDetails.put("feeType", percentage == null ? "AMOUNT" : "PERCENTAGE");
        feeDetails.put("feeSource", feeSource);
        if (percentage != null) {
            feeDetails.put("percentage", percentage);
            feeDetails.put("baseTotalMinor", total);
        }
        record(actor, "reservation.cancellation_fee_quoted", request.reservationId(),
                Map.of("cancellationRequestId", requestId, "status", PENDING), feeDetails);
        return new CancellationResult(reference, QUOTED, requestId, feeMinor, request.currency(), false,
                Math.max(0, paid - feeMinor), paid, null, null);
    }

    /**
     * SUPER_ADMIN refunded outside KAS and records it. Repeating the same record is a no-op;
     * a request already decided otherwise is refused.
     */
    @Transactional
    public RefundView recordRefund(UUID requestId, long amountMinor, OffsetDateTime refundedAt,
                                   String reference, String note, ResolvedActor actor) {
        if (amountMinor < 0) throw invalidFee("refundAmountMinor", "The refunded amount cannot be negative");
        RefundRow row = lockRefund(requestId, actor.scope())
                .orElseThrow(() -> NotFoundException.outOfScope("Cancellation request"));
        if ("REFUNDED".equals(row.status())) return refundView(requestId, actor.scope());
        if (!REFUND_PENDING.equals(row.status())) {
            throw ConflictException.illegalTransition("cancellationRequest", row.status(), "REFUNDED");
        }
        if (row.paidMinor() != null && amountMinor > row.paidMinor()) {
            throw invalidFee("refundAmountMinor", "The refund cannot exceed the amount paid");
        }
        OffsetDateTime at = OffsetDateTime.now(clock);
        jdbc.sql("""
                UPDATE reservation_cancellation_request
                   SET status = 'REFUNDED', refund_amount_minor = :amount, refunded_at = :refundedAt,
                       refund_reference = :ref, refund_note = :note,
                       refund_decided_by = :actor, refund_decided_at = :at, updated_at = :at
                 WHERE id = :id AND status = 'REFUND_PENDING'
                """).param("amount", amountMinor).param("refundedAt", refundedAt == null ? at : refundedAt)
                .param("ref", blankToNull(reference)).param("note", blankToNull(note))
                .param("actor", actor.userId()).param("at", at).param("id", requestId).update();
        record(actor, "reservation.refund_recorded", row.reservationId(),
                Map.of("cancellationRequestId", requestId, "status", REFUND_PENDING, "refundDueMinor", row.refundDueMinor()),
                Map.of("status", "REFUNDED", "refundAmountMinor", amountMinor));
        return refundView(requestId, actor.scope());
    }

    /** SUPER_ADMIN cannot or will not refund now; the reason is kept and the guest told. */
    @Transactional
    public RefundView rejectRefund(UUID requestId, String reason, ResolvedActor actor) {
        if (reason == null || reason.isBlank()) throw invalidFee("reason", "A reason is required");
        RefundRow row = lockRefund(requestId, actor.scope())
                .orElseThrow(() -> NotFoundException.outOfScope("Cancellation request"));
        if ("REFUND_REJECTED".equals(row.status())) return refundView(requestId, actor.scope());
        if (!REFUND_PENDING.equals(row.status())) {
            throw ConflictException.illegalTransition("cancellationRequest", row.status(), "REFUND_REJECTED");
        }
        OffsetDateTime at = OffsetDateTime.now(clock);
        jdbc.sql("""
                UPDATE reservation_cancellation_request
                   SET status = 'REFUND_REJECTED', refund_note = :note,
                       refund_decided_by = :actor, refund_decided_at = :at, updated_at = :at
                 WHERE id = :id AND status = 'REFUND_PENDING'
                """).param("note", reason.trim()).param("actor", actor.userId()).param("at", at)
                .param("id", requestId).update();
        record(actor, "reservation.refund_rejected", row.reservationId(),
                Map.of("cancellationRequestId", requestId, "status", REFUND_PENDING),
                Map.of("status", "REFUND_REJECTED"));
        return refundView(requestId, actor.scope());
    }

    /** Requests waiting for SUPER_ADMIN: a fee to quote, or a refund to make. */
    public List<PendingCancellation> pendingHotelQuotes(AuthorizationScope scope) {
        return queue(scope, "cr.status = 'PENDING_HOTEL_FEE'");
    }

    public List<PendingCancellation> refundQueue(AuthorizationScope scope) {
        return queue(scope, "cr.status IN ('REFUND_PENDING', 'REFUNDED', 'REFUND_REJECTED')");
    }

    public RefundView refundView(UUID requestId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(requestId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                SELECT cr.id, r.reference, cr.status::text AS status, r.currency, cr.paid_amount_minor,
                       cr.fee_amount_minor, cr.refund_due_minor, cr.refund_amount_minor, cr.refund_reference,
                       cr.refund_note, cr.refunded_at, cr.refund_decided_at
                  FROM reservation_cancellation_request cr
                  JOIN reservation r ON r.id = cr.reservation_id
                  JOIN property p ON p.id = r.property_id
                 WHERE cr.id = ? AND %s
                """.formatted(filter.sql())).params(params)
                .query((rs, n) -> new RefundView(rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getString("status"), rs.getString("currency"), rs.getObject("paid_amount_minor", Long.class),
                        rs.getObject("fee_amount_minor", Long.class), rs.getObject("refund_due_minor", Long.class),
                        rs.getObject("refund_amount_minor", Long.class), rs.getString("refund_reference"),
                        rs.getString("refund_note"), rs.getObject("refunded_at", OffsetDateTime.class),
                        rs.getObject("refund_decided_at", OffsetDateTime.class)))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Cancellation request"));
    }

    /** Expires due requests even when no guest or operator opens them. */
    public int expireDueRequests() {
        return expiry.expireDueRequests(OffsetDateTime.now(clock));
    }

    // ================================================================ internals

    private List<PendingCancellation> queue(AuthorizationScope scope, String where) {
        expiry.expireDueRequests(OffsetDateTime.now(clock));
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>(filter.parameters());
        return jdbc.sql("""
                SELECT cr.id, r.reference, p.slug AS property_slug, pt.name AS property_name,
                       r.guest_name, r.check_in, r.check_out, cr.created_at, r.currency, r.total_minor,
                       cr.status::text AS status, cr.free_policy, cr.free_until, cr.fee_amount_minor,
                       cr.fee_source, cr.paid_amount_minor, cr.refund_due_minor, cr.refund_amount_minor,
                       cr.refund_reference, cr.refund_note, cr.refunded_at, cr.customer_decided_at, r.property_id,
                       (SELECT pm.external_reference FROM payment pm
                         WHERE pm.reservation_id = r.id AND pm.status = 'VERIFIED' LIMIT 1) AS payment_reference
                  FROM reservation_cancellation_request cr
                  JOIN reservation r ON r.id = cr.reservation_id
                  JOIN property p ON p.id = r.property_id
                  LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                 WHERE %s AND %s
                 ORDER BY (cr.status IN ('PENDING_HOTEL_FEE', 'REFUND_PENDING')) DESC, cr.updated_at DESC, cr.id
                 LIMIT 300
                """.formatted(where, filter.sql())).params(params)
                .query((rs, row) -> {
                    Long totalMinor = (Long) rs.getObject("total_minor");
                    // Only a request still waiting for its fee has a policy fee to show.
                    PolicyFee policy = PENDING.equals(rs.getString("status"))
                            ? policyFee(rs.getString("fee_source"), rs.getObject("property_id", UUID.class),
                                    totalMinor == null ? 0 : totalMinor)
                            : null;
                    return new PendingCancellation(
                        rs.getObject("id", UUID.class), rs.getString("reference"),
                        rs.getString("property_slug"), rs.getString("property_name"),
                        rs.getString("guest_name"), rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getString("currency"),
                        (Long) rs.getObject("total_minor"), rs.getString("status"), rs.getString("free_policy"),
                        rs.getObject("free_until", OffsetDateTime.class), (Long) rs.getObject("fee_amount_minor"),
                        rs.getString("fee_source"), (Long) rs.getObject("paid_amount_minor"),
                        (Long) rs.getObject("refund_due_minor"), (Long) rs.getObject("refund_amount_minor"),
                        rs.getString("refund_reference"), rs.getString("refund_note"),
                        rs.getObject("refunded_at", OffsetDateTime.class),
                        rs.getObject("customer_decided_at", OffsetDateTime.class), rs.getString("payment_reference"),
                        policy == null ? null : policy.feeMinor(), policy == null ? null : policy.source(),
                        policy == null ? null : policy.feeType(), policy == null ? null : policy.percent());
                })
                .list();
    }

    private UUID insertRequest(StayRow stay, UUID customerId, String via, CancellationTerms t, String status,
                               String feeSource, OffsetDateTime at) {
        UUID id = UUID.randomUUID();
        boolean feeKnown = QUOTED.equals(status) || REFUND_PENDING.equals(status);
        jdbc.sql("""
                INSERT INTO reservation_cancellation_request
                    (id, reservation_id, customer_id, status, requested_via, free_policy, free_until,
                     fee_source, fee_rule_id, fee_type, fee_percent, fee_base_minor,
                     fee_amount_minor, fee_currency, quoted_at, paid_amount_minor, refund_due_minor,
                     customer_decided_at, created_at, updated_at)
                VALUES (:id, :reservation, :customer, CAST(:status AS cancellation_request_status), :via, :policy,
                        :freeUntil, :feeSource, :ruleId, :feeType, :percent, :base,
                        :fee, :currency, :quotedAt, :paid, :refundDue, :decidedAt, :at, :at)
                """)
                .param("id", id).param("reservation", stay.id()).param("customer", customerId)
                .param("status", status).param("via", via).param("policy", t.policy()).param("freeUntil", t.freeUntil())
                .param("feeSource", feeSource).param("ruleId", t.feeRuleId())
                .param("feeType", feeKnown ? (t.feeType() == null ? "NONE" : t.feeType()) : null)
                .param("percent", t.feePercent()).param("base", feeKnown ? t.totalMinor() : null)
                .param("fee", feeKnown ? t.feeMinor() : null).param("currency", feeKnown ? stay.currency() : null)
                .param("quotedAt", feeKnown ? at : null).param("paid", t.paidMinor())
                .param("refundDue", feeKnown ? t.refundDueMinor() : null)
                .param("decidedAt", REFUND_PENDING.equals(status) ? at : null).param("at", at).update();
        return id;
    }

    /**
     * The fee the policy sets for a waiting request, or null when no policy applies and
     * SUPER_ADMIN decides. A request opened inside the free window ({@code FREE_WINDOW}, a paid
     * booking under review) is free whatever rules exist; otherwise the active fee rule of the hotel.
     */
    private PolicyFee policyFee(String feeSource, UUID propertyId, long totalMinor) {
        if ("FREE_WINDOW".equals(feeSource)) return new PolicyFee("FREE_WINDOW", 0, null, "NONE", null);
        return feeRules.activeFor(propertyId)
                .map(rule -> new PolicyFee("RULE", CancellationFeeRuleService.fee(rule, totalMinor).feeMinor(),
                        rule.id(), rule.feeType(), rule.percent()))
                .orElse(null);
    }

    private record PolicyFee(String source, long feeMinor, UUID ruleId, String feeType, BigDecimal percent) { }

    /** What the guest actually paid: VERIFIED payments, net of reversals (V50: at most one verified). */
    long paidAmount(UUID reservationId) {
        return jdbc.sql("""
                SELECT COALESCE(sum(amount_minor), 0) FROM payment
                 WHERE reservation_id = :id AND status = 'VERIFIED'
                """).param("id", reservationId).query(Long.class).single();
    }

    private static KasException invalidFee(String field, String message) {
        return new KasException(ApiErrorCode.VALIDATION_FAILED, message,
                List.of(new KasException.ErrorDetail(field, "INVALID", message)));
    }

    private String latestRequestStatus(UUID reservationId) {
        return jdbc.sql("""
                SELECT status::text FROM reservation_cancellation_request
                 WHERE reservation_id = :reservation ORDER BY created_at DESC, id DESC LIMIT 1
                """).param("reservation", reservationId).query(String.class).optional().orElse("NONE");
    }

    private String latestStatus(UUID requestId) {
        return jdbc.sql("SELECT status::text FROM reservation_cancellation_request WHERE id = :id")
                .param("id", requestId).query(String.class).optional().orElse("NONE");
    }

    private UUID requireCustomer(ResolvedActor actor) {
        if (!actor.roles().contains(com.kas.platform.identity.UserRole.CUSTOMER)) {
            throw new org.springframework.security.access.AccessDeniedException("A customer account is required.");
        }
        return jdbc.sql("SELECT id FROM customer WHERE user_id = :user AND merged_into_id IS NULL")
                .param("user", actor.userId()).query(UUID.class).optional()
                .orElseThrow(() -> NotFoundException.outOfScope("Customer"));
    }

    private static final String STAY_SELECT = """
            SELECT r.id, r.reference, r.customer_id, r.property_id,
                   r.sales_status::text AS sales_status, r.stay_status::text AS stay_status,
                   r.check_in, r.currency, r.total_minor, p.check_in_time,
                   COALESCE(ls.member_eligible_at_booking, false) AS member_at_booking
              FROM reservation r
              JOIN property p ON p.id = r.property_id
              LEFT JOIN reservation_loyalty_snapshot ls ON ls.reservation_id = r.id
            """;

    private Optional<StayRow> lockOwnedStay(String reference, UUID userId) {
        return jdbc.sql(STAY_SELECT + """
                 JOIN customer c ON c.id = r.customer_id
                WHERE r.reference = :reference AND c.user_id = :userId AND c.merged_into_id IS NULL
                FOR UPDATE OF r
                """).param("reference", reference).param("userId", userId).query(this::stayRow).optional();
    }

    private Optional<StayRow> lockStay(UUID reservationId) {
        return jdbc.sql(STAY_SELECT + " WHERE r.id = :id FOR UPDATE OF r")
                .param("id", reservationId).query(this::stayRow).optional();
    }

    private StayRow stayRow(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new StayRow(rs.getObject("id", UUID.class), rs.getString("reference"),
                rs.getObject("customer_id", UUID.class), rs.getObject("property_id", UUID.class),
                rs.getString("sales_status"), rs.getString("stay_status"),
                rs.getObject("check_in", LocalDate.class), rs.getString("currency"),
                rs.getBoolean("member_at_booking"), rs.getObject("check_in_time", LocalTime.class),
                (Long) rs.getObject("total_minor"));
    }

    /**
     * Null when the booking can still be cancelled. Online cancellation closes at 12:00 on the
     * check-in day for everyone; only a pending or confirmed, not yet started stay qualifies.
     */
    String cancellableProblem(StayRow stay, OffsetDateTime at) {
        LocalDateTime localNow = at.atZoneSameInstant(HOTEL_ZONE).toLocalDateTime();
        if (!localNow.isBefore(stay.checkIn().atTime(LocalTime.NOON))) return "CANCELLATION_WINDOW_EXPIRED";
        boolean pending = stay.salesStatus() != null
                // ALTERNATIVE_OFFERED is terminal since 2026-11-07: that request already ended.
                && List.of("REQUESTED", "ASSIGNED", "AVAILABILITY_CHECK", "CUSTOMER_CONTACTED", "PAYMENT_PENDING")
                        .contains(stay.salesStatus())
                && stay.stayStatus() == null;
        boolean confirmed = "WON".equals(stay.salesStatus())
                && List.of("CONFIRMED", "CHECK_IN_READY").contains(stay.stayStatus());
        return pending || confirmed ? null : stay.currentStatus();
    }

    private CancellationRequest openRequest(UUID reservationId, boolean lock) {
        return jdbc.sql("""
                SELECT id, status::text AS status, fee_amount_minor, fee_currency
                  FROM reservation_cancellation_request
                 WHERE reservation_id = :reservation AND status IN ('PENDING_HOTEL_FEE', 'QUOTED')
                 ORDER BY created_at DESC, id DESC LIMIT 1
                """ + (lock ? " FOR UPDATE" : ""))
                .param("reservation", reservationId)
                .query((rs, row) -> new CancellationRequest(rs.getObject("id", UUID.class), rs.getString("status"),
                        (Long) rs.getObject("fee_amount_minor"), rs.getString("fee_currency")))
                .optional().orElse(null);
    }

    private Optional<ScopedRequest> lockScopedRequest(String reference, UUID requestId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(reference);
        params.addAll(filter.parameters());
        UUID reservationId = jdbc.sql("""
                SELECT r.id FROM reservation r JOIN property p ON p.id = r.property_id
                 WHERE r.reference = ? AND %s FOR UPDATE OF r
                """.formatted(filter.sql())).params(params).query(UUID.class).optional().orElse(null);
        if (reservationId == null) return Optional.empty();
        return jdbc.sql("""
                SELECT cr.id, cr.reservation_id, cr.status::text AS status, r.currency, r.check_in, r.total_minor,
                       cr.fee_source, r.property_id
                  FROM reservation_cancellation_request cr JOIN reservation r ON r.id = cr.reservation_id
                 WHERE cr.id = :requestId AND cr.reservation_id = :reservationId
                 FOR UPDATE OF cr
                """).param("requestId", requestId).param("reservationId", reservationId)
                .query((rs, row) -> new ScopedRequest(rs.getObject("id", UUID.class),
                        rs.getObject("reservation_id", UUID.class), rs.getString("status"),
                        rs.getString("currency"), rs.getObject("check_in", LocalDate.class),
                        (Long) rs.getObject("total_minor"), rs.getString("fee_source"),
                        rs.getObject("property_id", UUID.class)))
                .optional();
    }

    private Optional<RefundRow> lockRefund(UUID requestId, AuthorizationScope scope) {
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        List<Object> params = new ArrayList<>();
        params.add(requestId);
        params.addAll(filter.parameters());
        return jdbc.sql("""
                SELECT cr.id, cr.reservation_id, cr.status::text AS status, cr.paid_amount_minor, cr.refund_due_minor
                  FROM reservation_cancellation_request cr
                  JOIN reservation r ON r.id = cr.reservation_id
                  JOIN property p ON p.id = r.property_id
                 WHERE cr.id = ? AND %s
                 FOR UPDATE OF cr
                """.formatted(filter.sql())).params(params)
                .query((rs, n) -> new RefundRow(rs.getObject("id", UUID.class), rs.getObject("reservation_id", UUID.class),
                        rs.getString("status"), (Long) rs.getObject("paid_amount_minor"),
                        (Long) rs.getObject("refund_due_minor")))
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
                    """).param("id", stay.id()).param("fromStatus", stay.salesStatus())
                    .param("reason", reason).param("at", at).update();
            insertHistory(stay.id(), "SALES", stay.salesStatus(), "CANCELLED", actorId, reason);
        } else {
            jdbc.sql("""
                    UPDATE reservation
                       SET stay_status = 'CANCELLED', cancelled_at = :at,
                           cancellation_reason = :reason, updated_at = :at, version = version + 1
                     WHERE id = :id AND sales_status = 'WON' AND stay_status = CAST(:fromStatus AS stay_status)
                    """).param("id", stay.id()).param("fromStatus", stay.stayStatus())
                    .param("reason", reason).param("at", at).update();
            insertHistory(stay.id(), "STAY", stay.stayStatus(), "CANCELLED", actorId, reason);
        }
        // Unpaid: the voucher use it held is free again (V65). A paid booking keeps its redemption.
        if (paidAmount(stay.id()) == 0) voucherHolds.release(stay.id(), "BOOKING_CANCELLED");
        // Any open email links for this booking are void now.
        jdbc.sql("""
                UPDATE reservation_email_action_token SET invalidated_at = now()
                 WHERE reservation_id = :id AND used_at IS NULL AND invalidated_at IS NULL
                """).param("id", stay.id()).update();
    }

    private void insertHistory(UUID reservationId, String field, String from, String to, UUID actorId, String reason) {
        jdbc.sql("""
                INSERT INTO reservation_status_history
                    (reservation_id, field, from_status, to_status, actor_id, actor_type, reason, note, created_at)
                VALUES (:reservation, CAST(:field AS status_field), :fromStatus, :toStatus, :actor, 'CUSTOMER',
                        :reason, 'Customer cancellation workflow.', clock_timestamp())
                """).param("reservation", reservationId).param("field", field)
                .param("fromStatus", from).param("toStatus", to).param("actor", actorId)
                .param("reason", reason).update();
    }

    private CancellationResult result(StayRow stay, String status, Long feeMinor, String currency, UUID requestId,
                                      CancellationTerms t) {
        boolean cancelled = "CANCELLED".equals(status) || REFUND_PENDING.equals(status);
        return new CancellationResult(stay.reference(), status, requestId, feeMinor,
                currency == null ? stay.currency() : currency, cancelled,
                t == null ? null : t.refundDueMinor(), t == null ? null : t.paidMinor(),
                t == null ? null : t.freeUntil(), t == null ? null : t.policy());
    }

    private void record(ResolvedActor actor, String action, UUID reservationId,
                        Map<String, Object> before, Map<String, Object> after) {
        // A guest acting through a one-time email link has no account: no actor, no role
        // (audit_log.actor_role is the user_role enum); the source is written into the event.
        String role = actor == null ? null
                : actor.roles().contains(com.kas.platform.identity.UserRole.SUPER_ADMIN) ? "SUPER_ADMIN"
                : actor.roles().contains(com.kas.platform.identity.UserRole.ADMIN) ? "ADMIN" : "CUSTOMER";
        Map<String, Object> afterWithSource = after;
        if (actor == null && after != null) {
            afterWithSource = new HashMap<>(after);
            afterWithSource.put("via", "EMAIL_LINK");
        }
        audit.record(new AuditEvent(actor == null ? null : actor.userId(), role, action, "reservation",
                reservationId, before, afterWithSource, null, null, null, CorrelationId.current(),
                actor == null ? "OWN" : actor.scope().toString()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    // ================================================================ views

    /** What cancelling now would mean (see {@link #terms}). Amounts in minor units of {@code currency}. */
    public record CancellationTerms(String reference, String policy, OffsetDateTime freeUntil, boolean withinFreeWindow,
                                    String outcome, long paidMinor, long totalMinor, UUID feeRuleId, String feeType,
                                    BigDecimal feePercent, long feeMinor, long refundDueMinor, String currency,
                                    UUID openRequestId, String openRequestStatus, String notCancellableReason) { }

    public record CancellationResult(String reference, String status, UUID requestId, Long feeMinor, String currency,
                                     boolean cancelled, Long refundDueMinor, Long paidMinor,
                                     OffsetDateTime freeUntil, String policy) {
        /** The pre-2026-11-10 shape. */
        public CancellationResult(String reference, String status, UUID requestId, Long feeMinor, String currency,
                                  boolean cancelled) {
            this(reference, status, requestId, feeMinor, currency, cancelled, null, null, null, null);
        }
    }

    public record PendingCancellation(UUID requestId, String reference, String propertySlug, String propertyName,
                                      String guestName, LocalDate checkIn, LocalDate checkOut,
                                      OffsetDateTime requestedAt, String currency, Long totalMinor, String status,
                                      String freePolicy, OffsetDateTime freeUntil, Long feeMinor, String feeSource,
                                      Long paidMinor, Long refundDueMinor, Long refundAmountMinor,
                                      String refundReference, String refundNote, OffsetDateTime refundedAt,
                                      OffsetDateTime confirmedAt, String paymentReference,
                                      /**
                                       * For a request waiting for its fee: what the policy sets (2026-11-14).
                                       * {@code policyFeeBasis} is FREE_WINDOW (fee 0) or RULE (the configured
                                       * fee rule); all four are null when no policy applies and SUPER_ADMIN
                                       * names the fee.
                                       */
                                      Long policyFeeMinor, String policyFeeBasis, String policyFeeType,
                                      BigDecimal policyFeePercent) { }

    public record RefundView(UUID requestId, String reference, String status, String currency, Long paidMinor,
                             Long feeMinor, Long refundDueMinor, Long refundAmountMinor, String refundReference,
                             String refundNote, OffsetDateTime refundedAt, OffsetDateTime decidedAt) { }

    record StayRow(UUID id, String reference, UUID customerId, UUID propertyId, String salesStatus,
                   String stayStatus, LocalDate checkIn, String currency, boolean memberAtBooking,
                   LocalTime checkInTime, Long totalMinor) {
        String currentStatus() { return stayStatus == null ? salesStatus : stayStatus; }
        LocalTime checkInTimeOrFail() {
            if (checkInTime == null) throw new MissingConfigurationException("property.check_in_time");
            return checkInTime;
        }
    }

    private record CancellationRequest(UUID id, String status, Long feeMinor, String currency) { }
    private record ScopedRequest(UUID id, UUID reservationId, String status, String currency,
                                 LocalDate checkIn, Long totalMinor, String feeSource, UUID propertyId) { }
    private record RefundRow(UUID id, UUID reservationId, String status, Long paidMinor, Long refundDueMinor) { }
}
