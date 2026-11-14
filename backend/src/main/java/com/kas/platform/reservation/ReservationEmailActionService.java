package com.kas.platform.reservation;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** State changes initiated through expiring, single-use email action links. */
@Service
public class ReservationEmailActionService {
    private final JdbcClient jdbc;
    private final ReservationEmailActionTokenService tokens;
    private final com.kas.platform.settings.SystemSettingService settings;
    private final VoucherHoldService voucherHolds;
    private final com.kas.platform.customer.LoyaltyPointsService loyaltyPoints;
    private final Duration paymentWindow;
    private final Duration sameDayPaymentWindow;
    private final SePayProperties sePay;

    public ReservationEmailActionService(JdbcClient jdbc, ReservationEmailActionTokenService tokens,
                                         com.kas.platform.settings.SystemSettingService settings,
                                         VoucherHoldService voucherHolds,
                                         com.kas.platform.customer.LoyaltyPointsService loyaltyPoints,
                                         @org.springframework.beans.factory.annotation.Value("${kas.booking.payment-window:PT24H}")
                                         Duration paymentWindow,
                                         @org.springframework.beans.factory.annotation.Value("${kas.booking.same-day-payment-window:PT2H}")
                                         Duration sameDayPaymentWindow,
                                         SePayProperties sePay) {
        this.jdbc = jdbc;
        this.tokens = tokens;
        this.settings = settings;
        this.voucherHolds = voucherHolds;
        this.loyaltyPoints = loyaltyPoints;
        this.paymentWindow = paymentWindow;
        this.sameDayPaymentWindow = sameDayPaymentWindow;
        this.sePay = sePay;
    }

    /*
     * Owner 2026-11-14: SePay is the only way to pay and the only thing that confirms a payment.
     * The manual paths are gone: the static QR / bank transfer, the guest's "I have made the
     * transfer" report, the hotel's email link and the console's "payment received" button.
     * A booking becomes WON only through confirmPaymentByGateway (SePay IPN, or the order-API
     * poll in SePayPaymentPoller when an IPN is late or cannot reach the server).
     */

    /** The booking's payment deadline (V66); empty when none was set (approved before V66). */
    @Transactional(readOnly = true)
    public Optional<OffsetDateTime> paymentDueAt(UUID reservationId) {
        return jdbc.sql("SELECT payment_due_at FROM reservation WHERE id = :id")
                .param("id", reservationId)
                .query((rs, n) -> Optional.ofNullable(rs.getObject("payment_due_at", OffsetDateTime.class)))
                .optional().flatMap(due -> due);
    }

    /** True while the booking waits for payment and its deadline, if any, has not passed. */
    public static boolean payable(String salesStatus, Optional<OffsetDateTime> dueAt, OffsetDateTime now) {
        return "PAYMENT_PENDING".equals(salesStatus) && dueAt.map(now::isBefore).orElse(true);
    }

    @Transactional(readOnly = true)
    public EmailActionView preview(String rawToken) {
        return find(rawToken, false);
    }

    /**
     * Uses a GUEST_CANCEL link once: the reservation it was issued for. The token is the
     * authority (256-bit, expiring, single-use, emailed to the booking's own address), so a
     * guessed booking reference is worth nothing.
     */
    @Transactional
    public UUID consumeGuestCancel(String rawToken) {
        EmailActionView action = find(rawToken, true);
        if (!"GUEST_CANCEL".equals(action.action())) {
            throw new IllegalArgumentException("Not a cancellation link");
        }
        consume(rawToken);
        return action.reservationId();
    }

