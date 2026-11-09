import Link from 'next/link';
import { formatMoney } from '@/lib/domain/availability';
import {
  formatStayDate,
  guestCountLabel,
  present,
  propertyLabel,
  stayLabel,
  stayStatusDisplay,
  stayStatusLabel,
  stayStatusTone,
  type ReservationSummary,
} from '@/lib/domain/reservation';
import { Badge, EmptyState, Table, type Column } from '@/ui/primitives';
import styles from './Reservation.module.css';

/**
 * The reservation results — a dense table on a wide screen, stacked cards on a
 * narrow one.
 *
 * <h2>Two renderings, one at a time</h2>
 *
 * Both are in the markup and CSS shows exactly one, at the 768px breakpoint.
 * `display: none` removes the other from the accessibility tree as well as the
 * page, so a screen reader is never read the same reservation twice.
 *
 * <p>A single table that scrolled sideways at 375px was the alternative, and it
 * is the wrong one: eleven columns on a phone means the operator scrolls right
 * to learn who the booking is for, and doc 82 puts the scroll on the table
 * rather than the page precisely so it stays a desktop affordance.
 *
 * <h2>Every value is the backend's</h2>
 *
 * The night count, the room count and the total all arrive computed. Nothing is
 * summed here — doc 125 makes the reservation the authority on what a stay costs.
 *
 * <h2>What is not shown, because it does not exist</h2>
 *
 * No commission, no payout, no platform fee and no payment state. V15's
 * `payment` table has no read path in this application, and the other three are
 * not columns anywhere. A plausible-looking figure with nothing behind it is
 * worse than an absent one.
 */
