import Link from 'next/link';
import type { SalesRequestSummary } from '@/lib/domain/salesRequest';
import { InboxIcon } from '@/ui/icons';
import styles from './Dashboard.module.css';

/** Ten is what fits beside the stat row and the hotel grid without scrolling. */
const RAIL_LIMIT = 10;

/**
 * The right-hand column of the overview: booking requests still open.
 *
 * <h2>What the reference puts here, and what actually goes here</h2>
 *
 * The design shows a notification feed — new booking, cancellation, a five-star
 * review, an OTA policy update. There is no notification endpoint, no review
 * table with anything in it and no OTA integration, so every one of those rows
 * would be invented.
 *
 * <p>What the column does carry is the one live feed this console genuinely has:
 * `GET /admin/sales/requests`, already scope-filtered to the session's own
 * properties. It answers the same question the reference's panel does — "what
 * has come in that I have not dealt with" — from a real source.
 *
 * <h2>No timestamps that are not there</h2>
 *
 * The reference stamps every row with a time. `SalesRequestSummary` carries the
 * stay dates and the party, which is what a row shows; ageing a request against
 * the clock is the queue screen's job and it has the server's instant to do it
 * with. A dashboard row inventing "10:24" would be inventing the one thing the
 * reader would act on.
 */
export function RequestRail({
  requests,
  closed = 0,
}: {
  /** Already narrowed to the open ones — see the overview page. */
  readonly requests: readonly SalesRequestSummary[];
  /**
   * How many requests the queue holds that are no longer open.
   *
   * Named rather than dropped: "Chưa có yêu cầu nào" under a heading that says
   * "đang mở" reads as *nothing has ever come in*, which is a very different
   * message to a partner whose three requests all expired unanswered this
   * morning. The empty state says which of the two it is.
   */
  readonly closed?: number;
}) {
  const shown = requests.slice(0, RAIL_LIMIT);

  return (
    <section className={styles.rail} aria-labelledby="dashboard-requests">
      <div className={styles.railHead}>
        <h2 className={styles.railTitle} id="dashboard-requests">
          Yêu cầu đang mở
        </h2>
        {requests.length > 0 || closed > 0 ? (
          <Link href="/partner/requests" className={styles.sectionLink}>
            Xem tất cả
          </Link>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className={styles.railEmpty}>
          <span className={styles.railEmptyIcon} aria-hidden="true">
            <InboxIcon size={20} />
          </span>
          <p className={styles.railEmptyTitle}>
            {closed > 0 ? 'Không còn yêu cầu nào đang mở' : 'Chưa có yêu cầu nào'}
          </p>
          <p className={styles.railEmptyBody}>
            {closed > 0 ? (
              <>
                {closed} yêu cầu đã kết thúc (đã chốt, bị từ chối, huỷ hoặc quá hạn).{' '}
                <Link href="/partner/requests">Xem toàn bộ hàng đợi</Link>
              </>
            ) : (
              'Yêu cầu đặt phòng của khách sẽ xuất hiện tại đây ngay khi được gửi.'
            )}
          </p>
        </div>
      ) : (
        <ul className={styles.railList}>
          {shown.map((request) => (
            <li key={request.reference}>
              <Link
                href={`/partner/requests/${encodeURIComponent(request.reference)}`}
                className={styles.railRow}
              >
                <span className={styles.railRowTop}>
                  <span className={styles.railReference}>{request.reference}</span>
                  <span className={styles.railStatus}>{request.salesStatus}</span>
                </span>
                <span className={styles.railProperty}>
                  {request.propertyName ?? request.propertySlug}
                </span>
                <span className={styles.railMeta}>
                  {request.checkIn} → {request.checkOut} · {request.nights} đêm ·{' '}
                  {request.rooms} phòng
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Said rather than silently truncated: a list that stops at ten and does
        not admit it reads as "there are ten".
      */}
      {requests.length > RAIL_LIMIT ? (
        <p className={styles.railMore}>
          Còn {requests.length - RAIL_LIMIT} yêu cầu khác.{' '}
          <Link href="/partner/requests">Xem tất cả</Link>
        </p>
      ) : null}
    </section>
  );
}
