/**
 * "Quy tắc đặc biệt" — a holiday, season or weekday pattern with a fixed price per room
 * type (`/api/v1/admin/special-rates`, V56). The rate engine is unchanged: for each night a
 * price set on the calendar wins, then the highest-priority rule, then the base price.
 */

export const SPECIAL_RATE_KINDS = ['HOLIDAY', 'SEASON', 'WEEKLY', 'OTHER'] as const;
export type SpecialRateKind = (typeof SPECIAL_RATE_KINDS)[number];

export const SPECIAL_RATE_KIND_LABEL: Record<SpecialRateKind, string> = {
  HOLIDAY: 'Ngày lễ',
  SEASON: 'Mùa du lịch',
  WEEKLY: 'Theo thứ trong tuần',
  OTHER: 'Khác',
};

/** The backend's rule priority per kind: a holiday wins over a season, a season over a weekly pattern. */
export const SPECIAL_RATE_PRIORITY: Record<SpecialRateKind, number> = {
  HOLIDAY: 30,
  SEASON: 20,
  OTHER: 15,
  WEEKLY: 10,
};

export interface SpecialRatePrice {
  readonly roomTypeId: string;
  readonly priceMinor: number;
}

export interface SpecialRateView {
  readonly id: string;
  readonly propertyId: string;
  readonly kind: SpecialRateKind | string;
  readonly name: string;
  readonly dateFrom?: string | null;
  readonly dateTo?: string | null;
  /** 0 = Sunday … 6 = Saturday. Null or absent: every day. */
  readonly daysOfWeek?: readonly number[] | null;
  readonly active: boolean;
  readonly prices: readonly SpecialRatePrice[];
  readonly ruleIds: readonly string[];
}

export interface SpecialRateRequest {
  readonly kind: SpecialRateKind;
  readonly name: string;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly daysOfWeek: readonly number[] | null;
  readonly prices: readonly SpecialRatePrice[];
}

export interface DayPriceCell {
  readonly roomTypeId: string;
  readonly date: string;
}

export function isSpecialRateKind(value: string): value is SpecialRateKind {
  return (SPECIAL_RATE_KINDS as readonly string[]).includes(value);
}

export function kindLabel(kind: string): string {
  return isSpecialRateKind(kind) ? SPECIAL_RATE_KIND_LABEL[kind] : 'Khác';
}

/** Day of week of an ISO date, 0 = Sunday, as the backend counts it. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Whether a group prices this room on this date (active, dated range and weekdays match). */
export function specialRateApplies(rate: SpecialRateView, roomTypeId: string, date: string): boolean {
  if (!rate.active) return false;
  if (!rate.prices.some((price) => price.roomTypeId === roomTypeId)) return false;
  if (rate.dateFrom && date < rate.dateFrom) return false;
  if (rate.dateTo && date > rate.dateTo) return false;
  const days = rate.daysOfWeek;
  return !days || days.length === 0 || days.includes(dayOfWeek(date));
}

/**
 * The special rule that would price this night if no calendar price were set — the
 * highest priority wins; a dated rule beats an undated one of the same priority.
 */
export function winningSpecialRate(
  rates: readonly SpecialRateView[],
  roomTypeId: string,
  date: string,
): SpecialRateView | null {
  const candidates = rates.filter((rate) => specialRateApplies(rate, roomTypeId, date));
  candidates.sort((a, b) => {
    const pa = isSpecialRateKind(a.kind) ? SPECIAL_RATE_PRIORITY[a.kind] : 0;
    const pb = isSpecialRateKind(b.kind) ? SPECIAL_RATE_PRIORITY[b.kind] : 0;
    if (pa !== pb) return pb - pa;
    return (b.dateFrom ? 1 : 0) - (a.dateFrom ? 1 : 0);
  });
  return candidates[0] ?? null;
}

export function specialRatePrice(rate: SpecialRateView, roomTypeId: string): number | null {
  return rate.prices.find((price) => price.roomTypeId === roomTypeId)?.priceMinor ?? null;
}
