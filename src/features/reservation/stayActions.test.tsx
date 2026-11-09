// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ transition: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock('@/lib/api/endpoints/opsReservations', () => ({ opsReservationsApi: { transition: calls.transition } }));
import { ApiError } from '@/lib/api/errors';
import { StayActions } from './StayActions';
beforeEach(() => { vi.resetAllMocks(); calls.transition.mockResolvedValue({}); });
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
