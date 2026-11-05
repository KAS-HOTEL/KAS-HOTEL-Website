// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  allowedRuleTransitions,
  bulkActionLabel,
  bulkConfirmSentence,
  bulkRequestSignature,
  cellAmount,
  currentRangeLabel,
  formatMoney,
  indexRateCells,
  MAX_GRID_CELLS,
  MAX_RATE_RANGE_DAYS,
  pricedCellCount,
  rateCellLabel,
  rateCellState,
  ruleDateRange,
  ruleStatusLabel,
  ruleTransitionLabel,
  spokenMoney,
  weekdayLabel,
  baseRateAmount,
  baseRateLabel,
  baseRateProblem,
  type BaseRateView,
  type BulkRateEffect,
  type RateCell,
  type RateRuleView,
} from '@/lib/domain/rate';
import type { RoomTypeView } from '@/lib/domain/roomType';
import type * as Primitives from '@/ui/primitives';

const gridApi = vi.fn();
const rulesApi = vi.fn();
const baseRatesApi = vi.fn();
const setBaseRate = vi.fn();
const bulkPreview = vi.fn();
const bulkApply = vi.fn();
const updateRule = vi.fn();
const setRuleStatus = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const revalidate = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/lib/api/endpoints', () => ({
  ratesApi: {
    grid: (...a: unknown[]) => gridApi(...a),
    rules: (...a: unknown[]) => rulesApi(...a),
    baseRates: (...a: unknown[]) => baseRatesApi(...a),
    setBaseRate: (...a: unknown[]) => setBaseRate(...a),
    bulkPreview: (...a: unknown[]) => bulkPreview(...a),
    bulkApply: (...a: unknown[]) => bulkApply(...a),
    updateRule: (...a: unknown[]) => updateRule(...a),
    setRuleStatus: (...a: unknown[]) => setRuleStatus(...a),
  },
}));
vi.mock('./actions', () => ({ revalidateRates: (...a: unknown[]) => revalidate(...a) }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { AdvancedPricing } = await import('./AdvancedPricing');
const { loadRateGrid, loadRateRules, loadBaseRates, rateRangeProblem, bulkRateProblem } =
  await import('./load');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_A = '22222222-2222-4222-8222-222222222222';
const ROOM_B = '33333333-3333-4333-8333-333333333333';
const TODAY = '2026-08-19';

function room(id: string, name: string, slug: string): RoomTypeView {
  return {
    id, slug,
    translations: { vi: { name } },
    status: 'DRAFT',
    maxAdults: 2, maxChildren: 0, maxOccupancy: 2,
    smoking: false, sortOrder: 0, beds: [], amenityCodes: [], version: 0,
  };
}

function cell(overrides: Partial<RateCell> = {}): RateCell {
  return {
    roomTypeId: ROOM_A,
    date: TODAY,
    amountMinor: 1_250_000,
    currency: 'VND',
    ruleId: 'rule-1',
    ruleName: 'Cuối tuần',
    ...overrides,
  };
}

const unpriced = (date: string, roomTypeId = ROOM_A): RateCell => ({
  roomTypeId, date, amountMinor: null, currency: null, ruleId: null, ruleName: null,
});

/**
 * What an unpriced cell actually looks like on the wire.
 *
 * The backend runs `spring.jackson.default-property-inclusion: non_null`, so a
 * null component is omitted from the JSON entirely — the keys are simply not
 * there. A guard that only tested `=== null` would let this fall through as if a
 * rule had priced it.
 */
const unpricedOnTheWire = (date: string, roomTypeId = ROOM_A): RateCell =>
  ({ roomTypeId, date }) as RateCell;

function rule(overrides: Partial<RateRuleView> = {}): RateRuleView {
  return {
    id: 'rule-1',
    scope: 'ROOM_TYPE',
    roomTypeId: ROOM_A,
    name: 'Cuối tuần',
    priority: 0,
    specificity: 4,
    dateFrom: TODAY,
    dateTo: '2026-08-30',
    priceMinor: 1_250_000,
    currency: 'VND',
    status: 'ACTIVE',
    ...overrides,
  };
}

function effect(overrides: Partial<BulkRateEffect> = {}): BulkRateEffect {
  return {
    dateFrom: TODAY,
    dateTo: '2026-08-30',
    nights: 12,
    amountMinor: 1_500_000,
    currency: 'VND',
    cellsAffected: 24,
    roomTypes: [
      {
        roomTypeId: ROOM_A, roomTypeSlug: 'deluxe', datesAffected: 12,
        currentLowest: 1_200_000, currentHighest: 1_300_000,
        newAmountMinor: 1_500_000, action: 'CREATE',
      },
      {
        // No `currentLowest` / `currentHighest` at all — the wire shape for a
        // room type with no price in the range.
        roomTypeId: ROOM_B, roomTypeSlug: 'suite', datesAffected: 12,
        newAmountMinor: 1_500_000, action: 'UPDATE',
      },
    ],
    conflicts: [],
    ...overrides,
  };
}

function baseRate(overrides: Partial<BaseRateView> = {}): BaseRateView {
  return {
    roomTypeId: ROOM_A,
    roomTypeSlug: "deluxe",
    amountMinor: 1_200_000,
    currency: "VND",
    version: 0,
    ...overrides,
  };
}

/** The wire shape of an unset base rate: Jackson omits the null key entirely. */
const baseRateOnTheWire = (overrides: Partial<BaseRateView> = {}): BaseRateView =>
  ({ roomTypeId: ROOM_A, roomTypeSlug: "deluxe", currency: "VND", version: 0, ...overrides });

const apiError = (
  status: number,
  code: string,
  message: string,
  details: readonly { field: string | null; code: string; message: string }[] = [],
) => new ApiError(status, { code, message, details, correlationId: null });

afterEach(cleanup);
beforeEach(() => {
  for (const spy of [gridApi, rulesApi, baseRatesApi, setBaseRate, bulkPreview, bulkApply,
    updateRule, setRuleStatus,
    push, refresh, revalidate, toastShow]) {
    spy.mockReset();
  }
});

/**
 * The advanced pricing screen — where the bulk editor and the rule table live
 * since STEP K moved the daily grid to Giá &amp; Tồn phòng.
 */
const advanced = (
  rooms: RoomTypeView[],
  rules: RateRuleView[] = [],
  bases: BaseRateView[] = [],
  to = TODAY,
) => (
  <AdvancedPricing
    propertyId={PROPERTY_ID}
    propertyName="Khách sạn thử nghiệm"
    roomTypes={rooms}
    rules={rules}
    baseRates={bases}
    from={TODAY}
    to={to}
  />
);

const TWO_ROOMS = () => [room(ROOM_A, 'Deluxe', 'deluxe'), room(ROOM_B, 'Suite', 'suite')];

/** Open the bulk drawer and fill in a valid amount. */
async function openBulk(rooms = TWO_ROOMS()) {
  render(advanced(rooms));
  await userEvent.click(screen.getByRole('button', { name: 'Áp giá hàng loạt' }));
  await userEvent.type(screen.getByLabelText(/Giá mỗi đêm/), '1500000');
}

describe('rate domain', () => {
  it('treats a missing amount as unpriced, never as zero or free', () => {
    // Doc 56 §9 records base rates as OPEN, so an unpriced cell is a gap.
    expect(rateCellState(undefined)).toBe('unpriced');
    expect(rateCellState(unpriced(TODAY))).toBe('unpriced');
    // The wire shape: Jackson omits null properties, so the keys are absent.
    expect(rateCellState(unpricedOnTheWire(TODAY))).toBe('unpriced');
    expect(cellAmount(unpricedOnTheWire(TODAY))).toBeNull();
    // A price with no rule is the base price, which is a real distinction.
    expect(rateCellState(cell({ ruleId: null, ruleName: null }))).toBe('base');
    expect(rateCellState(cell())).toBe('ruled');
  });

  it('counts only cells that actually carry a price', () => {
    expect(pricedCellCount([cell(), unpriced(TODAY), unpricedOnTheWire(TODAY)])).toBe(1);
  });

  it('names each state in words, including which rule won', () => {
    expect(rateCellLabel('Deluxe', TODAY, undefined)).toContain('chưa cấu hình giá');
    expect(rateCellLabel('Deluxe', TODAY, unpricedOnTheWire(TODAY)))
      .toContain('chưa cấu hình giá');
    // Doc 56 §7: the grid exists to answer "why is this date different?".
    expect(rateCellLabel('Deluxe', TODAY, cell())).toContain('quy tắc Cuối tuần');
    expect(rateCellLabel('Deluxe', TODAY, cell({ ruleId: null, ruleName: null })))
      .toContain('giá cơ bản');
    // Room and date are in the label: a screen-reader user in a grid has neither
    // header in view.
    expect(rateCellLabel('Deluxe', TODAY, cell())).toContain('Deluxe');
    expect(rateCellLabel('Deluxe', TODAY, cell())).toContain(TODAY);
  });

  it('formats VND without inventing a fractional unit', () => {
    expect(formatMoney(1_250_000, 'VND')).toContain('250.000');
    expect(spokenMoney(1_250_000, 'VND')).toBe('1.250.000 đồng');
  });

  it('mirrors the frozen range and grid bounds', () => {
    // Doc 55 §2's 24-month horizon, expressed in days by RateAuthoringService.
    expect(MAX_RATE_RANGE_DAYS).toBe(732);
    expect(MAX_GRID_CELLS).toBe(5_000);
    expect(rateRangeProblem('2026-08-20', '2026-08-19')).toMatch(/trước ngày bắt đầu/);
    expect(rateRangeProblem('2026-01-01', '2028-12-31')).toMatch(/732/);
    expect(rateRangeProblem(TODAY, '2026-12-31', 40)).toMatch(/5000/);
    expect(rateRangeProblem(TODAY, TODAY, 1)).toBeNull();
  });

  it('indexes cells by room and date', () => {
    const index = indexRateCells([{ roomTypeId: ROOM_A, cells: [cell()] }]);
    expect(index.get(`${ROOM_A}|${TODAY}`)?.amountMinor).toBe(1_250_000);
  });

  it('reports a room type with no current price as a gap, never as zero', () => {
    const withoutPrice = effect().roomTypes[1];
    expect(withoutPrice).toBeDefined();
    if (withoutPrice !== undefined) {
      const label = currentRangeLabel(withoutPrice, 'VND');
      expect(label).toBe('chưa cấu hình giá');
      expect(label).not.toContain('0');
    }
  });

  it('shows the current price as the range the backend returned', () => {
    const withPrice = effect().roomTypes[0];
    expect(withPrice).toBeDefined();
    if (withPrice !== undefined) {
      const label = currentRangeLabel(withPrice, 'VND');
      expect(label).toContain('200.000');
      expect(label).toContain('300.000');
    }
  });

  it('describes a repeated edit as an update, not a duplicate', () => {
    // Doc 56 §5.3 — a bulk edit only ever creates or updates; nothing is deleted.
    expect(bulkActionLabel('UPDATE')).toMatch(/cập nhật/i);
    expect(bulkActionLabel('CREATE')).toMatch(/tạo/i);
  });

  it('builds the confirmation sentence from the preview, not the form', () => {
    const sentence = bulkConfirmSentence(effect());
    expect(sentence).toContain('2 loại phòng');
    expect(sentence).toContain('12 ngày');
    expect(sentence).toContain('24 ô');
  });

  it('changes the preview signature when any part of the request changes', () => {
    const base = {
      propertyId: PROPERTY_ID, roomTypeIds: [ROOM_A], dateFrom: TODAY, dateTo: '2026-08-30',
      amountMinor: 1_500_000, priority: 0,
    };
    const signature = bulkRequestSignature(base);

    expect(bulkRequestSignature({ ...base, roomTypeIds: [ROOM_A, ROOM_B] })).not.toBe(signature);
    expect(bulkRequestSignature({ ...base, dateFrom: '2026-08-20' })).not.toBe(signature);
    expect(bulkRequestSignature({ ...base, dateTo: '2026-08-31' })).not.toBe(signature);
    expect(bulkRequestSignature({ ...base, amountMinor: 1_600_000 })).not.toBe(signature);
    expect(bulkRequestSignature({ ...base, priority: 1 })).not.toBe(signature);
    expect(bulkRequestSignature({ ...base, name: 'Khuyến mãi' })).not.toBe(signature);
    // Selection order is not part of the request's identity.
    expect(bulkRequestSignature({ ...base, roomTypeIds: [ROOM_A] })).toBe(signature);
  });

  it('mirrors the frozen rule lifecycle without inventing a transition', () => {
    expect(allowedRuleTransitions('DRAFT')).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(allowedRuleTransitions('ACTIVE')).toEqual(['PAUSED', 'ARCHIVED']);
    expect(allowedRuleTransitions('PAUSED')).toEqual(['ACTIVE', 'ARCHIVED']);
    // Doc 56 §5.3 — archived is terminal, so a snapshot's ruleId always resolves.
    expect(allowedRuleTransitions('ARCHIVED')).toEqual([]);
    expect(allowedRuleTransitions('SOMETHING_NEW')).toEqual([]);
    // A transition control reads as a verb, never the same as a status label.
    expect(ruleTransitionLabel('ACTIVE')).not.toBe(ruleStatusLabel('ACTIVE'));
  });

  it('describes a rule shape without guessing at absent bounds', () => {
    expect(weekdayLabel(null)).toBe('Mọi ngày');
    expect(weekdayLabel(undefined)).toBe('Mọi ngày');
    expect(weekdayLabel([0, 6])).toBe('CN, T7');
    expect(ruleDateRange(rule({ dateFrom: null, dateTo: null }))).toBe('Không giới hạn');
    expect(ruleDateRange(rule())).toContain('→');
  });
});

describe('bulkRateProblem', () => {
  const valid = {
    roomTypeIds: [ROOM_A], dateFrom: TODAY, dateTo: '2026-08-30', amount: '1500000',
    priority: '0',
  };

  it('accepts a well-formed request', () => {
    expect(bulkRateProblem(valid)).toEqual({});
  });

  it('mirrors the frozen refusals rather than inventing commercial limits', () => {
    expect(bulkRateProblem({ ...valid, roomTypeIds: [] }).roomTypeIds).toBeDefined();
    expect(bulkRateProblem({ ...valid, dateTo: '2026-08-18' }).dateTo).toBeDefined();
    expect(bulkRateProblem({ ...valid, amount: '' }).amount).toBeDefined();
    expect(bulkRateProblem({ ...valid, amount: '-1' }).amount).toBeDefined();
    expect(bulkRateProblem({ ...valid, amount: '1.5' }).amount).toBeDefined();
    expect(bulkRateProblem({ ...valid, priority: 'x' }).priority).toBeDefined();
    // A blank priority is the column's own default of 0, not an error.
    expect(bulkRateProblem({ ...valid, priority: '' })).toEqual({});
    // No upper bound and no suggested amount — doc 56 §9 keeps base rates OPEN.
    expect(bulkRateProblem({ ...valid, amount: '999999999' })).toEqual({});
  });
});

describe('loadRateGrid', () => {
  it('returns the grid the backend resolved', async () => {
    const grid = { propertyId: PROPERTY_ID, from: TODAY, to: TODAY, rows: [] };
    gridApi.mockResolvedValue(grid);
    expect(await loadRateGrid(PROPERTY_ID, TODAY, TODAY, 'c=1')).toEqual({ status: 'ok', grid });
    expect(gridApi).toHaveBeenCalledWith(PROPERTY_ID, TODAY, TODAY, 'c=1');
  });

  it('answers a malformed property id without asking the backend', async () => {
    const result = await loadRateGrid('nope', TODAY, TODAY);
    expect(result.status).toBe('ok');
    expect(gridApi).not.toHaveBeenCalled();
  });

  it('surfaces 404, 422 and an unreachable backend as errors', async () => {
    for (const [status, code] of [[404, 'NOT_FOUND'], [422, 'NO_AVAILABILITY']] as const) {
      gridApi.mockRejectedValue(
        new ApiError(status, { code, message: 'x', details: [], correlationId: null }),
      );
      const result = await loadRateGrid(PROPERTY_ID, TODAY, TODAY);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.status).toBe(status);
      }
    }
    gridApi.mockRejectedValue(new TypeError('fetch failed'));
    const network = await loadRateGrid(PROPERTY_ID, TODAY, TODAY);
    expect(network.status).toBe('error');
    if (network.status === 'error') {
      expect(network.error.status).toBe(0);
    }
  });
});

