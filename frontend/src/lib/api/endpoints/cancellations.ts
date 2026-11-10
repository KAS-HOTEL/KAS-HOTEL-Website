import { api } from '../client';
import type { CancellationFeeQuote, PendingCancellation, RefundRecord } from '@/lib/domain/manualBooking';

const BASE = '/api/v1/admin/ops/reservations/cancellation-requests';
export const cancellationsApi = {
  list: () => api.get<PendingCancellation[]>(BASE),
  quote: (reference: string, requestId: string, quote: CancellationFeeQuote) =>
    api.post<void>(`${BASE}/${encodeURIComponent(reference)}/${encodeURIComponent(requestId)}/fee`, quote),
  /** Cancelled, paid bookings: waiting for a manual refund, and those already decided (payment.record). */
  refunds: () => api.get<PendingCancellation[]>(`${BASE}/refunds`),
  /** SUPER_ADMIN refunded outside KAS; only then is the guest told. Repeating is a no-op. */
  recordRefund: (requestId: string, body: RefundRecord) =>
    api.post<void>(`${BASE}/refunds/${encodeURIComponent(requestId)}/record`, body),
  /** SUPER_ADMIN cannot refund (now); the reason is kept and sent to the guest. */
  rejectRefund: (requestId: string, reason: string) =>
    api.post<void>(`${BASE}/refunds/${encodeURIComponent(requestId)}/reject`, { reason }),
};
