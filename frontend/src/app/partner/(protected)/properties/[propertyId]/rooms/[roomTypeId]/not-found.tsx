import Link from 'next/link';
import { EmptyState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

/**
 * The one not-found experience for a room type.
 *
 * Rendered when either id is malformed, when either names nothing, and when
 * either belongs to a different partner. The wording is generic for the last
 * case: doc 85 §6.3 has the backend answer 404 rather than 403 for a
 * cross-partner read, and the frontend is the last place that could give it away.
 *
 * So this page never says "you do not have permission", never says the record
 * belongs to another partner, and never echoes either id back — echoing is
 * harmless in itself but invites a future variant that echoes something that is
 * not.
 */
export default function RoomTypeNotFound() {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Loại phòng</h1>
      <EmptyState title="Không tìm thấy loại phòng">
        Không có loại phòng nào khớp với đường dẫn này trong phạm vi tài khoản của bạn.{' '}
        <Link href="/partner/properties">Quay lại danh sách khách sạn</Link>.
      </EmptyState>
    </div>
  );
}
