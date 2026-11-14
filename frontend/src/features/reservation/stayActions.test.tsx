// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ transition: vi.fn(), completeStay: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock('@/lib/api/endpoints/opsReservations', () => ({ opsReservationsApi: { transition: calls.transition, completeStay: calls.completeStay } }));
import { ApiError } from '@/lib/api/errors';
import { StayActions, hotelTime } from './StayActions';
beforeEach(() => { vi.resetAllMocks(); calls.transition.mockResolvedValue({}); calls.completeStay.mockResolvedValue({}); });
afterEach(cleanup);
it.each([
  ['CONFIRMED', ['Nhận phòng', 'Khách không đến']],
  ['CHECK_IN_READY', ['Nhận phòng', 'Khách không đến']],
  ['CHECKED_IN', ['Trả phòng']],
  ['CHECKED_OUT', ['Huỷ xác nhận trả phòng']],
  ['CANCELLED', []],
  [null, []],
])('offers only the transitions %s allows', (status, labels) => {
  render(<StayActions reference="KAS-1" stayStatus={status} />);
  expect(screen.queryAllByRole('button').map((button) => button.textContent)).toEqual(labels);
});
it('asks first, calls the backend, then reloads the reservation', async () => {
  render(<StayActions reference="KAS-1" stayStatus="CHECKED_IN" />);
  await userEvent.click(screen.getByRole('button', { name: 'Trả phòng' }));
  expect(calls.transition).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
  await waitFor(() => expect(calls.transition).toHaveBeenCalledWith('KAS-1', 'check-out'));
  await waitFor(() => expect(calls.refresh).toHaveBeenCalled());
});
it('shows a backend refusal without reloading', async () => {
  calls.transition.mockRejectedValue(new ApiError(409, { code: 'ILLEGAL_TRANSITION', message: 'too early', details: [], correlationId: null }));
  render(<StayActions reference="KAS-1" stayStatus="CONFIRMED" />);
  await userEvent.click(screen.getByRole('button', { name: 'Nhận phòng' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
  await screen.findByRole('alert');
  expect(calls.refresh).not.toHaveBeenCalled();
});
it('reads times typed in hotel time as +07:00', () => {
  expect(hotelTime('2026-11-10T14:30')).toBe('2026-11-10T14:30:00+07:00');
});
it('shows a no-show in red with the real-times form and no other stay button (2026-11-14)', () => {
  render(<StayActions reference="KAS-1" stayStatus="NO_SHOW" checkIn="2026-11-10" checkOut="2026-11-11" />);
  expect(screen.getByRole('heading', { name: /Khách không đến/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nhận phòng' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Trả phòng' })).toBeNull();
  expect((screen.getByLabelText('Giờ check-in thực tế') as HTMLInputElement).value).toBe('2026-11-10T14:00');
  expect((screen.getByLabelText('Giờ check-out thực tế') as HTMLInputElement).value).toBe('2026-11-11T12:00');
});
it('completes a no-show only after confirmation, with the times in hotel time', async () => {
  render(<StayActions reference="KAS-1" stayStatus="NO_SHOW" checkIn="2026-11-10" checkOut="2026-11-11" />);
  await userEvent.click(screen.getByRole('button', { name: 'Hoàn thành đơn' }));
  expect(calls.completeStay).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
  await waitFor(() => expect(calls.completeStay).toHaveBeenCalledWith('KAS-1', '2026-11-10T14:00:00+07:00', '2026-11-11T12:00:00+07:00'));
  await waitFor(() => expect(calls.refresh).toHaveBeenCalled());
});
it('refuses a check-out time before the check-in time without calling the backend', async () => {
  render(<StayActions reference="KAS-1" stayStatus="NO_SHOW" checkIn="2026-11-10" checkOut="2026-11-11" />);
  const out = screen.getByLabelText('Giờ check-out thực tế');
  await userEvent.clear(out);
  await userEvent.type(out, '2026-11-09T10:00');
  await userEvent.click(screen.getByRole('button', { name: 'Hoàn thành đơn' }));
  expect((await screen.findByRole('alert')).textContent).toContain('phải sau giờ check-in');
  expect(calls.completeStay).not.toHaveBeenCalled();
});
it('shows each field the backend refuses', async () => {
  calls.completeStay.mockRejectedValue(new ApiError(422, { code: 'VALIDATION_FAILED', message: 'bad', correlationId: null,
    details: [{ field: 'checkedOutAt', code: 'IN_THE_FUTURE', message: 'Giờ check-out không được ở tương lai.' }] }));
  render(<StayActions reference="KAS-1" stayStatus="NO_SHOW" checkIn="2026-11-10" checkOut="2026-11-11" />);
  await userEvent.click(screen.getByRole('button', { name: 'Hoàn thành đơn' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
  expect((await screen.findByRole('alert')).textContent).toContain('không được ở tương lai');
  expect(calls.refresh).not.toHaveBeenCalled();
});
