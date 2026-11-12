package com.kas.platform.shared;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The transactional emails the application sends and the variables each one gets.
 *
 * <p>Delivery is Brevo only ({@link BrevoEmailClient}). An email with a Brevo template id
 * ({@code BREVO_TEMPLATE_{KEY}_{VI|EN}}) is sent with that template and these values as
 * {@code params}; without an id, the design in {@code resources/email-templates/}
 * ({@code {KEY}_{VI|EN}.html} and {@code .subject.txt}, variables written
 * {@code {{{name}}}}) is filled in and sent instead. Values are HTML escaped when a
 * local design is filled, because guest names and hotel notes are untrusted text.
 */
public final class EmailTemplates {
    /** The variables each template declares, identical for its VI and EN versions. */
    public static final Map<String, List<String>> VARIABLES = variables();
    /** Every template the application sends, without its language suffix. */
    public static final List<String> KEYS = List.copyOf(VARIABLES.keySet());

    private EmailTemplates() {
    }

    private static Map<String, List<String>> variables() {
        Map<String, List<String>> all = new LinkedHashMap<>();
        all.put("MEMBER_WELCOME", List.of("firstName", "memberId", "memberTier", "accountUrl"));
        // Membership tier review (V59): an upgrade mid-quarter, and a change at the quarter review.
        all.put("MEMBER_TIER_UPGRADED", List.of("firstName", "memberId", "previousTier", "newTier",
                "accountUrl", "policyUrl"));
        all.put("MEMBER_TIER_QUARTER_REVIEW", List.of("firstName", "memberId", "previousTier", "newTier",
                "accountUrl", "policyUrl"));
        all.put("MEMBER_EMAIL_VERIFICATION", List.of("firstName", "code", "expiresInMinutes"));
        all.put("BOOKING_REQUEST_RECEIVED", List.of("firstName", "bookingReference", "hotelName",
                "checkIn", "checkOut", "guests", "accountUrl"));
        all.put("BOOKING_AVAILABILITY_PAYMENT", List.of("firstName", "bookingReference", "hotelName",
                "roomType", "checkIn", "checkOut", "guests", "totalAmount", "paymentAmount", "paymentDeadline",
                "paymentDescription", "paymentUrl", "qrImageUrl", "bankName", "accountHolder", "accountNumber",
                "transferContent"));
        all.put("BOOKING_CONFIRMED", List.of("firstName", "bookingReference", "hotelName",
                "checkIn", "checkOut", "guests", "accountUrl"));
        all.put("BOOKING_CANCELLED", List.of("firstName", "bookingReference", "hotelName",
                "checkIn", "checkOut", "cancellationDate", "accountUrl"));
        // V66: the payment deadline passed and the booking expired (Brevo templates 24 VI / 25 EN).
        // "reference" duplicates bookingReference because the Brevo subject line uses it.
        all.put("PAYMENT_DEADLINE_PASSED", List.of("firstName", "bookingReference", "reference", "hotelName",
                "checkIn", "checkOut", "paymentDeadline", "newBookingUrl"));
        all.put("ALTERNATIVE_STAY_SUGGESTION", List.of("firstName", "requestedHotelName", "alternativeHotelName",
                "alternativeBranch", "roomType", "checkIn", "checkOut", "guests", "priceSummary",
                "availabilityUrl", "rejectUrl"));
        all.put("BOOKING_REQUEST_REJECTED", List.of("firstName", "hotelName", "requestId", "checkIn",
                "checkOut", "guests", "reason", "alternativeUrl"));
        all.put("PASSWORD_RESET", List.of("resetUrl", "expiryMinutes"));
        return java.util.Collections.unmodifiableMap(all);
    }
}
