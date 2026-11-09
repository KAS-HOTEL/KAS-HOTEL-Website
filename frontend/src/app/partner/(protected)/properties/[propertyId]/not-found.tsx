import Link from 'next/link';
import { EmptyState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

/**
 * The one not-found experience for a property.
 *
 * <h2>Three causes, one page — on purpose</h2>
 *
 * It is rendered when the id is malformed, when it names nothing, and when it
 * names a property belonging to a different partner. The wording below is
 * carefully generic for the third case: doc 85 §6.3 has the backend return 404
 * rather than 403 for a cross-partner read so that the existence of another
 * partner's records is not disclosed, and the frontend is the last place that
 * could give it away.
 *
 * So this page never says "you do not have permission", never says "this
 * property belongs to another partner", and never names anything the caller did
 * not already type into the address bar. Even the id is left out: echoing it
 * back is harmless, but it invites a future variant that echoes back something
 * that is not.
 */
export default function PropertyNotFound() {
  return (
    <div className={styles.page}>
      {/* Every page owes the document one h1. Without it this screen would sit
          inside the shell with no heading at all, and a screen-reader user
          landing here would have nothing announcing where they are. */}
      <h1 className={styles.pageTitle}>Khách sạn</h1>
      <EmptyState title="Không tìm thấy khách sạn">
        Không có khách sạn nào khớp với đường dẫn này trong phạm vi tài khoản của bạn.{' '}
        <Link href="/partner/properties">Quay lại danh sách khách sạn</Link>.
      </EmptyState>
    </div>
  );
}
