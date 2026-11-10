package com.kas.platform.reservation;

import com.kas.platform.reservation.api.RequestReceiptView;
import com.kas.platform.reservation.api.ReservationRequestBody;
import com.kas.platform.shared.EmailLanguage;
import com.kas.platform.shared.EmailOutboxService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Guest templates follow nationality; hotel operational messages remain Vietnamese. */
@Service
public class BookingNotificationService {
    private static final String HOTEL_EMAIL_MISSING = "HOTEL_EMAIL_MISSING";
    private final JdbcClient jdbc;
    private final ReservationEmailActionTokenService actionTokens;
    private final EmailOutboxService outbox;
    private final String actionBaseUrl;
    private final String siteBaseUrl;
    private final String operationsEmail;

    public BookingNotificationService(JdbcClient jdbc, ReservationEmailActionTokenService actionTokens,
            EmailOutboxService outbox,
            @Value("${kas.booking.action-base-url:http://127.0.0.1:8080}") String actionBaseUrl,
            @Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBaseUrl,
            @Value("${kas.booking.operations-email:}") String operationsEmail) {
        this.jdbc = jdbc;
        this.actionTokens = actionTokens;
        this.outbox = outbox;
        this.actionBaseUrl = actionBaseUrl.replaceAll("/+$", "");
        this.siteBaseUrl = siteBaseUrl.replaceAll("/+$", "");
        this.operationsEmail = operationsEmail;
    }

    public void bookingRequestReceived(ReservationRequestBody booking, RequestReceiptView receipt, String ignoredLocale) {
        String country = booking.guest().country();
        String lang = EmailLanguage.forCountry(country);
        String hotelName = propertyName(booking.propertySlug(), lang);
        UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference=:ref").param("ref", receipt.reference()).query(UUID.class).single();
        Map<String, Object> params = baseParams(booking.guest().fullName(), receipt.reference(), hotelName,
                booking.checkIn(), booking.checkOut(), booking.adults(), booking.children(), country);
        outbox.templateForReservation(receipt.reference(), "booking-guest-" + receipt.reference(), "BOOKING_REQUEST_RECEIVED", country,
                booking.guest().email(), booking.guest().fullName(), params);
        notifyHotel(id, booking.propertySlug(), booking.guest().fullName(), booking.guest().email(),
                receipt.reference(), booking.checkIn(), booking.checkOut(), "booking-hotel-");
    }

    public void paymentRequestSent(ReservationEmailActionService.PaymentRequest request) {
        var booking = request.booking();
        boolean vi = "vi".equals(EmailLanguage.forCountry(booking.guestCountry()));
        Map<String, Object> params = paramsFor(booking);
        String amount = formatAmount(booking.totalMinor(), booking.currency(), booking.guestCountry());
        params.put("totalAmount", amount);
        params.put("paymentAmount", amount);
        params.put("qrImageUrl", request.qrUrl());
        // V66: the real deadline; past it the booking expires and the payment link closes.
        params.put("paymentDeadline", request.paymentDueAt() == null
                ? (vi ? "Vui lòng liên hệ khách sạn" : "Please contact the hotel")
                : PaymentDeadline.format(request.paymentDueAt(), vi));
        // The VI QR template has no button slot. Preserve the payment-report
        // action as a complete URL in the visible description, and expose it separately
        // for a future template button without changing the business flow.
        params.put("paymentReportUrl", actionUrl(request.guestToken()));
        params.put("paymentUrl", actionUrl(request.guestToken()));
        params.put("paymentDescription", (request.instructions() == null ? "" : request.instructions())
                + (vi ? " Đã chuyển khoản? Mở liên kết để báo khách sạn kiểm tra: " : " Already transferred? Open this link to notify the hotel: ")
                + actionUrl(request.guestToken()));
        // KAS-014: the shared KAS bank details (payment_account, V51); "see the QR" only where one is missing.
        String qrDetails = vi ? "Xem thông tin trên mã QR" : "See the payment QR details";
        params.put("bankName", orElse(request.bankName(), qrDetails));
        params.put("accountHolder", orElse(request.accountHolder(), qrDetails));
        params.put("accountNumber", orElse(request.accountNumber(), qrDetails));
        params.put("transferContent", booking.reference());
        outbox.templateForReservation(booking.reference(), "booking-payment-request-" + booking.reference(), "BOOKING_AVAILABILITY_PAYMENT",
                booking.guestCountry(), booking.guestEmail(), booking.guestName(), params);
    }

