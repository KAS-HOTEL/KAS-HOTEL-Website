import { RequestRail } from '@/features/dashboard/RequestRail';
import { StatCard } from '@/features/dashboard/StatCard';
import { salesQueue } from '@/features/salesRequest/server';
import { requireConsole } from '@/lib/auth/guard';
import { isOpenRequest } from '@/lib/domain/salesRequest';
import { InboxIcon } from '@/ui/icons';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/dashboard/Dashboard.module.css';

export const metadata = { title: 'Tổng quan — KAS Super Admin' };

/**
 * The Super Admin overview: what needs an answer now. Hotels belong to the Admin
 * console, so nothing here reads them.
 *
 * <h2>"Open" is a decision this page makes, and says</h2>
 *
 * The queue endpoint has no notion of open — it returns every request, WON and
 * EXPIRED included. Both the card and the rail beside it therefore filter, and
 * the card names the remainder rather than dropping it silently.
 *
 * <h2>No greeting by name</h2>
 *
 * The reference opens with "Xin chào, Nguyễn Văn A". The backend now exposes
 * `GET /me/profile`, but no frontend client or dashboard loader consumes it yet.
 * The greeting therefore remains role-based until that profile read is wired.
 *
 */
export default async function PartnerHome() {
  await requireConsole('SUPER_ADMIN');
  const requests = await salesQueue();

  /*
    The queue endpoint returns every request, terminal ones included, because a
    sales team needs to look up what happened to one it closed last week. This
    page asks a narrower question — "what needs me" — so it narrows the list
    itself rather than labelling the whole queue "Đang mở". Before this, the
    three seeded requests had all expired and the card still read "3 · Đang mở".

    Filtered here rather than by re-requesting with a status parameter: the
    response is the complete scoped set with no pagination, so counting it is
    exact, and the endpoint takes one status at a time while "open" is five.
  */
  const openRequests =
    requests.status === 'ok' ? requests.requests.filter(isOpenRequest) : [];

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <p className={styles.greetingEyebrow}>Super Admin</p>
        <h1 className={styles.title}>Tổng quan vận hành</h1>
        <p className={styles.lead}>Yêu cầu đặt phòng đang chờ xử lý, lấy trực tiếp từ hệ thống.</p>
      </header>

      <section className={styles.stats} aria-label="Chỉ số tổng quan">
        <StatCard
          label="Yêu cầu cần xử lý"
          value={requests.status === 'ok' ? String(openRequests.length) : null}
          note={
            requests.status === 'ok' && requests.requests.length > openRequests.length
              ? `${requests.requests.length - openRequests.length} yêu cầu đã kết thúc`
              : 'Chưa có yêu cầu nào đã kết thúc'
          }
          icon={<InboxIcon />}
        />
      </section>

      <div className={styles.columns}>
        {requests.status === 'error' ? (
          <section className={styles.rail} aria-label="Yêu cầu đang mở">
            <ErrorState error={requests.error} />
          </section>
        ) : (
          <RequestRail requests={openRequests} closed={requests.requests.length - openRequests.length} />
        )}
      </div>
    </div>
  );
}
