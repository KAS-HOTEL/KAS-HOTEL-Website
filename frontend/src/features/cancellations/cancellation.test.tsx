// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cancellationFeePreview } from '@/lib/domain/manualBooking';
const calls = vi.hoisted(() => ({ list: vi.fn(), quote: vi.fn(), refunds: vi.fn(), recordRefund: vi.fn(), rejectRefund: vi.fn() }));
vi.mock('@/lib/api/endpoints/cancellations', () => ({ cancellationsApi: calls }));
import { CancellationQueue } from './CancellationQueue';
const row = { requestId: 'request-1', reference: 'KAS-FEE', propertySlug: 'hotel-a', propertyName: 'Hotel A', guestName: 'Guest', checkIn: '2027-01-01', checkOut: '2027-01-03', requestedAt: '', currency: 'VND', totalMinor: 1500000 };
beforeEach(() => { vi.resetAllMocks(); calls.list.mockResolvedValue([row]); calls.quote.mockResolvedValue(undefined); calls.refunds.mockResolvedValue([]); });
afterEach(cleanup);

it('computes exact percentage rounding and validates currency precision', () => {
  expect(cancellationFeePreview('PERCENTAGE', '10', 10005, 0)).toBe(1001);
  expect(cancellationFeePreview('PERCENTAGE', '12.50', 1500000, 0)).toBe(187500);
  expect(cancellationFeePreview('PERCENTAGE', '0', 1500000, 0)).toBe(0);
  expect(cancellationFeePreview('PERCENTAGE', '100', 1500000, 0)).toBe(1500000);
  for (const value of ['-1', '100.01', '0.001', '', 'NaN']) expect(cancellationFeePreview('PERCENTAGE', value, 1500000, 0)).toBeNull();
  expect(cancellationFeePreview('PERCENTAGE', '10', null, 0)).toBeNull();
  expect(cancellationFeePreview('AMOUNT', '12.34', null, 2)).toBe(1234);
  expect(cancellationFeePreview('AMOUNT', '12.34', null, 0)).toBeNull();
});

it('previews percentage and only sends the percentage after confirmation', async () => {
  render(<CancellationQueue />);
  await screen.findByText(/KAS-FEE · Hotel A/);
  await userEvent.selectOptions(screen.getByLabelText('Loại phí'), 'PERCENTAGE');
  await userEvent.type(screen.getByLabelText('Mức phí (%)'), '25');
  await userEvent.type(screen.getByLabelText('Ghi chú cho khách'), 'Khách sạn báo phí');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại phí hủy' }));
  expect(calls.quote).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog').textContent).toContain('375.000');
  await userEvent.click(screen.getByRole('button', { name: 'Gửi phí hủy' }));
  await waitFor(() => expect(calls.quote).toHaveBeenCalledWith('KAS-FEE', 'request-1', { percentage: 25, note: 'Khách sạn báo phí' }));
});

it('supports a fixed currency amount and preserves errors for retry', async () => {
  calls.quote.mockRejectedValueOnce(new Error('offline'));
  render(<CancellationQueue />);
  await screen.findByText(/KAS-FEE · Hotel A/);
  await userEvent.type(screen.getByLabelText('Số tiền (VND)'), '250000');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại phí hủy' }));
  await userEvent.click(screen.getByRole('button', { name: 'Gửi phí hủy' }));
  await screen.findByRole('alert');
  expect(calls.quote).toHaveBeenCalledWith('KAS-FEE', 'request-1', { feeMinor: 250000, note: '' });
  expect(screen.queryByText(/Đã báo phí/)).toBeNull();
  expect((screen.getByLabelText('Số tiền (VND)') as HTMLInputElement).value).toBe('250000');
});
