import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadBaseRates, loadRateGrid, loadRateRules, loadSpecialRates } from './load';
import type { BaseRatesResult, RateGridResult, RateRulesResult, SpecialRatesResult } from './load';

/**
 * The Next-bound wrappers around `load.ts`, matching every other feature server:
 * cookie forwarding, because a Server Component has no browser to attach the
 * `HttpOnly` session cookies, and `cache()` so one render pass makes one call.
 */
export const rateGrid = cache(
  async (propertyId: string, from: string, to: string): Promise<RateGridResult> => {
    return loadRateGrid(propertyId, from, to, (await cookies()).toString());
  },
);

/**
 * The property's rate rules.
 *
 * Range-independent, so it is cached on the property alone — navigating the
 * calendar a week forward does not refetch it.
 */
export const rateRules = cache(async (propertyId: string): Promise<RateRulesResult> => {
  return loadRateRules(propertyId, (await cookies()).toString());
});

/**
 * Every room type's fallback price — doc 56 §3's Layer 0.
 *
 * Range-independent like the rules, so it is cached on the property alone.
 */
export const baseRates = cache(async (propertyId: string): Promise<BaseRatesResult> => {
  return loadBaseRates(propertyId, (await cookies()).toString());
});

/** The hotel's special rules — range-independent, cached on the property alone. */
export const specialRates = cache(async (propertyId: string): Promise<SpecialRatesResult> => {
  return loadSpecialRates(propertyId, (await cookies()).toString());
});
