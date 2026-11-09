// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ reset: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: calls.replace }) }));
vi.mock('@/lib/api/endpoints', () => ({ authApi: { resetCustomerPassword: calls.reset } }));
import { CustomerPasswordResetForm } from './CustomerPasswordResetForm';
beforeEach(() => { vi.resetAllMocks(); calls.reset.mockResolvedValue(undefined); });
afterEach(cleanup);
it('requires the email token before offering any mutation', () => {
  render(<CustomerPasswordResetForm locale="en" token="" />);
  expect(screen.getByRole('alert').textContent).toContain('Missing reset link');
  expect(screen.queryByRole('button')).toBeNull();
  expect(calls.reset).not.toHaveBeenCalled();
});
it('rejects mismatched passwords without calling the API', async () => {
  render(<CustomerPasswordResetForm locale="en" token="synthetic-token" />);
  await userEvent.type(screen.getByLabelText(/^New password/), 'password-one-456!');
  await userEvent.type(screen.getByLabelText(/^Confirm password/), 'password-two-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByRole('alert').textContent).toContain('same password twice');
  expect(calls.reset).not.toHaveBeenCalled();
});
it('uses the existing API and removes the token from the current route after success', async () => {
  render(<CustomerPasswordResetForm locale="vi" token="synthetic-token" />);
  await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), 'password-one-456!');
  await userEvent.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'password-one-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
  await waitFor(() => expect(calls.reset).toHaveBeenCalledWith('synthetic-token', 'password-one-456!'));
  expect(screen.getByRole('status').textContent).toContain('Đã đổi mật khẩu');
  expect(calls.replace).toHaveBeenCalledWith('/vi/account/reset-password');
});
it('does not report success when an expired or used token is rejected', async () => {
  calls.reset.mockRejectedValue(new Error('expired'));
  render(<CustomerPasswordResetForm locale="en" token="synthetic-expired-token" />);
  await userEvent.type(screen.getByLabelText(/^New password/), 'password-one-456!');
  await userEvent.type(screen.getByLabelText(/^Confirm password/), 'password-one-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Password changed. Please sign in again.')).toBeNull();
  expect(calls.replace).not.toHaveBeenCalled();
});
