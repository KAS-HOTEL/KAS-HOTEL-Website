export interface AlternativeOffer {
  propertySlug: string;
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  quantity: number;
  totalMinor: number;
  message: string;
}

export interface PendingCancellation {
  requestId: string;
  reference: string;
  propertySlug: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  requestedAt: string;
  currency: string;
  totalMinor: number | null;
  /** 2026-11-10 fields; absent from older servers. */
  status?: string;
  freePolicy?: string | null;
  freeUntil?: string | null;
  feeMinor?: number | null;
  feeSource?: string | null;
  paidMinor?: number | null;
  refundDueMinor?: number | null;
  refundAmountMinor?: number | null;
  refundReference?: string | null;
  refundNote?: string | null;
  refundedAt?: string | null;
  confirmedAt?: string | null;
  paymentReference?: string | null;
}

/** What SUPER_ADMIN records after refunding outside KAS. */
export interface RefundRecord {
  refundAmountMinor: number;
  refundedAt: string | null;
  reference: string | null;
  note: string | null;
}

export type CancellationFeeQuote = { feeMinor: number; note: string } | { percentage: number; note: string };

/** Integer arithmetic matches the server's HALF_UP rounding to the smallest currency unit. */
export function cancellationFeePreview(mode: 'AMOUNT' | 'PERCENTAGE', value: string, totalMinor: number | null, exponent: number): number | null {
  const decimals = mode === 'PERCENTAGE' ? 2 : exponent;
  if (!/^\d+(?:\.\d+)?$/.test(value) || (value.split('.')[1]?.length ?? 0) > decimals) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  const scaled = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
  let minor = scaled;
  if (mode === 'PERCENTAGE') {
    if (scaled > 10000n || totalMinor === null || !Number.isSafeInteger(totalMinor) || totalMinor < 0) return null;
    minor = (BigInt(totalMinor) * scaled + 5000n) / 10000n;
  }
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export const MANUAL_REVIEW_STATUSES = new Set([
  'REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK', 'CUSTOMER_CONTACTED',
]);
