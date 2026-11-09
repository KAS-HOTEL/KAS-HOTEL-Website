import Link from 'next/link';
import { AuthEmblem } from '@/features/auth/AuthEmblem';
import { AuthFooter, AuthHeading, AuthShell } from '@/features/auth/AuthShell';
import { FlowUnavailable } from '@/features/auth/FlowUnavailable';
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm';

export const metadata = { title: 'KAS Partner — Đặt lại mật khẩu', robots: { index: false } };

/**
 * Choosing a new password.
 *
 * <h2>No token is read from the URL</h2>
 *
 * The target design reaches this screen from a link in an email. No endpoint
 * issues such a link and nothing validates one, so this page reads no query
 * parameter and invents no token semantics — doing either would be guessing at
 * a contract that does not exist yet.
 *
 * <p>The form itself is live — the rules tick, the confirmation is checked — and
 * only the submit is inert. See {@link ResetPasswordForm}. The reference shows a
 * third rule, "not the same as your old password", which is omitted because
 * nothing here can compare against a stored hash.
 */
export default function PartnerResetPasswordPage() {
  return (
    <AuthShell variant="focused" medallion={<AuthEmblem icon="lock" />}>
      <AuthHeading title="Đặt lại mật khẩu">Tạo mật khẩu mới để tiếp tục.</AuthHeading>

      <ResetPasswordForm />

      <FlowUnavailable action="Đặt lại mật khẩu" />

      <AuthFooter>
        <Link href="/partner/login">Quay lại đăng nhập</Link>
      </AuthFooter>
    </AuthShell>
  );
}
