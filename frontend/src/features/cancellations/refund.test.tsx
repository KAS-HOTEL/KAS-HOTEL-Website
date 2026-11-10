// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { previewFee } from '@/lib/domain/cancellationFee';

const calls = vi.hoisted(() => ({ list: vi.fn(), quote: vi.fn(), refunds: vi.fn(), recordRefund: vi.fn(), rejectRefund: vi.fn() }));
vi.mock('@/lib/api/endpoints/cancellations', () => ({ cancellationsApi: calls }));
import { RefundQueue } from './RefundQueue';

const pending = {
  requestId: 'req-9', reference: 'KAS0300001', propertySlug: 'hotel-a', propertyName: 'Hotel A', guestName: 'Guest',
  checkIn: '2026-12-10', checkOut: '2026-12-12', requestedAt: '', currency: 'VND', totalMinor: 4_968_000,
  status: 'REFUND_PENDING', feeMinor: 496_800, feeSource: 'RULE', paidMinor: 4_968_000, refundDueMinor: 4_471_200,
  paymentReference: 'SEPAY-tx3',
};

beforeEach(() => {
  vi.resetAllMocks();
  calls.refunds.mockResolvedValue([pending]);
  calls.recordRefund.mockResolvedValue(undefined);
  calls.rejectRefund.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('shows paid, fee and refund due, and records the refund only after confirmation', async () => {
  render(<RefundQueue />);
  await screen.findByText(/KAS0300001 · Hotel A · Chờ hoàn tiền/);
  expect(screen.getByText(/Mã giao dịch thanh toán: SEPAY-tx3/)).toBeTruthy();
  const amount = screen.getByLabelText('Số tiền thực hoàn (VND)') as HTMLInputElement;
  expect(amount.value).toBe('4471200');
  await userEvent.type(screen.getByLabelText('Mã tham chiếu / chứng từ'), 'FT123');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại và ghi nhận' }));
  expect(calls.recordRefund).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Đã hoàn tiền' }));
  await waitFor(() => expect(calls.recordRefund).toHaveBeenCalledWith('req-9',
    { refundAmountMinor: 4_471_200, refundedAt: null, reference: 'FT123', note: null }));
});

it('refuses a refund larger than what was paid, without calling the API', async () => {
  render(<RefundQueue />);
  const amount = await screen.findByLabelText('Số tiền thực hoàn (VND)');
  await userEvent.clear(amount);
  await userEvent.type(amount, '5000000');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại và ghi nhận' }));
  expect((await screen.findByRole('alert')).textContent).toContain('không được lớn hơn');
  expect(calls.recordRefund).not.toHaveBeenCalled();
});

it('records a refusal with its reason', async () => {
  render(<RefundQueue />);
  await screen.findByText(/KAS0300001/);
  await userEvent.type(screen.getByLabelText('Lý do (gửi cho khách)'), 'Khách yêu cầu giữ tiền cho lần sau');
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận không hoàn' }));
  await userEvent.click(screen.getByRole('button', { name: 'Không hoàn tiền' }));
  await waitFor(() => expect(calls.rejectRefund).toHaveBeenCalledWith('req-9', 'Khách yêu cầu giữ tiền cho lần sau'));
});

it('shows a decided refund read-only', async () => {
  calls.refunds.mockResolvedValue([{ ...pending, status: 'REFUNDED', refundAmountMinor: 4_471_200, refundReference: 'FT123' }]);
  render(<RefundQueue />);
  await screen.findByText(/Đã hoàn tiền/);
  expect(screen.queryByLabelText('Số tiền thực hoàn (VND)')).toBeNull();
});

it('previews the fee the backend will charge', () => {
  expect(previewFee({ feeType: 'PERCENT_OF_TOTAL', amountMinor: null, percent: 10 }, 4_968_000)).toBe(496_800);
  expect(previewFee({ feeType: 'PERCENT_OF_TOTAL', amountMinor: null, percent: 12.5 }, 1_000_005)).toBe(125_001);
  expect(previewFee({ feeType: 'FIXED_AMOUNT', amountMinor: 2_000_000, percent: null }, 1_000_000)).toBe(1_000_000);
});
