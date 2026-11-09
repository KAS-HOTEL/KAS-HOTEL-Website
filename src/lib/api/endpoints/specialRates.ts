import { api } from '../client';
import type { DayPriceCell, SpecialRateRequest, SpecialRateView } from '@/lib/domain/specialRate';

const BASE = '/api/v1/admin/special-rates';

/** "Quy tắc đặc biệt" and calendar prices for many cells — SUPER_ADMIN (`rate.view` / `rate.manage`). */
export const specialRatesApi = {
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<SpecialRateView[]>(BASE, {
      query: { propertyId },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),
  create: (propertyId: string, body: SpecialRateRequest) =>
    api.post<SpecialRateView>(`${BASE}?propertyId=${encodeURIComponent(propertyId)}`, body),
  update: (id: string, body: SpecialRateRequest) =>
    api.put<SpecialRateView>(`${BASE}/${encodeURIComponent(id)}`, body),
  setActive: (id: string, active: boolean) =>
    api.patch<SpecialRateView>(`${BASE}/${encodeURIComponent(id)}/active?active=${active}`),
  archive: (id: string) => api.delete<void>(`${BASE}/${encodeURIComponent(id)}`),
  /** Sets the calendar price of every cell, or removes it when `amountMinor` is null. All or nothing. */
  dayPrices: (cells: readonly DayPriceCell[], amountMinor: number | null) =>
    api.put<{ cells: number }>(`${BASE}/day-prices`, { cells, amountMinor }),
} as const;
