/**
 * Late-cancellation fee rules (2026-11-10) — `pricing.api.AdminCancellationFeeController`.
 *
 * One rule for every hotel (`propertyId` null) and/or one per hotel; a hotel's rule replaces
 * the all-hotels rule. With no active rule a late cancellation is reviewed by SUPER_ADMIN.
 */
export type CancellationFeeType = 'FIXED_AMOUNT' | 'PERCENT_OF_TOTAL';
export type CancellationFeeStatus = 'ACTIVE' | 'INACTIVE';

export interface CancellationFeeRule {
  readonly id: string;
  readonly propertyId: string | null;
  readonly propertySlug: string | null;
  readonly propertyName: string | null;
  readonly feeType: CancellationFeeType;
  readonly amountMinor: number | null;
  readonly percent: number | null;
  readonly currency: string;
  readonly note: string | null;
  readonly status: CancellationFeeStatus;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CancellationFeeRuleRequest {
  readonly propertyId: string | null;
  readonly feeType: CancellationFeeType;
  readonly amountMinor: number | null;
  readonly percent: number | null;
  readonly note: string | null;
  readonly status: CancellationFeeStatus;
  readonly version?: number;
}

/** "300.000 ₫" or "10% tổng tiền đặt phòng". */
export function describeFee(rule: Pick<CancellationFeeRule, 'feeType' | 'amountMinor' | 'percent' | 'currency'>): string {
  if (rule.feeType === 'PERCENT_OF_TOTAL') {
    return `${String(rule.percent ?? 0).replace('.', ',')}% tổng tiền đặt phòng`;
  }
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: rule.currency, maximumFractionDigits: 0 })
    .format(rule.amountMinor ?? 0);
}

/**
 * The fee the backend will charge on a booking total, for the preview: fixed amount capped at
 * the total, or a percent rounded half-up to the dong. The backend computes the real figure.
 */
export function previewFee(rule: Pick<CancellationFeeRule, 'feeType' | 'amountMinor' | 'percent'>, totalMinor: number): number {
  const base = Math.max(0, totalMinor);
  const raw = rule.feeType === 'PERCENT_OF_TOTAL'
    ? Math.round((base * Math.round((rule.percent ?? 0) * 100)) / 10000)
    : rule.amountMinor ?? 0;
  return Math.max(0, Math.min(base, raw));
}
