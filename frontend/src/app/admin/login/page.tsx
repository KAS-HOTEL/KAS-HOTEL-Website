import { redirectIfAuthenticated, safeReturnTo } from '@/lib/auth/guard';
import { SessionRenewal } from '@/features/auth/SessionRenewal';
import { SignInForm } from '@/features/auth/SignInForm';
import { SignInLayout } from '@/features/auth/SignInLayout';

export const metadata = { title: 'KAS Admin — Đăng nhập', robots: { index: false } };

/**
 * The console's one sign-in page (owner decision 2026-11-10): Admin and Super Admin both
 * sign in here. `/admin` then sends each to their own overview — Admin stays on `/admin`,
 * Super Admin goes on to `/partner` (`requireConsole`). `/partner/login` redirects here.
 */
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
      subtitle="Đăng nhập cho tài khoản Admin và Super Admin."
    >
      <SessionRenewal returnTo={safeReturnTo(returnTo, '/admin')} attempt={returnTo !== undefined}>
        <SignInForm returnTo={safeReturnTo(returnTo, '/admin')} submitLabel="Đăng nhập" />
      </SessionRenewal>
    </SignInLayout>
  );
}
