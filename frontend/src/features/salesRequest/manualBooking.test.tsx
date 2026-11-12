// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SalesRequestSummary } from '@/lib/domain/salesRequest';
import type * as Primitives from '@/ui/primitives';

const calls = vi.hoisted(() => ({ approve: vi.fn(), confirm: vi.fn(), offer: vi.fn(), refresh: vi.fn(), show: vi.fn() }));
vi.mock('@/lib/api/endpoints/salesRequests', () => ({ salesRequestsApi: {
  approvePayment: calls.approve, confirmPayment: calls.confirm, proposeAlternative: calls.offer,
} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock('@/lib/api/endpoints/publicHotels', () => ({ publicHotelsApi: {
  properties: vi.fn().mockResolvedValue([{ slug: 'hotel-b', name: 'Khách sạn B', isFlagship: false, lifecycleState: 'OPEN' }]),
  roomTypes: vi.fn().mockResolvedValue([{ slug: 'deluxe', name: 'Phòng Deluxe' }]),
} }));
vi.mock('@/ui/primitives', async (original) => ({ ...(await original<typeof Primitives>()), useToast: () => ({ show: calls.show }) }));
import { ManualBookingActions } from './ManualBookingActions';
const request: SalesRequestSummary = { reference: 'KAS-TEST', salesStatus: 'REQUESTED', propertySlug: 'hotel-a', propertyName: 'Hotel A',
  leadSource: 'WEBSITE', checkIn: '2027-01-01', checkOut: '2027-01-03', rooms: 1, adults: 2, children: 0, nights: 2,
  guestName: 'Guest', requestedAt: '2026-10-24T01:00:00Z', slaDueAt: null, total: { amountMinor: 1000000, currency: 'VND', exponent: 0 } };
beforeEach(() => { vi.clearAllMocks(); calls.approve.mockResolvedValue(undefined); calls.confirm.mockResolvedValue(undefined); });
afterEach(cleanup);

it('requires an explicit confirmation before approving and refreshing the request', async () => {
  render(<ManualBookingActions request={request} />);
  await userEvent.click(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' }));
  expect(calls.approve).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: /^Xác nhận$/ }));
  await waitFor(() => expect(calls.approve).toHaveBeenCalledWith('KAS-TEST'));
  expect(calls.refresh).toHaveBeenCalled();
  expect(calls.confirm).not.toHaveBeenCalled();
});

it('only offers bank verification while payment is pending', async () => {
  render(<ManualBookingActions request={{ ...request, salesStatus: 'PAYMENT_PENDING' }} />);
  expect(screen.queryByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền' }));
  expect(calls.confirm).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: /^Xác nhận$/ }));
  await waitFor(() => expect(calls.confirm).toHaveBeenCalledWith('KAS-TEST'));
});

it('reports a failed approval without claiming success or refreshing', async () => {
  calls.approve.mockRejectedValue(new Error('offline'));
  render(<ManualBookingActions request={request} />);
  await userEvent.click(screen.getByRole('button', { name: 'Còn phòng — xác nhận và gửi link thanh toán' }));
  await userEvent.click(screen.getByRole('button', { name: /^Xác nhận$/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(calls.show).not.toHaveBeenCalled(); expect(calls.refresh).not.toHaveBeenCalled();
});

it('offers another room only after the admin reviews the proposal', async () => {
  render(<ManualBookingActions request={request} />);
  await userEvent.click(screen.getByRole('button', { name: 'Hết phòng — đề xuất phòng khác' }));
  await screen.findByRole('option', { name: 'Phòng Deluxe' });
  await userEvent.type(screen.getByLabelText(/Tổng giá/), '1400000');
  await userEvent.type(screen.getByLabelText('Lời nhắn'), 'Phòng khác cùng kỳ nghỉ');
  await userEvent.click(screen.getByRole('button', { name: 'Xem lại đề xuất' }));
  expect(calls.offer).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog').textContent).toContain('Khách sạn B');
  expect(screen.getByRole('dialog').textContent).toContain('Phòng Deluxe');
  // 2026-11-07: the dialog says the request ends and nothing is held.
  expect(screen.getByRole('dialog').textContent).toContain('Yêu cầu này sẽ kết thúc');
  await userEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất và kết thúc yêu cầu' }));
  await waitFor(() => expect(calls.offer).toHaveBeenCalledWith('KAS-TEST', {
    propertySlug: 'hotel-b', roomTypeSlug: 'deluxe', checkIn: '2027-01-01', checkOut: '2027-01-03',
    quantity: 1, totalMinor: 1400000, message: 'Phòng khác cùng kỳ nghỉ',
  }));
  expect(calls.approve).not.toHaveBeenCalled();
  expect(calls.confirm).not.toHaveBeenCalled();
});
