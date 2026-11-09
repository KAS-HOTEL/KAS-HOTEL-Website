import { redirectIfAuthenticated, safeReturnTo } from '@/lib/auth/guard';
import { SessionRenewal } from '@/features/auth/SessionRenewal';
import { SignInForm } from '@/features/auth/SignInForm';
import { SignInLayout } from '@/features/auth/SignInLayout';

export const metadata = { title: 'KAS Admin — Đăng nhập', robots: { index: false } };

/** Platform-operator sign-in using the current owner-approved auth policy. */
export default async function AdminLoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  await redirectIfAuthenticated('/admin');
  const { returnTo } = await searchParams;

  return (
    <SignInLayout
      title="KAS Admin"
      subtitle="Bảng điều khiển vận hành nền tảng."
    >
      <SessionRenewal returnTo={safeReturnTo(returnTo, '/admin')} attempt={returnTo !== undefined}>
        <SignInForm returnTo={safeReturnTo(returnTo, '/admin')} submitLabel="Đăng nhập" />
      </SessionRenewal>
    </SignInLayout>
  );
}
