'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import type { Locale } from '@/config/env';
import { authApi } from '@/lib/api/endpoints';
import { Button, Input } from '@/ui/primitives';
import styles from './CustomerAccountForm.module.css';

const CODE_LENGTH = 6;

export function CustomerEmailVerificationForm({ locale, token: _token }: { readonly locale: Locale; readonly token: string }) {
  const vi = locale === 'vi';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (code.trim()) { await authApi.verifyCustomerEmail(email.trim(), code.trim()); setDone(true); }
      else {
        await authApi.resendVerification(email.trim());
        setMessage(vi ? 'Nếu email thuộc tài khoản chưa xác thực, mã sẽ được gửi. Mã có hiệu lực 30 phút; có thể gửi lại sau 1 phút.' : 'If this email belongs to an unverified account, a code will be sent. It expires in 30 minutes; wait one minute before retrying.');
      }
    } catch {
      setError(vi ? 'Không thể xác thực. Mã có thể sai, đã dùng hoặc hết hạn.' : 'Could not verify. The code may be wrong, expired, or already used.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  if (done) return <div className={styles.form}><p role="status">{vi ? 'Email đã được xác thực. Bạn có thể đăng nhập.' : 'Email verified. You can now sign in.'}</p><Link href={`/${locale}/account/login`}>{vi ? 'Đăng nhập' : 'Sign in'}</Link></div>;
  return <form className={styles.form} onSubmit={submit}>
    <Input id="verificationEmail" type="email" label="Email" autoComplete="email" required maxLength={320} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
    <Input id="verificationCode" inputMode="numeric" autoComplete="one-time-code" label={vi ? 'Mã xác thực' : 'Verification code'} maxLength={CODE_LENGTH} value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))} />
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <Button type="submit" loading={busy} disabled={busy || !email.trim() || (code.trim() !== '' && !/^\d{6}$/.test(code.trim()))}>{code.trim() ? (vi ? 'Xác thực email' : 'Verify email') : (vi ? 'Gửi mã xác thực' : 'Send verification code')}</Button>
  </form>;
}