    @Transactional
    public PaymentRequest approveAndSendQr(String rawToken) {
        EmailActionView action = find(rawToken, true);
        if (!"REVIEW".equals(action.action()) || !manualReviewable(action.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", action.salesStatus(), "PAYMENT_PENDING");
        }
        PaymentRequest request = applyApproval(action, "SYSTEM", null,
                "Hotel approved availability; the SePay payment link was sent by email.");
        consume(rawToken);
        return request;
    }

    // ------------------------------------------------- signed-in staff actions
    //
    // The two hotel decisions the email links make, for staff working in the
    // console. The caller (SalesRequestService) has already locked the
    // reservation inside the actor's scope. Each one retires the matching email
    // link, so a decision cannot be made twice through the other door.
    // (Confirming a payment is not a staff decision: only SePay does it.)

    /** Staff confirm availability: PAYMENT_PENDING, and the guest is sent the SePay payment link. */
    @Transactional
    public PaymentRequest approveForStaff(UUID reservationId, UUID actorId) {
        EmailActionView action = viewOf(reservationId);
        if (!manualReviewable(action.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", action.salesStatus(), "PAYMENT_PENDING");
        }
        PaymentRequest request = applyApproval(action, "ADMIN", actorId,
                "Hotel staff approved availability; the SePay payment link was sent.");
        invalidateTokens(reservationId, "REVIEW");
        return request;
    }

    /**
     * Staff propose another stay: the offer is stored, the guest is emailed, and the
     * request ends as ALTERNATIVE_OFFERED (terminal). The guest sends a new request on the
     * website if they want the suggested stay; nothing is held or created here.
     */
    @Transactional
    public AlternativeProposal proposeForStaff(UUID reservationId, UUID actorId, AlternativeOfferInput input) {
        EmailActionView action = viewOf(reservationId);
        if (!manualReviewable(action.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", action.salesStatus(), "ALTERNATIVE_OFFERED");
        }
        AlternativeProposal proposal = applyProposal(action, input, "ADMIN", actorId,
                "Hotel staff proposed an alternative stay.");
        invalidateTokens(reservationId, "REVIEW");
        return proposal;
    }

    /** What a gateway notification did to the booking it names. */
    public enum GatewayMatch { CONFIRMED, NO_BOOKING, NOT_PENDING, AMOUNT_MISMATCH, ALREADY_PAID }

    public record GatewayResult(GatewayMatch match, UUID reservationId, EmailActionView booking) {}

    /**
     * SePay reported a captured payment for {@code reference}. The stay is confirmed only
     * when the booking is waiting for payment and the paid amount and currency equal the
     * booking total; anything else changes nothing and is left for SUPER_ADMIN.
     */
    @Transactional
    public GatewayResult confirmPaymentByGateway(String reference, long amountMinor, String currency,
                                                 String gatewayReference, String paymentMethod) {
        UUID reservationId = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref")
                .param("ref", reference).query(UUID.class).optional().orElse(null);
        if (reservationId == null) return new GatewayResult(GatewayMatch.NO_BOOKING, null, null);
        EmailActionView action = viewOf(reservationId);
        if (!"PAYMENT_PENDING".equals(action.salesStatus())) {
            boolean paid = jdbc.sql("SELECT count(*) FROM payment WHERE reservation_id = :id AND status = 'VERIFIED'")
                    .param("id", reservationId).query(Long.class).single() > 0;
            return new GatewayResult(paid ? GatewayMatch.ALREADY_PAID : GatewayMatch.NOT_PENDING, reservationId, action);
        }
        if (action.totalMinor() == null || action.totalMinor() != amountMinor
                || !String.valueOf(action.currency()).equalsIgnoreCase(currency)) {
            return new GatewayResult(GatewayMatch.AMOUNT_MISMATCH, reservationId, action);
        }
        applyPaymentConfirmation(action, "SYSTEM", null,
                "Paid through the SePay payment gateway.",
                "SePay reported the payment; reservation confirmed.", gatewayReference,
                "CARD".equalsIgnoreCase(paymentMethod) ? "CARD" : "QR");
        invalidateTokens(reservationId, "GUEST_MARK_PAID");
        invalidateTokens(reservationId, "HOTEL_CONFIRM_PAYMENT");
        return new GatewayResult(GatewayMatch.CONFIRMED, reservationId, action);
    }

    private PaymentRequest applyApproval(EmailActionView action, String actorType, UUID actorId, String note) {
        jdbc.sql("SELECT id FROM reservation WHERE id = :reservationId FOR UPDATE")
                .param("reservationId", action.reservationId()).query(UUID.class).single();
        // SePay is the only way to pay (owner 2026-11-14): it makes the bank QR for every order
        // and reports the result. Without it there is nothing to send the guest.
        if (!sePay.checkoutEnabled()) {
            throw new BusinessRuleException(ApiErrorCode.CONFIG_MISSING,
                    "The SePay payment gateway is not configured (KAS_SEPAY_MERCHANT_ID / KAS_SEPAY_SECRET_KEY).");
        }
        // V66: the payment deadline — 24h, 2h for a stay starting today, never past check-in.
        OffsetDateTime now = OffsetDateTime.now(PaymentDeadline.HOTEL_ZONE);
        LocalTime checkInTime = jdbc.sql("SELECT check_in_time FROM property WHERE slug = :slug")
                .param("slug", action.propertySlug())
                .query((rs, n) -> Optional.ofNullable(rs.getObject("check_in_time", LocalTime.class)))
                .optional().flatMap(time -> time).orElse(null);
        OffsetDateTime dueAt = PaymentDeadline.dueAt(now, action.checkIn(), checkInTime,
                paymentWindow, sameDayPaymentWindow);
        jdbc.sql("""
                UPDATE reservation SET sales_status = 'PAYMENT_PENDING',
                       payment_qr_url_snapshot = NULL,
                       payment_instructions_snapshot = NULL,
                       payment_requested_at = now(), payment_due_at = :dueAt, updated_at = now()
                 WHERE id = :reservationId AND sales_status = CAST(:fromStatus AS sales_status)
                """)
                .param("dueAt", dueAt)
                .param("reservationId", action.reservationId())
                .param("fromStatus", action.salesStatus()).update();
        history(action.reservationId(), action.salesStatus(), "PAYMENT_PENDING", actorType, actorId,
                note + " Payment due by " + PaymentDeadline.format(dueAt, false) + ".");
        // The guest's payment link lives exactly until the deadline.
        Duration linkLifetime = Duration.between(now, dueAt);
        String guestToken = tokens.issue(action.reservationId(), "GUEST_MARK_PAID", action.guestEmail(),
                linkLifetime.compareTo(Duration.ofMinutes(1)) < 0 ? Duration.ofMinutes(1) : linkLifetime);
        return new PaymentRequest(action, guestToken, dueAt);
    }

    @Transactional
    public AlternativeProposal proposeAlternative(String rawToken, AlternativeOfferInput input) {
        EmailActionView action = find(rawToken, true);
        if (!"REVIEW".equals(action.action()) || !manualReviewable(action.salesStatus())) {
            throw ConflictException.illegalTransition("salesStatus", action.salesStatus(), "ALTERNATIVE_OFFERED");
        }
        AlternativeProposal proposal = applyProposal(action, input, "SYSTEM", null,
                "Hotel proposed an alternative stay by email.");
        consume(rawToken);
        return proposal;
    }

    private AlternativeProposal applyProposal(EmailActionView action, AlternativeOfferInput input,
                                              String actorType, UUID actorId, String note) {
        if (!input.checkOut().isAfter(input.checkIn()) || input.quantity() < 1 || input.totalMinor() < 1) {
            throw new IllegalArgumentException("Alternative dates, quantity, and total must be valid.");
        }
        OfferRoom room = jdbc.sql("""
                SELECT p.id AS property_id, p.slug, p.email::text AS hotel_email,
                       coalesce(pt.name, p.slug) AS property_name,
                       rt.id AS room_type_id, rt.max_occupancy, rtt.name AS room_name
                  FROM property p JOIN room_type rt ON rt.property_id = p.id
                  LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                  LEFT JOIN room_type_translation rtt ON rtt.room_type_id = rt.id AND rtt.locale = 'vi'
                 WHERE p.slug = :propertySlug AND p.lifecycle_state = 'OPEN'
                   AND rt.slug = :roomTypeSlug AND rt.status = 'PUBLISHED'
                """).param("propertySlug", input.propertySlug()).param("roomTypeSlug", input.roomTypeSlug())
                .query((rs, n) -> new OfferRoom(rs.getObject("property_id", UUID.class),
                        rs.getString("slug"), rs.getString("property_name"),
                        rs.getObject("room_type_id", UUID.class), rs.getInt("max_occupancy"),
                        rs.getString("room_name"), rs.getString("hotel_email")))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Alternative room"));
        if ((long) action.adults() + action.children() > (long) room.maxOccupancy() * input.quantity()) {
            throw new IllegalArgumentException("The offered rooms do not fit the guest count.");
        }
        UUID offerId = UUID.randomUUID();
        long nights = ChronoUnit.DAYS.between(input.checkIn(), input.checkOut());
        String snapshot = "{\"manualQuote\":true,\"propertySlug\":\"" + escJson(room.slug())
                + "\",\"roomTypeSlug\":\"" + escJson(input.roomTypeSlug())
                + "\",\"checkIn\":\"" + input.checkIn() + "\",\"checkOut\":\"" + input.checkOut()
                + "\",\"quantity\":" + input.quantity() + ",\"totalMinor\":" + input.totalMinor() + "}";
        jdbc.sql("""
                INSERT INTO reservation_alternative_offer
                    (id, reservation_id, status, property_id, check_in, check_out, hotel_message,
                     currency, subtotal_minor, total_minor, price_snapshot, quote_expires_at, sent_at)
                VALUES (:id, :reservationId, 'SENT', :propertyId, :checkIn, :checkOut, :message,
                        :currency, :total, :total, CAST(:snapshot AS jsonb), now() + interval '3 days', now())
                """).param("id", offerId).param("reservationId", action.reservationId())
                .param("propertyId", room.propertyId()).param("checkIn", input.checkIn())
                .param("checkOut", input.checkOut()).param("message", input.message())
                .param("currency", action.currency()).param("total", input.totalMinor())
                .param("snapshot", snapshot).update();
        jdbc.sql("""
                INSERT INTO reservation_alternative_offer_line
                    (offer_id, room_type_id, quantity, room_type_name_snapshot, line_total_minor)
                VALUES (:offerId, :roomTypeId, :quantity, :roomName, :total)
                """).param("offerId", offerId).param("roomTypeId", room.roomTypeId())
                .param("quantity", input.quantity()).param("roomName", room.roomName() == null
                        ? input.roomTypeSlug() : room.roomName()).param("total", input.totalMinor()).update();
        jdbc.sql("UPDATE reservation SET sales_status = 'ALTERNATIVE_OFFERED', updated_at = now() WHERE id = :id")
                .param("id", action.reservationId()).update();
        history(action.reservationId(), action.salesStatus(), "ALTERNATIVE_OFFERED", actorType, actorId,
                note + " The original request is closed; the guest may send a new request on the website.");
        // No guest accept / reject tokens: the request ends here (owner decision 2026-11-07).
        // Nothing is held and no new request is created; any open action links are retired.
        invalidateOtherTokens(action.reservationId());
        return new AlternativeProposal(action, offerId, room.propertyName(), room.roomName(),
                input.checkIn(), input.checkOut(), input.quantity(), input.totalMinor(),
                input.message());
    }

    /*
     * Guest accept / reject of an alternative was retired on 2026-11-07 (owner decision):
     * proposing an alternative now ends the original request (ALTERNATIVE_OFFERED is
     * terminal) and a guest who wants the suggested stay sends a new request on the
     * website. Old email links answer an explanatory page and change nothing
     * (PublicReservationEmailActionController).
     */

    private void applyPaymentConfirmation(EmailActionView action, String actorType, UUID actorId,
                                          String paymentNote, String historyNote, String transactionReference,
                                          String method) {
        String reference = transactionReference == null || transactionReference.isBlank() ? null : transactionReference.trim();
        if (reference != null && reference.length() > 120) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "The transaction reference is too long.",
                    List.of(new KasException.ErrorDetail("transactionReference", "TOO_LONG", "At most 120 characters.")));
        }
        if (reference != null && isReferenceClash(reference, action.reservationId())) {
            throw ConflictException.paymentAlreadyVerified(true);
        }
        try {
            jdbc.sql("""
                    INSERT INTO payment (reservation_id, method, amount_minor, currency,
                                         received_at, status, notes, external_reference, recorded_by)
                    SELECT id, CAST(:method AS payment_method), total_minor, currency, now(), 'VERIFIED',
                           :note, :reference, :actor
                      FROM reservation WHERE id = :id AND sales_status = 'PAYMENT_PENDING'
                    """).param("id", action.reservationId()).param("note", paymentNote).param("method", method)
                    .param("reference", reference).param("actor", actorId).update();
        } catch (org.springframework.dao.DuplicateKeyException duplicate) {
            // V50: one VERIFIED payment per reservation, one bank transaction per payment.
            // The transaction is aborted here, so decide from the index the database named.
            throw ConflictException.paymentAlreadyVerified(String.valueOf(duplicate.getMessage())
                    .contains("payment_verified_external_reference_uniq"));
        }
        // V65: the payment is verified — the voucher use this booking held becomes the
        // redemption (once; a repeated IPN or confirmation finds the payment already VERIFIED above).
        voucherHolds.consume(action.reservationId());
        // The points the booking held are spent now (once per booking).
        loyaltyPoints.consume(action.reservationId());
        jdbc.sql("""
                UPDATE reservation SET sales_status = 'WON', stay_status = 'CONFIRMED',
                       won_at = now(), confirmed_at = now(), payment_verified_at = now(),
                       updated_at = now()
                 WHERE id = :id AND sales_status = 'PAYMENT_PENDING'
                """).param("id", action.reservationId()).update();
        history(action.reservationId(), "PAYMENT_PENDING", "WON", actorType, actorId, historyNote);
        jdbc.sql("""
                INSERT INTO reservation_status_history (reservation_id, field, from_status,
                        to_status, actor_id, actor_type, note, created_at)
                VALUES (:id, 'STAY', NULL, 'CONFIRMED', :actorId, CAST(:actorType AS actor_type),
                        'Stay confirmed after payment verification.', now())
                """).param("id", action.reservationId()).param("actorId", actorId)
                .param("actorType", actorType).update();
    }

    /** One SALES history row; {@code actorId} is null for an email-link (SYSTEM) action. */
    private void history(UUID reservationId, String fromStatus, String toStatus,
                         String actorType, UUID actorId, String note) {
        jdbc.sql("""
                INSERT INTO reservation_status_history (reservation_id, field, from_status,
                        to_status, actor_id, actor_type, note, created_at)
                VALUES (:id, 'SALES', :fromStatus, :toStatus, :actorId, CAST(:actorType AS actor_type),
                        :note, now())
                """).param("id", reservationId).param("fromStatus", fromStatus)
                .param("toStatus", toStatus).param("actorId", actorId)
                .param("actorType", actorType).param("note", note).update();
    }

    /** The decision context for a reservation the caller has already scope-checked and locked. */
    private EmailActionView viewOf(UUID reservationId) {
        return jdbc.sql("""
                SELECT r.id AS reservation_id, r.sales_status::text AS sales_status,
                       r.reference, r.guest_name, r.guest_email::text AS guest_email, r.guest_country,
                       r.check_in, r.check_out, r.total_minor, r.currency, r.adults, r.children,
                       p.email::text AS hotel_email, p.slug AS property_slug,
                       coalesce(pt.name, p.slug) AS property_name,
                       r.payment_qr_url_snapshot, r.payment_instructions_snapshot
                  FROM reservation r
                  JOIN property p ON p.id = r.property_id
                  LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                 WHERE r.id = :id
                   FOR UPDATE OF r
                """)
                .param("id", reservationId)
                .query((rs, n) -> new EmailActionView(
                        rs.getObject("reservation_id", UUID.class), "STAFF",
                        rs.getString("sales_status"), rs.getString("reference"),
                        rs.getString("guest_name"), rs.getString("guest_email"),
                        rs.getObject("check_in", LocalDate.class), rs.getObject("check_out", LocalDate.class),
                        (Long) rs.getObject("total_minor"), rs.getString("currency"),
                        rs.getString("hotel_email"), rs.getString("property_slug"),
                        rs.getString("property_name"), rs.getString("payment_qr_url_snapshot"),
                        rs.getString("payment_instructions_snapshot"),
                        null, null, null, null, null, null, null, null,
                        rs.getInt("adults"), rs.getInt("children"), rs.getString("guest_country")))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
    }

    /** Retires unused email links of one kind once staff made that decision in the console. */
    private void invalidateTokens(UUID reservationId, String action) {
        jdbc.sql("""
                UPDATE reservation_email_action_token SET invalidated_at = now()
                 WHERE reservation_id = :id AND action = CAST(:action AS reservation_email_action)
                   AND used_at IS NULL AND invalidated_at IS NULL
                """).param("id", reservationId).param("action", action).update();
    }

    private EmailActionView find(String rawToken, boolean lock) {
        String suffix = lock ? " FOR UPDATE OF t, r" : "";
        return jdbc.sql("""
                SELECT t.reservation_id, t.action::text AS action, r.sales_status::text AS sales_status,
                       r.reference, r.guest_name, r.guest_email::text AS guest_email, r.guest_country,
                       r.check_in, r.check_out, r.total_minor, r.currency, r.adults, r.children,
                       p.email::text AS hotel_email, p.slug AS property_slug,
                       coalesce(pt.name, p.slug) AS property_name,
                       r.payment_qr_url_snapshot, r.payment_instructions_snapshot,
                       offer.offer_id, offer.offer_property_name, offer.offer_room_name,
                       offer.offer_check_in, offer.offer_check_out, offer.offer_total_minor,
                       offer.hotel_message, offer.offer_quantity
                  FROM reservation_email_action_token t
                  JOIN reservation r ON r.id = t.reservation_id
                  JOIN property p ON p.id = r.property_id
                  LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                  LEFT JOIN LATERAL (
                    SELECT o.id AS offer_id, op.slug AS offer_property_slug,
                           coalesce(opt.name,op.slug) AS offer_property_name,
                           o.check_in AS offer_check_in, o.check_out AS offer_check_out,
                           o.total_minor AS offer_total_minor, o.hotel_message,
                           l.room_type_name_snapshot AS offer_room_name, l.quantity AS offer_quantity
                      FROM reservation_alternative_offer o
                      JOIN property op ON op.id=o.property_id
                      LEFT JOIN property_translation opt ON opt.property_id=op.id AND opt.locale='vi'
                      JOIN reservation_alternative_offer_line l ON l.offer_id=o.id
                     WHERE o.reservation_id=r.id AND o.status='SENT'
                     ORDER BY o.created_at DESC LIMIT 1
                  ) offer ON true
                 WHERE t.token_hash = :hash AND t.used_at IS NULL
                   AND t.invalidated_at IS NULL AND t.expires_at > now()
                """ + suffix)
                .param("hash", ReservationEmailActionTokenService.hash(rawToken))
                .query((rs, n) -> new EmailActionView(
                        rs.getObject("reservation_id", UUID.class), rs.getString("action"),
                        rs.getString("sales_status"), rs.getString("reference"),
                        rs.getString("guest_name"), rs.getString("guest_email"),
                        rs.getObject("check_in", java.time.LocalDate.class),
                        rs.getObject("check_out", java.time.LocalDate.class),
                        (Long) rs.getObject("total_minor"), rs.getString("currency"),
                        rs.getString("hotel_email"), rs.getString("property_slug"),
                        rs.getString("property_name"), rs.getString("payment_qr_url_snapshot"),
                        rs.getString("payment_instructions_snapshot"),
                        (UUID) rs.getObject("offer_id"), rs.getString("offer_property_name"),
                        rs.getString("offer_room_name"), rs.getObject("offer_check_in", LocalDate.class),
                        rs.getObject("offer_check_out", LocalDate.class), (Long) rs.getObject("offer_total_minor"),
                        rs.getString("hotel_message"), (Integer) rs.getObject("offer_quantity"),
                        rs.getInt("adults"), rs.getInt("children"), rs.getString("guest_country")))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Email action"));
    }

    private void consume(String rawToken) {
        int used = jdbc.sql("""
                UPDATE reservation_email_action_token SET used_at = now()
                 WHERE token_hash = :hash AND used_at IS NULL AND invalidated_at IS NULL
                   AND expires_at > now()
                """).param("hash", ReservationEmailActionTokenService.hash(rawToken)).update();
        if (used != 1) throw NotFoundException.outOfScope("Email action");
    }

    private void invalidateOtherTokens(UUID reservationId) {
        jdbc.sql("UPDATE reservation_email_action_token SET invalidated_at=now() WHERE reservation_id=:id AND used_at IS NULL AND invalidated_at IS NULL")
                .param("id", reservationId).update();
    }

    private static boolean manualReviewable(String status) {
        return java.util.Set.of("REQUESTED", "ASSIGNED", "AVAILABILITY_CHECK", "CUSTOMER_CONTACTED")
                .contains(status);
    }

    private static String escJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** True when another booking already holds this bank transaction as a verified payment. */
    private boolean isReferenceClash(String reference, UUID reservationId) {
        return jdbc.sql("SELECT count(*) FROM payment WHERE external_reference = :ref AND status = 'VERIFIED' AND reservation_id <> :id")
                .param("ref", reference).param("id", reservationId).query(Long.class).single() > 0;
    }

    public record EmailActionView(UUID reservationId, String action, String salesStatus,
                                  String reference, String guestName, String guestEmail,
                                  java.time.LocalDate checkIn, java.time.LocalDate checkOut,
                                  Long totalMinor, String currency, String hotelEmail,
                                  String propertySlug, String propertyName,
                                  String qrUrl, String paymentInstructions, UUID offerId,
                                  String offerPropertyName, String offerRoomName,
                                  LocalDate offerCheckIn, LocalDate offerCheckOut,
                                  Long offerTotalMinor, String offerMessage, Integer offerQuantity,
                                  int adults, int children, String guestCountry) {}

    /** The SePay payment link (guest token) and its deadline (V66), for the payment email. */
    public record PaymentRequest(EmailActionView booking, String guestToken,
                                 OffsetDateTime paymentDueAt) {}
    public record AlternativeOfferInput(String propertySlug, String roomTypeSlug,
                                        LocalDate checkIn, LocalDate checkOut, int quantity,
                                        long totalMinor, String message) {}
    public record AlternativeProposal(EmailActionView booking, UUID offerId,
                                      String propertyName, String roomName, LocalDate checkIn,
                                      LocalDate checkOut, int quantity, long totalMinor,
                                      String message) {}
    private record OfferRoom(UUID propertyId, String slug, String propertyName, UUID roomTypeId,
                             int maxOccupancy, String roomName, String hotelEmail) {}
}
