import { redirectIfAuthenticated, safeReturnTo } from '@/lib/auth/guard';
import { AuthFooter, AuthHeading, AuthShell } from '@/features/auth/AuthShell';
import { SessionRenewal } from '@/features/auth/SessionRenewal';
import { SignInForm } from '@/features/auth/SignInForm';

export const metadata = { title: 'KAS Partner — Đăng nhập', robots: { index: false } };

/**
 * Partner sign-in.
 *
 * Doc 154: KAS staff share one SUPER_ADMIN account and sign in with its email
 * and password at the same `POST /api/v1/public/auth/login` the admin console
 * uses; one session serves both consoles. There is no registration and no
 * self-service recovery: KAS creates the account and changes its password.
 *
 * <h2>What the reference shows that is not here</h2>
 *
 * Google and Microsoft buttons, and a "remember me" checkbox. All three are
 * omitted: there is no OAuth provider configured (doc 51 C9 keeps social login
 * as future scope) and `LoginRequest` has no field that could make a session
 * longer or shorter. A button that cannot sign anyone in is worse on a partner
 * portal than its absence, so the session's real lifetime is stated instead.
 */
export default async function PartnerLoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  await redirectIfAuthenticated('/partner');
  const { returnTo } = await searchParams;

  return (
    <AuthShell
      eyebrow="Cổng đối tác"
      headline={
        <>
          Cùng bạn kiến tạo trải nghiệm tuyệt vời cho du khách
        </>
      }
      supporting="Quản lý khách sạn dễ dàng hơn với KAS Partner — nhanh chóng, an toàn và hiệu quả."
      quote="Mỗi hành trình tuyệt vời đều bắt đầu từ một đối tác tuyệt vời."
    >
      <AuthHeading title="Chào mừng trở lại">
        Đăng nhập để tiếp tục quản lý khách sạn của bạn.
      </AuthHeading>

      <SessionRenewal returnTo={safeReturnTo(returnTo, '/partner')} attempt={returnTo !== undefined}>
        <SignInForm returnTo={safeReturnTo(returnTo, '/partner')} submitLabel="Đăng nhập" />
      </SessionRenewal>

      <AuthFooter>
        <span>Chưa có tài khoản hoặc quên mật khẩu? Vui lòng liên hệ KAS.</span>
      </AuthFooter>
    </AuthShell>
  );
}