    public void guestReportedPayment(ReservationEmailActionService.HotelPaymentCheck check) {
        var booking = check.booking();
        hotelInline(booking.reference(), "booking-payment-reported-" + booking.reference(), booking.hotelEmail(), booking.propertyName(), "Khách báo đã thanh toán " + booking.reference(),
                "<p>Khách " + esc(booking.guestName()) + " báo đã thanh toán cho " + esc(booking.reference())
                        + ". Hãy đối chiếu ngân hàng trước khi xác nhận.</p>"
                        + button(actionUrl(check.hotelToken()), "Xác nhận đã nhận tiền"));
    }

    public void bookingConfirmed(ReservationEmailActionService.EmailActionView booking) {
        outbox.templateForReservation(booking.reference(), "booking-confirmed-" + booking.reference(), "BOOKING_CONFIRMED",
                booking.guestCountry(), booking.guestEmail(), booking.guestName(), paramsFor(booking));
    }

    public void alternativeOffered(ReservationEmailActionService.AlternativeProposal proposal) {
        var booking = proposal.booking();
        Map<String, Object> params = paramsFor(booking);
        params.put("requestedHotelName", params.get("hotelName"));
        params.put("alternativeHotelName", proposal.propertyName());
        params.put("roomType", proposal.roomName() + " × " + proposal.quantity());
        params.put("checkIn", proposal.checkIn().toString());
        params.put("checkOut", proposal.checkOut().toString());
        params.put("priceSummary", formatAmount(proposal.totalMinor(), booking.currency(), booking.guestCountry()));
        // Owner decision 2026-11-07: the original request is closed and nothing is held. The
        // guest sends a NEW request on the website if they want the suggested stay, so both
        // links open the website's stay search; there is no accept / decline step any more.
        // (Same parameter names as before, so the Brevo templates keep rendering; their
        // button wording must be updated in Brevo — the repo designs already are.)
        String newRequestUrl = siteBaseUrl + "/hotels.html";
        params.put("availabilityUrl", newRequestUrl);
        params.put("rejectUrl", newRequestUrl);
        // The hotel's own note only.
        params.put("alternativeBranch", proposal.message() == null ? "" : proposal.message());
        outbox.templateForReservation(booking.reference(), "alternative-offer-" + proposal.offerId(), "ALTERNATIVE_STAY_SUGGESTION",
                booking.guestCountry(), booking.guestEmail(), booking.guestName(), params);
    }

