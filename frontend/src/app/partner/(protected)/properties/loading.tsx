import { PropertyTable } from '@/features/property/PropertyTable';
import styles from '@/features/property/Property.module.css';

/**
 * Shown while the scoped property list is being fetched.
 *
 * The real table in its loading state, not a bespoke placeholder — so the page
 * does not shift when the data lands, and so there is exactly one definition of
 * what "loading" looks like.
 *
 * No placeholder hotel names. A skeleton row is obviously a skeleton; a greyed
 * "Khách sạn Mẫu" is a fabricated property that a screenshot would preserve
 * forever.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Khách sạn</h1>
      <PropertyTable properties={[]} loading />
    </div>
  );
}
