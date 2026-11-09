import { describe, expect, it } from 'vitest';
import type { RateGridView } from '@/lib/domain/rate';
import { winningSpecialRate, type SpecialRateView } from '@/lib/domain/specialRate';
import {
  cellRectangle,
  explainCell,
  parseVnd,
  readSpan,
  shortVnd,
  summarize,
  weekdaySubset,
} from './pricing';
import { specialRateProblem, toRequest } from './SpecialRatesPanel';

const special = (over: Partial<SpecialRateView>): SpecialRateView => ({
  id: 'g', propertyId: 'p', kind: 'HOLIDAY', name: 'Lễ', dateFrom: null, dateTo: null,
  daysOfWeek: null, active: true, prices: [{ roomTypeId: 'a', priceMinor: 1_800_000 }], ruleIds: ['r1'], ...over,
});

describe('money and dates', () => {
  it('formats compact cell prices and reads typed money', () => {
    expect(shortVnd(1_500_000)).toBe('1,5tr');
    expect(shortVnd(850_000)).toBe('850k');
    expect(shortVnd(null)).toBe('—');
    expect(parseVnd('1.500.000')).toBe(1_500_000);
    expect(parseVnd('  ')).toBeNull();
  });

  it('accepts only the offered spans', () => {
    expect(readSpan('30')).toBe(30);
    expect(readSpan('9')).toBe(14);
    expect(readSpan(undefined)).toBe(14);
  });

  it('treats no weekdays or all weekdays as every day', () => {
    expect(weekdaySubset([5, 6])).toEqual([5, 6]);
    expect(weekdaySubset([0, 1, 2, 3, 4, 5, 6])).toBeNull();
    expect(weekdaySubset([])).toBeNull();
  });
});

describe('selection', () => {
  it('selects every cell in the rectangle between two cells', () => {
    const keys = cellRectangle(['a', 'b', 'c'], ['d1', 'd2', 'd3'], { roomTypeId: 'c', date: 'd2' }, { roomTypeId: 'b', date: 'd1' });
    expect(keys.sort()).toEqual(['b|d1', 'b|d2', 'c|d1', 'c|d2']);
  });
});

describe('which special rule wins', () => {
  const holiday = special({ id: 'h', kind: 'HOLIDAY', dateFrom: '2026-12-24', dateTo: '2026-12-26' });
  const weekly = special({ id: 'w', kind: 'WEEKLY', daysOfWeek: [6, 0], prices: [{ roomTypeId: 'a', priceMinor: 1_200_000 }] });

  it('prefers a holiday over a weekly pattern on the same night', () => {
    // 2026-12-26 is a Saturday.
    expect(winningSpecialRate([weekly, holiday], 'a', '2026-12-26')?.id).toBe('h');
    expect(winningSpecialRate([weekly, holiday], 'a', '2026-12-27')?.id).toBe('w');
    expect(winningSpecialRate([weekly, holiday], 'a', '2026-12-28')).toBeNull();
  });

  it('ignores paused rules and rooms without a price', () => {
    expect(winningSpecialRate([{ ...holiday, active: false }], 'a', '2026-12-25')).toBeNull();
    expect(winningSpecialRate([holiday], 'b', '2026-12-25')).toBeNull();
  });

  it('explains a calendar price with the rule underneath crossed out', () => {
    const lines = explainCell({ roomTypeId: 'a', date: '2026-12-25', amountMinor: 2_000_000, isDayPrice: true },
      'a', '2026-12-25', 1_000_000, [holiday]);
    expect(lines.map((line) => [line.label, line.amount, line.wins])).toEqual([
      ['Giá áp trên lịch', 2_000_000, true],
      ['Ngày lễ: Lễ', 1_800_000, false],
      ['Giá cơ bản', 1_000_000, false],
    ]);
  });
});

describe('hotel summary', () => {
  it('counts unpriced nights and finds tonight’s range and the next special rule', () => {
    const grid: RateGridView = {
      propertyId: 'p', from: '2026-11-08', to: '2026-11-09',
      rows: [
        { roomTypeId: 'a', cells: [{ roomTypeId: 'a', date: '2026-11-08', amountMinor: 1_000_000 }, { roomTypeId: 'a', date: '2026-11-09', amountMinor: 1_200_000 }] },
        { roomTypeId: 'b', cells: [{ roomTypeId: 'b', date: '2026-11-08', amountMinor: 2_000_000 }, { roomTypeId: 'b', date: '2026-11-09', amountMinor: null }] },
      ],
    };
    const summary = summarize(grid, [{ roomTypeId: 'b', roomTypeSlug: 'b', amountMinor: null, currency: 'VND', version: 1 }],
      [special({ dateFrom: '2026-12-24', dateTo: '2026-12-26' }), special({ id: 'old', dateFrom: '2026-01-01', dateTo: '2026-01-02' })],
      '2026-11-08', 2);
    expect(summary.tonightMin).toBe(1_000_000);
    expect(summary.tonightMax).toBe(2_000_000);
    expect(summary.gaps).toBe(1);
    expect(summary.noBase).toBe(1);
    expect(summary.nightly).toEqual([1_500_000, null]);
    expect(summary.next?.dateFrom).toBe('2026-12-24');
  });
});

describe('special rule form', () => {
  const form = { id: null, kind: 'HOLIDAY' as const, name: 'Lễ 30/4', dateFrom: '2027-04-30', dateTo: '2027-05-01', days: null, prices: { a: '1.800.000', b: '' } };

  it('requires a name, a date range (except weekly) and one price', () => {
    expect(specialRateProblem(form)).toBeNull();
    expect(specialRateProblem({ ...form, name: ' ' })).toBe('Nhập tên quy tắc.');
    expect(specialRateProblem({ ...form, dateTo: '' })).toBe('Chọn khoảng ngày.');
    expect(specialRateProblem({ ...form, dateTo: '2027-04-01' })).toBe('Ngày kết thúc đang trước ngày bắt đầu.');
    expect(specialRateProblem({ ...form, prices: { a: '' } })).toBe('Nhập giá cho ít nhất một hạng phòng.');
    expect(specialRateProblem({ ...form, kind: 'WEEKLY', dateFrom: '', dateTo: '', days: [] })).toBe('Chọn ít nhất một thứ trong tuần.');
  });

  it('sends only priced rooms, and no dates for a weekly rule', () => {
    expect(toRequest(form)).toEqual({
      kind: 'HOLIDAY', name: 'Lễ 30/4', dateFrom: '2027-04-30', dateTo: '2027-05-01', daysOfWeek: null,
      prices: [{ roomTypeId: 'a', priceMinor: 1_800_000 }],
    });
    expect(toRequest({ ...form, kind: 'WEEKLY', days: [5, 6] })).toMatchObject({ dateFrom: null, dateTo: null, daysOfWeek: [5, 6] });
  });
});
