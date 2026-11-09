// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import {
  ageFor,
  overdueFor,
  slaState,
  type SalesRequestDetail,
  type SalesRequestSummary,
} from '@/lib/domain/salesRequest';

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
const REQUESTED = Date.parse(REQUESTED_AT);
/** A day after the request, so the SLA band is independent of the age. */
const DUE_AT = '2026-09-02T08:00:00Z';

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

const AGE_HEADER = 'Tuổi yêu cầu';

/** The header row's labels, in the order doc 69 §4.2 fixes them. */
function headers(container: HTMLElement): readonly (string | null)[] {
  return [...container.querySelectorAll('thead th')].map((th) => th.textContent);
}

afterEach(cleanup);

describe('ageFor — the measurement', () => {
  it('is 0m for a request that has only just arrived', () => {
    expect(ageFor(summary(), REQUESTED)).toBe('0m');
  });

  it('counts minutes below an hour — doc 69 §4.2 shows "47m"', () => {
    expect(ageFor(summary(), REQUESTED + 47 * MINUTE)).toBe('47m');
    expect(ageFor(summary(), REQUESTED + 59 * MINUTE)).toBe('59m');
  });

  it('counts hours and minutes below a day — doc 69 §4.2 shows "6h12m"', () => {
    expect(ageFor(summary(), REQUESTED + 6 * HOUR + 12 * MINUTE)).toBe('6h12m');
    expect(ageFor(summary(), REQUESTED + 23 * HOUR + 59 * MINUTE)).toBe('23h59m');
  });

  it('counts days and hours beyond a day — doc 69 §4.2 shows "1d 2h"', () => {
    expect(ageFor(summary(), REQUESTED + DAY + 2 * HOUR)).toBe('1d 2h');
    // Minutes are dropped past a day, exactly as the formatter already drops them.
    expect(ageFor(summary(), REQUESTED + DAY + 2 * HOUR + 45 * MINUTE)).toBe('1d 2h');
  });

  it('keeps counting for a request nobody ever answered', () => {
    // No cap, no "30d+", no escalation wording. The shape stays the same and
    // only the magnitude grows — a measurement, not a policy.
    expect(ageFor(summary(), REQUESTED + 400 * DAY + 7 * HOUR)).toBe('400d 7h');
  });

  it('never shows seconds', () => {
    expect(ageFor(summary(), REQUESTED + 30_000)).toBe('0m');
    expect(ageFor(summary(), REQUESTED + 90_000)).toBe('1m');
  });

  it('is null when the timestamp cannot be parsed, and fabricates nothing', () => {
    expect(ageFor({ requestedAt: 'not-a-date' }, REQUESTED)).toBeNull();
  });

  it('reads 0m if the clock runs behind the request — the formatter already clamps', () => {
    // Reachable only through skew between the database and the renderer. The
    // clamp is formatElapsed's existing behaviour, pinned here rather than
    // replaced by an invented negative or a dash.
    expect(ageFor(summary(), REQUESTED - 5 * MINUTE)).toBe('0m');
  });

  it('is not the overdue measurement — the two answer different questions', () => {
    // Two hours past a deadline that stood 24 hours after the request.
    const now = Date.parse(DUE_AT) + 2 * HOUR;

    expect(ageFor(summary(), now)).toBe('1d 2h');
    expect(overdueFor(summary(), now)).toBe('2h0m');
  });
});

describe('the queue no longer has an age column', () => {
  it('shows the response deadline instead, and keeps the backend’s order', () => {
    const rows = [
      summary({ reference: 'KAS-A', requestedAt: '2026-09-01T07:00:00Z' }),
      summary({ reference: 'KAS-B', requestedAt: '2026-09-01T04:00:00Z' }),
      summary({ reference: 'KAS-C', requestedAt: '2026-09-01T06:00:00Z' }),
    ];
    const { container } = render(<SalesRequestTable requests={rows} now={Date.parse('2026-09-01T08:00:00Z')} />);

    expect(headers(container)).not.toContain(AGE_HEADER);
    expect(headers(container)).toContain('Thời hạn phản hồi');
    const references = [...container.querySelectorAll('tbody tr')]
      .filter((row) => row.querySelector('td') !== null)
      .map((row) => row.querySelector('td')?.textContent);
    expect(references).toEqual(['KAS-A', 'KAS-B', 'KAS-C']);
  });
});

describe('age and the SLA band stay independent', () => {
  it('does not band the request — an old request inside a long promise is still within', () => {
    const now = REQUESTED + 20 * HOUR;
    const request = summary({ slaDueAt: '2026-09-05T08:00:00Z' });

    expect(ageFor(request, now)).toBe('20h0m');
    expect(slaState(request, now)).toBe('within');
  });
});

describe('the request workspace', () => {
  it('shows how long ago the request was sent, beside its status', () => {
    render(<SalesRequestDetailView request={detail()} now={REQUESTED + 47 * MINUTE} />);

    expect(screen.getByText(/đã gửi 47 phút/)).toBeTruthy();
  });

  it('shows the age and the overdue time as two labelled measurements', () => {
    render(<SalesRequestDetailView request={detail()} now={Date.parse(DUE_AT) + 3 * HOUR} />);

    expect(screen.getByText(/đã gửi 1 ngày 3 giờ/)).toBeTruthy();
    expect(screen.getByText('Số thời gian quá hạn')).toBeTruthy();
    expect(screen.getByText('Quá hạn 3 giờ')).toBeTruthy();
  });

  it('shows the time left while the deadline still stands', () => {
    render(<SalesRequestDetailView request={detail()} now={REQUESTED + 2 * HOUR} />);

    expect(screen.getByText(/đã gửi 2 giờ/)).toBeTruthy();
    expect(screen.getByText('Thời gian còn lại')).toBeTruthy();
    expect(screen.getByText('Còn 22 giờ')).toBeTruthy();
    expect(screen.queryByText(/Quá hạn/)).toBeNull();
  });

  it('leaves the rest of the workspace alone, without the lead source', () => {
    render(<SalesRequestDetailView request={detail()} now={REQUESTED + HOUR} />);

    expect(screen.getByRole('heading', { name: 'KAS-260912-4F7A' })).toBeTruthy();
    expect(screen.queryByText('Nguồn khách')).toBeNull();
    expect(screen.getByText(/Deluxe Room × 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
  });

  it('exposes no internal identifier alongside it', () => {
    render(<SalesRequestDetailView request={detail()} now={REQUESTED + HOUR} />);

    expect(document.body.innerHTML)
      .not.toMatch(/salesOwnerId|partnerId|propertyId|reservationId/i);
  });
});