describe('loadRateRules', () => {
  it('treats an empty rule list as a success', async () => {
    rulesApi.mockResolvedValue([]);
    expect(await loadRateRules(PROPERTY_ID, 'c=1')).toEqual({ status: 'ok', rules: [] });
    expect(rulesApi).toHaveBeenCalledWith(PROPERTY_ID, 'c=1');
  });

  it('surfaces a foreign property as an error, not as an empty list', async () => {
    rulesApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'x'));
    const result = await loadRateRules(PROPERTY_ID);
    expect(result.status).toBe('error');
  });
});

describe('BulkRateEditor — form', () => {
  it('offers only the operation the frozen contract supports', async () => {
    await openBulk();

    // `BulkRateRequest` carries one `amountMinor` and no operation field, so a
    // percentage or delta option would be offering a request the endpoint cannot
    // express.
    expect(screen.getByText('Đặt giá cố định')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /tăng|giảm/i })).toBeNull();
  });

  it('selects every room type by default and lets each be turned off', async () => {
    await openBulk();

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.checked)).toBe(true);

    await userEvent.click(screen.getByLabelText('Suite'));
    expect((screen.getByLabelText('Suite') as HTMLInputElement).checked).toBe(false);
  });

  it('refuses to preview an empty selection or a missing amount', async () => {
    render(advanced(TWO_ROOMS()));
    await userEvent.click(screen.getByRole('button', { name: 'Áp giá hàng loạt' }));

    const preview = screen.getByRole('button', { name: 'Xem trước thay đổi' }) as HTMLButtonElement;
    expect(preview.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Giá mỗi đêm/), '1500000');
    expect((screen.getByRole('button', { name: 'Xem trước thay đổi' }) as HTMLButtonElement)
      .disabled).toBe(false);

    await userEvent.click(screen.getByLabelText('Deluxe'));
    await userEvent.click(screen.getByLabelText('Suite'));
    expect((screen.getByRole('button', { name: 'Xem trước thay đổi' }) as HTMLButtonElement)
      .disabled).toBe(true);
    expect(screen.getByText('Chọn ít nhất một loại phòng.')).toBeTruthy();
    expect(bulkPreview).not.toHaveBeenCalled();
  });

  it('sends exactly the frozen request shape, with no partner identifier', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));

    await waitFor(() => expect(bulkPreview).toHaveBeenCalledTimes(1));
    const body = bulkPreview.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['amountMinor', 'dateFrom', 'dateTo', 'priority', 'propertyId', 'roomTypeIds'],
    );
    expect(body['propertyId']).toBe(PROPERTY_ID);
    expect(body['amountMinor']).toBe(1_500_000);
    expect(body['priority']).toBe(0);
    // Scope is the backend's to enforce; the client never names a partner.
    expect(JSON.stringify(body)).not.toMatch(/partnerId|Authorization|Bearer/i);
  });
});

