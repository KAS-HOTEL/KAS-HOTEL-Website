import { addDays } from '@/lib/domain/availability';
import { rateCellState, type BaseRateView, type RateCell, type RateGridView } from '@/lib/domain/rate';
import {
  kindLabel,
  specialRatePrice,
  winningSpecialRate,
  type SpecialRateView,
} from '@/lib/domain/specialRate';

/** Pure helpers for the "Giá phòng" screens — kept here so they can be tested without a page. */

export const SPANS = [7, 14, 30] as const;
export type Span = (typeof SPANS)[number];
export const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
/** Weekday chips in the order a Vietnamese week is read: Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function readSpan(value: string | undefined): Span {
  const n = Number(value);
  return (SPANS as readonly number[]).includes(n) ? (n as Span) : 14;
}

/** Today in Vietnam, as an ISO date. */
export function todayInVietnam(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

export function datesFrom(from: string, span: number): string[] {
  return Array.from({ length: span }, (_, index) => addDays(from, index));
}

export function dmy(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount);
}

/** Compact price for a calendar cell: 1,5tr · 850k. */
export function shortVnd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr`;
  }
  return `${Math.round(amount / 1000)}k`;
}

/** Digits typed into a money field → a whole number of đồng, or null when blank. */
export function parseVnd(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export type CellSource = 'day' | 'rule' | 'base' | 'gap';

export function cellSource(cell: RateCell | undefined): CellSource {
  const state = rateCellState(cell);
  return state === 'day' ? 'day' : state === 'ruled' ? 'rule' : state === 'base' ? 'base' : 'gap';
}

export const SOURCE_LABEL: Record<CellSource, string> = {
  day: 'Giá áp trên lịch',
  rule: 'Quy tắc đặc biệt',
  base: 'Giá cơ bản',
  gap: 'Chưa có giá',
};

/** The rule a grid cell was priced by, named with its kind when it is a special rule. */
export function ruleLabel(cell: RateCell | undefined, specials: readonly SpecialRateView[]): string {
  const id = cell?.ruleId ?? null;
  const special = id ? specials.find((rate) => rate.ruleIds.includes(id)) : undefined;
  if (special) return `${kindLabel(special.kind)}: ${special.name}`;
  return cell?.ruleName ?? 'Quy tắc';
}

export interface WhyLine {
  readonly label: string;
  readonly amount: number | null;
  readonly wins: boolean;
}

/**
 * Why one night has its price: the three sources in precedence order, the winner marked.
 * A rule hidden under a calendar price is found from the special rules themselves.
 */
export function explainCell(
  cell: RateCell | undefined,
  roomTypeId: string,
  date: string,
  base: number | null,
  specials: readonly SpecialRateView[],
): readonly WhyLine[] {
  const source = cellSource(cell);
  const amount = cell?.amountMinor ?? null;
  let ruleLine: WhyLine;
  if (source === 'rule') {
    ruleLine = { label: ruleLabel(cell, specials), amount, wins: true };
  } else {
    const hidden = winningSpecialRate(specials, roomTypeId, date);
    ruleLine = hidden
      ? { label: `${kindLabel(hidden.kind)}: ${hidden.name}`, amount: specialRatePrice(hidden, roomTypeId), wins: false }
      : { label: 'Quy tắc đặc biệt', amount: null, wins: false };
  }
  return [
    { label: 'Giá áp trên lịch', amount: source === 'day' ? amount : null, wins: source === 'day' },
    ruleLine,
    { label: 'Giá cơ bản', amount: base, wins: source === 'base' },
  ];
}

export interface HotelPriceSummary {
  readonly tonightMin: number | null;
  readonly tonightMax: number | null;
  readonly gaps: number;
  readonly noBase: number;
  /** Average price per night, null for a night with any unpriced room. */
  readonly nightly: readonly (number | null)[];
  readonly next: SpecialRateView | null;
}

/** The overview card of one hotel: tonight's range, unpriced nights, the next special rule. */
export function summarize(
  grid: RateGridView,
  baseRates: readonly BaseRateView[],
  specials: readonly SpecialRateView[],
  today: string,
  nights: number,
): HotelPriceSummary {
  const dates = datesFrom(today, nights);
  const byRoom = grid.rows.map((row) => new Map(row.cells.map((cell) => [cell.date, cell.amountMinor ?? null])));
  const tonight = byRoom.map((cells) => cells.get(today) ?? null).filter((v): v is number => v !== null);
  let gaps = 0;
  const nightly = dates.map((date) => {
    const values = byRoom.map((cells) => cells.get(date) ?? null);
    gaps += values.filter((v) => v === null).length;
    const priced = values.filter((v): v is number => v !== null);
    return priced.length === values.length && priced.length > 0
      ? priced.reduce((a, b) => a + b, 0) / priced.length
      : null;
  });
  const next = specials
    .filter((rate) => rate.active && rate.dateFrom && (rate.dateTo ?? rate.dateFrom) >= today)
    .sort((a, b) => ((a.dateFrom ?? '') < (b.dateFrom ?? '') ? -1 : 1))[0] ?? null;
  return {
    tonightMin: tonight.length ? Math.min(...tonight) : null,
    tonightMax: tonight.length ? Math.max(...tonight) : null,
    gaps,
    noBase: baseRates.filter((rate) => rate.amountMinor === null || rate.amountMinor === undefined).length,
    nightly,
    next,
  };
}

/** Every cell in the rectangle between two cells (rooms in display order, dates inclusive). */
export function cellRectangle(
  roomIds: readonly string[],
  dates: readonly string[],
  from: { roomTypeId: string; date: string },
  to: { roomTypeId: string; date: string },
): string[] {
  const r1 = roomIds.indexOf(from.roomTypeId), r2 = roomIds.indexOf(to.roomTypeId);
  const d1 = dates.indexOf(from.date), d2 = dates.indexOf(to.date);
  if (r1 < 0 || r2 < 0 || d1 < 0 || d2 < 0) return [];
  const keys: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
    for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d += 1) {
      keys.push(cellKey(roomIds[r] as string, dates[d] as string));
    }
  }
  return keys;
}

export function cellKey(roomTypeId: string, date: string): string {
  return `${roomTypeId}|${date}`;
}

export function splitKey(key: string): { roomTypeId: string; date: string } {
  const [roomTypeId = '', date = ''] = key.split('|');
  return { roomTypeId, date };
}

const WEEK_DAYS = WEEK_ORDER.length;

/** The chosen weekdays, or null when none or all are chosen (the rule applies every day). */
export function weekdaySubset(days: readonly number[] | null | undefined): readonly number[] | null {
  if (!days) return null;
  const unique = [...new Set(days)];
  return unique.length === 0 || unique.length >= WEEK_DAYS ? null : unique;
}
