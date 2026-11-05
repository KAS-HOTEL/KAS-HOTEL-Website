import Link from 'next/link';
import type { SalesQueueView } from '@/lib/api/endpoints';
import { queueHref, type QueueSearch } from './tabs';
import styles from './SalesRequest.module.css';

/**
 * Pages of the request queue. The total comes from the view's count in the
 * database, so the last page and "x–y of n" are exact; the tab and hotel are kept.
 */
export function QueuePager({
  view,
  property,
  page,
  pageSize,
  total,
  search = {},
}: {
  readonly search?: QueueSearch;
  readonly view: 'all' | SalesQueueView;
  readonly property: string | undefined;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page <= 1) {
    return null;
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className={styles.pager} aria-label="Phân trang yêu cầu">
      <span className={styles.muted}>
        {from}–{to} / {total} yêu cầu
      </span>
      <div className={styles.pagerLinks}>
        {page > 1 ? (
          <Link href={queueHref(view, property, page - 1, search)} rel="prev">
            ‹ Trang trước
          </Link>
        ) : (
          <span aria-disabled="true">‹ Trang trước</span>
        )}
        <span className={styles.pagerCurrent} aria-current="page">
          Trang {Math.min(page, pages)} / {pages}
        </span>
        {page < pages ? (
          <Link href={queueHref(view, property, page + 1, search)} rel="next">
            Trang sau ›
          </Link>
        ) : (
          <span aria-disabled="true">Trang sau ›</span>
        )}
      </div>
    </nav>
  );
}
