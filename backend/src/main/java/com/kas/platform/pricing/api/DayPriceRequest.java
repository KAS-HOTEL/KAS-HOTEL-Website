package com.kas.platform.pricing.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * One date's price.
 *
 * <h2>No date and no room type in the body</h2>
 *
 * Both are in the path, so there is exactly one place they can come from and no
 * way for a body to disagree with the URL it was sent to.
 *
 * <h2>No version</h2>
 *
 * Every other MASTER write in this API carries one (doc 58 §2). A day price does
 * not: the row is keyed by (room type, date) and written with {@code ON CONFLICT},
 * so two operators saving the same cell resolve in the database with the later
 * write winning — which is the correct outcome for a single number that either
 * operator is entitled to set. There is no other field to lose.
 */
public record DayPriceRequest(

        /** Minor units. Zero is a real price — a complimentary night — not "unset". */
        @NotNull
        @PositiveOrZero
        Long amountMinor) {
}
