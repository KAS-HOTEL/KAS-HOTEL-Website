'use client';

import { useRouter } from 'next/navigation';
import type { SalesQueueView } from '@/lib/api/endpoints';
import { MAX_SEARCH } from './SalesQueueFilters';
import { queueHref } from './tabs';
import styles from './SalesRequest.module.css';

/**
 * Search by request code or guest name, and the order (newest or oldest first).
 *
 * Both write the URL — the tab, hotel and search survive a reload, a shared link
 * and the back button — and both return to the first page. The result count is
 * the database's, for the same tab, hotel and search.
 */
export function QueueSearchBar({
  view,
  property,
  q,
  sort,
  total,
}: {
  readonly view: 'all' | SalesQueueView;
  readonly property: string | undefined;
  readonly q: string | undefined;
  readonly sort: 'newest' | 'oldest';
  /** Null when the counts did not load. */
  readonly total: number | null;
}) {
  const router = useRouter();
  return (
    <form
      role="search"
      className={styles.searchBar}
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('q');
        router.push(queueHref(view, property, 1, { q: typeof value === 'string' ? value : undefined, sort }));
      }}
    >
      <label htmlFor="queue-search" className="srOnly">
        Tìm theo mã yêu cầu hoặc tên khách
      </label>
      <input
        // Re-mounts when the URL's search changes (back button, clear link).
        key={q ?? ''}
        id="queue-search"
        name="q"
        type="search"
        className={styles.searchInput}
        placeholder="Tìm mã yêu cầu hoặc tên khách"
        defaultValue={q ?? ''}
        maxLength={MAX_SEARCH}
        autoComplete="off"
      />
      <button type="submit" className={styles.searchButton}>
        Tìm
      </button>
      <label htmlFor="queue-sort" className="srOnly">
        Sắp xếp
      </label>
      <select
        id="queue-sort"
        className={styles.filterControl}
        value={sort}
        onChange={(event) =>
          router.push(queueHref(view, property, 1, { q, sort: event.target.value === 'oldest' ? 'oldest' : 'newest' }))
        }
      >
        <option value="newest">Mới nhất trước</option>
        <option value="oldest">Cũ nhất trước</option>
      </select>
      {total === null ? null : (
        <span className={styles.resultCount} aria-live="polite">
          {q === undefined ? `${total} yêu cầu` : `Tìm thấy ${total} yêu cầu`}
        </span>
      )}
    </form>
  );
}
