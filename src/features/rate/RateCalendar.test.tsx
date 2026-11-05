// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoomTypeView } from '@/lib/domain/roomType';
import type { RateGridView } from '@/lib/domain/rate';
const setPrice = vi.fn();
const clearPrice = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/api/endpoints', () => ({ ratesApi: {
  setDayPrice: (...args: unknown[]) => setPrice(...args),
  clearDayPrice: (...args: unknown[]) => clearPrice(...args),
} }));
vi.mock('./actions', () => ({ revalidateRates: vi.fn() }));
const { RateCalendar } = await import('./RateCalendar');
const room: RoomTypeView = { id: 'r1', slug: 'suite', translations: { vi: { name: 'Suite' } },
  status: 'PUBLISHED', maxAdults: 2, maxChildren: 0, maxOccupancy: 2, smoking: false,
  sortOrder: 0, beds: [], amenityCodes: [], version: 0 };
const grid: RateGridView = { propertyId: 'p1', from: '2026-11-01', to: '2026-11-01',
  rows: [{ roomTypeId: 'r1', cells: [{ roomTypeId: 'r1', date: '2026-11-01', amountMinor: 100_000, currency: 'VND' }] }] };
afterEach(cleanup);
beforeEach(() => { setPrice.mockReset(); clearPrice.mockReset(); refresh.mockReset(); });
function show() { return render(<RateCalendar propertyId="p1" rooms={[room]} grid={grid} />); }
it('shows prices without stock counts or stock editors', () => {
  const { container } = show();
  expect(container.textContent).not.toMatch(/tồn|còn.*phòng|đã giữ|availableDirect/i);
  expect(screen.getByRole('button', { name: 'Giá Suite 2026-11-01' })).toBeTruthy();
});
it('saves a daily price without making an inventory request', async () => {
  setPrice.mockResolvedValue({}); show();
  await userEvent.click(screen.getByRole('button', { name: 'Giá Suite 2026-11-01' }));
  await userEvent.clear(screen.getByLabelText('Số tiền'));
  await userEvent.type(screen.getByLabelText('Số tiền'), '125000');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu giá' }));
  await waitFor(() => expect(setPrice).toHaveBeenCalledWith('r1', '2026-11-01', 125000));
  expect(clearPrice).not.toHaveBeenCalled();
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Đã cập nhật giá.');
});
it('clears only the day override and reports a failed save', async () => {
  clearPrice.mockRejectedValue(new Error('offline')); show();
  await userEvent.click(screen.getByRole('button', { name: 'Giá Suite 2026-11-01' }));
  await userEvent.click(screen.getByRole('button', { name: 'Dùng lại giá cơ bản hoặc quy tắc' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Không lưu được giá. Vui lòng thử lại.');
  expect(clearPrice).toHaveBeenCalledWith('r1', '2026-11-01');
  expect(setPrice).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
