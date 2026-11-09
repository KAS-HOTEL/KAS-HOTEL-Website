import type { Metadata } from 'next';
import Link from 'next/link';
import { mediaCovers } from '@/features/media/server';
import { PortfolioFilters } from '@/features/property/PortfolioFilters';
import { PropertyCards } from '@/features/property/PropertyCards';
import { PropertyTable } from '@/features/property/PropertyTable';
import { propertyList } from '@/features/property/server';
import { roomTypeList } from '@/features/roomType/server';
import {
  filterProperties,
  isPortfolioFiltered,
  readPortfolioFilter,
} from '@/lib/domain/property';
import { EmptyState, ErrorState, PageHeader } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Khách sạn — KAS Partner',
};

/**
 * The partner's portfolio.
 *
 * A Server Component: the session cookies are `HttpOnly`, so the server is the
 * only place that can read this list without the browser first painting an empty
 * table and then filling it in.
 *
 * Everything rendered comes from `GET /api/v1/admin/properties`, which is
 * already scope-filtered in SQL. There is no property allowlist and no count
 * anywhere in this file — the list is whatever the backend says the session can
 * reach.
 *
 * <h2>The filter narrows what is shown, never what is fetched</h2>
 *
 * Step 5 recorded that this page had no client-side filter. That is no longer
 * true and the reason is worth stating: the endpoint **takes no parameters** and
 * doc 58 §8's Properties row names none, so a server-side `q` would be an
 * invented contract. The filter therefore runs over the complete response, in
 * the URL, on the server. It is safe here for one specific reason — the response
 * is the whole scoped set with no pagination, so there is no unseen remainder a
 * filter could hide, and narrowing a list that is already scope-filtered cannot
 * widen it. It stops being safe the day the portfolio outgrows one response:
 * **OQ-158**.
 */
export default async function PartnerPropertiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string; readonly state?: string }>;
}) {
  /*
    In parallel, and the covers are allowed to fail on their own. A portfolio
    that will not load is a broken screen; covers that will not load are a list
    without pictures, and taking the whole page down for the second would be a
    worse answer than saying so in the frame where each picture would have been.
  */
  const [result, covers] = await Promise.all([propertyList(), mediaCovers('PROPERTY')]);
  const filter = readPortfolioFilter(await searchParams);

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <p className={styles.pageEyebrow}>Danh mục</p>
          <h1 className={styles.pageTitle}>Khách sạn</h1>
        </div>
        <ErrorState error={result.error} />
      </div>
    );
  }

  const all = result.properties;
  // How many room types each hotel has, from the room-type list the hotel page
  // already uses: one request per hotel, in parallel. A hotel whose list fails
  // shows "—" rather than a wrong count.
  const roomLists = await Promise.all(all.map((property) => roomTypeList(property.id)));
  const roomTypeCounts = new Map<string, number>();
  all.forEach((property, index) => {
    const list = roomLists[index];
    if (list?.status === 'ok') roomTypeCounts.set(property.id, list.roomTypes.length);
  });
  const visible = filterProperties(all, filter);
  const narrowed = isPortfolioFiltered(filter);

  return (
    <div className={styles.page}>
      {/*
        The primary action sits beside the title rather than under the list: on
        a portfolio of thirty it would otherwise be a scroll away, and "add"
        belongs with the heading that names what is being added to.
      */}
      <PageHeader
        eyebrow="Danh mục"
        title={
          <>
            Khách sạn &amp; Hạng phòng
            {/* The count is the backend's answer, not a number written here. */}
            {all.length === 0 ? null : <span className={styles.pageCount}> ({all.length})</span>}
          </>
        }
        description="Mỗi khách sạn gồm thông tin, ảnh và ảnh Hero, hạng phòng cùng ảnh từng hạng phòng, tiện ích và chính sách — quản lý trong cùng một nơi."
        actions={
          <Link href="/partner/properties/new" className={styles.pageAction}>
            Thêm khách sạn
          </Link>
        }
      />

      {/* No portfolio at all is a different thing from a filter matching
          nothing, so the filter is withheld when there is nothing to filter. */}
      {all.length === 0 ? null : (
        <PortfolioFilters
          action="/partner/properties"
          filter={filter}
          showing={visible.length}
          total={all.length}
        />
      )}

      {narrowed && visible.length === 0 ? (
        // Not an error, so not an alert: the request succeeded and the portfolio
        // is intact — this filter simply matches none of it.
        <EmptyState title="Không có khách sạn nào khớp bộ lọc">
          Thử bỏ bớt từ khoá hoặc chọn “Tất cả trạng thái”.{' '}
          <Link href="/partner/properties">Xoá bộ lọc</Link>
        </EmptyState>
      ) : (
        <>
          {/*
            One list, two shapes. The table is the desktop instrument and the
            cards are the phone one; CSS shows exactly one, so neither the
            layout nor the accessibility tree ever holds both.
          */}
          <PropertyTable
            properties={visible}
            roomTypeCounts={roomTypeCounts}
            covers={covers.status === 'ok' ? covers.covers : undefined}
            coversUnavailable={covers.status === 'error'}
          />
          <PropertyCards
            properties={visible}
            roomTypeCounts={roomTypeCounts}
            covers={covers.status === 'ok' ? covers.covers : undefined}
            coversUnavailable={covers.status === 'error'}
          />
        </>
      )}
    </div>
  );
}
