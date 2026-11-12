package com.kas.platform.reservation.api;

import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.reservation.ReservationEmailActionService;
import com.kas.platform.security.PublicEndpoint;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.EmailActionPageStyle;
import com.kas.platform.shared.EmailLanguage;
import com.kas.platform.shared.KasException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Landing pages for email links. GET only previews; state changes require an explicit POST.
 *
 * <p>Hotel pages (review, payment check, proposal) stay Vietnamese, like every hotel
 * message. Guest pages (payment report, alternative offer) follow the guest's nationality,
 * like the guest's emails. Failures (used or expired link, missing hotel QR, a request
 * already handled, an invalid form) answer a readable page with the right status instead
 * of the JSON error body (KAS-008, KAS-017). Styling is one hashed stylesheet allowed by
 * this path's Content-Security-Policy ({@link EmailActionPageStyle}).
 */
@RestController
@RequestMapping("/api/v1/public/reservation-actions")
public class PublicReservationEmailActionController {
    private static final Logger log = LoggerFactory.getLogger(PublicReservationEmailActionController.class);
    private static final String BASE = "/api/v1/public/reservation-actions/";
    private final ReservationEmailActionService actions;
    private final BookingNotificationService notifications;
    private final com.kas.platform.reservation.SePayGatewayService sePay;
    private final com.kas.platform.reservation.CustomerCancellationService cancellations;
    private final com.kas.platform.reservation.CancellationNotifier cancellationEmails;
    private final com.kas.platform.reservation.SePayCheckoutCanceller sePayCheckouts;
    private final String siteBaseUrl;

