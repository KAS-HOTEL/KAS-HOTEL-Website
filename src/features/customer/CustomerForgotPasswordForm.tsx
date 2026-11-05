'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import type { Locale } from '@/config/env';
import { authApi } from '@/lib/api/endpoints';
import { Button, Input } from '@/ui/primitives';
import styles from './CustomerAccountForm.module.css';

/** Requests a reset link. The answer never says whether the email has an account. */
export function CustomerForgotPasswordForm({ locale }: { readonly locale: Locale }) {
  const vi = locale === 'vi';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await authApi.forgotCustomerPassword(email.trim());
      setSent(true);
    } catch {
      setError(vi ? 'Không thể gửi yêu cầu. Vui lòng thử lại.' : 'Could not send the request. Please try again.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (sent) return <div className={styles.form}><p role="status">{vi ? 'Nếu email thuộc một tài khoản KAS, liên kết đặt lại mật khẩu sẽ được gửi. Liên kết có hiệu lực 30 phút; có thể gửi lại sau 1 phút.' : 'If this email has a KAS account, a reset link will be sent. It expires in 30 minutes; wait one minute before retrying.'}</p><Link href={`/${locale}/account/login`}>{vi ? 'Quay lại đăng nhập' : 'Back to sign in'}</Link></div>;
  return <form className={styles.form} onSubmit={submit}>
    <Input id="recoveryEmail" type="email" label="Email" autoComplete="email" required maxLength={320} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
    {error && <p className={styles.error} role="alert">{error}</p>}
    <Button type="submit" loading={busy} disabled={busy || !email.trim()}>{vi ? 'Gửi liên kết đặt lại' : 'Send reset link'}</Button>
    <Link href={`/${locale}/account/login`}>{vi ? 'Quay lại đăng nhập' : 'Back to sign in'}</Link>
  </form>;
}
