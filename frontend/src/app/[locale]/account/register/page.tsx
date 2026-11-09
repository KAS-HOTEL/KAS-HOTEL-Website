import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { CustomerAccountForm } from '@/features/customer/CustomerAccountForm';
import { safeReturnTo } from '@/lib/auth/guard';
import styles from '../account.module.css';

export default async function CustomerRegisterPage({
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
      <h1>{locale === 'vi' ? 'Tạo tài khoản KAS' : 'Create your KAS account'}</h1>
      <p>{locale === 'vi' ? 'Tạo tài khoản để liên kết các đặt phòng mới với hồ sơ khách hàng của bạn.' : 'Create an account to link future bookings to your customer profile.'}</p>
      <CustomerAccountForm locale={locale} mode="register" returnTo={safeReturnTo(returnTo, home)} />
    </section>
  );
}
