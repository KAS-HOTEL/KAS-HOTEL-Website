import Link from 'next/link';
import type { ReservationSearchFilters } from '@/lib/api/endpoints';
import { pageCount, pageRange, type ReservationPage } from '@/lib/domain/reservation';
import styles from './Reservation.module.css';

/**
 * The pager.
 *
 * <h2>Links, not buttons</h2>
 *
 * Each page is a URL, so the browser's back button walks back through pages, a
 * page can be bookmarked, and middle-click opens one in a new tab. A button that
 * pushed history would have to reimplement all three.
 *
 * <h2>Only what the server said</h2>
 *
 * `total` and `size` come from the response, and `total` was counted under the
 * same partner scope and the same predicate as the rows — so the page numbers
 * offered here can never imply reservations this session cannot open.
 *
 * <h2>Absent when there is one page</h2>
 *
 * A pager showing "1 / 1" is furniture. The summary line stays, because "20
 * trong 43" is what tells an operator their search matched more than the screen
 * is showing.
 */
export function ReservationPager({
  page,
  filters,
  copy,
}: {
  readonly page: ReservationPage;
  /** The active filters, carried into every page link so paging keeps them. */
  readonly filters: ReservationSearchFilters;
  readonly copy: ReservationPagerCopy;
}) {
  const pages = pageCount(page);
  const range = pageRange(page);

  if (page.total === 0) {
    return null;
  }

  return (
    <nav className={styles.pager} aria-label={copy.label}>
      <p className={styles.pagerSummary} role="status">
        {copy.showing(range.from, range.to, page.total)}
      </p>

      {/*
        Also shown when there is only one page but the caller is not on it —
        `?page=9` on a two-page result is reachable from the address bar, and
        without these controls that page has no way back to the results.
      */}
      {pages <= 1 && page.page === 0 ? null : (
        <div className={styles.pagerControls}>
          <PageLink
            filters={filters}
            page={page.page - 1}
            disabled={page.page <= 0}
            label={copy.previous}
          />
          <span className={styles.pagerPosition}>
            {/*
              A page past the end reports the real page count rather than its own
              index: "Trang 10 / 2" is confusing, and the honest statement is that
              the result has two pages and this is not one of them.
            */}
            {copy.position(Math.min(page.page + 1, pages), pages)}
          </span>
          <PageLink
            filters={filters}
            page={page.page + 1}
            disabled={page.page + 1 >= pages}
            label={copy.next}
          />
        </div>
      )}
    </nav>
  );
}

/**
 * One page link, or an inert span at the ends.
 *
 * A disabled anchor is not a thing HTML has: an `<a>` without an `href` is still
 * announced as a link by some screen readers and is still focusable in others.
 * A `span` with `aria-disabled` says what it is and cannot be followed.
 */
function PageLink({
  filters,
  page,
  disabled,
  label,
}: {
  readonly filters: ReservationSearchFilters;
  readonly page: number;
  readonly disabled: boolean;
  readonly label: string;
}) {
  if (disabled) {
    return (
      <span className={styles.pagerDisabled} aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <Link className={styles.pagerLink} href={hrefFor(filters, page)}>
      {label}
    </Link>
  );
}

/**
 * The same search, one page along.
 *
 * Every active filter is carried over — a pager that dropped them would silently
 * page through a different result set than the one on screen. Page 0 is written
 * as no parameter at all, so the first page has one canonical URL rather than
 * two that differ only by `?page=0`.
 */
export function hrefFor(filters: ReservationSearchFilters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key !== 'page' && value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  if (page > 0) {
    params.set('page', String(page));
  }
  const query = params.toString();
  return query === '' ? '/partner/reservations' : `/partner/reservations?${query}`;
}

export interface ReservationPagerCopy {
  readonly label: string;
  readonly previous: string;
  readonly next: string;
  readonly showing: (from: number, to: number, total: number) => string;
  readonly position: (page: number, pages: number) => string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const RESERVATION_PAGER_COPY: ReservationPagerCopy = {
  label: 'Phân trang kết quả',
  previous: 'Trang trước',
  next: 'Trang sau',
  showing: (from, to, total) => `Hiển thị ${from}–${to} trong ${total} đặt phòng`,
  position: (page, pages) => `Trang ${page} / ${pages}`,
};
