// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ list: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/api/endpoints/unmatchedPayments', () => ({ unmatchedPaymentsApi: calls }));
import { UnmatchedPayments } from './UnmatchedPayments';

const late = {
  id: 'evt-1', receivedAt: '2026-11-11T08:30:00Z', matchStatus: 'NOT_PENDING', invoiceNumber: 'KAS0112345-T1',
  transactionId: 'tx-77', paymentMethod: 'BANK_TRANSFER', amountMinor: 2_160_000, currency: 'VND',
  reference: 'KAS0112345', salesStatus: 'EXPIRED', guestName: 'Nguyen An', guestEmail: 'an@example.com',
  propertyName: 'KAS Elegance', bookingTotalMinor: 2_160_000, paymentDueAt: '2026-11-11T08:00:00Z',
  resolvedAt: null, resolution: null, resolutionNote: null, resolvedByEmail: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  calls.list.mockResolvedValue([late]);
  calls.resolve.mockResolvedValue({ ...late, resolvedAt: '2026-11-11T09:00:00Z', resolution: 'REFUNDED' });
});
afterEach(cleanup);

it('explains why the money did not confirm the booking', async () => {
  render(<UnmatchedPayments />);
  await screen.findByText(/KAS0112345 · .* · Chưa xử lý/);
  expect(screen.getByText(/không còn chờ thanh toán/)).toBeTruthy();
  expect(screen.getByText(/Mã giao dịch SePay: tx-77/)).toBeTruthy();
});

it('records the settlement only after a note and a confirmation', async () => {
  render(<UnmatchedPayments />);
  await screen.findByText(/KAS0112345/);
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại và ghi nhận' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Ghi lại đã làm gì');
  expect(calls.resolve).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Ghi chú'), 'Đã hoàn qua VCB, FT999');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại và ghi nhận' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));
  await waitFor(() => expect(calls.resolve).toHaveBeenCalledWith('evt-1', 'REFUNDED', 'Đã hoàn qua VCB, FT999'));
});

it('shows a settled payment read-only', async () => {
  calls.list.mockResolvedValue([{ ...late, resolvedAt: '2026-11-11T09:00:00Z', resolution: 'HANDLED',
    resolutionNote: 'Tạo đặt phòng mới KAS0154321', resolvedByEmail: 'admin@kas.vn' }]);
  render(<UnmatchedPayments />);
  await screen.findByText(/Đã xử lý cách khác/);
  expect(screen.queryByRole('button', { name: 'Xem lại và ghi nhận' })).toBeNull();
});