describe('BulkRateEditor — preview is mandatory', () => {
  it('keeps apply unreachable until a preview exists', async () => {
    await openBulk();

    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText(/Bắt buộc xem trước/)).toBeTruthy();
    expect(bulkApply).not.toHaveBeenCalled();
  });

  it('reports the cells, rooms and nights the backend counted', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));

    // Every figure is the backend's, never the form's.
    expect(await screen.findByText(/2 loại phòng trong 12 ngày, tổng cộng 24 ô/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('shows the current and new value per room type, and the repeat-edit action', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));

    const region = await screen.findByRole('region', { name: 'Chi tiết thay đổi' });
    const deluxe = within(region).getByRole('row', { name: /Deluxe/ });
    expect(deluxe.textContent).toContain('200.000');
    expect(deluxe.textContent).toContain('500.000');
    expect(deluxe.textContent).toMatch(/tạo quy tắc mới/i);

    // A room type with no current price reads as a gap, never as 0 or free.
    const suite = within(region).getByRole('row', { name: /Suite/ });
    expect(suite.textContent).toContain('chưa cấu hình giá');
    expect(suite.textContent).not.toMatch(/miễn phí/i);
    // Doc 56 §5.3 — repeating an edit reprices, it does not duplicate.
    expect(suite.textContent).toMatch(/cập nhật quy tắc hiện có/i);
  });

  it('states the all-or-nothing guarantee on the preview', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));

    expect(await screen.findAllByText(/áp dụng toàn bộ hoặc không áp dụng/)).not.toHaveLength(0);
  });

  it('invalidates the preview when any input changes', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
        .toBe(false));

    // Old preview + changed form must never reach apply.
    await userEvent.type(screen.getByLabelText(/Giá mỗi đêm/), '0');
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText(/Biểu mẫu đã thay đổi sau lần xem trước/)).toBeTruthy();
  });

  it('invalidates the preview when the room selection changes', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
        .toBe(false));

    await userEvent.click(screen.getByLabelText('Suite'));
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('blocks apply when the preview came back with conflicts', async () => {
    bulkPreview.mockResolvedValue(
      effect({ conflicts: ['stray-room does not belong to that property.'] }),
    );
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));

    // The backend's own wording, verbatim — never re-described as a skip.
    expect(await screen.findByText('stray-room does not belong to that property.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.queryByText(/bỏ qua|đã áp dụng một phần/i)).toBeNull();
  });
});

