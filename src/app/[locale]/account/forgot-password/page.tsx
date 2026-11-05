import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { CustomerForgotPasswordForm } from '@/features/customer/CustomerForgotPasswordForm';
import styles from '../account.module.css';

export const metadata = { robots: { index: false, follow: false } } as const;

export default async function CustomerForgotPasswordPage({ params }: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return <section className={styles.authCard}><h1>{locale === 'vi' ? 'Quên mật khẩu' : 'Forgot password'}</h1><CustomerForgotPasswordForm locale={locale} /></section>;
}
