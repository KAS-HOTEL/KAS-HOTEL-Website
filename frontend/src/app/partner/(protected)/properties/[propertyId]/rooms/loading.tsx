import { RoomTypeTable } from '@/features/roomType/RoomTypeTable';
import styles from '@/features/property/Property.module.css';

/**
 * Shown while the property and its room types are being fetched.
 *
 * The real table in its loading state, so nothing shifts when the data lands.
 * The heading is generic rather than the property's name: naming it before the
 * backend has authorised reading it would display, however briefly, a hotel the
 * caller may have no right to see.
 */
export default function Loading() {
  return (
    <div className={styles.page} aria-busy="true" aria-live="polite">
      <h1 className={styles.pageTitle}>Đang tải loại phòng…</h1>
      <RoomTypeTable propertyId="" roomTypes={[]} loading />
    </div>
  );
}
