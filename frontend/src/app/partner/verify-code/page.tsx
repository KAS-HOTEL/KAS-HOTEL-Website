import Link from 'next/link';
import { AuthEmblem } from '@/features/auth/AuthEmblem';
import { AuthFooter, AuthHeading, AuthShell } from '@/features/auth/AuthShell';
import { FlowUnavailable } from '@/features/auth/FlowUnavailable';
import { OtpBoxes } from '@/features/auth/OtpBoxes';
import { Button } from '@/ui/primitives';
import styles from '@/features/auth/RegisterForm.module.css';

export const metadata = { title: 'KAS Admin — Xác thực mã', robots: { index: false } };

/**
 * Entering a verification code.
 *
 * No code is ever sent, because nothing sends it: there is no verification
 * endpoint and no email transport. The six boxes are real inputs so the layout
 * and touch targets can be reviewed and measured, and the submit is disabled.
 *
 * <p>The boxes themselves are fully interactive — typing advances, Backspace
 * steps back, arrows move, and a pasted six-digit code fills all six. That is
 * the half worth building now; see {@link OtpBoxes}.
 *
 * <p>No email address is shown, and no resend countdown runs. The reference
 * masks an address here and counts down from sixty seconds; this page has no
 * submitted address to mask and nothing to resend, so printing
 * {@code p***@hotel.com} above a dead timer would be putting a fictional account
 * and a fictional message on screen.
 */
export default function PartnerVerifyCodePage() {
  return (
    <AuthShell variant="focused" medallion={<AuthEmblem icon="shield" />}>
      <AuthHeading title="Nhập mã xác thực">
        Nhập mã gồm 6 số đã được gửi tới email của bạn.
      </AuthHeading>

      <div className={styles.fields}>
        <OtpBoxes />
        <Button type="submit" disabled>
          Xác nhận
        </Button>
      </div>

      <FlowUnavailable action="Xác thực mã qua email" />

      <AuthFooter>
        <Link href="/admin/login">← Quay lại đăng nhập</Link>
      </AuthFooter>
    </AuthShell>
  );
}
