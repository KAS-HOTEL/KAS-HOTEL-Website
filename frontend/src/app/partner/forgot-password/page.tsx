import Link from 'next/link';
import { AuthEmblem } from '@/features/auth/AuthEmblem';
import { AuthFooter, AuthHeading, AuthShell } from '@/features/auth/AuthShell';
import { FlowUnavailable } from '@/features/auth/FlowUnavailable';

export const metadata = { title: 'KAS Partner — Khôi phục mật khẩu', robots: { index: false } };

/**
 * Password recovery, which this application cannot yet perform.
 *
 * <h2>Why there is no form here</h2>
 *
 * The authentication surface is four endpoints — {@code POST
 * /public/auth/login}, {@code /refresh}, {@code /logout} and {@code /register}.
 * There is no {@code /forgot-password} and no {@code /reset-password}: both
 * need a way to reach an inbox, and inventing one here would mean a screen that
 * accepts an address and sends nothing.
 *
 * <p>The page used to carry the designed form — a real email field and a
 * "Gửi mã xác thực" button — with the button disabled and a notice underneath.
 * That was honest but still wrong-shaped: the heading asked for an address in
 * order to send a code, and a disabled control is read as "try again later",
 * not as "this does not exist". An operator who is locked out needs the answer
 * and the next step in the first line, not a form to look at.
 *
 * <p>So the page states the position and offers the two routes that do work:
 * contact KAS, or register if the problem is that there is no account yet. When
 * a reset contract exists, the form comes back — the design is in the git
 * history and {@link AuthShell} has not changed.
 */
export default function PartnerForgotPasswordPage() {
  return (
    <AuthShell variant="focused" medallion={<AuthEmblem icon="mail" />}>
      <AuthHeading title="Khôi phục mật khẩu">
        Hiện chưa thể tự đặt lại mật khẩu từ cổng đối tác.
      </AuthHeading>

      <FlowUnavailable action="Đặt lại mật khẩu" />

      <AuthFooter>
        <Link href="/partner/login">Quay lại đăng nhập</Link>
      </AuthFooter>
    </AuthShell>
  );
}
