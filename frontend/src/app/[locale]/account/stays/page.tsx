import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';
import { ApiError } from '@/lib/api/errors';
import { customerProfileApi, customerStaysApi } from '@/lib/api/endpoints';
import { isSupportedLocale } from '@/config/env';
import { CustomerStaysList } from '@/features/customer/CustomerStaysList';
import { CustomerProfilePanel } from '@/features/customer/CustomerProfilePanel';
import styles from '../account.module.css';

export async function generateMetadata({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: locale === 'vi' ? 'Lưu trú của tôi — KAS' : 'My stays — KAS', robots: { index: false } };
}

export default async function CustomerStaysPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const returnTo = `/${locale}/account/stays`;
  const session = await requireSession({ signInPath: `/${locale}/account/login`, returnTo });
  if (session.status === 'unavailable') {
    return <p className={styles.error} role="alert">{locale === 'vi' ? 'Tài khoản hiện chưa kết nối được. Hãy thử tải lại sau.' : 'Your account could not be reached. Please reload in a moment.'}</p>;
  }

  let accountData:
    | {
        ok: true;
        stays: Awaited<ReturnType<typeof customerStaysApi.list>>;
        profile: Awaited<ReturnType<typeof customerProfileApi.get>>;
      }
    | { ok: false; forbidden: boolean };
  try {
    const cookieHeader = (await cookies()).toString();
    const [stays, profile] = await Promise.all([
      customerStaysApi.list(locale, cookieHeader),
      customerProfileApi.get(cookieHeader),
    ]);
    accountData = { ok: true, stays, profile };
  } catch (error) {
    accountData = { ok: false, forbidden: error instanceof ApiError && error.isForbidden };
  }

  if (!accountData.ok) {
    return (
      <section className={styles.page}>
        <h1>{locale === 'vi' ? 'Lưu trú của tôi' : 'My stays'}</h1>
        <p className={styles.error} role="alert">
          {accountData.forbidden
            ? locale === 'vi' ? 'Tài khoản này chưa có hồ sơ khách hàng để xem đặt phòng.' : 'This account does not have a customer profile for bookings.'
            : locale === 'vi' ? 'Không thể tải danh sách lưu trú. Hãy thử lại sau.' : 'We could not load your stays. Please try again later.'}
        </p>
        <Link href={`/${locale}/account/login`} className={styles.link}>{locale === 'vi' ? 'Đăng nhập bằng tài khoản khách hàng' : 'Sign in with a customer account'}</Link>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>{locale === 'vi' ? 'TÀI KHOẢN KAS' : 'YOUR KAS ACCOUNT'}</p>
      <h1>My KAS</h1>
      <p className={styles.intro}>{locale === 'vi' ? 'Đặt phòng và hồ sơ thành viên của bạn.' : 'Your bookings and member profile.'}</p>
      <h2 className={styles.subheading}>{locale === 'vi' ? 'Đặt phòng của tôi' : 'My bookings'}</h2>
      <CustomerStaysList initialStays={accountData.stays} locale={locale} />
      <CustomerProfilePanel profile={accountData.profile} locale={locale} />
    </section>
  );
}
