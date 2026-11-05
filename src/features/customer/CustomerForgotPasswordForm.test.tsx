// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ forgot: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => ({ authApi: { forgotCustomerPassword: calls.forgot } }));
import { CustomerForgotPasswordForm } from './CustomerForgotPasswordForm';
beforeEach(() => { vi.resetAllMocks(); calls.forgot.mockResolvedValue({ message: 'accepted' }); });
afterEach(cleanup);
it('requests a reset link and gives the same answer for any address', async () => {
  render(<CustomerForgotPasswordForm locale="en" />);
  await userEvent.type(screen.getByLabelText(/^Email/), ' guest@example.invalid');
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  await waitFor(() => expect(calls.forgot).toHaveBeenCalledWith('guest@example.invalid'));
  expect(screen.getByRole('status').textContent).toContain('If this email has a KAS account');
});
it('does not claim a link was sent when the request fails', async () => {
  calls.forgot.mockRejectedValue(new Error('offline'));
  render(<CustomerForgotPasswordForm locale="vi" />);
  await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.invalid');
  await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Không thể gửi');
  expect(screen.queryByRole('status')).toBeNull();
});
