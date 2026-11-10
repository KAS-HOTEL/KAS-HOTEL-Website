import Link from 'next/link';
import styles from './FlowUnavailable.module.css';

/**
 * What a partner is told when an account-recovery flow has no backend behind it.
 *
 * <h2>Why this exists rather than a working form</h2>
 *
 * The authentication surface is now four endpoints — {@code POST /public/auth/login},
 * {@code /refresh}, {@code /logout} and {@code /register}. Registration works;
 * <strong>recovery does not</strong>, and the reason is narrow: there is no
 * password-reset endpoint, no verification-code endpoint and no email transport
 * in the application at all. Every one of those needs a way to reach an inbox.
 *
 * <p>Doc 154 withdrew self-registration: staff share one account that KAS
 * creates and whose password KAS changes, so the notice points back to sign-in.
 *
 * <p>So these screens are built to the design and stop at the point where they
 * would have to lie. The form above this notice is real markup with real
 * validation and real focus behaviour, which is the part that will still be
 * correct when a contract exists; the submit is disabled and says why, because a
 * button that appears to send a code and sends nothing is the worse failure —
 * the operator waits for an email that was never going to arrive.
 *
 * <h2>It offers the route that does work</h2>
 *
 * An operator reaching this page is locked out or has no account, and both are
 * resolved the same way in V1: by KAS, who create staff accounts directly.
 */
export function FlowUnavailable({
  /** What the operator was trying to do, in their words. */
  action,
}: {
  readonly action: string;
}) {
  return (
    <div className={styles.notice} role="status">
      <p className={styles.title}>Chưa khả dụng</p>
      {/*
        What, and what to do — not why.

        This used to end "vì chưa có kênh gửi email tự động", which is a
        sentence about our build, addressed to a hotelier trying to get back
        into their account. The operator needs the state and the next step; the
        reason is ours to carry.
      */}
      <p className={styles.body}>{action} hiện chưa khả dụng trên cổng đối tác.</p>
      <p className={styles.body}>
        Tài khoản quản trị do KAS tạo và đặt lại mật khẩu. Vui lòng liên hệ KAS để được hỗ trợ, rồi{' '}
        <Link href="/admin/login" className={styles.link}>
          quay lại trang đăng nhập
        </Link>
        .
      </p>
    </div>
  );
}
