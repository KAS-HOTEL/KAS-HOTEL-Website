package com.kas.platform.pricing.api;

import java.util.UUID;

/**
 * One room type's base rate — doc 56 §3's Layer 0, on the commercial console.
 *
 * <p>{@code amountMinor} is <strong>null when no base rate has been set</strong>, which is the state
 * every room type starts in: doc 56 §9 records base rates (config B6) as OPEN and no KAS price is
 * seeded anywhere. Null is a gap, never a zero — and zero is a price a Partner may deliberately set,
 * which is why the two are distinct values rather than one falsy one.
 *
 * <p>{@code currency} is echoed because the amount is meaningless without it and VND is
 * zero-decimal (doc 56 §6): 1,200,000 ₫ is {@code 1200000}, not {@code 120000000}. It is not
 * settable — VND is the only transactional currency in V1.
 *
 * <p>{@code version} is {@code room_type}'s own optimistic-concurrency token (doc 58 §2). The base
 * rate lives on that row, so it takes that row's concurrency model; {@code rate_rule} has no version
 * column and none is invented for it.
 *
 * <p>An <strong>operator</strong> shape. It carries no rule identity, because a base rate is not a
 * rule — it is the fallback used when no rule applies.
 */
public record BaseRateView(
        UUID roomTypeId,
        String roomTypeSlug,
        Long amountMinor,
        String currency,
        int version) {
}
