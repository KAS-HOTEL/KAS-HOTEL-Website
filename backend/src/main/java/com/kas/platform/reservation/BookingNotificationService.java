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
        params.put("paymentDeadline", vi ? "Vui lòng liên hệ khách sạn" : "Please contact the hotel");
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
