// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ register: vi.fn().mockResolvedValue(undefined), verify: vi.fn().mockResolvedValue(undefined), replace: vi.fn(), invalidate: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: calls.replace }) }));
vi.mock('@/lib/api/endpoints', () => ({ authApi: { registerCustomer: calls.register, verifyCustomerEmail: calls.verify } }));
vi.mock('@/features/auth/actions', () => ({ invalidateSessionCache: calls.invalidate }));
import { ApiError } from '@/lib/api/errors';
import { CustomerAccountForm } from './CustomerAccountForm';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('sends actual nationality independently from website language', async () => {
  render(<CustomerAccountForm locale="en" mode="register" returnTo="/en/account/stays" />);
  await userEvent.selectOptions(screen.getByLabelText(/Nationality/), 'VN');
  await userEvent.type(screen.getByLabelText(/Full name/), 'Test Guest');
  await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.invalid');
  await userEvent.type(screen.getByLabelText(/Phone number/), '0900000000');
  await userEvent.type(screen.getByLabelText(/^Password/), 'test-password-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Create customer account' }));
  await waitFor(() => expect(calls.register).toHaveBeenCalledWith({ fullName: 'Test Guest', email: 'guest@example.invalid', phone: '0900000000', password: 'test-password-456!', locale: 'en', country: 'VN' }));
  expect(calls.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('Enter the six-digit code');
});
it('moves a new account to the code screen and verifies with the email it registered', async () => {
  render(<CustomerAccountForm locale="en" mode="register" returnTo="/en/account/stays" />);
  await userEvent.selectOptions(screen.getByLabelText(/Nationality/), 'VN');
  await userEvent.type(screen.getByLabelText(/Full name/), 'Test Guest');
  await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.invalid');
  await userEvent.type(screen.getByLabelText(/Phone number/), '0900000000');
  await userEvent.type(screen.getByLabelText(/^Password/), 'test-password-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Create customer account' }));
  await userEvent.type(await screen.findByLabelText(/Verification code/), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(calls.verify).toHaveBeenCalledWith('guest@example.invalid', '123456'));
  expect((await screen.findByRole('status')).textContent).toContain('Email verified');
});
it('names a duplicate email instead of a generic failure', async () => {
  calls.register.mockRejectedValueOnce(new ApiError(409, { code: 'ACCOUNT_ALREADY_EXISTS', message: 'exists', details: [], correlationId: null }));
  render(<CustomerAccountForm locale="vi" mode="register" returnTo="/vi/account/stays" />);
  await userEvent.selectOptions(screen.getByLabelText(/Quốc tịch/), 'VN');
  await userEvent.type(screen.getByLabelText(/Họ và tên/), 'Test Guest');
  await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.invalid');
  await userEvent.type(screen.getByLabelText(/Số điện thoại/), '0900000000');
  await userEvent.type(screen.getByLabelText(/^Mật khẩu/), 'test-password-456!');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản khách hàng' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Email này đã tồn tại');
  expect(screen.queryByLabelText(/Mã xác thực/)).toBeNull();
});
it('offers password recovery from sign-in', () => {
  render(<CustomerAccountForm locale="en" mode="login" returnTo="/en/account/stays" />);
  expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/en/account/forgot-password');
});
