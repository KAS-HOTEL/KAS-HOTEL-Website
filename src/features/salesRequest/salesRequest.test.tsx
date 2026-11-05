// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type * as Primitives from '@/ui/primitives';
import {
  propertyLabel,
  slaState,
  stayLabel,
  type SalesRequestDetail,
  type SalesRequestSummary,
} from '@/lib/domain/salesRequest';

const queueApi = vi.fn();
const detailApi = vi.fn();
const declineApi = vi.fn();
const checkApi = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    queue: (...a: unknown[]) => queueApi(...a),
    detail: (...a: unknown[]) => detailApi(...a),
    // The detail view renders the decline panel, so the module mock must carry
    // its endpoint too — an undefined export would fail at import.
    decline: (...a: unknown[]) => declineApi(...a),
    availabilityCheck: (...a: unknown[]) => checkApi(...a),
  },
}));
// The decline panel is a client component and calls useRouter().
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The detail view now renders the availability-check panel, which shows a toast
// on success. The real ToastProvider is mounted by the partner layout, not by a
// unit render — so useToast is replaced and every other primitive stays real,
// the same shape inventory.test.tsx and policy.test.tsx use.
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));


const { loadSalesQueue, loadSalesRequest } = await import('./load');
const { SalesRequestTable } = await import('./SalesRequestTable');
const { SalesRequestDetailView } = await import('./SalesRequestDetailView');

const REQUESTED_AT = '2026-09-01T08:00:00Z';
const SLA_DUE_AT = '2026-09-02T08:00:00Z';
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
    rooms: 3,
    guestName: 'Nguyen Van A',
    requestedAt: REQUESTED_AT,
    slaDueAt: SLA_DUE_AT,
    total: { amountMinor: 12_450_000, currency: 'VND', exponent: 0 },
    ...overrides,
  };
}

function detail(overrides: Partial<SalesRequestDetail> = {}): SalesRequestDetail {
  return {
    summary: summary(),
    lines: [
      {
        roomTypeName: 'Deluxe Room',
        quantity: 2,
        nightly: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },
        lineTotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      },
    ],
    guest: {
      fullName: 'Nguyen Van A',
      email: 'guest@example.com',
      phone: '+84900000123',
      country: 'VN',
      preferredChannel: 'EMAIL',
      specialRequests: 'Late arrival',
    },
    timeline: [
      {
        field: 'SALES',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorType: 'CUSTOMER',
        reason: null,
        note: 'Guest submitted a direct reservation request (S1).',
        at: '2026-09-01T08:00:00Z',
      },
    ],
    ...overrides,
  };
}

function apiError(status: number, code: string) {
  return new ApiError(status, { code, message: 'refused', details: [], correlationId: 'c-1' });
}

beforeEach(() => {
  queueApi.mockReset();
  detailApi.mockReset();
});
afterEach(cleanup);

describe('sales request — pure domain', () => {
  it('bands the SLA against the deadline the server computed', () => {
    const row = { requestedAt: REQUESTED_AT, slaDueAt: SLA_DUE_AT };
    // One hour into a 24-hour window.
    expect(slaState(row, NOW)).toBe('within');
    // The last quarter.
    expect(slaState(row, Date.parse('2026-09-02T06:00:00Z'))).toBe('approaching');
    expect(slaState(row, Date.parse('2026-09-02T09:00:00Z'))).toBe('breached');
    // No deadline is not a breach — config A6 could be unset.
    expect(slaState({ requestedAt: REQUESTED_AT, slaDueAt: null }, NOW)).toBe('unknown');
  });

  it("renders the server's own nights and dates, never its own arithmetic", () => {
    expect(stayLabel(summary())).toBe('2026-09-12 → 2026-09-14 · 2 đêm');
    // The count comes from the field, not from subtracting the dates.
    expect(stayLabel(summary({ nights: 5 }))).toContain('5 đêm');
  });

  it('falls back to the slug the backend addressed the property by', () => {
    expect(propertyLabel(summary())).toBe('KAS Milestone');
    expect(propertyLabel(summary({ propertyName: null }))).toBe('kas-milestone');
  });
});

describe('sales queue loading', () => {
  it('treats an empty queue as success, not as a broken screen', async () => {
    queueApi.mockResolvedValue([]);
    const result = await loadSalesQueue();
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.requests).toEqual([]);
  });

  it('surfaces a failure as an error state', async () => {
    queueApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    expect((await loadSalesQueue()).status).toBe('error');
  });

  it('maps 404 to notFound and never re-describes it as a permission problem', async () => {
    detailApi.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const result = await loadSalesRequest('KAS-OTHER-PARTNER');
    // Doc 85 §6.3 — another partner's reference, an OTA reservation and one that
    // never existed are one answer.
    expect(result.status).toBe('notFound');
  });

  it('keeps other failures distinct from notFound', async () => {
    detailApi.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    expect((await loadSalesRequest('KAS-1')).status).toBe('error');
  });
});

