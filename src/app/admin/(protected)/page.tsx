import type { Metadata } from 'next';
import Link from 'next/link';
import { DashboardHotels } from '@/features/dashboard/DashboardHotels';
import { StatCard } from '@/features/dashboard/StatCard';
import { mediaCovers } from '@/features/media/server';
import { ReviewQueue } from '@/features/review/ReviewQueue';
import { reviewQueue, serverNow } from '@/features/review/server';
import { propertyList } from '@/features/property/server';
import { requireConsole } from '@/lib/auth/guard';
import { BuildingIcon, CheckIcon, InboxIcon } from '@/ui/icons';
import { EmptyState, ErrorState, PageHeader } from '@/ui/primitives';
import dashboardStyles from '@/features/dashboard/Dashboard.module.css';
import styles from '@/features/review/Review.module.css';

export const metadata: Metadata = { title: 'Tổng quan — KAS Admin' };

/**
 * The Admin overview.
 *
 * <h2>Two figures, both counted from responses this page already has</h2>
 *
 * Properties in scope and submissions awaiting review — the lengths of the two
 * lists it fetches. No analytics endpoint exists, so nothing else is shown: no
 * approval rate, no time-to-decision, no reviewer workload. Those would each be
 * a number this application has never measured.
 *
 * <h2>The queue is the page</h2>
 *
 * An Admin opens this to answer "is there anything to do", so the queue itself
 * is here rather than only a link to it.
 */
export default async function AdminHome() {
  await requireConsole('ADMIN');
  const [queue, properties, covers, now] = await Promise.all([
    reviewQueue(),
    propertyList(),
    mediaCovers('PROPERTY'),
    serverNow(),
  ]);

  const waiting = queue.status === 'ok' ? queue.submissions.length : null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quản trị"
        title="Tổng quan"
        description="Khách sạn và hồ sơ chờ duyệt, lấy trực tiếp từ hệ thống."
      />

      <section className={dashboardStyles.stats} aria-label="Chỉ số quản trị">
        <StatCard
          label="Hồ sơ chờ duyệt"
          value={waiting === null ? null : String(waiting)}
          note="Trong phạm vi của bạn"
          icon={<InboxIcon />}
        />
        <StatCard
          label="Khách sạn"
          value={properties.status === 'ok' ? String(properties.properties.length) : null}
          note="Trong phạm vi của bạn"
          icon={<BuildingIcon />}
        />
        <StatCard
          label="Đã công bố"
          value={
            properties.status === 'ok'
              ? String(properties.properties.filter((p) => p.lifecycleState !== 'DRAFT').length)
              : null
          }
          note="Khách có thể thấy"
          icon={<CheckIcon />}
        />
      </section>

      <section aria-labelledby="admin-hotels" className={styles.pageHead}>
        <h2 className={styles.pageTitle} id="admin-hotels">Danh sách khách sạn</h2>
        {properties.status === 'error' ? (
          <ErrorState error={properties.error} />
        ) : properties.properties.length === 0 ? (
          <EmptyState title="Chưa có khách sạn nào">
            Tài khoản này chưa có khách sạn nào trong phạm vi được cấp.
          </EmptyState>
        ) : (
          <DashboardHotels
            properties={properties.properties}
            covers={covers.status === 'ok' ? covers.covers : undefined}
            coversUnavailable={covers.status === 'error'}
          />
        )}
      </section>

      <section aria-labelledby="admin-queue" className={styles.pageHead}>
        <h2 className={styles.pageTitle} id="admin-queue">
          Hồ sơ chờ duyệt
        </h2>

        {queue.status === 'error' ? (
          <ErrorState error={queue.error} />
        ) : queue.submissions.length === 0 ? (
          <EmptyState title="Không có hồ sơ nào đang chờ">
            Khi một khách sạn được gửi lên để duyệt, hồ sơ sẽ xuất hiện tại đây.
          </EmptyState>
        ) : (
          <>
            <ReviewQueue submissions={queue.submissions} now={now} />
            <p>
              <Link href="/admin/review">Xem tất cả hồ sơ chờ duyệt</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
