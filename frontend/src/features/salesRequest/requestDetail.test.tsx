// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import type { SalesRequestDetail } from '@/lib/domain/salesRequest';

const checkApi = vi.fn();
const declineApi = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  salesRequestsApi: {
    availabilityCheck: (...a: unknown[]) => checkApi(...a),
    decline: (...a: unknown[]) => declineApi(...a),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const { SalesRequestDetailView } = await import('./SalesRequestDetailView');
const { DECLINE_COPY } = await import('./DeclineRequestPanel');

const REFERENCE = 'KAS-260912-4F7A';
const NOW = Date.parse('2026-09-01T09:00:00Z');

function detail(salesStatus = 'AVAILABILITY_CHECK'): SalesRequestDetail {
  return {
    summary: {
      reference: REFERENCE,
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
  };
}

beforeEach(() => {
  checkApi.mockReset();
  declineApi.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});
afterEach(cleanup);

describe('detail view — manual payment workflow', () => {
  it('offers QR approval before payment and bank verification only at PAYMENT_PENDING', () => {
    for (const status of ['REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK', 'CUSTOMER_CONTACTED']) {
      render(<SalesRequestDetailView request={detail(status)} now={NOW} />);
      expect(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Xác nhận đã nhận tiền' })).toBeNull();
      cleanup();
    }
    render(<SalesRequestDetailView request={detail('PAYMENT_PENDING')} now={NOW} />);
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' })).toBeNull();
  });
  it('offers neither payment action after an offer or a terminal decision', () => {
    for (const status of ['ALTERNATIVE_OFFERED', 'WON', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
      render(<SalesRequestDetailView request={detail(status)} now={NOW} />);
      expect(screen.queryByRole('button', { name: 'Xác nhận đã nhận tiền' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' })).toBeNull();
      cleanup();
    }
  });
  it('introduces no assignment control — doc 134’s dependency is still missing', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Phân công|Nhận xử lý|người phụ trách này/);
    expect(screen.queryByRole('button', { name: /Assign/i })).toBeNull();

    // With the contact panel removed, the only select left is the cancel form's
    // "who asked" (2026-11-07) — no owner / assignment picker.
    expect(screen.queryAllByRole('combobox').map((select) => select.id)).toEqual(['cancel-reason-requested-by']);
  });

  it('introduces no payment control — B12 was answered pay-at-hotel', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);

    // The approve button names what it sends (the SePay payment link, 2026-11-10); beyond that
    // label the detail view still collects no payment, deposit, cash or invoice data.
    const text = (document.body.textContent ?? '').replace('Còn phòng — xác nhận và gửi link thanh toán', '');
    expect(text).not.toMatch(/thanh toán|đặt cọc|chuyển khoản|tiền mặt|hoá đơn/i);
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });

  it('exposes no internal identifier through the new action', () => {
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);
    expect(document.body.innerHTML).not.toMatch(
      /salesOwnerId|reservationId|holdId|priceSnapshot|partnerId|direct_committed/i,
    );
  });

  it('leaves decline exactly as it was', async () => {
    declineApi.mockResolvedValue(undefined);
    render(<SalesRequestDetailView request={detail('AVAILABILITY_CHECK')} now={NOW} />);

    await userEvent.type(
      screen.getByLabelText(new RegExp(DECLINE_COPY.reasonLabel)),
      'Guest went elsewhere.',
    );
    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.action }));
    expect(declineApi).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: DECLINE_COPY.confirm }));
    await waitFor(() => expect(declineApi).toHaveBeenCalledTimes(1));
  });
});

describe('detail view — price breakdown (2026-11-10)', () => {
  const vnd = (amountMinor: number) => ({ amountMinor, currency: 'VND', exponent: 0 });

  it('lists rooms, voucher, VAT and the total the guest pays', () => {
    const request: SalesRequestDetail = {
      ...detail('REQUESTED'),
      price: {
        roomsSubtotal: vnd(1_400_000),
        voucherCode: 'KAS-FKRYTFKZ',
        voucherName: 'TEST',
        voucherPercent: 50,
        discount: vnd(700_000),
        roomsAfterDiscount: vnd(700_000),
        taxes: [{ type: 'VAT', ratePercent: 8, amount: vnd(56_000), inclusive: false }],
        total: vnd(756_000),
      },
    };
    render(<SalesRequestDetailView request={request} now={NOW} />);

    expect(screen.getByText('Chi tiết giá')).toBeTruthy();
    expect(screen.getByText(/Voucher KAS-FKRYTFKZ \(−50%\)/)).toBeTruthy();
    expect(screen.getByText('Tiền phòng sau ưu đãi')).toBeTruthy();
    expect(screen.getByText('Thuế GTGT (VAT) 8%')).toBeTruthy();
    expect(screen.getByText('Tổng khách cần thanh toán')).toBeTruthy();
  });

  it('shows no voucher rows when none was used, and no card from an older server', () => {
    const withoutVoucher: SalesRequestDetail = {
      ...detail('REQUESTED'),
      price: {
        roomsSubtotal: vnd(2_400_000), voucherCode: null, voucherName: null, voucherPercent: null,
        discount: vnd(0), roomsAfterDiscount: vnd(2_400_000),
        taxes: [{ type: 'VAT', ratePercent: 8, amount: vnd(192_000), inclusive: false }],
        total: vnd(2_592_000),
      },
    };
    const { unmount } = render(<SalesRequestDetailView request={withoutVoucher} now={NOW} />);
    expect(screen.queryByText(/^Voucher /)).toBeNull();
    expect(screen.queryByText('Tiền phòng sau ưu đãi')).toBeNull();
    unmount();

    render(<SalesRequestDetailView request={detail('REQUESTED')} now={NOW} />);
    expect(screen.queryByText('Chi tiết giá')).toBeNull();
  });
});

describe('detail view — email status wording (2026-11-10)', () => {
  it('says a test-allowlist hold is not an error and shows no attempt count', async () => {
    const { emailDeliveryState } = await import('./SalesRequestDetailView');
    const held = emailDeliveryState({ eventKey: 'booking-guest-KAS1', status: 'RETRY', attempts: 0, nextAttemptAt: null, sentAt: null, lastErrorCode: 'RECIPIENT_NOT_ALLOWED' });
    expect(held.status).toBe('Không gửi (chế độ thử nghiệm)');
    expect(held.detail).not.toMatch(/thử lại|lần/);
    const sent = emailDeliveryState({ eventKey: 'booking-hotel-KAS1', status: 'SENT', attempts: 1, nextAttemptAt: null, sentAt: '2026-11-10T06:32:00Z', lastErrorCode: null });
    expect(sent.status).toBe('Đã gửi đi');
    const retry = emailDeliveryState({ eventKey: 'x', status: 'RETRY', attempts: 2, nextAttemptAt: null, sentAt: null, lastErrorCode: 'PROVIDER_5XX' });
    expect(retry.detail).toContain('đã thử 2 lần');
    expect(emailDeliveryState({ eventKey: 'x', status: 'RETRY', attempts: 0, nextAttemptAt: null, sentAt: null, lastErrorCode: 'PROVIDER_5XX' }).detail).not.toContain('0');
  });
});
