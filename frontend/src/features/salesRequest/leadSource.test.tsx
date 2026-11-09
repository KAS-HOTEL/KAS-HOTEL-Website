// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail, SalesRequestSummary } from '@/lib/domain/salesRequest';

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

const NOW = Date.parse('2026-09-01T09:00:00Z');

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
    requestedAt: '2026-09-01T08:00:00Z',
    slaDueAt: '2026-09-02T08:00:00Z',
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

afterEach(cleanup);

/**
 * The lead source is still recorded and returned by the API, but the owner asked
 * for it to leave the screens: the console no longer sorts work by where a guest
 * came from.
 */
describe('the queue', () => {
  it('has no lead source column', () => {
    const { container } = render(<SalesRequestTable requests={[summary({ leadSource: 'FACEBOOK' })]} now={NOW} />);
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).not.toContain('Nguồn khách');
    expect(screen.queryByText('FACEBOOK')).toBeNull();
  });

  it('keeps code, guest, hotel, sent at, stay, party, value, deadline and status, in that order', () => {
    const { container } = render(<SalesRequestTable requests={[summary()]} now={NOW} />);
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual([
      'Mã yêu cầu', 'Khách hàng', 'Khách sạn', 'Thời điểm gửi', 'Kỳ nghỉ', 'Phòng / khách', 'Giá trị',
      'Thời hạn phản hồi', 'Trạng thái',
    ]);
    expect(screen.getByRole('link', { name: 'KAS-260912-4F7A' })).toBeTruthy();
    expect(screen.getByText('Nguyen Van A')).toBeTruthy();
    expect(screen.getByText('KAS Milestone')).toBeTruthy();
    expect(screen.getByText('12/09 – 14/09')).toBeTruthy();
    expect(screen.getByText('1 phòng')).toBeTruthy();
    expect(screen.getByText('2 khách')).toBeTruthy();
    expect(screen.getByText(/2.400.000/)).toBeTruthy();
  });
});

describe('the request detail', () => {
  it('does not list the lead source among the stay facts', () => {
    render(<SalesRequestDetailView request={detail({ leadSource: 'ZALO' })} now={NOW} />);
    expect(screen.queryByText('Nguồn khách')).toBeNull();
    expect(screen.queryByText('ZALO')).toBeNull();
  });

  it('leaves the rest of the workspace untouched', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} />);
    expect(screen.getByRole('heading', { name: 'KAS-260912-4F7A' })).toBeTruthy();
    expect(screen.getByText(/Deluxe Room × 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối yêu cầu' })).toBeTruthy();
  });

  it('exposes no internal identifier', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} />);
    expect(document.body.innerHTML).not.toMatch(/salesOwnerId|partnerId|propertyId|reservationId/i);
  });
});
