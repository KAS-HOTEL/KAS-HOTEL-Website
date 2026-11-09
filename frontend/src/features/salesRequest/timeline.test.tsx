// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import { salesStatusLabel } from '@/lib/domain/salesRequest';
import type { SalesRequestDetail, SalesRequestEvent } from '@/lib/domain/salesRequest';

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    decline: vi.fn(),
    cancel: vi.fn(),
    availabilityCheck: vi.fn(),
    win: vi.fn(),
    contact: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

/** The removed full timeline's heading; the detail page must not show it. */
const TIMELINE_TITLE = 'Lịch sử xử lý';
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const NOW = Date.parse('2026-09-01T09:00:00Z');

afterEach(cleanup);

function event(overrides: Partial<SalesRequestEvent> = {}): SalesRequestEvent {
  return {
    field: 'SALES',
    fromStatus: 'REQUESTED',
    toStatus: 'ASSIGNED',
    actorType: 'ADMIN',
    reason: null,
    note: null,
    at: '2026-09-01T08:30:00Z',
    ...overrides,
  };
}

/** The lifecycle as the backend actually records it, oldest first. */
const FULL_HISTORY: readonly SalesRequestEvent[] = [
  event({
    fromStatus: null,
    toStatus: 'REQUESTED',
    actorType: 'CUSTOMER',
    note: 'Guest submitted a direct reservation request (S1).',
    at: '2026-09-01T08:00:00Z',
  }),
  event({ toStatus: 'ASSIGNED', at: '2026-09-01T08:10:00Z' }),
  event({
    fromStatus: 'ASSIGNED',
    toStatus: 'AVAILABILITY_CHECK',
    at: '2026-09-01T08:20:00Z',
  }),
  event({
    fromStatus: 'AVAILABILITY_CHECK',
    toStatus: 'WON',
    note: 'Won. 2 hold night(s) converted, 0 released (S10).',
    at: '2026-09-01T08:30:00Z',
  }),
  event({
    field: 'STAY',
    fromStatus: null,
    toStatus: 'CONFIRMED',
    at: '2026-09-01T08:30:00.001Z',
  }),
];

function detail(
  salesStatus = 'REQUESTED',
  events: readonly SalesRequestEvent[] = FULL_HISTORY,
): SalesRequestDetail {
  return {
    summary: {
      reference: 'KAS-260912-4F7A',
      salesStatus,
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
      requestedAt: '2026-09-01T08:00:00Z',
      slaDueAt: '2026-09-02T08:00:00Z',
      total: { amountMinor: 2_400_000, currency: 'VND', exponent: 0 },
    },
    lines: [{ roomTypeName: 'Deluxe Room', quantity: 1, nightly: null, lineTotal: null }],
    guest: null,
    timeline: events,
  };
}

/** One entry, checked — indexed access is `| undefined` under strict mode. */

/**
 * The detail page draws its own compact history ("Lịch sử cập nhật") in the
 * handling column: sales statuses in the badge's Vietnamese, newest first, with
 * who acted and when.
 */
describe('the detail page', () => {
  it('shows the sales history newest first, in Vietnamese, without raw codes', () => {
    const { container } = render(<SalesRequestDetailView request={detail()} now={NOW} />);

    expect(screen.getByText('Lịch sử cập nhật')).toBeTruthy();
    expect(screen.queryByText(TIMELINE_TITLE)).toBeNull();
    const entries = [...(container.querySelector('ol')?.querySelectorAll('li') ?? [])];
    // Four sales transitions; the stay's CONFIRMED is not part of this history.
    expect(entries).toHaveLength(4);
    expect(entries[0]?.textContent).toContain(salesStatusLabel('WON'));
    expect(entries[3]?.textContent).toContain(salesStatusLabel('REQUESTED'));
    expect(entries[3]?.textContent).toContain('Khách hàng');
    for (const raw of ['ASSIGNED', 'AVAILABILITY_CHECK', 'WON', 'CONFIRMED']) {
      expect(screen.queryByText(raw)).toBeNull();
    }
    // The machine's English notes and raw ISO timestamps stay off the page.
    expect(screen.queryByText(/Won\. 2 hold night/)).toBeNull();
    expect(screen.queryByText(/2026-09-01T08:10/)).toBeNull();
  });

  it('draws a history entry whose reason and note were left out of the JSON', () => {
    const onTheWire = [{ field: 'SALES', fromStatus: null, toStatus: 'REQUESTED', actorType: 'CUSTOMER', at: '2026-09-01T08:00:00Z' }] as unknown as SalesRequestEvent[];
    render(<SalesRequestDetailView request={detail('REQUESTED', onTheWire)} now={NOW} />);
    expect(screen.getByText('Lịch sử cập nhật')).toBeTruthy();
    expect(screen.getAllByText(salesStatusLabel('REQUESTED')).length).toBeGreaterThan(0);
  });

  it('leaves the existing action panels working', () => {
    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);

    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối yêu cầu' })).toBeTruthy();
  });

  it('explains nothing on a terminal request — it simply offers nothing', () => {
    render(<SalesRequestDetailView request={detail('DECLINED')} now={NOW} />);

    expect(screen.queryByRole('button', { name: 'Từ chối yêu cầu' })).toBeNull();
    expect(screen.queryByText(TIMELINE_TITLE)).toBeNull();
    expect(screen.queryByText(/đã ở trạng thái cuối/)).toBeNull();
  });
});
