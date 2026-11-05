import styles from '@/features/reservation/Reservation.module.css';
import { Skeleton } from '@/ui/primitives';

/**
 * Shown while a reservation search is running.
 *
 * <h2>"Loading" is its own state, distinct from empty and from failed</h2>
 *
 * Doc 82: a screen must not show "không tìm thấy đặt phòng" while it is still
 * fetching. The heading and the status line say the search is in progress; the
 * empty state only ever appears after a successful, genuinely empty response,
 * and a failure renders an error instead.
 *
 * <h2>No placeholder reservations</h2>
 *
 * Skeleton bars, never greyed-out fake bookings. A skeleton is obviously a
 * skeleton; a placeholder "KAS-000000-XXXX / Nguyễn Văn A" is a fabricated
 * reservation that a screenshot would preserve forever.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Đặt phòng &amp; khách lưu trú</h1>
      <p className={styles.pageIntro} role="status" aria-live="polite">
        Đang tải đặt phòng…
      </p>
      <div aria-hidden="true" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Skeleton height={44} />
        <Skeleton height={20} width="40%" />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} width="70%" />
      </div>
    </div>
  );
}
