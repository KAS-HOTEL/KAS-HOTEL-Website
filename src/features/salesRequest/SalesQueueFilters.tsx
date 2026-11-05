import type { SalesQueueFilters, SalesQueueView } from '@/lib/api/endpoints';

/**
 * Reads the queue's state back out of the URL: the view (`queue`), the hotel
 * (`property`), the search (`q`, code or guest name) and the order (`sort`).
 * The status, lead source and "overdue only" filters duplicated the tabs and
 * were removed.
 *
 * <p>An unknown `queue` value is dropped (the "Tất cả" view), since only the tabs
 * write it. A hotel slug is passed through: one that does not exist, or is out of
 * scope, simply matches nothing on the backend.
 */
export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): SalesQueueFilters {
  const queue = first(params.queue);
  const property = first(params.property);
  // The backend refuses a search longer than 100 characters; trim rather than fail.
  const q = first(params.q)?.trim().slice(0, MAX_SEARCH);
  return {
    ...(queue !== undefined && QUEUE_VIEWS.has(queue) ? { queue: queue as SalesQueueView } : {}),
    ...(property === undefined || property === '' ? {} : { property }),
    ...(q === undefined || q === '' ? {} : { q }),
    // Newest first is the default; only the reverse order is carried.
    ...(first(params.sort) === 'oldest' ? { sort: 'oldest' as const } : {}),
  };
}

/** The 1-based page in the URL; anything that is not a positive whole number is page 1. */
export function pageFromSearchParams(params: Record<string, string | string[] | undefined>): number {
  const raw = first(params.page);
  const page = raw === undefined ? 1 : Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export const MAX_SEARCH = 100;

const QUEUE_VIEWS: ReadonlySet<string> = new Set(['awaiting', 'expired', 'accepted']);

/** A repeated parameter takes its first value; the controls only ever send one. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
