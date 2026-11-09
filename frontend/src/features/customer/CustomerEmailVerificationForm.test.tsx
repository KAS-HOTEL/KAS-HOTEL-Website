// @vitest-environment jsdom
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({verify:vi.fn(),resend:vi.fn()}));
vi.mock('@/lib/api/endpoints',()=>({authApi:{verifyCustomerEmail:calls.verify,resendVerification:calls.resend}}));
import {CustomerEmailVerificationForm} from './CustomerEmailVerificationForm';
beforeEach(()=>{vi.resetAllMocks();calls.verify.mockResolvedValue(undefined);calls.resend.mockResolvedValue(undefined);});
afterEach(cleanup);
it('verifies with the email and six-digit code the user entered',async()=>{
 render(<CustomerEmailVerificationForm locale="vi" token=""/>);
 expect(calls.verify).not.toHaveBeenCalled();
 await userEvent.type(screen.getByLabelText(/^Email/),'guest@example.invalid');
 await userEvent.type(screen.getByLabelText(/Mã xác thực/),'123456');
 await userEvent.click(screen.getByRole('button',{name:'Xác thực email'}));
 await waitFor(()=>expect(calls.verify).toHaveBeenCalledWith('guest@example.invalid','123456'));
 expect(screen.getByRole('status').textContent).toContain('Email đã được xác thực');
});
it('does not submit a partial code',async()=>{
 render(<CustomerEmailVerificationForm locale="en" token=""/>);
 await userEvent.type(screen.getByLabelText(/^Email/),'guest@example.invalid');
 await userEvent.type(screen.getByLabelText(/Verification code/),'123');
 expect((screen.getByRole('button',{name:'Verify email'}) as HTMLButtonElement).disabled).toBe(true);
 expect(calls.verify).not.toHaveBeenCalled();
});
it('resends through the API and presents a generic response',async()=>{
 render(<CustomerEmailVerificationForm locale="en" token=""/>);
 await userEvent.type(screen.getByLabelText(/^Email/),'guest@example.invalid');
 await userEvent.click(screen.getByRole('button',{name:'Send verification code'}));
 await waitFor(()=>expect(calls.resend).toHaveBeenCalledWith('guest@example.invalid'));
 expect(screen.getByRole('status').textContent).toContain('If this email belongs');
});
it('rejects expired codes without reporting a verified account',async()=>{
 calls.verify.mockRejectedValue(new Error('expired'));
 render(<CustomerEmailVerificationForm locale="en" token=""/>);
 await userEvent.type(screen.getByLabelText(/^Email/),'guest@example.invalid');
 await userEvent.type(screen.getByLabelText(/Verification code/),'123456');
 await userEvent.click(screen.getByRole('button',{name:'Verify email'}));
 await screen.findByRole('alert');expect(screen.queryByText('Email verified. You can now sign in.')).toBeNull();
});
