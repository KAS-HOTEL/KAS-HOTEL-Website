// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import {
  deadlineFor,
  overdueFor,
  slaState,
  type SalesRequestSummary,
} from '@/lib/domain/salesRequest';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    decline: vi.fn(),
    cancel: vi.fn(),
    availabilityCheck: vi.fn(),
    win: vi.fn(),
    contact: vi.fn(),
    addNote: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

const { SalesRequestTable } = await import('./SalesRequestTable');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const REQUESTED_AT = '2026-09-01T08:00:00Z';
const DUE_AT = '2026-09-02T08:00:00Z';
const DUE = Date.parse(DUE_AT);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function summary(overrides: Partial<SalesRequestSummary> = {}): SalesRequestSummary {
  return {
    reference: 'KAS-260912-4F7A',
    salesStatus: 'REQUESTED',
    leadSource: 'WEBSITE',
    propertySlug: 'kas-milestone',
    propertyName: 'KAS Milestone',
    checkIn: '2026-09-12',
    checkOut: '2026-09-14',
    nights: 2,
    adults: 2,
    children: 0,
    rooms: 1,
    guestName: 'Nguyen Van A',
    requestedAt: REQUESTED_AT,
    slaDueAt: DUE_AT,
    total: { amountMinor: 2_400_000, currency: 'VND', exponent: 0 },
    ...overrides,
  };
}

function detail(overrides: Partial<SalesRequestSummary> = {}): SalesRequestDetail {
  return {
    summary: summary(overrides),
    lines: [{ roomTypeName: 'Deluxe Room', quantity: 1, nightly: null, lineTotal: null }],
    guest: null,
    timeline: [],
  };
}

