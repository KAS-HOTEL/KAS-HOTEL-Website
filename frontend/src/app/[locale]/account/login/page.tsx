import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { CustomerAccountForm } from '@/features/customer/CustomerAccountForm';
import { safeReturnTo } from '@/lib/auth/guard';
import styles from '../account.module.css';

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ locale }, { returnTo }] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const home = `/${locale}/account/stays`;
  return (
    <section className={styles.authCard}>
      <p className={styles.eyebrow}>{locale === 'vi' ? 'TÀI KHOẢN KHÁCH HÀNG' : 'CUSTOMER ACCOUNT'}</p>
      <h1>{locale === 'vi' ? 'Chào mừng trở lại' : 'Welcome back'}</h1>
      <p>{locale === 'vi' ? 'Đăng nhập để xem và quản lý các kỳ lưu trú.' : 'Sign in to view and manage your stays.'}</p>
      <CustomerAccountForm locale={locale} mode="login" returnTo={safeReturnTo(returnTo, home)} />
    </section>
  );
}
