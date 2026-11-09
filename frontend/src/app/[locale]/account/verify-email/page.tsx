import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { CustomerEmailVerificationForm } from '@/features/customer/CustomerEmailVerificationForm';
import styles from '../account.module.css';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' } as const;
export default async function VerifyCustomerEmailPage({ params, searchParams }: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token = '' }] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  return <section className={styles.authCard}><h1>{locale === 'vi' ? 'Xác thực email' : 'Verify your email'}</h1><CustomerEmailVerificationForm locale={locale} token={token} /></section>;
}
