import { api } from '../client';
import type { CancellationFeeQuote, PendingCancellation } from '@/lib/domain/manualBooking';

const BASE = '/api/v1/admin/ops/reservations/cancellation-requests';
export const cancellationsApi = {
  list: () => api.get<PendingCancellation[]>(BASE),
  quote: (reference: string, requestId: string, quote: CancellationFeeQuote) =>
    api.post<void>(`${BASE}/${encodeURIComponent(reference)}/${encodeURIComponent(requestId)}/fee`, quote),
};