export function ReservationResults({
  reservations,
  pastEnd = false,
  filtered = false,
  copy,
}: {
  readonly reservations: readonly ReservationSummary[];
  /**
   * Whether the URL narrowed this list. Decides which of the two empty states
   * is true: a filter matching nothing is not the same fact as an account with
   * no reservations, and only one of them has an action.
   */
  readonly filtered?: boolean;
  /**
   * True when the search matched rows but this page holds none — reachable
   * from the address bar, and a different fact from "nothing matched".
   */
  readonly pastEnd?: boolean;
  readonly copy: ReservationResultsCopy;
}) {
  if (reservations.length === 0) {
    // Three empty screens, not one. A failed request renders an ErrorState on
    // the page instead; "nothing matched", "you are past the last page" and
    // "the search broke" are different facts and must never share a screen.
    if (pastEnd) {
      return <EmptyState title={copy.pastEndTitle}>{copy.pastEndBody}</EmptyState>;
    }
    return filtered ? (
      <EmptyState title={copy.noMatchTitle}>{copy.noMatchBody}</EmptyState>
    ) : (
      <EmptyState title={copy.emptyTitle}>{copy.emptyBody}</EmptyState>
    );
  }

  const columns: readonly Column<ReservationSummary>[] = [
    {
      key: 'reference',
      header: copy.reference,
      /*
        Channel lives here now, as a quiet line under the reference, rather than
        as a column of its own.

        At 1440 this workspace has 983px of content width — the shell keeps the
        rest — and nine columns wanted 1145 of it, so the table scrolled sideways
        on a desktop. Channel was the column paying least for its width: whether
        a booking came direct or through an OTA is worth knowing at a glance and
        is not worth a header, a badge column and 108px.

        `channel_type` is untouched in the API, the response and the database.
        This is presentation only, and the detail page still states it in full.
      */
      cell: (row) => (
        <div className={styles.referenceCell}>
          <Link className={styles.reference} href={`/partner/reservations/${row.reference}`}>
            {row.reference}
          </Link>
        </div>
      ),
    },
    {
      key: 'guest',
      header: copy.guest,
      cell: (row) => (
        <div className={styles.guestCell}>
          <span>{row.guestName ?? '—'}</span>
          {/*
            Absent unless the session holds customer.view. A dash would claim the
            guest left no number; absence of the element says nothing at all.
          */}
          {present(row.guestPhone) ? (
            <a className={styles.phone} href={`tel:${row.guestPhone}`}>
              {row.guestPhone}
            </a>
          ) : null}
        </div>
      ),
    },
    {
      key: 'property',
      header: copy.property,
      cell: (row) => propertyLabel(row),
    },
    {
      key: 'rooms',
      header: copy.rooms,
      align: 'end',
      cell: (row) => row.rooms,
    },
    {
      key: 'stay',
      header: copy.stay,
      cell: (row) => (
        // Three facts on two lines. The dates refuse to break — a range split
        // after the arrow is unreadable — but the nights and the party move to
        // the line below, so the column asks for the width of one date range
        // rather than the width of the whole sentence.
        <div className={styles.stayCell}>
          <span className={styles.stayDates}>
            {formatStayDate(row.checkIn)} → {formatStayDate(row.checkOut)}
          </span>
          <span className={styles.muted}>
            {row.nights} đêm · {guestCountLabel(row)}
          </span>
        </div>
      ),
    },
    {
      key: 'total',
      header: copy.total,
      align: 'end',
      // A dash, never a zero: a zero would read as "free".
      cell: (row) => (present(row.total) ? formatMoney(row.total) : '—'),
    },
    {
      key: 'stayStatus',
      header: copy.stayStatus,
      // stay_status, never sales_status. Doc 58 §6 makes this the operational
      // field, and a null is "not yet confirmed" rather than a missing value.
      cell: (row) => (
        // The four-word vocabulary the filter offers, so a row answers in the
        // words the question used. Filtering by "Khách đã tới" used to return
        // rows labelled "Đã nhận phòng", "Đã trả phòng" and "Hoàn tất". The
        // exact state stays in the title for support.
        <span title={stayStatusLabel(row.stayStatus)}>
          <Badge tone={stayStatusTone(row.stayStatus)}>{stayStatusDisplay(row.stayStatus)}</Badge>
        </span>
      ),
    },
    {
      key: 'actions',
      header: copy.actions,
      isActions: true,
      cell: (row) => (
        <Link className={styles.rowAction} href={`/partner/reservations/${row.reference}`}>
          {copy.open}
        </Link>
      ),
    },
  ];

  return (
    <>
      <div className={styles.tableOnly}>
        <Table
          caption={copy.caption}
          columns={columns}
          rows={reservations}
          rowKey={(row) => row.reference}
        />
      </div>

      <ul className={styles.cardsOnly} aria-label={copy.caption}>
        {reservations.map((row) => (
          <li key={row.reference} className={styles.card}>
            <div className={styles.cardHeader}>
              <Link className={styles.reference} href={`/partner/reservations/${row.reference}`}>
                {row.reference}
              </Link>
              {/* Same four words as the table and the filter. */}
              <span title={stayStatusLabel(row.stayStatus)}>
                <Badge tone={stayStatusTone(row.stayStatus)}>
                  {stayStatusDisplay(row.stayStatus)}
                </Badge>
              </span>
            </div>

            <p className={styles.cardGuest}>{row.guestName ?? '—'}</p>
            {present(row.guestPhone) ? (
              <a className={styles.phone} href={`tel:${row.guestPhone}`}>
                {row.guestPhone}
              </a>
            ) : null}

            <dl className={styles.cardFacts}>
              <CardFact label={copy.property} value={propertyLabel(row)} />
              <CardFact label={copy.stay} value={stayLabel(row)} />
              <CardFact label={copy.rooms} value={`${row.rooms} · ${guestCountLabel(row)}`} />
              <CardFact
                label={copy.total}
                value={present(row.total) ? formatMoney(row.total) : '—'}
              />
            </dl>

            <Link className={styles.cardAction} href={`/partner/reservations/${row.reference}`}>
              {copy.open}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function CardFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.cardFact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export interface ReservationResultsCopy {
  readonly caption: string;
  readonly reference: string;
  readonly guest: string;
  readonly property: string;
  readonly rooms: string;
  readonly stay: string;
  readonly channel: string;
  readonly total: string;
  readonly stayStatus: string;
  readonly actions: string;
  readonly open: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly noMatchTitle: string;
  readonly noMatchBody: string;
  readonly pastEndTitle: string;
  readonly pastEndBody: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const RESERVATION_RESULTS_COPY: ReservationResultsCopy = {
  caption: 'Đặt phòng trong phạm vi tài khoản của bạn',
  reference: 'Mã đặt phòng',
  guest: 'Khách',
  property: 'Khách sạn',
  rooms: 'Phòng',
  stay: 'Kỳ nghỉ',
  channel: 'Kênh',
  total: 'Tổng tiền',
  // 'Trạng thái lưu trú' was two words wider than the column needed and did not
  // match the filter beside it, which says 'Trạng thái'. One name for one thing.
  stayStatus: 'Trạng thái',
  actions: 'Hành động',
  open: 'Xem chi tiết',
  noMatchTitle: 'Không tìm thấy đặt phòng',
  noMatchBody: 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.',
  emptyTitle: 'Chưa có đặt phòng',
  emptyBody: 'Đặt phòng của khách sẽ xuất hiện tại đây.',
  pastEndTitle: 'Trang này không có đặt phòng nào',
  pastEndBody: 'Kết quả tìm kiếm có ít trang hơn. Dùng nút Trang trước để quay lại.',
};
