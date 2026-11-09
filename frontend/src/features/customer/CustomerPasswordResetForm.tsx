'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import type { Locale } from '@/config/env';
import { authApi } from '@/lib/api/endpoints';
import { Button, Input } from '@/ui/primitives';
import styles from './CustomerAccountForm.module.css';

export function CustomerPasswordResetForm({ locale, token }: { readonly locale: Locale; readonly token: string }) {
  const vi = locale === 'vi';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (password.length < 8 || password.length > 200 || password !== confirmation) {
      setError(vi ? 'Mật khẩu cần từ 8 đến 200 ký tự và hai lần nhập phải giống nhau.' : 'Use 8–200 characters and enter the same password twice.');
      return;
    }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await authApi.resetCustomerPassword(token, password);
      setPassword(''); setConfirmation(''); setDone(true);
      router.replace(`/${locale}/account/reset-password`);
    } catch {
      setError(vi ? 'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn hoặc đã dùng; hãy yêu cầu liên kết mới.' : 'Could not reset your password. The link may have expired or already been used; request a new link.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (done) return <div className={styles.form}><p role="status">{vi ? 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' : 'Password changed. Please sign in again.'}</p><Link href={`/${locale}/account/login`}>{vi ? 'Đăng nhập' : 'Sign in'}</Link></div>;
  if (!token) return <div className={styles.form}><p role="alert">{vi ? 'Thiếu liên kết đặt lại mật khẩu. Hãy mở liên kết trong email của bạn.' : 'Missing reset link. Open the link in your email.'}</p><Link href={`/${locale}/account/forgot-password`}>{vi ? 'Yêu cầu liên kết mới' : 'Request a new link'}</Link></div>;
  return <form className={styles.form} onSubmit={submit}>
    <Input id="newPassword" label={vi ? 'Mật khẩu mới' : 'New password'} type="password" autoComplete="new-password"
      required minLength={8} maxLength={200} disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} />
    <Input id="confirmPassword" label={vi ? 'Nhập lại mật khẩu' : 'Confirm password'} type="password" autoComplete="new-password"
      required minLength={8} maxLength={200} disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
    {error && <p className={styles.error} role="alert">{error}</p>}
    <Button type="submit" loading={busy} disabled={busy}>{vi ? 'Đổi mật khẩu' : 'Change password'}</Button>
    <Link href={`/${locale}/account/forgot-password`}>{vi ? 'Yêu cầu liên kết mới' : 'Request a new link'}</Link>
  </form>;
}
