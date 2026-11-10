package com.kas.platform.reservation;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * When a booking waiting for payment must be paid (owner decision 2026-11-10, V66).
 *
 * <ul>
 *   <li>24 hours after the hotel approves;</li>
 *   <li>2 hours when the stay starts that day (hotel time);</li>
 *   <li>never later than the hotel's check-in time on the check-in day.</li>
 * </ul>
 * Approved after the check-in time on the check-in day itself, the cap has already passed, so
 * the guest gets the same-day window: nothing else could be paid at all.
 */
public final class PaymentDeadline {

    public static final ZoneId HOTEL_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    /** Used when the property has no check-in time recorded. */
    static final LocalTime DEFAULT_CHECK_IN = LocalTime.of(14, 0);

    private static final DateTimeFormatter VI = DateTimeFormatter.ofPattern("HH:mm 'ngày' dd/MM/yyyy");
    private static final DateTimeFormatter EN = DateTimeFormatter.ofPattern("HH:mm, d MMM yyyy", Locale.ENGLISH);

    private PaymentDeadline() {
    }

    public static OffsetDateTime dueAt(OffsetDateTime approvedAt, LocalDate checkIn, LocalTime checkInTime,
                                       Duration standardWindow, Duration sameDayWindow) {
        ZonedDateTime now = approvedAt.atZoneSameInstant(HOTEL_ZONE);
        boolean sameDay = !checkIn.isAfter(now.toLocalDate());
        ZonedDateTime due = now.plus(sameDay ? sameDayWindow : standardWindow);
        ZonedDateTime cap = checkIn.atTime(checkInTime == null ? DEFAULT_CHECK_IN : checkInTime).atZone(HOTEL_ZONE);
        if (due.isAfter(cap)) due = cap;
        if (!due.isAfter(now)) due = now.plus(sameDayWindow);
        return due.toOffsetDateTime();
    }

    /** "15:30 ngày 11/11/2026" or "15:30, 11 Nov 2026 (Vietnam time)". */
    public static String format(OffsetDateTime dueAt, boolean vi) {
        ZonedDateTime local = dueAt.atZoneSameInstant(HOTEL_ZONE);
        return vi ? local.format(VI) : local.format(EN) + " (Vietnam time)";
    }
}