/** The response-deadline cell of the queue's only row, found through its header. */
function deadlineCell(container: HTMLElement): HTMLElement {
  const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
  const column = headers.indexOf('Thời hạn phản hồi');
  const row = [...container.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td') !== null);
  const cell = row?.querySelectorAll('td')[column];
  if (column < 0 || !(cell instanceof HTMLElement)) {
    throw new Error('the queue row has no deadline cell');
  }
  return cell;
}

afterEach(cleanup);

describe('overdueFor — the measurement', () => {
  it('is null while the promise still stands', () => {
    // One hour before the deadline. Nothing is overdue, so nothing is claimed.
    expect(overdueFor(summary(), DUE - HOUR)).toBeNull();
  });

  it('is null when no deadline exists — config A6 unset', () => {
    expect(overdueFor(summary({ slaDueAt: null }), DUE + HOUR)).toBeNull();
    // And no timestamp is fabricated to fill the gap.
    expect(overdueFor({ requestedAt: REQUESTED_AT, slaDueAt: null }, Date.now())).toBeNull();
  });

  it('is null when a timestamp cannot be parsed', () => {
    expect(overdueFor(summary({ slaDueAt: 'not-a-date' }), DUE + HOUR)).toBeNull();
    expect(overdueFor(summary({ requestedAt: 'not-a-date' }), DUE + HOUR)).toBeNull();
  });

  it('is 0m exactly at the deadline, agreeing with the band', () => {
    // slaState uses `now >= due`, so the request is already breached at that
    // instant. The duration says the same thing rather than contradicting it.
    expect(slaState(summary(), DUE)).toBe('breached');
    expect(overdueFor(summary(), DUE)).toBe('0m');
  });

  it('counts minutes below an hour — doc 69 §4.2 shows "47m"', () => {
    expect(overdueFor(summary(), DUE + MINUTE)).toBe('1m');
    expect(overdueFor(summary(), DUE + 47 * MINUTE)).toBe('47m');
    expect(overdueFor(summary(), DUE + 59 * MINUTE)).toBe('59m');
  });

  it('counts hours and minutes below a day — doc 69 §4.2 shows "6h12m"', () => {
    expect(overdueFor(summary(), DUE + HOUR)).toBe('1h0m');
    expect(overdueFor(summary(), DUE + 6 * HOUR + 12 * MINUTE)).toBe('6h12m');
    expect(overdueFor(summary(), DUE + 23 * HOUR + 59 * MINUTE)).toBe('23h59m');
  });

  it('counts days and hours beyond a day — doc 69 §4.2 shows "1d 2h"', () => {
    expect(overdueFor(summary(), DUE + DAY)).toBe('1d 0h');
    expect(overdueFor(summary(), DUE + DAY + 2 * HOUR)).toBe('1d 2h');
    // Minutes are dropped past a day, exactly as the mockup drops them.
    expect(overdueFor(summary(), DUE + DAY + 2 * HOUR + 45 * MINUTE)).toBe('1d 2h');
    expect(overdueFor(summary(), DUE + 12 * DAY + 5 * HOUR)).toBe('12d 5h');
  });

  it('never shows seconds', () => {
    expect(overdueFor(summary(), DUE + 90_000)).toBe('1m');
    expect(overdueFor(summary(), DUE + 30_000)).toBe('0m');
  });

  it('invents no band — it measures one thing and reports it', () => {
    // No escalation level, no "critical after N hours". Two very different
    // delays produce the same shape of answer, differing only in magnitude.
    expect(overdueFor(summary(), DUE + 5 * MINUTE)).toBe('5m');
    expect(overdueFor(summary(), DUE + 40 * DAY)).toBe('40d 0h');
  });
});

describe('deadlineFor — what the console says about the deadline', () => {
  it('counts down while an unanswered request is within its deadline', () => {
    expect(deadlineFor(summary(), DUE - 3 * HOUR - 20 * MINUTE)).toEqual({ state: 'remaining', text: 'Còn 3 giờ 20 phút' });
  });

  it('counts up once the deadline has passed, for an unanswered or expired request', () => {
    expect(deadlineFor(summary(), DUE + DAY + 4 * HOUR)).toEqual({ state: 'overdue', text: 'Quá hạn 1 ngày 4 giờ' });
    expect(deadlineFor(summary({ salesStatus: 'EXPIRED' }), DUE + 12 * MINUTE).text).toBe('Quá hạn 12 phút');
  });

  it('says answered for a request the hotel already handled, whatever the clock says', () => {
    for (const status of ['PAYMENT_PENDING', 'WON', 'DECLINED', 'CANCELLED', 'CUSTOMER_CONTACTED']) {
      expect(deadlineFor(summary({ salesStatus: status }), DUE + DAY).state).toBe('answered');
    }
  });

  it('never invents a deadline that was not stored', () => {
    expect(deadlineFor(summary({ slaDueAt: null }), DUE)).toEqual({ state: 'none', text: 'Chưa có hạn' });
  });
});

describe('the queue row', () => {
  it('shows the time left and the deadline itself', () => {
    const { container } = render(<SalesRequestTable requests={[summary()]} now={DUE - 2 * HOUR} />);
    expect(within(deadlineCell(container)).getByText('Còn 2 giờ')).toBeTruthy();
    expect(within(deadlineCell(container)).getByText(/^Hạn /)).toBeTruthy();
  });

  it('shows how long ago the deadline passed for an expired request', () => {
    const { container } = render(
      <SalesRequestTable requests={[summary({ salesStatus: 'EXPIRED' })]} now={DUE + 2 * DAY + HOUR} />,
    );
    expect(within(deadlineCell(container)).getByText('Quá hạn 2 ngày 1 giờ')).toBeTruthy();
  });

  it('renders safely when no deadline exists', () => {
    const { container } = render(<SalesRequestTable requests={[summary({ slaDueAt: null })]} now={DUE} />);
    expect(within(deadlineCell(container)).getByText('Chưa có hạn')).toBeTruthy();
  });

  it('adds no button to the cell — the deadline states a fact', () => {
    const { container } = render(<SalesRequestTable requests={[summary()]} now={DUE + HOUR} />);
    expect(within(deadlineCell(container)).queryByRole('button')).toBeNull();
  });
});

describe('the request detail', () => {
  it('shows the creation time, the deadline, the overdue time and the status', () => {
    render(<SalesRequestDetailView request={detail({ salesStatus: 'EXPIRED' })} now={DUE + 3 * HOUR} />);
    for (const label of ['Ngày tạo yêu cầu', 'Thời hạn phản hồi', 'Số thời gian quá hạn', 'Trạng thái hiện tại']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('Quá hạn 3 giờ')).toBeTruthy();
    expect(screen.getAllByText(/Quá hạn/).length).toBeGreaterThan(0);
  });
});
