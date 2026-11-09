package com.kas.platform.property;

/**
 * A room type's base nightly rate — doc 56 §3, "Layer 0".
 *
 * <p>Held on {@code room_type} rather than in {@code rate_rule} because it is not
 * a rule: it is the price that applies when no rule matches. Doc 56 §3.1's
 * algorithm ends "{@code if candidates empty: return roomType.base_price_minor}".
 *
 * <p>The column is <strong>nullable and unpopulated</strong>. Doc 56 §9 records
 * config B6 — "Base rates per room type per property" — as {@code OPEN}, and doc
 * 88 §11 lists rates among what was deliberately not seeded. A room type with no
 * base price and no matching rule has no price at all, which is why this is
 * returned as an {@link java.util.Optional} and never defaulted to zero.
 *
 * @param amountMinor minor units. VND is zero-decimal (doc 56 §6), so this is
 *                    whole dong, and a generic "divide by 100" would be 100×
 *                    wrong
 */
public record BasePrice(long amountMinor, String currency) {
}
