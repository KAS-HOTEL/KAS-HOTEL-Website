package com.kas.platform.pricing.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Sets or clears one room type's base rate — doc 56 §7 "Set base rate", per room type.
 *
 * <p>A full replacement, not a patch: {@code amountMinor} absent or {@code null}
 * <strong>clears</strong> the base rate, returning the room type to having no price at all. That is a
 * real operation and a different one from setting zero, which
 * {@code room_type_price_nonneg} permits and which means "this room costs nothing".
 *
 * <p>{@code amountMinor} is minor units of VND, which is zero-decimal (doc 56 §6): 1,200,000 ₫ is
 * {@code 1200000}. There is no default and no suggested value — base rates are config B6 and remain
 * OPEN (doc 56 §9), so no number originates here.
 *
 * <p>{@code currency} is deliberately absent. VND is the only transactional currency in V1 and the
 * column already defaults to it; accepting a currency would imply a second one exists.
 *
 * <p>{@code version} is {@code room_type}'s concurrency token and is required — doc 58 §2 puts
 * {@code version} on MASTER updates. Without it, two operators pricing the same room from two tabs
 * would silently overwrite each other.
 */
public record BaseRateRequest(

        @Min(0)
        Long amountMinor,

        @NotNull
        Integer version) {
}