    /** Called only after a cancellation transaction has actually completed. */
    public void bookingCancelled(String reference) {
        guestOf(reference, "(r.sales_status='CANCELLED' OR r.stay_status='CANCELLED')").ifPresent(guest -> {
            guest.params().put("cancellationDate", LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).toString());
            outbox.templateForReservation(reference, "booking-cancelled-" + reference, "BOOKING_CANCELLED",
                    guest.country(), guest.email(), guest.name(), guest.params());
        });
    }

    /**
     * Called only after a request has actually been declined. The reason is the text the
     * agent typed in the console, which tells the guest why (the console says so).
     * Brevo template BOOKING_REQUEST_REJECTED_{VI|EN}; alternativeUrl opens the hotel list.
     */
    public void bookingRequestRejected(String reference, String reason) {
        guestOf(reference, "r.sales_status='DECLINED'").ifPresent(guest -> {
            String lang = EmailLanguage.forCountry(guest.country());
            guest.params().put("requestId", reference);
            guest.params().put("reason", reason == null ? "" : reason.trim());
            guest.params().put("alternativeUrl", siteBaseUrl + "/hotels.html?lang=" + lang);
            outbox.templateForReservation(reference, "booking-request-rejected-" + reference, "BOOKING_REQUEST_REJECTED",
                    guest.country(), guest.email(), guest.name(), guest.params());
        });
    }

    /** {@code state} is a fixed SQL predicate from this class, never caller input. */
    // ------------------------------------------------------------ cancellation & refund (2026-11-10)

    /**
     * A guest without an account asked to cancel: a one-time link to the cancellation page,
     * to the booking's own address only (proves control of that inbox). Valid until online
     * cancellation closes (12:00 on the check-in day) and at most 48 hours.
     */
    public void guestCancellationLink(String reference) {
        guestOf(reference, "true").ifPresent(guest -> {
            UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference=:ref").param("ref", reference)
                    .query(UUID.class).single();
            LocalDate checkIn = jdbc.sql("SELECT check_in FROM reservation WHERE id=:id").param("id", id)
                    .query(LocalDate.class).single();
            java.time.OffsetDateTime closes = checkIn.atTime(12, 0).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toOffsetDateTime();
            Duration life = Duration.between(java.time.OffsetDateTime.now(), closes);
            if (life.isNegative() || life.isZero()) return;
            if (life.compareTo(Duration.ofHours(48)) > 0) life = Duration.ofHours(48);
            String token = actionTokens.issue(id, "GUEST_CANCEL", guest.email(), life);
            boolean vi = "vi".equals(EmailLanguage.forCountry(guest.country()));
            guestInline(reference, "guest-cancel-link-" + token.substring(0, 12), guest,
                    vi ? "Liên kết huỷ đặt phòng " + reference : "Cancel your booking " + reference,
                    vi ? "<p>Bạn đã yêu cầu huỷ đặt phòng " + esc(reference) + ". Mở liên kết dưới đây để xem chính sách huỷ, phí (nếu có) và xác nhận. Liên kết dùng một lần.</p>"
                            + button(actionUrl(token), "Xem và xác nhận huỷ")
                            + "<p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này; đặt phòng vẫn giữ nguyên.</p>"
                       : "<p>You asked to cancel booking " + esc(reference) + ". Open the link below to see the cancellation policy, any fee, and confirm. The link works once.</p>"
                            + button(actionUrl(token), "Review and confirm the cancellation")
                            + "<p>If this was not you, ignore this email; your booking stays as it is.</p>");
        });
    }

    /**
     * The guest is past the free window: the fee, the amount paid and the refund, and how to
     * confirm or keep the booking. Nothing is cancelled until the guest confirms.
     */
    public void cancellationFeeQuoted(String reference, CustomerCancellationService.CancellationResult result,
                                      boolean viaEmailLink) {
        guestOf(reference, "true").ifPresent(guest -> {
            boolean vi = "vi".equals(EmailLanguage.forCountry(guest.country()));
            String link;
            if (viaEmailLink) {
                UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference=:ref").param("ref", reference)
                        .query(UUID.class).single();
                link = actionUrl(actionTokens.issue(id, "GUEST_CANCEL", guest.email(), Duration.ofHours(48)));
            } else {
                link = siteBaseUrl + "/manage-booking.html";
            }
            String fee = formatAmount(result.feeMinor(), result.currency(), guest.country());
            String paid = formatAmount(result.paidMinor() == null ? 0L : result.paidMinor(), result.currency(), guest.country());
            String refund = formatAmount(result.refundDueMinor() == null ? 0L : result.refundDueMinor(), result.currency(), guest.country());
            guestInline(reference, "cancellation-fee-" + result.requestId(), guest,
                    vi ? "Phí huỷ đặt phòng " + reference : "Cancellation fee for " + reference,
                    vi ? "<p>Yêu cầu huỷ " + esc(reference) + " đã quá thời hạn huỷ miễn phí nên có phí huỷ.</p>"
                            + "<p>Đã thanh toán: <strong>" + esc(paid) + "</strong><br>Phí huỷ: <strong>" + esc(fee)
                            + "</strong><br>Dự kiến hoàn lại: <strong>" + esc(refund) + "</strong></p>"
                            + "<p>Đặt phòng <strong>chưa bị huỷ</strong>. Vui lòng xác nhận tiếp tục huỷ hoặc giữ đặt phòng:</p>"
                            + button(link, "Xác nhận hoặc giữ đặt phòng")
                       : "<p>Your cancellation of " + esc(reference) + " is past the free-cancellation deadline, so a fee applies.</p>"
                            + "<p>Paid: <strong>" + esc(paid) + "</strong><br>Cancellation fee: <strong>" + esc(fee)
                            + "</strong><br>Expected refund: <strong>" + esc(refund) + "</strong></p>"
                            + "<p>Your booking is <strong>not cancelled yet</strong>. Please confirm the cancellation or keep the booking:</p>"
                            + button(link, "Confirm or keep my booking"));
        });
    }

    /**
     * A cancelled, paid booking waits for a manual refund: every SUPER_ADMIN (and the
     * operations mailbox, if set) is told what to refund and what to look up. No card or
     * bank data: only the booking's own references.
     */
    public void refundRequested(String reference) {
        var row = jdbc.sql("""
                SELECT r.reference, COALESCE(pt.name, p.slug) AS hotel, r.guest_name, r.currency,
                       cr.paid_amount_minor, cr.fee_amount_minor, cr.refund_due_minor, cr.id AS request_id,
                       (SELECT pm.external_reference FROM payment pm
                         WHERE pm.reservation_id = r.id AND pm.status = 'VERIFIED' LIMIT 1) AS payment_reference
                  FROM reservation_cancellation_request cr
                  JOIN reservation r ON r.id = cr.reservation_id
                  JOIN property p ON p.id = r.property_id
                  LEFT JOIN property_translation pt ON pt.property_id = p.id AND pt.locale = 'vi'
                 WHERE r.reference = :ref AND cr.status = 'REFUND_PENDING'
                 ORDER BY cr.updated_at DESC LIMIT 1
                """).param("ref", reference).query((rs, n) -> Map.of(
                        "hotel", String.valueOf(rs.getString("hotel")),
                        "guest", String.valueOf(rs.getString("guest_name")),
                        "paid", formatAmount((Long) rs.getObject("paid_amount_minor"), rs.getString("currency"), "VN"),
                        "fee", formatAmount(rs.getObject("fee_amount_minor") == null ? 0L : (Long) rs.getObject("fee_amount_minor"), rs.getString("currency"), "VN"),
                        "refund", formatAmount((Long) rs.getObject("refund_due_minor"), rs.getString("currency"), "VN"),
                        "requestId", rs.getObject("request_id", UUID.class).toString(),
                        "paymentRef", rs.getString("payment_reference") == null ? "—" : rs.getString("payment_reference")))
                .optional().orElse(null);
        if (row == null) return;
        String html = "<p>Đặt phòng <strong>" + esc(reference) + "</strong> (" + esc(row.get("hotel")) + ", khách "
                + esc(row.get("guest")) + ") đã huỷ và cần hoàn tiền thủ công.</p>"
                + "<p>Đã thanh toán: " + esc(row.get("paid")) + "<br>Phí huỷ: " + esc(row.get("fee"))
                + "<br>Cần hoàn: <strong>" + esc(row.get("refund")) + "</strong><br>Mã giao dịch thanh toán: "
                + esc(row.get("paymentRef")) + "</p>"
                + "<p>Hoàn tiền ngoài hệ thống, rồi ghi nhận kết quả trong Console → Yêu cầu hủy. KAS không tự hoàn tiền.</p>";
        for (String email : superAdminEmails()) {
            outbox.inlineForReservation(reference, "refund-requested-" + row.get("requestId") + "-" + email, email,
                    "KAS Super Admin", "Cần hoàn tiền " + reference, html);
        }
    }

    /** SUPER_ADMIN must quote the fee by hand: paid booking, or late with no fee rule. */
    public void cancellationNeedsReview(String reference, UUID requestId) {
        String html = "<p>Khách yêu cầu huỷ <strong>" + esc(reference) + "</strong>. Yêu cầu cần Super Admin xem xét: đặt phòng đã "
                + "thanh toán, hoặc đã quá hạn miễn phí mà khách sạn chưa có cấu hình phí huỷ. Vui lòng báo phí (có thể là 0) "
                + "trong Console → Yêu cầu hủy; khách xác nhận rồi mới huỷ và hoàn tiền.</p>";
        for (String email : superAdminEmails()) {
            outbox.inlineForReservation(reference, "cancellation-review-" + requestId + "-" + email, email,
                    "KAS Super Admin", "Yêu cầu huỷ cần xem xét " + reference, html);
        }
    }

    /** Sent only after SUPER_ADMIN recorded a successful refund. */
    public void refundCompleted(String reference, UUID requestId) {
        guestOf(reference, "true").ifPresent(guest -> {
            var amounts = jdbc.sql("""
                    SELECT r.currency, cr.refund_amount_minor, cr.fee_amount_minor
                      FROM reservation_cancellation_request cr JOIN reservation r ON r.id = cr.reservation_id
                     WHERE cr.id = :id AND cr.status = 'REFUNDED'
                    """).param("id", requestId).query((rs, n) -> new String[] {
                            formatAmount((Long) rs.getObject("refund_amount_minor"), rs.getString("currency"), guest.country()),
                            formatAmount(rs.getObject("fee_amount_minor") == null ? 0L : (Long) rs.getObject("fee_amount_minor"),
                                    rs.getString("currency"), guest.country())})
                    .optional().orElse(null);
            if (amounts == null) return;
            boolean vi = "vi".equals(EmailLanguage.forCountry(guest.country()));
            guestInline(reference, "refund-completed-" + requestId, guest,
                    vi ? "Đã hoàn tiền đặt phòng " + reference : "Refund made for " + reference,
                    vi ? "<p>KAS đã hoàn <strong>" + esc(amounts[0]) + "</strong> cho đặt phòng đã huỷ " + esc(reference)
                            + ". Phí huỷ đã khấu trừ: " + esc(amounts[1]) + ".</p><p>Thời gian tiền về tài khoản tuỳ ngân hàng.</p>"
                       : "<p>KAS has refunded <strong>" + esc(amounts[0]) + "</strong> for your cancelled booking " + esc(reference)
                            + ". Cancellation fee deducted: " + esc(amounts[1]) + ".</p><p>When it reaches your account depends on your bank.</p>");
        });
    }

    /** SUPER_ADMIN could not refund (now): the guest is told, with the reason given. */
    public void refundRejected(String reference, UUID requestId, String reason) {
        guestOf(reference, "true").ifPresent(guest -> {
            boolean vi = "vi".equals(EmailLanguage.forCountry(guest.country()));
            guestInline(reference, "refund-rejected-" + requestId, guest,
                    vi ? "Về việc hoàn tiền đặt phòng " + reference : "About the refund for " + reference,
                    vi ? "<p>KAS chưa thể hoàn tiền cho đặt phòng " + esc(reference) + ".</p><p>Lý do: " + esc(reason)
                            + "</p><p>Vui lòng trả lời email này hoặc liên hệ KAS để được hỗ trợ.</p>"
                       : "<p>KAS could not make the refund for booking " + esc(reference) + ".</p><p>Reason: " + esc(reason)
                            + "</p><p>Please reply to this email or contact KAS for help.</p>");
        });
    }

    // ------------------------------------------------------------ payment deadline (V66, 2026-11-10)

    /**
     * The booking was not paid by its deadline and has expired: the guest is told (with a way
     * to send a new request) and the hotel is told the rooms are no longer promised.
     */
    public void paymentDeadlinePassed(String reference, java.time.OffsetDateTime dueAt, String hotelEmail,
                                      String hotelName) {
        guestOf(reference, "r.sales_status='EXPIRED'").ifPresent(guest -> {
            boolean vi = "vi".equals(EmailLanguage.forCountry(guest.country()));
            String due = dueAt == null ? "" : PaymentDeadline.format(dueAt, vi);
            String again = siteBaseUrl + "/hotels.html?lang=" + (vi ? "vi" : "en");
            guestInline(reference, "payment-deadline-guest-" + reference, guest,
                    vi ? "Đặt phòng " + reference + " đã hết hạn thanh toán" : "Booking " + reference + " was not paid in time",
                    vi ? "<p>Đặt phòng <strong>" + esc(reference) + "</strong> chưa được thanh toán trước hạn " + esc(due)
                            + " nên đã hết hạn. Phòng không còn được giữ cho bạn; voucher và điểm KAS (nếu có) đã được trả lại.</p>"
                            + "<p>Nếu bạn vẫn muốn lưu trú, vui lòng gửi yêu cầu mới:</p>" + button(again, "Gửi yêu cầu đặt phòng mới")
                            + "<p>Nếu bạn đã chuyển tiền, đừng lo: KAS sẽ kiểm tra và liên hệ bạn để xác nhận lại hoặc hoàn tiền.</p>"
                       : "<p>Booking <strong>" + esc(reference) + "</strong> was not paid by " + esc(due)
                            + ", so it has expired. The rooms are no longer held for you; any voucher or KAS points were given back.</p>"
                            + "<p>If you still want to stay, please send a new request:</p>" + button(again, "Send a new booking request")
                            + "<p>If you already paid, don't worry: KAS will check and contact you to confirm again or refund you.</p>");
        });
        hotelInline(reference, "payment-deadline-hotel-" + reference, hotelEmail, hotelName,
                "Đặt phòng " + reference + " đã hết hạn thanh toán",
                "<p>Đặt phòng <strong>" + esc(reference) + "</strong> không được thanh toán trước hạn"
                        + (dueAt == null ? "" : " " + esc(PaymentDeadline.format(dueAt, true)))
                        + " nên hệ thống đã chuyển sang <strong>Quá hạn</strong>. Phòng không còn giữ cho khách.</p>");
    }

    /**
     * SePay reported money that could not confirm a booking (layer 3): the booking expired or
     * was cancelled, the amount differs, it was already paid, or no booking matches. Every
     * SUPER_ADMIN (and the operations mailbox) is told to settle it in the console.
     */
    public void unmatchedPayment(UUID eventId, String reference, String matchStatus, Long amountMinor,
                                 String currency, String transactionId) {
        String why = switch (matchStatus) {
            case "NOT_PENDING" -> "đặt phòng không còn chờ thanh toán (đã hết hạn hoặc đã huỷ)";
            case "AMOUNT_MISMATCH" -> "số tiền không khớp tổng tiền đặt phòng";
            case "ALREADY_PAID" -> "đặt phòng đã được thanh toán trước đó (khách trả lần hai)";
            default -> "không tìm thấy đặt phòng tương ứng";
        };
        String key = reference == null ? "?" : reference;
        String html = "<p>SePay báo đã nhận <strong>" + esc(formatAmount(amountMinor, currency == null ? "VND" : currency, "VN"))
                + "</strong> cho " + (reference == null ? "một mã đơn không xác định" : "đặt phòng <strong>" + esc(reference) + "</strong>")
                + ", nhưng không thể xác nhận vì " + esc(why) + ".</p>"
                + "<p>Mã giao dịch SePay: " + esc(transactionId == null ? "—" : transactionId) + "</p>"
                + "<p>Vui lòng xử lý trong Console → Tiền chưa khớp đơn: liên hệ khách, xác nhận lại hoặc hoàn tiền rồi ghi nhận.</p>";
        for (String email : superAdminEmails()) {
            outbox.inlineForReservation(reference, "unmatched-payment-" + eventId + "-" + email, email,
                    "KAS Super Admin", "Tiền chưa khớp đơn " + key, html);
        }
    }

    private void guestInline(String reference, String eventKey, CancelledGuest guest, String subject, String html) {
        if (guest.email() == null || guest.email().isBlank()) return;
        outbox.inlineForReservation(reference, eventKey, guest.email(), guest.name(), subject, html);
    }

    /** Active SUPER_ADMIN accounts, plus the operations mailbox when configured. */
    private java.util.List<String> superAdminEmails() {
        java.util.LinkedHashSet<String> emails = new java.util.LinkedHashSet<>(jdbc.sql("""
                SELECT DISTINCT u.email::text FROM app_user u
                  JOIN role_assignment ra ON ra.user_id = u.id AND ra.revoked_at IS NULL AND ra.role = 'SUPER_ADMIN'
                 WHERE u.email IS NOT NULL AND u.status = 'ACTIVE'
                """).query(String.class).list());
        if (operationsEmail != null && !operationsEmail.isBlank()) emails.add(operationsEmail.trim());
        return java.util.List.copyOf(emails);
    }

    private java.util.Optional<CancelledGuest> guestOf(String reference, String state) {
        return jdbc.sql("""
                SELECT r.id, r.guest_name, r.guest_email::text, r.guest_country, p.slug,
                       r.check_in, r.check_out, r.adults, r.children
                  FROM reservation r JOIN property p ON p.id=r.property_id
                 WHERE r.reference=:ref AND\s""" + state).param("ref", reference).query((rs, n) -> {
                    String country = rs.getString("guest_country");
                    return new CancelledGuest(rs.getString("guest_email"), rs.getString("guest_name"), country,
                            baseParams(rs.getString("guest_name"), reference,
                                    propertyName(rs.getString("slug"), EmailLanguage.forCountry(country)),
                                    rs.getObject("check_in", LocalDate.class), rs.getObject("check_out", LocalDate.class),
                                    rs.getInt("adults"), rs.getInt("children"), country));
                }).optional();
    }

    private void notifyHotel(UUID id, String slug, String guestName, String guestEmail, String ref,
                             LocalDate checkIn, LocalDate checkOut, String eventPrefix) {
        String email = hotelRecipient(jdbc.sql("SELECT email::text FROM property WHERE slug=:slug").param("slug", slug).query(String.class).optional().orElse(null));
        if (email == null) {
            outbox.recordUndeliverable(ref, eventPrefix + ref, HOTEL_EMAIL_MISSING);
            return;
        }
        String token = actionTokens.issue(id, "REVIEW", email, Duration.ofDays(3));
        outbox.inlineForReservation(ref, eventPrefix + ref, email, propertyName(slug, "vi"), "Yêu cầu đặt phòng mới " + ref,
                "<p>Yêu cầu " + esc(ref) + " · " + esc(guestName) + " · " + esc(guestEmail)
                        + " · " + checkIn + " – " + checkOut + ". Hãy kiểm tra phòng thủ công.</p>"
                        + button(actionUrl(token), "Mở yêu cầu và xử lý"));
    }

    /** The property's own address, then the operations mailbox; null when neither exists. */
    private String hotelRecipient(String propertyEmail) {
        if (propertyEmail != null && !propertyEmail.isBlank()) return propertyEmail;
        return operationsEmail == null || operationsEmail.isBlank() ? null : operationsEmail.trim();
    }

    private void hotelInline(String reference, String eventKey, String propertyEmail, String name,
                             String subject, String html) {
        String recipient = hotelRecipient(propertyEmail);
        if (recipient == null) {
            outbox.recordUndeliverable(reference, eventKey, HOTEL_EMAIL_MISSING);
            return;
        }
        outbox.inlineForReservation(reference, eventKey, recipient, name, subject, html);
    }

    private Map<String, Object> paramsFor(ReservationEmailActionService.EmailActionView booking) {
        Map<String, Object> params = baseParams(booking.guestName(), booking.reference(),
                propertyName(booking.propertySlug(), EmailLanguage.forCountry(booking.guestCountry())),
                booking.checkIn(), booking.checkOut(), booking.adults(), booking.children(), booking.guestCountry());
        String roomTypes = jdbc.sql("SELECT string_agg(room_type_name_snapshot || ' × ' || quantity, ', ' ORDER BY id) FROM reservation_line WHERE reservation_id=:id")
                .param("id", booking.reservationId()).query(String.class).optional().orElse("");
        params.put("roomType", roomTypes);
        return params;
    }

    private Map<String, Object> baseParams(String name, String ref, String hotel, LocalDate checkIn,
                                          LocalDate checkOut, int adults, int children, String country) {
        boolean vi = "vi".equals(EmailLanguage.forCountry(country));
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("firstName", name == null ? "" : name);
        params.put("bookingReference", ref);
        params.put("hotelName", hotel);
        params.put("checkIn", checkIn.toString());
        params.put("checkOut", checkOut.toString());
        params.put("guests", adults + (vi ? " người lớn" : " adults") + (children > 0 ? " + " + children + (vi ? " trẻ em" : " children") : ""));
        params.put("accountUrl", siteBaseUrl + "/" + EmailLanguage.forCountry(country) + "/account/stays");
        return params;
    }

    private String propertyName(String slug, String lang) {
        return jdbc.sql("SELECT name FROM property_translation WHERE property_id=(SELECT id FROM property WHERE slug=:slug) AND locale=:locale")
                .param("slug", slug).param("locale", lang).query(String.class).optional().orElse(slug);
    }

    private static String orElse(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String actionUrl(String token) { return actionBaseUrl + "/api/v1/public/reservation-actions/" + token; }
    private static String button(String url, String label) { return "<p><a href=\"" + esc(url) + "\">" + esc(label) + "</a></p>"; }
    private static String formatAmount(Long minor, String currency, String country) {
        if (minor == null) return "vi".equals(EmailLanguage.forCountry(country)) ? "Liên hệ khách sạn" : "Contact the hotel";
        var formatter = java.text.NumberFormat.getNumberInstance(java.util.Locale.forLanguageTag("vi".equals(EmailLanguage.forCountry(country)) ? "vi-VN" : "en-US"));
        int exponent = "VND".equals(currency) ? 0 : 2;
        formatter.setMinimumFractionDigits(exponent); formatter.setMaximumFractionDigits(exponent);
        return formatter.format(java.math.BigDecimal.valueOf(minor, exponent)) + " " + currency;
    }
    private static String esc(String text) { return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;"); }
    private record CancelledGuest(String email, String name, String country, Map<String, Object> params) { }
}
