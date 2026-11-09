'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { AlertIcon } from '@/ui/icons';
import { Button, Input } from '@/ui/primitives';
import { MailIcon } from '@/ui/icons';
import { invalidateSessionCache } from './actions';
import { signInMessageFor } from './messages';
import { PasswordField } from './PasswordField';
import styles from './SignInForm.module.css';

/**
 * The sign-in form, posting to the real backend.
 *
 * <h2>Why this is a client component</h2>
 *
 * The browser must receive the backend's `Set-Cookie` headers directly, with
 * their exact flags. Posting through the Next.js proxy achieves that; posting
 * from a Server Action would mean re-issuing the cookies by hand and risking a
 * lost `Path` or a widened `SameSite`. See `features/auth/actions.ts`.
 *
 * <h2>What is never held here</h2>
 *
 * No token, in state or anywhere else. The response body is empty — the backend
 * answers `204 No Content` and the session lives entirely in `HttpOnly` cookies
 * this code cannot read. There is nothing to store, which is the point.
 *
 * The fields are exactly `LoginRequest`: `email` and `password`. Read from the
 * Java record, not guessed.
 *
 * <h2>What this screen deliberately does not offer</h2>
 *
 * No "remember me" and no Google or Microsoft button: each would need a backend
 * capability that does not exist, and a control that cannot do what it says is
 * worse on a partner portal than its absence. The session's own lifetime is
 * stated instead — see the persistence note below, which describes what actually
 * happens rather than offering a switch that changes nothing.
 *
 * <p>The account links — registration, which is real, and recovery, which is
 * not — belong to the page rather than to the form, and sit under the card.
 */
export function SignInForm({
  returnTo,
  submitLabel = 'Sign in',
}: {
  readonly returnTo: string;
  readonly submitLabel?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await authApi.login({ email, password });
      // Server-rendered pages resolved the session before this point, so they
      // must be re-fetched rather than served from the router cache.
      await invalidateSessionCache();
      router.replace(returnTo);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(signInMessageFor(caught));
        setFieldErrors(caught.fieldErrors());
      } else {
        // A network failure or the proxy being down. Never surface the raw
        // exception — it can carry a URL or an internal hostname.
        setError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      }
      // Deliberately not cleared on failure: retyping an email after a typo in
      // the password is friction with no security benefit.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {error ? (
        <p className={styles.error} role="alert">
          <AlertIcon size={16} />
          <span>{error}</span>
        </p>
      ) : null}

      <Input
        id="email"
        label="Email"
        name="email"
        required
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={320}
        placeholder="ten@khachsan.com"
        leadingIcon={<MailIcon />}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors['email']}
        disabled={submitting}
      />

      <PasswordField
        id="password"
        label="Mật khẩu"
        name="password"
        required
        autoComplete="current-password"
        maxLength={512}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors['password']}
        disabled={submitting}
      />

      <Button
        type="submit"
        loading={submitting}
        disabled={submitting || email === '' || password === ''}
      >
        {submitting ? 'Đang đăng nhập…' : submitLabel}
      </Button>

      {/*
        The honest version of "Lưu đăng nhập". The session already persists —
        `staff-refresh-ttl` is PT12H and the refresh cookie is HttpOnly — and
        `LoginRequest` has no field that could make it longer or shorter. A
        checkbox would therefore be a control wired to nothing, so the behaviour
        is stated instead.
      */}
      <p className={styles.persistence}>
        Phiên đăng nhập được giữ trong khoảng 12 giờ trên thiết bị này. Hãy đăng xuất khi dùng
        máy tính chung.
      </p>

      {/*
        Doc 154 lockout, stated up front. The refusal itself stays generic so it
        never discloses whether an address has an account, which is why the rule
        is shown here rather than in the error.
      */}
      <p className={styles.persistence}>
        Nhập sai mật khẩu 5 lần liên tiếp, tài khoản sẽ bị tạm khóa 15 phút.
      </p>
    </form>
  );
}
