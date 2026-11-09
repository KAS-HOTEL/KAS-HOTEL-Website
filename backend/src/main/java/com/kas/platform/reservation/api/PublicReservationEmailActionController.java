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

    public PublicReservationEmailActionController(ReservationEmailActionService actions,
                                                  BookingNotificationService notifications) {
        this.actions = actions;
        this.notifications = notifications;
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
                        button(token, "approve", "Xác nhận còn phòng và gửi QR", false) + proposal);
            }
            case "GUEST_MARK_PAID" -> {
                return vi
                        ? page("vi", "Báo khách sạn kiểm tra thanh toán",
                                facts("Yêu cầu " + view.reference() + " tại " + view.propertyName()),
                                "Thao tác này chỉ báo khách sạn kiểm tra giao dịch, chưa xác nhận đặt phòng.",
                                button(token, "paid", "Tôi đã chuyển khoản", false))
                        : page("en", "Ask the hotel to check your payment",
                                facts("Request " + view.reference() + " at " + view.propertyName()),
                                "This only asks the hotel to check the transfer; it does not confirm the booking.",
                                button(token, "paid", "I have made the transfer", false));
            }
            case "HOTEL_CONFIRM_PAYMENT" -> {
                return page("vi", "Xác nhận đã nhận thanh toán",
                        facts("Yêu cầu " + view.reference() + " tại " + view.propertyName()),
                        "Chỉ tiếp tục nếu đã kiểm tra tài khoản và nhận được tiền.",
                        "<form method=\"post\" action=\"" + BASE + esc(token) + "/confirm-payment\">"
                                + "<label>Mã giao dịch ngân hàng (không bắt buộc)<input name=\"transactionReference\" maxlength=\"120\" autocomplete=\"off\"></label>"
                                + "<button type=\"submit\">Đã kiểm tra, xác nhận đặt phòng</button></form>");
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
        return page("vi", "Đã gửi thông tin thanh toán", "", "Email QR và hướng dẫn thanh toán đã được gửi cho khách.", "");
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
            vi = "Chưa thể gửi thông tin thanh toán vì khách sạn chưa có mã QR thanh toán. Vui lòng nhập mã QR trong trang quản trị rồi mở lại liên kết này.";
            en = "Payment details cannot be sent yet because the hotel has no payment QR. Please add it in the console, then open this link again.";
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
