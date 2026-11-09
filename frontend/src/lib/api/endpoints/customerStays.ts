import { api } from '../client';
import type { CancellationResult, CustomerStay } from '@/lib/domain/customerStay';

/** Signed-in customer stays and cancellation workflow. */
export const customerStaysApi = {
  /** Owner-scoped list. The backend never links reservations by email. */
  list: (locale: string, cookieHeader?: string) =>
    api.get<CustomerStay[]>('/api/v1/me/stays', {
      query: { locale },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /** The backend cancels immediately when eligible, otherwise requests a fee quote. */
  cancel: (reference: string) =>
    api.post<CancellationResult>(`/api/v1/me/stays/${encodeURIComponent(reference)}/cancel`),

  /** Accept or decline the hotel-provided late cancellation fee. */
  decide: (reference: string, accept: boolean) =>
    api.post<CancellationResult>(
      `/api/v1/me/stays/${encodeURIComponent(reference)}/cancel/decision`,
      { accept },
    ),
} as const;
