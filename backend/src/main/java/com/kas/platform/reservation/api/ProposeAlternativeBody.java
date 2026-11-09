package com.kas.platform.reservation.api;

import com.kas.platform.reservation.ReservationEmailActionService;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Body of {@code POST /admin/sales/requests/{reference}/propose-alternative} —
 * the same fields the hotel's email form sends (doc 152 §5): another published
 * hotel and room type, dates, room count, the total in minor units, and an
 * optional message for the guest.
 */
public record ProposeAlternativeBody(
        @NotBlank String propertySlug,
        @NotBlank String roomTypeSlug,
        @NotNull LocalDate checkIn,
        @NotNull LocalDate checkOut,
        @Min(1) int quantity,
        @Min(1) long totalMinor,
        @Size(max = 2000) String message) {

    ReservationEmailActionService.AlternativeOfferInput toInput() {
        return new ReservationEmailActionService.AlternativeOfferInput(propertySlug, roomTypeSlug,
                checkIn, checkOut, quantity, totalMinor, message);
    }
}
