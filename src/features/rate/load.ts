import { ratesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { BaseRateView, RateGridView, RateRuleView } from '@/lib/domain/rate';
import { MAX_GRID_CELLS, MAX_RATE_RANGE_DAYS } from '@/lib/domain/rate';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a rate-grid request into a state a page can render.
 *
 * Pure and transport-only, like every other loader here, so each branch is
 * testable without a running server.
 */

export type RateGridResult =
  | { readonly status: 'ok'; readonly grid: RateGridView }
  | { readonly status: 'error'; readonly error: ApiError };

const EMPTY = (propertyId: string, from: string, to: string): RateGridView => ({
  propertyId,
  from,
  to,
  rows: [],
});

/**
 * The resolved grid for one property over a range.
 *
 * A grid with no rows is a **success**, and today it is the correct answer for
 * every seed property: none has a room type, so none can have a priced cell. It
 * is not "everything is free" and not an error.
 */
export async function loadRateGrid(
  propertyId: string,
  from: string,
  to: string,
  cookieHeader?: string,
): Promise<RateGridResult> {
  if (!isPropertyId(propertyId)) {
    return { status: 'ok', grid: EMPTY(propertyId, from, to) };
  }
  try {
    return { status: 'ok', grid: await ratesApi.grid(propertyId, from, to, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * A range the backend would refuse, caught before the round trip.
 *
 * Mirrors `RateAuthoringService.requireOrderedDates` and `requireGridFits`. The
 * cell bound needs the room-type count, so it is only checked when the caller
 * knows it; the backend enforces both regardless.
 */
export function rateRangeProblem(
  from: string,
  to: string,
  roomTypeCount?: number,
): string | null {
  if (to < from) {
    return 'Ngày kết thúc đang trước ngày bắt đầu.';
  }
  const nights =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (nights > MAX_RATE_RANGE_DAYS) {
    return `Khoảng ngày vượt quá ${MAX_RATE_RANGE_DAYS} ngày. Hãy chia nhỏ khoảng xem.`;
  }
  if (roomTypeCount !== undefined && roomTypeCount * nights > MAX_GRID_CELLS) {
    return `Khoảng xem quá lớn (tối đa ${MAX_GRID_CELLS} ô). Hãy chọn khoảng ngắn hơn hoặc lọc theo loại phòng.`;
  }
  return null;
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, {
    code: 'INTERNAL_ERROR',
    message: 'The service could not be reached.',
    details: [],
    correlationId: null,
  });
}

export type RateRulesResult =
  | { readonly status: 'ok'; readonly rules: readonly RateRuleView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * The rate rules behind the grid.
 *
 * Loaded alongside the grid rather than derived from it: a cell names only the
 * rule that **won** it, so a rule that is drafted, paused, or beaten everywhere
 * appears nowhere in the grid — and those are exactly the rules an operator
 * needs to see when a price is not what they expected.
 *
 * An empty list is a **success**, and today it is the correct answer for every
 * seed property.
 */
export async function loadRateRules(
  propertyId: string,
  cookieHeader?: string,
): Promise<RateRulesResult> {
  if (!isPropertyId(propertyId)) {
    return { status: 'ok', rules: [] };
  }
  try {
    return { status: 'ok', rules: await ratesApi.rules(propertyId, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * A bulk edit the backend would refuse, caught before the round trip.
 *
 * Mirrors `RateAuthoringService.requireAtLeastOneRoomType`, `requireOrderedDates`,
 * `requireRangeFits` and `requireNonNegativePrice`, and the `@NotEmpty` /
 * `@Min(0)` constraints on `BulkRateRequest`. The backend enforces all of them
 * regardless; this exists so an operator reads which field is wrong instead of a
 * 400 with no field attached.
 *
 * It decides nothing commercial. There is no suggested amount, no default price
 * and no upper bound — doc 56 §9 keeps base rates OPEN, and a frontend that
 * proposed a number would be inventing one.
 */
export function bulkRateProblem(request: {
  readonly roomTypeIds: readonly string[];
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly amount: string;
  readonly priority: string;
}): Partial<Record<'roomTypeIds' | 'dateTo' | 'amount' | 'priority', string>> {
  const problems: Record<string, string> = {};

  if (request.roomTypeIds.length === 0) {
    problems['roomTypeIds'] = 'Chọn ít nhất một loại phòng.';
  }

  const range = rateRangeProblem(request.dateFrom, request.dateTo);
  if (range !== null) {
    problems['dateTo'] = range;
  }

  const amount = Number(request.amount);
  if (request.amount.trim() === '') {
    problems['amount'] = 'Nhập giá muốn áp dụng.';
  } else if (!Number.isInteger(amount) || amount < 0) {
    problems['amount'] = 'Giá phải là số nguyên không âm, tính bằng đồng.';
  }

  // `BulkRateRequest.priority` is a primitive `int`, so a blank field is 0 —
  // the same default the column carries — but anything typed has to be whole.
  if (request.priority.trim() !== '' && !Number.isInteger(Number(request.priority))) {
    problems['priority'] = 'Độ ưu tiên phải là số nguyên.';
  }

  return problems;
}

export type BaseRatesResult =
  | { readonly status: 'ok'; readonly baseRates: readonly BaseRateView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every room type's fallback price — doc 56 §3's Layer 0.
 *
 * A list where every `amountMinor` is absent is a **success**, and today it is the
 * correct answer for every seed property: doc 56 §9 keeps base rates (config B6)
 * OPEN and no KAS price is seeded anywhere. It is not an error and it is not zero.
 */
export async function loadBaseRates(
  propertyId: string,
  cookieHeader?: string,
): Promise<BaseRatesResult> {
  if (!isPropertyId(propertyId)) {
    return { status: 'ok', baseRates: [] };
  }
  try {
    return { status: 'ok', baseRates: await ratesApi.baseRates(propertyId, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}
