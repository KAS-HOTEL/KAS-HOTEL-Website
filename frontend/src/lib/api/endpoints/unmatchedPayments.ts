import { api } from '../client';

/** A SePay payment that could not confirm a booking (backend V66, layer 3). */
export interface UnmatchedPayment {
  readonly id: string;
  readonly receivedAt: string;
  /** NOT_PENDING (expired / cancelled), AMOUNT_MISMATCH, ALREADY_PAID (paid twice) or NO_BOOKING. */
  readonly matchStatus: string;
  readonly invoiceNumber: string | null;
  readonly transactionId: string | null;
  readonly paymentMethod: string | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly reference: string | null;
  readonly salesStatus: string | null;
  readonly guestName: string | null;
  readonly guestEmail: string | null;
  readonly propertyName: string | null;
  readonly bookingTotalMinor: number | null;
  readonly paymentDueAt: string | null;
  readonly resolvedAt: string | null;
  /** REFUNDED or HANDLED once settled. */
  readonly resolution: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedByEmail: string | null;
}

export type UnmatchedResolution = 'REFUNDED' | 'HANDLED';

const BASE = '/api/v1/admin/ops/payments/unmatched';
export const unmatchedPaymentsApi = {
  /** Open items (oldest first), then the most recently settled ones. */
  list: () => api.get<UnmatchedPayment[]>(BASE),
  /** Records what SUPER_ADMIN did outside KAS. Moves no money; repeating is a no-op. */
  resolve: (id: string, resolution: UnmatchedResolution, note: string) =>
    api.post<UnmatchedPayment>(`${BASE}/${encodeURIComponent(id)}/resolve`, { resolution, note }),
};
