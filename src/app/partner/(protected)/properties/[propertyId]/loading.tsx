import { Skeleton } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';
import overview from '@/features/property/Overview.module.css';

/**
 * Shown while a single property is being fetched.
 *
 * Skeletons only. Nothing here shows a slug, an id or a status — not even the
 * one from the URL — because a page that renders the requested id before the
 * backend has authorised it would display, however briefly, a property the
 * caller may have no right to see.
 *
 * <h2>Shaped like what arrives</h2>
 *
 * The hero, then the four metrics. It used to be shaped like the screen STEP K
 * replaced — two cards, one of them titled "Thông tin hệ thống" — so the page
 * visibly rearranged itself the moment the data landed.
 */
export default function Loading() {
  return (
    <div className={styles.page} aria-busy="true" aria-live="polite">
      {/* Generic, not the slug from the URL: the page must not name the property
          before the backend has authorised reading it. */}
      <h1 className={styles.pageTitle}>Đang tải khách sạn…</h1>
      <Skeleton height={14} width="200px" />

      <div className={overview.overview}>
        <Skeleton height={220} />
        <div className={overview.metrics}>
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
        <Skeleton height={160} />
      </div>
    </div>
  );
}
