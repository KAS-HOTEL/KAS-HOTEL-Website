import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { CustomerPasswordResetForm } from '@/features/customer/CustomerPasswordResetForm';
import styles from '../account.module.css';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' } as const;

export default async function CustomerResetPasswordPage({ params, searchParams }: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token = '' }] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  return <section className={styles.authCard}>
    <h1>{locale === 'vi' ? 'Đặt lại mật khẩu' : 'Reset your password'}</h1>
    <CustomerPasswordResetForm locale={locale} token={token} />
  </section>;
}
