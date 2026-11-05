import type { Metadata } from 'next';
import Link from 'next/link';
import { hotelOptions } from '@/features/reservation/hotelOptions';
import { HotelFilter } from '@/features/salesRequest/HotelFilter';
import { QueueAutoRefresh } from '@/features/salesRequest/QueueAutoRefresh';
import { QueuePager } from '@/features/salesRequest/QueuePager';
import { QueueSearchBar } from '@/features/salesRequest/QueueSearchBar';
import { filtersFromSearchParams, pageFromSearchParams } from '@/features/salesRequest/SalesQueueFilters';
import { SalesRequestTable } from '@/features/salesRequest/SalesRequestTable';
import { salesQueue, salesQueueCounts, serverNow } from '@/features/salesRequest/server';
import { activeQueueTab, QUEUE_PAGE_SIZE, queueHref, queueTabs } from '@/features/salesRequest/tabs';
import { ErrorState, PageHeader, Tabs } from '@/ui/primitives';
import styles from '@/features/salesRequest/SalesRequest.module.css';

export const metadata: Metadata = {
  title: 'Yêu cầu đặt phòng — KAS',
};

/**
 * The booking request inbox: four views (all, awaiting a response, overdue,
 * accepted), a hotel filter, a search (code or guest name) and the order (newest
 * first by default). The view's status set, the order and the counts come from
 * the backend; every link keeps the hotel, search and order. The list re-reads
 * itself every minute without losing any of them.
 */
export default async function PartnerRequestsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = filtersFromSearchParams(params);
  const page = pageFromSearchParams(params);
  const view = filters.queue ?? 'all';
  const search = { q: filters.q, sort: filters.sort };

  const [result, counts, properties, now] = await Promise.all([
    // One page, in the backend's order; the counts give the total for the pager.
    salesQueue({ ...filters, page: page - 1, size: QUEUE_PAGE_SIZE }),
    salesQueueCounts(filters.property, filters.q),
    hotelOptions(),
    // Server-supplied, so a wrong client clock cannot move a deadline.
    serverNow(),
  ]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Vận hành"
        title="Yêu cầu đặt phòng"
        description="Yêu cầu khách gửi tới khách sạn, mới nhất ở trên cùng. Yêu cầu không được phản hồi trước thời hạn sẽ tự chuyển sang Quá hạn."
      />

      <div className={styles.queueBar}>
        <div className={styles.queueTabs}>
          <Tabs label="Nhóm yêu cầu" items={queueTabs(filters.property, counts, search)} activeId={activeQueueTab(filters)} />
        </div>
        <HotelFilter view={view} property={filters.property} properties={properties} search={search} />
      </div>

      <div className={styles.queueControls}>
        <QueueSearchBar
          view={view}
          property={filters.property}
          q={filters.q}
          sort={filters.sort ?? 'newest'}
          total={counts === null ? null : counts[view]}
        />
        {filters.q === undefined ? null : (
          <Link className={styles.filterClear} href={queueHref(view, filters.property, 1, { sort: filters.sort })}>
            Xoá tìm kiếm
          </Link>
        )}
      </div>
      <QueueAutoRefresh />

      {result.status === 'error' ? (
        <ErrorState error={result.error} />
      ) : (
        <SalesRequestTable
          requests={result.requests}
          now={now}
          filtered={view !== 'all' || filters.property !== undefined || filters.q !== undefined}
          clearHref={queueHref('all', undefined)}
        />
      )}

      {result.status === 'ok' && counts !== null ? (
        <QueuePager view={view} property={filters.property} page={page} pageSize={QUEUE_PAGE_SIZE} total={counts[view]} search={search} />
      ) : null}
    </div>
  );
}
