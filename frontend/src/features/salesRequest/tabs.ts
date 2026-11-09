import type { SalesQueueCounts, SalesQueueFilters, SalesQueueView } from '@/lib/api/endpoints';
import type { TabItem } from '@/ui/primitives';

/**
 * The booking request queue's four views.
 *
 * <h2>The backend owns what each view contains</h2>
 *
 * A tab sends `queue=awaiting|expired|accepted|alternative` (or nothing, for "Tất cả") and the
 * backend applies the status set it defines for that view. Overdue requests are
 * moved to `EXPIRED` by the backend's expiry job, so "Chờ phản hồi" and "Quá hạn"
 * can never hold the same request.
 *
 * <h2>The hotel filter survives a tab change</h2>
 *
 * Each tab link carries the selected hotel, so switching view never drops it.
 * The counts are fetched for the same hotel, from the database — not counted from
 * the rows on screen.
 */
export const SALES_QUEUE_VIEWS: readonly { readonly id: 'all' | SalesQueueView; readonly label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'awaiting', label: 'Chờ phản hồi' },
  { id: 'expired', label: 'Quá hạn' },
  { id: 'accepted', label: 'Đã chấp nhận' },
  // Closed: KAS proposed another stay and the guest sends a new request if they want it.
  { id: 'alternative', label: 'Đã đề xuất phương án khác' },
];

export const REQUESTS_PATH = '/partner/requests';

/** The search box and the sort order, carried by every link on the queue. */
export interface QueueSearch {
  readonly q?: string | undefined;
  readonly sort?: 'newest' | 'oldest' | undefined;
}

/** The URL of one view, keeping the selected hotel, the search and the order. */
export function queueHref(
  view: 'all' | SalesQueueView,
  property: string | undefined,
  page = 1,
  search: QueueSearch = {},
): string {
  const params = new URLSearchParams();
  if (view !== 'all') {
    params.set('queue', view);
  }
  if (property !== undefined && property !== '') {
    params.set('property', property);
  }
  const q = search.q?.trim();
  if (q !== undefined && q !== '') {
    params.set('q', q);
  }
  // Newest first is the default and is left out of the URL.
  if (search.sort === 'oldest') {
    params.set('sort', 'oldest');
  }
  // 1-based in the URL; a tab or hotel change always returns to the first page.
  if (page > 1) {
    params.set('page', String(page));
  }
  const query = params.toString();
  return query === '' ? REQUESTS_PATH : `${REQUESTS_PATH}?${query}`;
}

/** The tab strip, with counts when they loaded. */
export function queueTabs(
  property: string | undefined,
  counts: SalesQueueCounts | null,
  search: QueueSearch = {},
): readonly TabItem[] {
  return SALES_QUEUE_VIEWS.map((view) => ({
    id: view.id,
    label: counts === null ? view.label : `${view.label} (${counts[view.id]})`,
    href: queueHref(view.id, property, 1, search),
  }));
}

/** Which tab the current URL shows. */
export function activeQueueTab(filters: SalesQueueFilters): string {
  return filters.queue ?? 'all';
}

/** Rows per page of the queue. */
export const QUEUE_PAGE_SIZE = 25;