describe('BulkRateEditor — apply', () => {
  async function previewed() {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
        .toBe(false));
  }

  it('requires a confirmation that quotes the backend figures', async () => {
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

    const dialog = await screen.findByRole('dialog', { name: 'Xác nhận đổi giá' });
    expect(within(dialog).getByText(/2 loại phòng trong 12 ngày, tổng cộng 24 ô/)).toBeTruthy();
    expect(within(dialog).getByText(/áp dụng toàn bộ hoặc không áp dụng/)).toBeTruthy();
    // Confirming is a separate, deliberate act.
    expect(bulkApply).not.toHaveBeenCalled();
  });

  it('calls the bulk endpoint exactly once and never loops over dates', async () => {
    bulkApply.mockResolvedValue(effect());
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    await waitFor(() => expect(bulkApply).toHaveBeenCalledTimes(1));
    expect(updateRule).not.toHaveBeenCalled();
    expect(setRuleStatus).not.toHaveBeenCalled();
  });

  it('refetches the grid and announces the applied effect', async () => {
    bulkApply.mockResolvedValue(effect({ cellsAffected: 24 }));
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    await waitFor(() => expect(revalidate).toHaveBeenCalledWith(PROPERTY_ID));
    // The backend is authoritative: the grid is refetched, not patched.
    expect(refresh).toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringContaining('24 ô'));

    // The result is announced, and it quotes the apply response.
    const status = await screen.findByRole('status', { name: 'Kết quả áp dụng' });
    expect(status.textContent).toContain('24 ô');
  });

  it('requires a fresh preview before a second apply', async () => {
    bulkApply.mockResolvedValue(effect());
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    await waitFor(() => expect(bulkApply).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('shows a 422 refusal with the backend reasons and applies nothing', async () => {
    bulkApply.mockRejectedValue(apiError(422, 'NO_AVAILABILITY',
      'This bulk rate change cannot be applied.',
      [{ field: 'bulk', code: 'BULK_RATE_CONFLICT',
        message: 'stray-room does not belong to that property.' }]));
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This bulk rate change cannot be applied.');
    expect(alert.textContent).toContain('stray-room does not belong to that property.');
    // No retry, no partial success story.
    expect(bulkApply).toHaveBeenCalledTimes(1);
    expect(toastShow).not.toHaveBeenCalled();
    expect(screen.queryByText(/bỏ qua/i)).toBeNull();
  });

  it('reports a 404 as not found, never as a permission problem', async () => {
    bulkApply.mockRejectedValue(apiError(404, 'NOT_FOUND', 'Property not found.'));
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    // Doc 85 §6.3 — a foreign property is 404 so its existence is not disclosed.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/không tìm thấy/i);
    expect(alert.textContent).not.toMatch(/không có quyền/i);
  });

  it('reports a 409 as a conflict and asks for a reload', async () => {
    bulkApply.mockRejectedValue(apiError(409, 'ILLEGAL_TRANSITION', 'x'));
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/tải lại/i);
    // Never regenerate a preview or retry on the operator's behalf.
    expect(bulkPreview).toHaveBeenCalledTimes(1);
    expect(bulkApply).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable backend without inventing an outcome', async () => {
    bulkApply.mockRejectedValue(new TypeError('fetch failed'));
    await previewed();
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận áp dụng' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/không thể kết nối/i);
    expect(toastShow).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('writes nothing to web storage while editing', async () => {
    bulkPreview.mockResolvedValue(effect());
    await openBulk();
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước thay đổi' }));
    await screen.findByRole('region', { name: 'Chi tiết thay đổi' });

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('RateRulePanel', () => {
  /**
   * Renders the calendar and opens the rules section.
   *
   * STEP H moved rate rules below the fold into a collapsed disclosure: seasons
   * and campaigns are still real, but they are no longer what an operator meets
   * before they can change one night. Every assertion about the rule table
   * therefore has to open it first, exactly as an operator would.
   */
  const withRules = (rules: RateRuleView[]) => {
    // STEP K: the rule table is the advanced screen's own section and is no
    // longer behind a disclosure — the whole screen is now the secondary entry.
    return render(advanced([room(ROOM_A, 'Deluxe', 'deluxe')], rules));
  };

  it('explains where to start when no rule exists', () => {
    withRules([]);
    expect(screen.getByText('Chưa có quy tắc giá nào')).toBeTruthy();
  });

  it('shows both ordering keys without computing a winner', () => {
    withRules([rule({ priority: 5, specificity: 4 })]);

    const panel = screen.getByRole('region', { name: 'Danh sách quy tắc giá' });
    expect(within(panel).getByRole('columnheader', { name: 'Ưu tiên' })).toBeTruthy();
    expect(within(panel).getByRole('columnheader', { name: 'Độ cụ thể' })).toBeTruthy();
    // No prediction of which rule would win — RateResolver owns that.
    expect(screen.queryByText(/sẽ thắng|dự đoán/i)).toBeNull();
  });

  it('offers only the transitions the backend accepts', () => {
    withRules([rule({ status: 'ACTIVE' })]);
    expect(screen.getByRole('button', { name: 'Tạm ngưng quy tắc' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu trữ quy tắc' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kích hoạt quy tắc' })).toBeNull();

    cleanup();
    // Doc 56 §5.3 — archived is terminal, never deleted. Scoped to the panel:
    // the disclosure that now contains it is itself a button whose name ends in
    // "quy tắc", and it is not a transition control.
    withRules([rule({ status: 'ARCHIVED' })]);
    const panel = within(screen.getByRole('region', { name: 'Danh sách quy tắc giá' }));
    expect(panel.queryByRole('button', { name: /quy tắc$/ })).toBeNull();
    expect(panel.queryByRole('button', { name: /xoá|xóa|delete/i })).toBeNull();
  });

  it('surfaces an activation tie with the backend wording', async () => {
    setRuleStatus.mockRejectedValue(apiError(422, 'NO_AVAILABILITY',
      'An equally applicable rate rule already exists.',
      [{ field: 'priority', code: 'RATE_RULE_TIE',
        message: 'Doc 56 §3.1: a tie on (priority, specificity) is a configuration error.' }]));
    withRules([rule({ status: 'PAUSED' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Kích hoạt quy tắc' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('An equally applicable rate rule already exists.');
    expect(alert.textContent).toContain('configuration error');
    // The frontend never resolves the tie itself.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reprices a rule through the frozen PATCH and refetches', async () => {
    updateRule.mockResolvedValue(rule({ priceMinor: 1_800_000 }));
    withRules([rule()]);

    await userEvent.click(screen.getByRole('button', { name: 'Sửa giá' }));
    const price = await screen.findByLabelText(/Giá mỗi đêm/);
    await userEvent.clear(price);
    await userEvent.type(price, '1800000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    // The price is always restated: the backend requires exactly one of
    // priceMinor and adjustmentPercent.
    expect(updateRule.mock.calls[0]?.[1]).toEqual({ priceMinor: 1_800_000 });
    expect(refresh).toHaveBeenCalled();
  });

  it('will not reprice a percentage rule, whose rounding is still unfrozen', () => {
    withRules([rule({ priceMinor: null, adjustmentPercent: 25 })]);
    // OQ-119: converting it to a fixed price would endorse a PROPOSED rounding
    // mode. The rule stays readable and can still be paused or archived.
    expect(screen.queryByRole('button', { name: 'Sửa giá' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tạm ngưng quy tắc' })).toBeTruthy();
  });
});

describe('base-rate domain', () => {
  it('treats a missing base rate as a gap, never as zero', () => {
    // Doc 56 §9 keeps config B6 OPEN, so an unset base rate is a configuration
    // gap. Jackson omits the key entirely, so absent and null are one state.
    expect(baseRateAmount(baseRate({ amountMinor: null }))).toBeNull();
    expect(baseRateAmount(baseRateOnTheWire())).toBeNull();
    expect(baseRateAmount(undefined)).toBeNull();
    expect(baseRateLabel(baseRateOnTheWire())).toBe('chưa cấu hình giá cơ bản');
    expect(baseRateLabel(baseRateOnTheWire())).not.toContain('0');

    // Zero is a price a Partner may deliberately set — the CHECK permits it.
    expect(baseRateAmount(baseRate({ amountMinor: 0 }))).toBe(0);
    expect(baseRateLabel(baseRate({ amountMinor: 0 }))).not.toBe('chưa cấu hình giá cơ bản');
  });

  it('mirrors the frozen refusal without inventing a commercial limit', () => {
    expect(baseRateProblem('1200000')).toBeNull();
    expect(baseRateProblem('0')).toBeNull();
    // Blank is how the form says "clear", which is a real operation, not an error.
    expect(baseRateProblem('')).toBeNull();
    expect(baseRateProblem('-1')).toMatch(/không âm/);
    expect(baseRateProblem('1.5')).toMatch(/số nguyên/);
    // No upper bound and no suggested amount.
    expect(baseRateProblem('999999999')).toBeNull();
  });
});

describe('loadBaseRates', () => {
  it('treats an all-unpriced list as a success', async () => {
    baseRatesApi.mockResolvedValue([baseRateOnTheWire()]);
    const result = await loadBaseRates(PROPERTY_ID, 'c=1');
    expect(result.status).toBe('ok');
    expect(baseRatesApi).toHaveBeenCalledWith(PROPERTY_ID, 'c=1');
  });

  it('answers a malformed property id without asking the backend', async () => {
    const result = await loadBaseRates('nope');
    expect(result).toEqual({ status: 'ok', baseRates: [] });
    expect(baseRatesApi).not.toHaveBeenCalled();
  });

  it('surfaces a foreign property as an error, not as an empty list', async () => {
    baseRatesApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'x'));
    expect((await loadBaseRates(PROPERTY_ID)).status).toBe('error');
  });
});

describe('BaseRatePanel', () => {
  const withBases = (bases: BaseRateView[]) =>
    render(advanced([room(ROOM_A, 'Deluxe', 'deluxe')], [], bases));

  it('separates the base rate from a rate rule in words', () => {
    withBases([baseRate()]);
    // Doc 56 §3.1 ends its ladder at "base", below every rule — the Partner must
    // never mistake a conditional override for the fallback.
    expect(screen.getByText(/không có quy tắc giá nào/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Giá cơ bản' })).toBeTruthy();
  });

  it('shows an unset base rate as a gap and offers nothing to clear', () => {
    withBases([baseRateOnTheWire()]);
    expect(screen.getByText('chưa cấu hình giá cơ bản')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Xoá giá' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByLabelText(/Giá cơ bản — Deluxe/) as HTMLInputElement).value).toBe('');
  });

  it('sends the frozen request shape with the room type version', async () => {
    setBaseRate.mockResolvedValue(baseRate({ amountMinor: 1_200_000, version: 4 }));
    withBases([baseRateOnTheWire({ version: 3 })]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '1200000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(setBaseRate).toHaveBeenCalledTimes(1));
    expect(setBaseRate.mock.calls[0]?.[0]).toBe(ROOM_A);
    // room_type's own token — no version is invented for rate_rule, which has none.
    expect(setBaseRate.mock.calls[0]?.[1]).toEqual({ amountMinor: 1_200_000, version: 3 });
    // The backend decides what a date now costs, so the grid is refetched.
    expect(revalidate).toHaveBeenCalledWith(PROPERTY_ID);
    expect(refresh).toHaveBeenCalled();
  });

  it('never sends a partner identifier or an Authorization header', async () => {
    setBaseRate.mockResolvedValue(baseRate());
    withBases([baseRateOnTheWire({ version: 0 })]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '900000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(setBaseRate).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(setBaseRate.mock.calls[0])).not.toMatch(/partnerId|Authorization|Bearer/i);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('refuses a negative or fractional amount before the round trip', async () => {
    withBases([baseRateOnTheWire()]);
    const field = screen.getByLabelText(/Giá cơ bản — Deluxe/);

    await userEvent.type(field, '-5');
    expect(screen.getByText(/không âm/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
    expect(setBaseRate).not.toHaveBeenCalled();
  });

  it('accepts a deliberate zero', async () => {
    setBaseRate.mockResolvedValue(baseRate({ amountMinor: 0 }));
    withBases([baseRateOnTheWire()]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(setBaseRate).toHaveBeenCalledTimes(1));
    expect(setBaseRate.mock.calls[0]?.[1]).toEqual({ amountMinor: 0, version: 0 });
  });

  it('confirms before clearing, and clearing is not zeroing', async () => {
    setBaseRate.mockResolvedValue(baseRate({ amountMinor: null }));
    withBases([baseRate({ amountMinor: 1_200_000 })]);

    await userEvent.click(screen.getByRole('button', { name: 'Xoá giá' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xoá giá cơ bản' });
    expect(dialog.textContent).toMatch(/không bán được/);
    expect(dialog.textContent).toMatch(/không phải đặt giá bằng 0/);
    expect(setBaseRate).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xoá giá cơ bản' }));
    await waitFor(() => expect(setBaseRate).toHaveBeenCalledTimes(1));
    // null clears; it is never sent as 0.
    expect(setBaseRate.mock.calls[0]?.[1]).toEqual({ amountMinor: null, version: 0 });
  });

  it('reports a version conflict as a conflict and writes nothing further', async () => {
    setBaseRate.mockRejectedValue(apiError(409, 'VERSION_CONFLICT', 'x'));
    withBases([baseRateOnTheWire()]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '1200000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/tải lại/i);
    expect(setBaseRate).toHaveBeenCalledTimes(1);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('reports a foreign room type as not found, never as forbidden', async () => {
    setBaseRate.mockRejectedValue(apiError(404, 'NOT_FOUND', 'x'));
    withBases([baseRateOnTheWire()]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '1200000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/không tìm thấy/i);
    expect(alert.textContent).not.toMatch(/không có quyền/i);
  });

  it('announces a successful save', async () => {
    setBaseRate.mockResolvedValue(baseRate());
    withBases([baseRateOnTheWire()]);

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '1200000');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Trạng thái giá cơ bản' }).textContent)
        .toMatch(/Đã lưu/));
  });

  it('saves one room type per request and never loops the endpoint', async () => {
    setBaseRate.mockResolvedValue(baseRate());
    render(advanced(TWO_ROOMS(), [],
      [baseRateOnTheWire(), baseRateOnTheWire({ roomTypeId: ROOM_B, roomTypeSlug: 'suite' })]));

    await userEvent.type(screen.getByLabelText(/Giá cơ bản — Deluxe/), '1200000');
    await userEvent.click(screen.getAllByRole('button', { name: 'Lưu' })[0]!);

    // There is no bulk base-rate endpoint on the contract, so a "save all" that
    // fanned out PUTs would be inventing a workflow (OQ-150).
    await waitFor(() => expect(setBaseRate).toHaveBeenCalledTimes(1));
    expect(setBaseRate.mock.calls[0]?.[0]).toBe(ROOM_A);
  });

  it('keeps rule, base and unpriced as three distinct states', () => {
    // A base rate existing does not mean every cell resolves to it, and the
    // distinction has to survive wherever a cell is rendered. STEP K moved the
    // grid to Giá & Tồn phòng, so the invariant is asserted where it lives —
    // in the domain — and the calendar's rendering of it is covered by
    // `features/operations/operations.test.tsx`.
    expect(rateCellState(cell({ date: TODAY }))).toBe('ruled');
    expect(rateCellState(cell({ date: '2026-08-20', ruleId: null, ruleName: null })))
      .toBe('base');
    expect(rateCellState(unpricedOnTheWire('2026-08-21'))).toBe('unpriced');
  });

  it('shows no tax and no voucher', () => {
    const { container } = withBases([baseRate()]);
    expect(container.textContent).not.toMatch(/thuế|\bVAT\b|phí dịch vụ/i);
    expect(container.textContent).not.toMatch(/voucher|mã giảm giá/i);
  });
});