    public PublicReservationEmailActionController(ReservationEmailActionService actions,
                                                  BookingNotificationService notifications,
                                                  com.kas.platform.reservation.SePayGatewayService sePay,
                                                  com.kas.platform.reservation.CustomerCancellationService cancellations,
                                                  com.kas.platform.reservation.CancellationNotifier cancellationEmails,
                                                  com.kas.platform.reservation.SePayCheckoutCanceller sePayCheckouts,
                                                  @org.springframework.beans.factory.annotation.Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}")
                                                  String siteBaseUrl) {
        this.actions = actions;
        this.notifications = notifications;
        this.sePay = sePay;
        this.cancellations = cancellations;
        this.cancellationEmails = cancellationEmails;
        this.sePayCheckouts = sePayCheckouts;
        this.siteBaseUrl = siteBaseUrl.replaceAll("/+$", "");
    }

    /**
     * The guest's decision from the cancellation page: {@code confirm} cancels (accepting the
     * fee that page showed, {@code expectedFeeMinor}), {@code keep} keeps the booking. The link
     * is used up either way.
     */
    @PostMapping(value = "/{token}/guest-cancel", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit POST with an expiring, single-use guest cancellation token")
    @org.springframework.transaction.annotation.Transactional
    public String guestCancel(@PathVariable String token,
                              @org.springframework.web.bind.annotation.RequestParam String decision,
                              @org.springframework.web.bind.annotation.RequestParam(required = false) Long expectedFeeMinor) {
        var view = actions.preview(token);
        boolean vi = "vi".equals(EmailLanguage.forCountry(view.guestCountry()));
        java.util.UUID reservationId = actions.consumeGuestCancel(token);
        var terms = cancellations.previewForGuest(reservationId);
        com.kas.platform.reservation.CustomerCancellationService.CancellationResult result;
        if ("keep".equals(decision)) {
            if ("OPEN_REQUEST".equals(terms.outcome()) && "QUOTED".equals(terms.openRequestStatus())) {
                result = cancellations.decideForGuest(reservationId, false);
            } else {
                return page(vi ? "vi" : "en", vi ? "Đặt phòng được giữ nguyên" : "Your booking is kept", "",
                        vi ? "Không có thay đổi nào với đặt phòng của bạn." : "Nothing has changed on your booking.", "");
            }
        } else {
            result = cancellations.requestForGuest(reservationId, true, expectedFeeMinor);
        }
        cancellationEmails.after(result, true);
        return switch (result.status()) {
            case "CANCELLED" -> page(vi ? "vi" : "en", vi ? "Đã huỷ đặt phòng" : "Booking cancelled", facts(view.reference()),
                    vi ? "Đặt phòng đã được huỷ. Bạn sẽ nhận email xác nhận." : "Your booking is cancelled. A confirmation email is on its way.", "");
            case "REFUND_PENDING" -> page(vi ? "vi" : "en", vi ? "Đã huỷ – chờ hoàn tiền" : "Cancelled – refund pending", facts(view.reference()),
                    vi ? "Đặt phòng đã được huỷ. KAS sẽ hoàn " + money(result.refundDueMinor()) + " thủ công và gửi email khi đã hoàn xong."
                       : "Your booking is cancelled. KAS will refund " + money(result.refundDueMinor()) + " by hand and email you once it is done.", "");
            case "PENDING_HOTEL_FEE" -> page(vi ? "vi" : "en", vi ? "Đã gửi yêu cầu huỷ" : "Cancellation request sent", facts(view.reference()),
                    vi ? "Đã quá hạn huỷ miễn phí. KAS sẽ xem xét và gửi email cho bạn mức phí (nếu có) để bạn quyết định. Đặt phòng chưa bị huỷ."
                       : "The free-cancellation deadline has passed. KAS will review and email you any fee so you can decide. Your booking is not cancelled yet.", "");
            case "DECLINED" -> page(vi ? "vi" : "en", vi ? "Đặt phòng được giữ nguyên" : "Your booking is kept", facts(view.reference()),
                    vi ? "Bạn đã không đồng ý phí huỷ; đặt phòng vẫn giữ nguyên." : "You did not accept the fee; your booking stays as it is.", "");
            default -> page(vi ? "vi" : "en", vi ? "Đã ghi nhận" : "Received", facts(view.reference()), "", "");
        };
    }

    private String guestCancelPage(String token, ReservationEmailActionService.EmailActionView view, boolean vi) {
        var t = cancellations.previewForGuest(view.reservationId());
        String deadline = t.freeUntil() == null ? "" : t.freeUntil().atZoneSameInstant(java.time.ZoneId.of("Asia/Ho_Chi_Minh"))
                .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy"));
        String policy = com.kas.platform.reservation.CustomerCancellationService.MEMBER_POLICY.equals(t.policy())
                ? (vi ? "Thành viên KAS: huỷ miễn phí đến 12:00 ngày nhận phòng" : "KAS member: free cancellation until 12:00 on the check-in day")
                : (vi ? "Khách thường: huỷ miễn phí trước giờ nhận phòng 24 giờ" : "Guest: free cancellation until 24 hours before check-in");
        String head = facts((vi ? "Đặt phòng " : "Booking ") + view.reference() + " · " + view.propertyName() + " · "
                + view.checkIn() + " – " + view.checkOut());
        String terms = "<p>" + esc(policy) + (deadline.isEmpty() ? "" : (vi ? " (hạn: " : " (deadline: ") + esc(deadline) + ")") + ".</p>";
        String paid = t.paidMinor() > 0 ? "<p>" + esc(vi ? "Đã thanh toán: " : "Paid: ") + esc(money(t.paidMinor())) + "</p>" : "";
        String keep = form(token, "keep", null, vi ? "Giữ đặt phòng" : "Keep my booking", true);
        String lang = vi ? "vi" : "en";
        String title = vi ? "Huỷ đặt phòng" : "Cancel your booking";
        return switch (t.outcome()) {
            case "CANCEL_FREE" -> page(lang, title, head,
                    vi ? "Bạn đang trong thời hạn huỷ miễn phí." : "You are within the free-cancellation period.",
                    terms + form(token, "confirm", null, vi ? "Xác nhận huỷ miễn phí" : "Cancel free of charge", false) + keep);
            case "PAID_REVIEW" -> page(lang, title, head,
                    vi ? "Bạn đang trong thời hạn huỷ miễn phí. Vì đặt phòng đã thanh toán, KAS sẽ xem xét yêu cầu và gửi email để bạn xác nhận trước khi huỷ và hoàn tiền."
                       : "You are within the free-cancellation period. As this booking is paid, KAS will review the request and email you to confirm before it is cancelled and refunded.",
                    terms + paid + form(token, "confirm", null, vi ? "Gửi yêu cầu huỷ" : "Send the cancellation request", false) + keep);
            case "CONFIRM_FEE" -> page(lang, title, head,
                    vi ? "Đã quá thời hạn huỷ miễn phí nên có phí huỷ. Đặt phòng chỉ bị huỷ khi bạn xác nhận."
                       : "The free-cancellation deadline has passed, so a fee applies. Nothing is cancelled unless you confirm.",
                    terms + paid + "<p>" + esc(vi ? "Phí huỷ: " : "Cancellation fee: ") + "<strong>" + esc(money(t.feeMinor()))
                            + "</strong><br>" + esc(vi ? "Dự kiến hoàn lại: " : "Expected refund: ") + "<strong>"
                            + esc(money(t.refundDueMinor())) + "</strong></p>"
                            + form(token, "confirm", t.feeMinor(), vi ? "Đồng ý phí và huỷ" : "Accept the fee and cancel", false) + keep);
            case "MANUAL_REVIEW" -> page(lang, title, head,
                    vi ? "Đã quá thời hạn huỷ miễn phí. KAS sẽ xem xét và báo mức phí (nếu có) để bạn quyết định; đặt phòng chưa bị huỷ."
                       : "The free-cancellation deadline has passed. KAS will review and tell you any fee so you can decide; nothing is cancelled yet.",
                    terms + form(token, "confirm", null, vi ? "Gửi yêu cầu huỷ" : "Send the cancellation request", false) + keep);
            case "OPEN_REQUEST" -> "QUOTED".equals(t.openRequestStatus())
                    ? page(lang, title, head, vi ? "KAS đã báo phí huỷ cho yêu cầu của bạn." : "KAS has quoted a fee for your request.",
                        terms + paid + "<p>" + esc(vi ? "Phí huỷ: " : "Cancellation fee: ") + "<strong>" + esc(money(t.feeMinor()))
                            + "</strong><br>" + esc(vi ? "Dự kiến hoàn lại: " : "Expected refund: ") + "<strong>"
                            + esc(money(t.refundDueMinor())) + "</strong></p>"
                            + form(token, "confirm", t.feeMinor(), vi ? "Đồng ý phí và huỷ" : "Accept the fee and cancel", false) + keep)
                    : page(lang, title, head, vi ? "KAS đang xem xét yêu cầu huỷ của bạn và sẽ gửi email." : "KAS is reviewing your request and will email you.", "");
            default -> page(lang, title, head,
                    vi ? "Đặt phòng này không thể huỷ trực tuyến nữa. Vui lòng liên hệ KAS." : "This booking can no longer be cancelled online. Please contact KAS.", "");
        };
    }

    private static String form(String token, String decision, Long expectedFeeMinor, String label, boolean secondary) {
        return "<form method=\"post\" action=\"" + BASE + esc(token) + "/guest-cancel\">"
                + "<input type=\"hidden\" name=\"decision\" value=\"" + esc(decision) + "\">"
                + (expectedFeeMinor == null ? "" : "<input type=\"hidden\" name=\"expectedFeeMinor\" value=\"" + expectedFeeMinor + "\">")
                + "<button type=\"submit\"" + (secondary ? " class=\"secondary\"" : "") + ">" + esc(label) + "</button></form>";
    }

    private static String money(Long minor) {
        return minor == null ? "—" : String.format(java.util.Locale.ROOT, "%,d", minor).replace(',', '.') + " VND";
    }

    @GetMapping(value = "/{token}", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Short-lived, single-use email action token; GET is read-only")
    public String preview(@PathVariable String token) {
        var view = actions.preview(token);
        boolean vi = "vi".equals(EmailLanguage.forCountry(view.guestCountry()));
        switch (view.action()) {
            case "REVIEW" -> {
                String proposal = "<hr><h2>Đề xuất phương án khác</h2><form method=\"post\" action=\"" + BASE
                        + esc(token) + "/propose\"><label>Khách sạn (slug)<input required name=\"propertySlug\"></label>"
                        + "<label>Loại phòng (slug)<input required name=\"roomTypeSlug\"></label>"
                        + "<label>Nhận phòng<input required type=\"date\" name=\"checkIn\"></label>"
                        + "<label>Trả phòng<input required type=\"date\" name=\"checkOut\"></label>"
                        + "<label>Số phòng<input required type=\"number\" min=\"1\" name=\"quantity\" value=\"1\"></label>"
                        + "<label>Tổng giá (VND)<input required type=\"number\" min=\"1\" name=\"totalMinor\"></label>"
                        + "<label>Lời nhắn cho khách<textarea name=\"message\" maxlength=\"2000\" rows=\"4\"></textarea></label>"
                        + "<button type=\"submit\" class=\"secondary\">Gửi đề xuất cho khách</button></form>";
                return page("vi", "Xử lý yêu cầu đặt phòng",
                        facts("Yêu cầu " + view.reference() + " · " + view.propertyName() + " · "
                                + view.checkIn() + " – " + view.checkOut()),
                        "Hãy kiểm tra phòng thực tế trước khi gửi thông tin thanh toán.",
                        button(token, "approve", "Xác nhận còn phòng và gửi link thanh toán", false) + proposal);
            }
            case "GUEST_MARK_PAID" -> {
                // V66 layer 1: the payment gate is open only while the booking waits for payment
                // and its deadline has not passed.
                var dueAt = actions.paymentDueAt(view.reservationId());
                if (!ReservationEmailActionService.payable(view.salesStatus(), dueAt,
                        java.time.OffsetDateTime.now())) {
                    return paymentClosedPage(view, vi);
                }
                String online = sePayForm(token, view, vi);
                // Manual bank transfer is offered only when KAS keeps a static QR in the payment
                // account (owner 2026-11-10): with SePay on and no static QR, SePay is the only way.
                String manual = actions.manualTransfer().map(account -> manualTransferBlock(token, view, account, vi,
                        !online.isEmpty())).orElse("");
                String deadline = dueAt.map(due -> facts((vi ? "Hạn thanh toán: " : "Pay by: ")
                        + com.kas.platform.reservation.PaymentDeadline.format(due, vi))).orElse("");
                String text = !online.isEmpty()
                        ? (vi ? "Bấm nút bên dưới để thanh toán qua SePay (quét QR ngân hàng hoặc thẻ). Đặt phòng được xác nhận tự động ngay khi thanh toán thành công."
                              : "Use the button below to pay with SePay (bank QR or card). Your booking is confirmed automatically as soon as the payment succeeds.")
                        : manual.isEmpty()
                                ? (vi ? "Hiện chưa thể thanh toán trực tuyến. Vui lòng liên hệ KAS." : "Online payment is not available right now. Please contact KAS.")
                                : (vi ? "Chuyển khoản theo thông tin bên dưới rồi bấm \"Tôi đã chuyển khoản\" để khách sạn kiểm tra."
                                      : "Transfer using the details below, then press \"I have made the transfer\" so the hotel checks it.");
                return page(vi ? "vi" : "en", vi ? "Thanh toán đặt phòng" : "Pay for your booking",
                        facts((vi ? "Yêu cầu " : "Request ") + view.reference() + (vi ? " tại " : " at ")
                                + view.propertyName()) + deadline,
                        text, online + manual);
            }
            case "HOTEL_CONFIRM_PAYMENT" -> {
                return page("vi", "Xác nhận đã nhận thanh toán",
                        facts("Yêu cầu " + view.reference() + " tại " + view.propertyName()),
                        "Chỉ tiếp tục nếu đã kiểm tra tài khoản và nhận được tiền.",
                        "<form method=\"post\" action=\"" + BASE + esc(token) + "/confirm-payment\">"
                                + "<label>Mã giao dịch ngân hàng (không bắt buộc)<input name=\"transactionReference\" maxlength=\"120\" autocomplete=\"off\"></label>"
                                + "<button type=\"submit\">Đã kiểm tra, xác nhận đặt phòng</button></form>");
            }
            case "GUEST_CANCEL" -> {
                return guestCancelPage(token, view, vi);
            }
            case "GUEST_ACCEPT_ALTERNATIVE", "GUEST_REJECT_ALTERNATIVE" -> {
                // Links from emails sent before 2026-11-07. Accepting or declining by email
                // was retired: the request is closed, nothing changes here.
                return alternativeRetiredPage(vi);
            }
            default -> throw new IllegalArgumentException("Unsupported email action");
        }
    }

    @PostMapping(value = "/{token}/approve", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit POST with an expiring, single-use hotel review token")
    @org.springframework.transaction.annotation.Transactional
    public String approve(@PathVariable String token) {
        var request = actions.approveAndSendQr(token);
        notifications.paymentRequestSent(request);
        return page("vi", "Đã gửi thông tin thanh toán", "", "Email thanh toán (link thanh toán và hạn thanh toán) đã được gửi cho khách.", "");
    }

    /** Bank details for a manual transfer, with "I have made the transfer"; secondary when SePay is offered. */
    private static String manualTransferBlock(String token, ReservationEmailActionService.EmailActionView view,
                                              ReservationEmailActionService.ManualTransfer account, boolean vi,
                                              boolean secondary) {
        StringBuilder html = new StringBuilder();
        if (secondary) html.append("<hr><h2>").append(esc(vi ? "Hoặc chuyển khoản" : "Or bank transfer")).append("</h2>");
        html.append("<p class=\"facts\">");
        if (account.bankName() != null) html.append(esc((vi ? "Ngân hàng: " : "Bank: ") + account.bankName())).append("<br>");
        if (account.accountHolder() != null) html.append(esc((vi ? "Chủ tài khoản: " : "Account holder: ") + account.accountHolder())).append("<br>");
        if (account.accountNumber() != null) html.append(esc((vi ? "Số tài khoản: " : "Account number: ") + account.accountNumber())).append("<br>");
        if (view.totalMinor() != null) html.append(esc((vi ? "Số tiền: " : "Amount: ") + money(view.totalMinor()))).append("<br>");
        html.append(esc((vi ? "Nội dung chuyển khoản: " : "Transfer reference: ") + view.reference())).append("</p>");
        if (account.instructions() != null) html.append("<p class=\"muted\">").append(esc(account.instructions())).append("</p>");
        html.append(button(token, "paid", vi ? "Tôi đã chuyển khoản" : "I have made the transfer", secondary));
        return html.toString();
    }

    /**
     * The guest pressed "Pay online" (V66 layer 2). The page's signed checkout form comes here
     * first: KAS checks the booking still waits for payment within its deadline and that the
     * form is the one it signed for this booking, records the SePay invoice (so it can be
     * cancelled at SePay if the booking ends unpaid), and answers 307 so the browser re-posts
     * the very same form to SePay. The CSP allows that redirect target (form-action).
     */
    @PostMapping(value = "/{token}/sepay", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit POST with an expiring guest payment token; forwards the signed checkout to SePay")
    public ResponseEntity<String> startSePay(@PathVariable String token,
                                             @org.springframework.web.bind.annotation.RequestParam
                                             java.util.Map<String, String> form) {
        var view = actions.preview(token);
        boolean vi = "vi".equals(EmailLanguage.forCountry(view.guestCountry()));
        if (!"GUEST_MARK_PAID".equals(view.action())) throw new IllegalArgumentException("Not a payment link");
        if (!ReservationEmailActionService.payable(view.salesStatus(), actions.paymentDueAt(view.reservationId()),
                java.time.OffsetDateTime.now())) {
            return ResponseEntity.status(409).contentType(HTML).body(paymentClosedPage(view, vi));
        }
        String invoice = view.totalMinor() == null ? null : sePay.verifyCheckout(form, view.reference(), view.totalMinor());
        if (invoice == null) {
            log.warn("SePay checkout form refused for reference={}", view.reference());
            return failurePage(400, "Thông tin thanh toán không hợp lệ hoặc đã thay đổi. Vui lòng mở lại liên kết trong email.",
                    "The payment details are not valid or have changed. Please open the link in the email again.");
        }
        sePayCheckouts.record(invoice, view.reservationId(), view.totalMinor());
        return ResponseEntity.status(307).location(java.net.URI.create(sePay.checkoutUrl())).build();
    }

    private static final MediaType HTML = new MediaType("text", "html", java.nio.charset.StandardCharsets.UTF_8);

    /** The payment gate is closed: deadline passed, or the booking no longer waits for payment. */
    private String paymentClosedPage(ReservationEmailActionService.EmailActionView view, boolean vi) {
        String again = "<p><a href=\"" + esc(siteBaseUrl + "/hotels.html?lang=" + (vi ? "vi" : "en")) + "\">"
                + esc(vi ? "Gửi yêu cầu đặt phòng mới" : "Send a new booking request") + "</a></p>";
        if ("WON".equals(view.salesStatus())) {
            return page(vi ? "vi" : "en", vi ? "Đặt phòng đã thanh toán" : "Booking already paid", facts(view.reference()),
                    vi ? "Đặt phòng này đã được thanh toán và xác nhận. Không cần thanh toán thêm."
                       : "This booking is already paid and confirmed. Nothing more to pay.", "");
        }
        return page(vi ? "vi" : "en", vi ? "Đã hết hạn thanh toán" : "Payment deadline passed", facts(view.reference()),
                vi ? "Đặt phòng này không còn nhận thanh toán (đã quá hạn hoặc đã kết thúc). Vui lòng không chuyển tiền cho đặt phòng này. Nếu bạn đã chuyển, KAS sẽ kiểm tra và liên hệ bạn."
                   : "This booking no longer takes payment (the deadline passed or it has ended). Please do not send money for it. If you already did, KAS will check and contact you.",
                again);
    }

    @PostMapping(value = "/{token}/paid", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit POST with an expiring, single-use guest payment report token")
    @org.springframework.transaction.annotation.Transactional
    public String paid(@PathVariable String token) {
        var check = actions.guestReportedPaid(token);
        notifications.guestReportedPayment(check);
        return "vi".equals(EmailLanguage.forCountry(check.booking().guestCountry()))
                ? page("vi", "Đã báo khách sạn", "", "Khách sạn sẽ kiểm tra giao dịch. Đặt phòng chưa được xác nhận cho tới khi khách sạn xác nhận đã nhận tiền.", "")
                : page("en", "The hotel has been told", "", "The hotel will check the transfer. Your booking is confirmed only after the hotel confirms the payment.", "");
    }

    @PostMapping(value = "/{token}/confirm-payment", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit POST with an expiring, single-use hotel payment verification token")
    @org.springframework.transaction.annotation.Transactional
    public String confirmPayment(@PathVariable String token,
                                 @org.springframework.web.bind.annotation.RequestParam(required = false) String transactionReference) {
        var booking = actions.confirmPayment(token, transactionReference);
        notifications.bookingConfirmed(booking);
        return page("vi", "Đặt phòng đã xác nhận", "", "Khách sạn đã xác nhận thanh toán và đặt phòng. Khách đã nhận email xác nhận.", "");
    }

    @PostMapping(value = "/{token}/propose", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Explicit hotel proposal POST with an expiring, single-use review token")
    @org.springframework.transaction.annotation.Transactional
    public String propose(@PathVariable String token, @Valid @ModelAttribute ProposalForm form) {
        var proposal = actions.proposeAlternative(token, form.toInput());
        notifications.alternativeOffered(proposal);
        // The email is queued in the outbox here, not yet delivered.
        return page("vi", "Đã ghi nhận đề xuất", "",
                "Yêu cầu ban đầu đã kết thúc. Email phương án thay thế đã được xếp vào hàng gửi cho khách.", "");
    }

    /*
     * Retired 2026-11-07: buttons in alternative emails sent before the change still POST
     * here. They change nothing and explain the new flow. Same answer for an unknown,
     * used or expired token, so the page discloses nothing about the booking.
     */
    @PostMapping(value = "/{token}/accept-alternative", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Retired guest acceptance link from older emails; answers an explanatory page only")
    public String acceptAlternative(@PathVariable String token,
                                    @org.springframework.web.bind.annotation.RequestHeader(value = "Accept-Language", required = false) String language) {
        return alternativeRetiredPage(language != null && language.toLowerCase(java.util.Locale.ROOT).startsWith("vi"));
    }

    @PostMapping(value = "/{token}/reject-alternative", produces = MediaType.TEXT_HTML_VALUE)
    @PublicEndpoint(reason = "Retired guest rejection link from older emails; answers an explanatory page only")
    public String rejectAlternative(@PathVariable String token,
                                    @org.springframework.web.bind.annotation.RequestHeader(value = "Accept-Language", required = false) String language) {
        return alternativeRetiredPage(language != null && language.toLowerCase(java.util.Locale.ROOT).startsWith("vi"));
    }

    private String alternativeRetiredPage(boolean vi) {
        return vi
                ? page("vi", "Yêu cầu đã kết thúc", "",
                        "Yêu cầu đặt phòng ban đầu đã kết thúc khi KAS gửi phương án thay thế. Nếu muốn lưu trú theo phương án này, vui lòng tạo yêu cầu đặt phòng mới trên website KAS. Phương án gợi ý không có nghĩa phòng đã được giữ hay đặt phòng đã được xác nhận.", "")
                : page("en", "This request has ended", "",
                        "Your original booking request ended when KAS sent the alternative. If you would like that stay, please send a new booking request on the KAS website. A suggestion does not mean a room is held or a booking is confirmed.", "");
    }

    public record ProposalForm(
            @jakarta.validation.constraints.NotBlank String propertySlug,
            @jakarta.validation.constraints.NotBlank String roomTypeSlug,
            @jakarta.validation.constraints.NotNull java.time.LocalDate checkIn,
            @jakarta.validation.constraints.NotNull java.time.LocalDate checkOut,
            @jakarta.validation.constraints.Min(1) int quantity,
            @jakarta.validation.constraints.Min(1) long totalMinor,
            @jakarta.validation.constraints.Size(max = 2000) String message) {
        ReservationEmailActionService.AlternativeOfferInput toInput() {
            return new ReservationEmailActionService.AlternativeOfferInput(propertySlug,
                    roomTypeSlug, checkIn, checkOut, quantity, totalMinor, message);
        }
    }

    /* ------------------------------------------------------------ failures as pages */

    @ExceptionHandler(KasException.class)
    ResponseEntity<String> failed(KasException ex) {
        ApiErrorCode code = ex.code();
        String vi;
        String en;
        if (code == ApiErrorCode.NOT_FOUND) {
            vi = "Liên kết này đã được sử dụng hoặc đã hết hạn.";
            en = "This link has already been used or has expired.";
        } else if (code == ApiErrorCode.CONFIG_MISSING || String.valueOf(ex.getMessage()).contains("QR")) {
            vi = "Chưa thể gửi thông tin thanh toán vì chưa có cách thanh toán nào: cổng SePay chưa bật và chưa có QR trong Tài khoản thanh toán. Vui lòng báo KAS cấu hình rồi mở lại liên kết này.";
            en = "Payment details cannot be sent yet: the SePay gateway is off and no payment QR is set. Please ask KAS to configure one, then open this link again.";
        } else if (code.httpStatus() == 409) {
            vi = "Yêu cầu này đã được xử lý trước đó. Không cần thao tác thêm.";
            en = "This request has already been handled. Nothing else is needed.";
        } else {
            vi = "Chưa thể thực hiện thao tác này. Vui lòng thử lại sau hoặc liên hệ đội ngũ KAS.";
            en = "This action cannot be completed right now. Please try again later or contact the KAS team.";
        }
        log.info("email action refused code={}", code);
        return failurePage(code.httpStatus(), vi, en);
    }

    @ExceptionHandler({BindException.class, IllegalArgumentException.class})
    ResponseEntity<String> invalid(Exception ex) {
        boolean form = ex instanceof BindException;
        return failurePage(form ? 400 : 404,
                form ? "Thông tin chưa hợp lệ. Vui lòng quay lại, kiểm tra các ô bắt buộc và gửi lại." : "Liên kết này không hợp lệ.",
                form ? "Some details are missing or invalid. Please go back, check the required fields and send again." : "This link is not valid.");
    }

    private static ResponseEntity<String> failurePage(int status, String vi, String en) {
        String body = "<p class=\"facts error\">" + esc(vi) + "</p><p class=\"muted\">" + esc(en) + "</p>";
        return ResponseEntity.status(status).contentType(new MediaType("text", "html", java.nio.charset.StandardCharsets.UTF_8))
                .body(pageHtml("vi", "Không thể tiếp tục · Unable to continue", body, ""));
    }

    /* ------------------------------------------------------------ rendering */

    private static String button(String token, String target, String label, boolean secondary) {
        return "<form method=\"post\" action=\"" + BASE + esc(token) + "/" + target + "\"><button type=\"submit\""
                + (secondary ? " class=\"secondary\"" : "") + ">" + esc(label) + "</button></form>";
    }

    /** The signed SePay checkout form, or "" when the gateway is off or the total is unknown. */
    private String sePayForm(String token, ReservationEmailActionService.EmailActionView view, boolean vi) {
        if (!sePay.checkoutEnabled() || view.totalMinor() == null || view.totalMinor() <= 0
                || !"VND".equalsIgnoreCase(view.currency())) return "";
        // Posted to KAS first (V66): checked and recorded, then 307-forwarded to SePay unchanged.
        StringBuilder form = new StringBuilder("<form method=\"post\" action=\"").append(BASE).append(esc(token))
                .append("/sepay\">");
        sePay.checkoutFields(view.reference(), view.totalMinor(), vi ? "vi" : "en").forEach((name, value) ->
                form.append("<input type=\"hidden\" name=\"").append(esc(name)).append("\" value=\"").append(esc(value)).append("\">"));
        String amount = String.format(java.util.Locale.ROOT, "%,d", view.totalMinor()).replace(',', '.');
        form.append("<button type=\"submit\">").append(esc(vi ? "Thanh toán online " + amount + " VND"
                : "Pay online " + amount + " VND")).append("</button></form>");
        return form.toString();
    }

    private static String facts(String text) {
        return text == null || text.isBlank() ? "" : "<p class=\"facts\">" + esc(text) + "</p>";
    }

    private static String page(String lang, String title, String factsHtml, String text, String action) {
        return pageHtml(lang, title, factsHtml + (text == null || text.isBlank() ? "" : "<p>" + esc(text) + "</p>"), action);
    }

    /** {@code bodyHtml} and {@code action} are already escaped HTML built in this class. */
    private static String pageHtml(String lang, String title, String bodyHtml, String action) {
        return "<!doctype html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\">"
                + "<title>KAS · " + esc(title) + "</title><style>" + EmailActionPageStyle.CSS + "</style></head>"
                + "<body><main><p class=\"brand\">KAS HOTEL COLLECTION</p><h1>" + esc(title) + "</h1>"
                + bodyHtml + action + "</main></body></html>";
    }

    private static String esc(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
