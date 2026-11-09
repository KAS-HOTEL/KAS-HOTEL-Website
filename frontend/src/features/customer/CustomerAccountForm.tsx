'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Locale } from '@/config/env';
import { authApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { invalidateSessionCache } from '@/features/auth/actions';
import { AlertIcon, MailIcon } from '@/ui/icons';
import { Button, Input, Select } from '@/ui/primitives';
import { nationalityOptions } from '@/lib/domain/countries';
import styles from './CustomerAccountForm.module.css';

const CODE_LENGTH = 6;

const COPY = {
  vi: {
    fullName: 'Họ và tên', email: 'Email', phone: 'Số điện thoại', password: 'Mật khẩu',
    submitLogin: 'Đăng nhập', submitRegister: 'Tạo tài khoản khách hàng', submitting: 'Đang xử lý…',
    persistence: 'Đăng nhập khách hàng được duy trì trên thiết bị theo thời hạn phiên của tài khoản.',
    genericError: 'Không thể kết nối tới hệ thống. Vui lòng thử lại.',
    loginError: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.',
    registerError: 'Không thể tạo tài khoản. Hãy kiểm tra thông tin hoặc dùng email khác.',
    tooShort: 'Mật khẩu cần có ít nhất 8 ký tự.',
  },
  en: {
    fullName: 'Full name', email: 'Email', phone: 'Phone number', password: 'Password',
    submitLogin: 'Sign in', submitRegister: 'Create customer account', submitting: 'Working…',
    persistence: 'Your customer session follows the account session period on this device.',
    genericError: 'Could not connect to KAS. Please try again.',
    loginError: 'The email or password is incorrect. Check and try again.',
    registerError: 'Could not create the account. Check the details or use another email.',
    tooShort: 'Password must be at least 8 characters.',
  },
} as const;

export function CustomerAccountForm({
  locale,
  mode,
  returnTo,
}: {
  readonly locale: Locale;
  readonly mode: 'login' | 'register';
  readonly returnTo: string;
}) {
  const router = useRouter();
  const copy = COPY[locale];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verified, setVerified] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});
    if (mode === 'register' && !verificationPending && password.length < 8) {
      setFieldErrors({ password: copy.tooShort });
      return;
    }
    setSubmitting(true);
    try {
      if (verificationPending) {
        await authApi.verifyCustomerEmail(email.trim(), verificationCode.trim());
        setVerified(true);
        return;
      } else if (mode === 'login') {
        await authApi.login({ email: email.trim(), password });
      } else {
        await authApi.registerCustomer({
          fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), password, locale, country,
        });
        setPassword('');
        setVerificationPending(true);
        return;
      }
      await invalidateSessionCache();
      router.replace(returnTo);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const unverified = caught.details.some((detail) => detail.code === 'EMAIL_NOT_VERIFIED');
        const duplicate = caught.code === 'ACCOUNT_ALREADY_EXISTS' || caught.details.some((detail) => detail.code === 'ACCOUNT_ALREADY_EXISTS');
        setError(verificationPending ? (locale === 'vi' ? 'Mã không đúng, đã hết hạn hoặc đã được sử dụng. Vui lòng kiểm tra và thử lại.' : 'The code is incorrect, expired, or already used. Check it and try again.') : duplicate ? (locale === 'vi' ? 'Email này đã tồn tại. Vui lòng đăng nhập hoặc dùng email khác.' : 'This email is already registered. Sign in or use another email.') : unverified ? (locale === 'vi' ? 'Vui lòng xác thực email trước khi đăng nhập.' : 'Verify your email before signing in.') : mode === 'login' ? copy.loginError : copy.registerError);
        setFieldErrors(caught.fieldErrors());
      } else {
        setError(verificationPending ? (locale === 'vi' ? 'Không thể xác thực mã. Vui lòng thử lại.' : 'Could not verify the code. Please try again.') : copy.genericError);
      }
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  if (verificationPending) return verified ? <div className={styles.form}>
    <p role="status">{locale === 'vi' ? 'Email đã được xác thực. Bạn có thể đăng nhập.' : 'Email verified. You can now sign in.'}</p>
    <Link href={`/${locale}/account/login`}>{locale === 'vi' ? 'Đăng nhập' : 'Sign in'}</Link>
  </div> : <form className={styles.form} onSubmit={submit} noValidate>
    <p role="status">{locale === 'vi' ? `Mã xác thực đang được gửi đến ${email} và có thể mất vài phút. Nhập mã gồm 6 chữ số.` : `A verification code is on its way to ${email} and may take a few minutes. Enter the six-digit code.`}</p>
    {error ? <p className={styles.error} role="alert"><AlertIcon size={16} />{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <Input id="verificationCode" label={locale === 'vi' ? 'Mã xác thực' : 'Verification code'} name="code" required
      inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_LENGTH} value={verificationCode}
      onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))} />
    <Button type="submit" loading={submitting} disabled={submitting || !/^\d{6}$/.test(verificationCode)}>
      {submitting ? copy.submitting : locale === 'vi' ? 'Xác thực email' : 'Verify email'}
    </Button>
    <button type="button" className={styles.linkButton} disabled={submitting} onClick={async () => {
      setError(null); setNotice(null); setSubmitting(true);
      try { await authApi.resendVerification(email.trim()); setNotice(locale === 'vi' ? 'Nếu tài khoản chưa xác thực, mã sẽ được gửi lại. Vui lòng chờ 1 phút trước khi yêu cầu lại.' : 'If the account is unverified, a code will be sent. Wait one minute before requesting again.'); }
      catch { setError(copy.genericError); } finally { setSubmitting(false); }
    }}>{locale === 'vi' ? 'Gửi lại mã' : 'Resend code'}</button>
  </form>;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {error ? <p className={styles.error} role="alert"><AlertIcon size={16} />{error}</p> : null}
      {mode === 'register' ? (
        <Select id="customerCountry" name="country" label={locale === 'vi' ? 'Quốc tịch' : 'Nationality'}
          required placeholder={locale === 'vi' ? 'Chọn quốc tịch' : 'Select nationality'} options={nationalityOptions(locale)}
          value={country} onChange={(event) => setCountry(event.target.value)} error={fieldErrors.country} />
      ) : null}
      {mode === 'register' ? (
        <Input id="fullName" label={copy.fullName} name="fullName" required maxLength={200}
          autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} error={fieldErrors.fullName} />
      ) : null}
      <Input id="customerEmail" label={copy.email} name="email" required type="email" inputMode="email"
        autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={320}
        leadingIcon={<MailIcon />} value={email} onChange={(event) => setEmail(event.target.value)} error={fieldErrors.email} />
      {mode === 'register' ? (
        <Input id="customerPhone" label={copy.phone} name="phone" required type="tel" autoComplete="tel"
          maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} error={fieldErrors.phone} />
      ) : null}
      <Input id="customerPassword" label={copy.password} name="password" required type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined}
        maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} error={fieldErrors.password} />
      <Button type="submit" loading={submitting} disabled={submitting || email.trim() === '' || password === '' || (mode === 'register' && (fullName.trim() === '' || phone.trim() === '' || country === ''))}>
        {submitting ? copy.submitting : mode === 'login' ? copy.submitLogin : copy.submitRegister}
      </Button>
      {mode === 'login' ? <p className={styles.note}>{copy.persistence}</p> : null}
      {mode === 'login' ? <Link href={`/${locale}/account/forgot-password`}>{locale === 'vi' ? 'Quên mật khẩu?' : 'Forgot password?'}</Link> : null}
      {mode === 'login' ? <Link href={`/${locale}/account/verify-email`}>{locale === 'vi' ? 'Chưa xác thực email? Nhập mã hoặc gửi lại mã' : 'Email not verified? Enter or resend your code'}</Link> : null}
      <p className={styles.switch}>
        {mode === 'login'
          ? <>{locale === 'vi' ? 'Chưa có tài khoản?' : 'New to KAS?'} <Link href={`/${locale}/account/register`}>{locale === 'vi' ? 'Tạo tài khoản' : 'Create an account'}</Link></>
          : <>{locale === 'vi' ? 'Đã có tài khoản?' : 'Already have an account?'} <Link href={`/${locale}/account/login`}>{locale === 'vi' ? 'Đăng nhập' : 'Sign in'}</Link></>}
      </p>
    </form>
  );
}
