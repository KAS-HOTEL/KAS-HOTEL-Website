// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const login = vi.fn();
const replace = vi.fn();
const invalidate = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({ authApi: { login: (...a: unknown[]) => login(...a) } }));
vi.mock('./actions', () => ({ invalidateSessionCache: () => invalidate() }));

const { SignInForm } = await import('./SignInForm');
const { SignInLayout } = await import('./SignInLayout');

function apiError(status: number, code: string, details: { field: string; message: string }[] = []) {
  return new ApiError(status, {
    code,
    message: 'refused',
    details: details.map((d) => ({ field: d.field, code: 'INVALID', message: d.message })),
    correlationId: 'corr-1',
  });
}

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [login, replace, invalidate]) {
    fn.mockReset();
  }
});

describe('the sign-in form', () => {
  it('posts exactly the two fields LoginRequest declares', async () => {
    login.mockResolvedValue(undefined);
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'a-real-password');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    // `LoginRequest` is email + password and nothing else. A "remember me" flag
    // would be a field the backend has no binding for.
    expect(login.mock.calls[0]?.[0]).toEqual({
      email: 'partner@kas.invalid',
      password: 'a-real-password',
    });
  });

  it('revalidates the session cache before navigating', async () => {
    login.mockResolvedValue(undefined);
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // Server components resolved "signed out" before this point; navigating
    // without invalidating would render the pre-login answer.
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/partner');
  });

  it('will not submit until both fields have something in them', async () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    const submit = () => screen.getByRole('button', { name: /Đăng nhập/ }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    expect(submit().disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'pw');
    expect(submit().disabled).toBe(false);
  });

  it('shows one generic refusal for a rejected sign-in', async () => {
    login.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // The backend answers the same 401 for a wrong password, an unknown account,
    // a locked one. That is account-enumeration resistance and the screen must
    // not try to guess.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Email hoặc mật khẩu không đúng');
    expect(replace).not.toHaveBeenCalled();
  });

  it('never leaks a URL or hostname when the transport fails', async () => {
    login.mockRejectedValue(new TypeError('fetch failed: http://backend.internal:8081'));
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('backend.internal');
    expect(alert.textContent).toContain('Không thể kết nối');
  });

  it('clears the password but keeps the email after a failure', async () => {
    login.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await screen.findByRole('alert');
    // Retyping an email after a password typo is friction with no security gain.
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value)
      .toBe('partner@kas.invalid');
    expect((screen.getByLabelText(/Mật khẩu/) as HTMLInputElement).value).toBe('');
  });

  it('offers no control that has no backend behind it', () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    // None of these exist as a contract: there is no remember-me field on
    // LoginRequest, no OAuth endpoint, no forgot-password route and — by doc 85
    // — no partner self-registration. A control wired to nothing is worse than
    // its absence on a portal an operator depends on.
    expect(screen.queryByLabelText(/Lưu đăng nhập/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Google|Microsoft/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Quên mật khẩu|Đăng ký/i })).toBeNull();
  });

  it('states what the session actually does instead', () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    // staff-refresh-ttl is PT12H and the cookie is HttpOnly, so persistence is
    // real and fixed. Describing it beats a switch that changes nothing.
    expect(screen.getByText(/12 giờ/)).toBeTruthy();
  });

  it('states the lockout rule up front, since the refusal itself stays generic', () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    expect(screen.getByText(/5 lần liên tiếp.*15 phút/)).toBeTruthy();
  });

  it('writes nothing to browser storage', async () => {
    login.mockResolvedValue(undefined);
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'a-real-password');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('the password field', () => {
  it('hides the password until the toggle is pressed', async () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    const field = screen.getByLabelText(/Mật khẩu/) as HTMLInputElement;
    expect(field.type).toBe('password');

    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect((screen.getByLabelText(/Mật khẩu/) as HTMLInputElement).type).toBe('text');

    await userEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect((screen.getByLabelText(/Mật khẩu/) as HTMLInputElement).type).toBe('password');
  });

  it('says the state in words, not only in the icon', async () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    const toggle = () => screen.getByRole('button', { name: /mật khẩu/i });
    // Doc 82 forbids conveying state by shape alone, so the accessible name
    // changes and a live description accompanies the field.
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Mật khẩu đang được ẩn.')).toBeTruthy();

    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Mật khẩu đang hiển thị.')).toBeTruthy();
  });

  it('does not submit the form when the toggle is used', async () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    await userEvent.type(screen.getByLabelText(/Email/), 'partner@kas.invalid');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));

    // type="button", so Enter in the field still submits and the toggle never does.
    expect(login).not.toHaveBeenCalled();
  });

  it('is reachable from the keyboard', async () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    screen.getByLabelText(/Mật khẩu/).focus();
    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
  });

  it('carries the autocomplete hints a password manager needs', () => {
    render(<SignInForm returnTo="/partner" submitLabel="Đăng nhập" />);

    expect(screen.getByLabelText(/Email/).getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText(/Mật khẩu/).getAttribute('autocomplete'))
      .toBe('current-password');
  });
});

describe('the sign-in shell', () => {
  it('gives the page exactly one h1, and it is the wordmark', () => {
    render(
      <SignInLayout title="KAS Partner" subtitle="Đăng nhập để tiếp tục.">
        <p>form</p>
      </SignInLayout>,
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('KAS Partner');
  });

  it('hides the brand panel from assistive technology', () => {
    const { container } = render(
      <SignInLayout title="KAS Partner" subtitle="Đăng nhập." tagline="Một nơi duy nhất.">
        <p>form</p>
      </SignInLayout>,
    );

    // It repeats the wordmark visually; announcing it twice would be noise.
    const decorative = container.querySelector('[aria-hidden="true"]');
    expect(decorative).not.toBeNull();
    expect(decorative?.textContent).toContain('KAS Partner');
  });

});
