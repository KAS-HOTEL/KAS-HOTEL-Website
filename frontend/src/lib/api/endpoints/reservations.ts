import { api } from '../client';
import type {
  RequestReceipt,
  ReservationRequest,
} from '@/lib/domain/reservationRequest';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */

export const reservationsApi = {
  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  request: (body: ReservationRequest, idempotencyKey: string, locale: string) =>
    api.post<RequestReceipt>('/api/v1/public/reservations/requests', body, {
      query: { locale },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * `GET /api/v1/public/reservations/requests/{reference}/sent` — doc 58 §3,
   * *"Confirmation screen data"*.
   *
   * Returns the receipt the `201` returned, read back from the snapshot S1
   * already stored. That is what lets a confirmation survive a reload: until
   * this existed the receipt lived only in the browser that submitted it.
   *
   * **No session and no token.** Doc 58 §3 gives the route a bare
   * `{reference}`, and the receipt carries no guest detail — no name, email or
   * phone, and a status literal rather than a lifecycle value, so it reports
   * nothing about how the request is progressing. The durable tokenised surface
   * is `/public/track/{signedToken}`, which is OQ-162 and not this.
   *
   * **404** for a reference that was never issued a receipt — the same answer a
   * malformed one gets, because a reference is an identifier and never a
   * credential (doc 85 §6.3).
   */
  receipt: (reference: string, cookieHeader?: string) =>
    api.get<RequestReceipt>(
      `/api/v1/public/reservations/requests/${encodeURIComponent(reference)}/sent`,
      cookieHeader === undefined ? {} : { cookieHeader },
    )
} as const;