describe('queue rendering', () => {
  it('shows the reference, guest name, stay, rooms and value', () => {
    render(<SalesRequestTable requests={[summary()]} now={NOW} />);
    expect(screen.getByRole('link', { name: 'KAS-260912-4F7A' })).toBeTruthy();
    expect(screen.getByText('Nguyen Van A')).toBeTruthy();
    expect(screen.getByText('12/09 – 14/09')).toBeTruthy();
    expect(screen.getByText('3 phòng')).toBeTruthy();
    expect(screen.getByText(/^Còn /)).toBeTruthy();
  });

  it('links each row by reference and nothing else', () => {
    render(<SalesRequestTable requests={[summary()]} now={NOW} />);
    const link = screen.getByRole('link', { name: 'KAS-260912-4F7A' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/partner/requests/KAS-260912-4F7A');
    // No guest datum in the URL — doc 85 §11 row 7 makes the reference the
    // addressable identifier, and it is not a credential.
    expect(link.getAttribute('href')).not.toMatch(/Nguyen|example\.com|84900/);
  });

  it('carries no guest contact detail at all', () => {
    render(<SalesRequestTable requests={[summary()]} now={NOW} />);
    const text = document.body.textContent ?? '';
    // Doc 59:148 gates guest data behind customer.view and requires the access be
    // logged. The queue incurs neither obligation, so it discloses neither datum.
    expect(text).not.toMatch(/@|\+84|EMAIL|ZALO/);
  });

  it('renders an empty state rather than an empty table', () => {
    render(<SalesRequestTable requests={[]} now={NOW} />);
    expect(screen.getByText('Chưa có yêu cầu nào')).toBeTruthy();
  });

  it('shows a dash for an unpriced row, never a zero', () => {
    render(<SalesRequestTable requests={[summary({ total: null })]} now={NOW} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/0\s*₫/);
  });

  it('marks a passed deadline in words as well as tint', () => {
    render(<SalesRequestTable requests={[summary()]} now={Date.parse('2026-09-03T00:00:00Z')} />);
    // Doc 82 forbids state carried by colour alone.
    expect(screen.getByText(/^Quá hạn /)).toBeTruthy();
  });
});

describe('detail rendering', () => {
  it('shows the stay, its lines and the guest when the server sent one', () => {
    const { container } = render(<SalesRequestDetailView request={detail()} now={NOW} />);
    expect(screen.getByRole('heading', { name: 'KAS-260912-4F7A' })).toBeTruthy();
    // Scoped to the header: the status also appears in the timeline now, and
    // what this line has always meant is that the header carries it.
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText('Chờ phản hồi')).toBeTruthy();
    expect(screen.getByText(/Deluxe Room × 2/)).toBeTruthy();
    expect(screen.getByText('guest@example.com')).toBeTruthy();
    expect(screen.getByText('+84900000123')).toBeTruthy();
  });

  it('says plainly when the account may not see the guest, rather than showing blanks', () => {
    render(<SalesRequestDetailView request={detail({ guest: null })} now={NOW} />);
    expect(screen.getByText(/không có quyền xem thông tin liên hệ/)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('guest@example.com');
  });

  it('offers decline, and no transition that is still blocked', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} />);
    // S11 is implemented, so the control exists. S10 needs config B12 and
    // OQ-172, and assignment needs B24/B25 — a button the server would refuse
    // is worse than none, so neither is rendered.
    expect(screen.getByRole('button', { name: 'Từ chối yêu cầu' })).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Xác nhận đặt phòng|Chấp nhận|Nhận xử lý|Phân công/);
    expect(screen.queryByRole('button', { name: /Accept|Win|Assign/i })).toBeNull();
  });

  it('claims no email or notification was sent', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} />);

    // The claim that matters is still enforced: nothing on this page tells the
    // operator a message went out, because none does.
    expect(document.body.textContent ?? '').not.toMatch(/đã gửi email|email sent/i);

    // It no longer says so in a paragraph, though. Explaining the absence of a
    // mail sender and of an assignment control to a hotelier described the
    // build rather than their booking, and it was the longest text on the page.
    expect(screen.queryByText(/chưa gửi bất kỳ email hay\s+thông báo nào/)).toBeNull();
    expect(screen.queryByText(/phân công người phụ trách/)).toBeNull();
  });

  it('renders a per-night dash rather than a price the stay never had', () => {
    const varying = detail({
      lines: [{ roomTypeName: 'Suite', quantity: 1, nightly: null, lineTotal: null }],
    });
    const { container } = render(<SalesRequestDetailView request={varying} now={NOW} />);

    // Doc 125 §9 — null when the nights differ. Asserted on the line itself,
    // because the summary legitimately carries an amount that ends in a zero and
    // a document-wide regex would match that instead of the line.
    const line = container.querySelector('li');
    expect(line?.textContent).toContain('Giá theo từng đêm');
    expect(line?.textContent).toContain('—');
    // A zero would read as "free", which is the one thing it never means.
    expect(line?.textContent).not.toMatch(/₫/);
  });

  it('exposes no internal identifier', () => {
    render(<SalesRequestDetailView request={detail()} now={NOW} />);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/ruleId|appliedRuleIds|priceSnapshot|partnerId|idempotenc/i);
  });
});
