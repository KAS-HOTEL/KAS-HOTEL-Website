import type { Metadata } from 'next';
import { allStayStatuses } from '@/lib/domain/reservation';
import {
  filtersFromSearchParams,
  RESERVATION_FILTER_COPY,
  ReservationFilterBar,
  stayStatusGroupFromParams,
} from '@/features/reservation/ReservationFilterBar';
import {
  RESERVATION_PAGER_COPY,
  ReservationPager,
} from '@/features/reservation/ReservationPager';
import {
  RESERVATION_RESULTS_COPY,
  ReservationResults,
} from '@/features/reservation/ReservationResults';
import { reservationSearch } from '@/features/reservation/server';
import { serverNow } from '@/features/salesRequest/server';
import { hotelOptions, roomOptions } from '@/features/reservation/hotelOptions';
import { isPastEnd } from '@/lib/domain/reservation';
import { ErrorState, Tabs, PageHeader } from '@/ui/primitives';
import { activeReservationTab, reservationTabs } from '@/features/reservation/statusTabs';
import styles from '@/features/reservation/Reservation.module.css';

export const metadata: Metadata = {
  title: 'Đặt phòng & khách lưu trú — KAS',
};

/**
 * The reservation workspace — doc 58 §6, `/admin/ops/reservations`.
 *
 * <h2>Why this is a second screen and not a wider sales queue</h2>
 *
 * `/partner/requests` works the **direct sales lifecycle**: `salesStatus`,
 * oldest-first because a request model fails by neglect, with the transitions
 * doc 54 defines. This screen answers a different question — *find me this
 * booking* — across **every channel**, newest first, and performs no transition.
 *
 * <p>They cannot be one screen without inventing a status vocabulary that spans
 * both lifecycles, because `sales_status` is DIRECT-only and NULL for every OTA
 * reservation. Doc 53 refuses to create one, and so does this. The practical
 * consequence is that no DIRECT sales action is ever offered here, so none can
 * be aimed at an OTA reservation where it would be meaningless.
 *
 * <h2>Server-rendered, and scoped by the server</h2>
 *
 * The page is whatever `GET /admin/ops/reservations` returns for this session.
 * There is no client-side filtering of somebody else's rows, because no row from
 * another partner ever arrives: the ownership predicate
 * (`reservation → property → partner`) lives inside the backend's SQL — and so
 * does the count behind `total`, so the pager cannot imply reservations this
 * session could not open.
 *
 * <h2>The URL is the state</h2>
 *
 * The search box and every filter are a plain GET form, and each page is a link.
 * A refresh, a bookmark, a shared link and the browser's back button all
 * reproduce the same results, with no client state that could disagree with the
 * address bar.
 */
export default async function PartnerReservationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Server time, so "Sắp nhận phòng" uses the KAS business date, not the browser's.
  const now = await serverNow();
  const filters = filtersFromSearchParams(params);
  const activeGroup = stayStatusGroupFromParams(params);
  // Only confirmed bookings belong here: a reservation gets a stay status once
  // its payment is confirmed. Until then it is a request — awaiting the hotel or
  // awaiting payment — and is handled on "Yêu cầu đặt phòng".
  const result = await reservationSearch({ ...filters, stayStatus: filters.stayStatus ?? allStayStatuses() });

  // Already loaded by the partner layout, and request-memoised, so naming the
  // partner's own properties here costs nothing and shows names rather than slugs.
  const list = await hotelOptions();
  const properties = list;

  /*
    Room types are per property — their slugs are unique within one, not across
    the portfolio — so the control exists only once a property is chosen, and is
    loaded from that property alone rather than by fetching every hotel's list to
    build a picker whose labels would repeat.
  */
  const roomTypes = filters.property ? await roomOptions(filters.property) : [];

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Vận hành" title="Đặt phòng & khách lưu trú" description="Đặt phòng đã thanh toán và được xác nhận, cùng quá trình lưu trú của khách. Yêu cầu đang chờ xác nhận hoặc chờ thanh toán nằm ở mục Yêu cầu đặt phòng." />

      {/* Operational views over the same search: stay statuses only, never request statuses. */}
      <Tabs
        label="Trạng thái lưu trú"
        items={reservationTabs(filters.property, now)}
        activeId={activeReservationTab(params, now)}
      />

      <ReservationFilterBar
        active={filters}
        activeGroup={activeGroup}
        properties={properties}
        roomTypes={roomTypes}
        copy={RESERVATION_FILTER_COPY}
      />

      {/*
        A failed request and an empty result are different facts and never share
        a screen: ErrorState says the backend refused, ReservationResults' empty
        state says nothing matched. Showing "không tìm thấy" for a failure would
        hide a broken console behind a plausible answer.
      */}
      {result.status === 'error' ? (
        <ErrorState error={result.error} />
      ) : (
        <>
          <ReservationResults
            reservations={result.page.items}
            pastEnd={isPastEnd(result.page)}
            // Which of the two empty states is true. Any filter at all counts,
            // including one only the URL carries.
            filtered={Object.keys(filters).some((key) => key !== 'page' && key !== 'size')}
            copy={RESERVATION_RESULTS_COPY}
          />
          <ReservationPager
            page={result.page}
            filters={filters}
            copy={RESERVATION_PAGER_COPY}
          />
        </>
      )}
    </div>
  );
}
