import { redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/auth/guard';

export const metadata = { title: 'KAS — Đăng nhập', robots: { index: false } };

/**
 * The console has one sign-in page, `/admin/login` (owner decision 2026-11-10).
 *
 * Admin and Super Admin sign in there and each sees their own menu; the `/partner/*`
 * screens stay where they are. This address is kept so old bookmarks and email links
 * still land on the sign-in page, carrying their `returnTo` along.
 */
export default async function PartnerLoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const target = safeReturnTo(returnTo, '');
  redirect(target === '' ? '/admin/login' : `/admin/login?returnTo=${encodeURIComponent(target)}`);
}
