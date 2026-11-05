import { Skeleton } from '@/ui/primitives';
import styles from '@/features/messaging/Messaging.module.css';

/**
 * Shown while the inbox is being fetched.
 *
 * "Loading" is its own state, distinct from empty and from failed: the screen
 * must not say "chưa có cuộc trò chuyện" while it is still asking. No
 * placeholder conversations — a skeleton is obviously a skeleton, while a greyed
 * "Nguyễn Văn A" is a fabricated guest a screenshot would preserve forever.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Tin nhắn</h1>
      <p className={styles.pageIntro} role="status" aria-live="polite">
        Đang tải tin nhắn…
      </p>
      <div aria-hidden="true" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Skeleton height={44} />
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    </div>
  );
}
