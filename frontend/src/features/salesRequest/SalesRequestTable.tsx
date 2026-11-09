'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/domain/availability';
import {
  deadlineFor,
  formatAgoVi,
  formatBusinessDateTimeShort,
  requestAgeGroup,
  propertyLabel,
  salesStatusLabel,
  salesStatusTone,
  type SalesRequestSummary,
} from '@/lib/domain/salesRequest';
import { Badge, Table, type Column } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * The booking request queue.
 *
 * An inbox: rows arrive in the backend's order (newest first unless the user
 * chose oldest) and are sectioned by the business day they were sent — Hôm nay,
 * Hôm qua, 7 ngày gần đây, Cũ hơn — without being re-sorted. A request nobody
 * has picked up yet (`REQUESTED`) is emphasised; the backend records no per-user
 * "seen" state, so that is the only "new" signal shown.
 *
 * Columns: code, guest, hotel, sent at, stay, rooms/guests, value, response
 * deadline, status. Clicking a row opens the request; the code stays a real link
 * so it can be opened in a new tab.
 */
export function SalesRequestTable({
  requests,
  now,
  filtered = false,
  clearHref,
}: {
  readonly requests: readonly SalesRequestSummary[];
  readonly now: number;
  readonly filtered?: boolean;
  /** Where "show everything" goes when a view or hotel filter matches nothing. */
  readonly clearHref?: string;
}) {
  const router = useRouter();
  const detailHref = (row: SalesRequestSummary) => `/partner/requests/${encodeURIComponent(row.reference)}`;

  const columns: readonly Column<SalesRequestSummary>[] = [
    {
      key: 'reference',
      header: 'Mã yêu cầu',
      cell: (row) => (
        <Link className={styles.reference} href={detailHref(row)} onClick={(event) => event.stopPropagation()}>
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'guest',
      header: 'Khách hàng',
      cell: (row) => <span className={styles.guestName}>{row.guestName ?? '—'}</span>,
    },
    {
      key: 'property',
      header: 'Khách sạn',
      cell: (row) => <span className={styles.hotelCell}>{propertyLabel(row)}</span>,
    },
    {
      key: 'sentAt',
      header: 'Thời điểm gửi',
      cell: (row) => {
        const sent = Date.parse(row.requestedAt);
        return (
          <div className={styles.stack}>
            <span className={styles.nowrap}>{formatBusinessDateTimeShort(row.requestedAt, now)}</span>
            {Number.isNaN(sent) ? null : <span className={styles.muted}>{formatAgoVi(now - sent)}</span>}
          </div>
        );
      },
    },
    {
      key: 'stay',
      header: 'Kỳ nghỉ',
      cell: (row) => (
        <div className={styles.stack}>
          <span className={styles.nowrap}>{stayRange(row.checkIn, row.checkOut, now)}</span>
          <span className={styles.muted}>{row.nights} đêm</span>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'Phòng / khách',
      cell: (row) => (
        <div className={styles.stack}>
          <span className={styles.nowrap}>{row.rooms} phòng</span>
          <span className={styles.muted}>{row.adults + row.children} khách</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Giá trị',
      align: 'end',
      cell: (row) => <span className={styles.nowrap}>{row.total === null ? '—' : formatMoney(row.total)}</span>,
    },
    {
      key: 'deadline',
      header: 'Thời hạn phản hồi',
      cell: (row) => {
        const deadline = deadlineFor(row, now);
        return (
          <div className={`${styles.stack} ${styles.deadlineCell}`}>
            <span className={deadline.state === 'overdue' ? styles.deadlineOverdue : deadline.state === 'remaining' ? styles.deadlineOpen : styles.muted}>
              {deadline.text}
            </span>
            {row.slaDueAt === null ? null : (
              <span className={styles.muted}>Hạn {formatBusinessDateTimeShort(row.slaDueAt, now)}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'salesStatus',
      header: 'Trạng thái',
      cell: (row) => (
        <span className={styles.statusCell}>
          <Badge tone={salesStatusTone(row.salesStatus)}>{salesStatusLabel(row.salesStatus)}</Badge>
        </span>
      ),
    },
  ];

  return (
    <div className={styles.queueTable}>
    <Table
      caption="Yêu cầu đặt phòng"
      columns={columns}
      rows={requests}
      rowKey={(row) => row.reference}
      onRowSelect={(row) => router.push(detailHref(row))}
      groupOf={(row) => requestAgeGroup(row.requestedAt, now)}
      rowClassName={(row) => (row.salesStatus === 'REQUESTED' ? styles.unhandled : undefined)}
      emptyTitle={filtered ? 'Không có yêu cầu nào trong mục này' : 'Chưa có yêu cầu nào'}
      emptyBody={
        filtered ? (
          <>
            Thử chọn mục khác hoặc <Link href={clearHref ?? '/partner/requests'}>xem tất cả yêu cầu</Link>.
          </>
        ) : (
          'Yêu cầu đặt phòng của khách sẽ xuất hiện ở đây ngay khi được gửi.'
        )
      }
    />
    </div>
  );
}

/** "2026-12-24" → "24/12/2026". The dates are calendar dates, so no time zone applies. */
/**
 * "24/11 – 26/11" when the stay is in the current year; otherwise the year is
 * shown on each end that needs it ("28/12/2026 – 02/01/2027").
 */
function stayRange(checkIn: string, checkOut: string, now: number): string {
  const year = String(new Date(now).getUTCFullYear());
  const thisYear = checkIn.startsWith(year) && checkOut.startsWith(year);
  if (thisYear) {
    return `${dayMonth(checkIn)} – ${dayMonth(checkOut)}`;
  }
  const sameYear = yearOf(checkIn) === yearOf(checkOut);
  return `${sameYear ? dayMonth(checkIn) : shortDate(checkIn)} – ${shortDate(checkOut)}`;
}

function yearOf(isoDate: string): string {
  return isoDate.split('-')[0] ?? '';
}

/** dd/MM of a yyyy-MM-dd date. */
function dayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return month === undefined || day === undefined ? isoDate : `${day}/${month}`;
}

function shortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year === undefined || month === undefined || day === undefined ? isoDate : `${day}/${month}/${year}`;
}
