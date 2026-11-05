import type { Metadata } from 'next';
import { ReviewQueue } from '@/features/review/ReviewQueue';
import { reviewQueue, serverNow } from '@/features/review/server';
import { EmptyState, ErrorState, PageHeader } from '@/ui/primitives';
import styles from '@/features/review/Review.module.css';

export const metadata: Metadata = { title: 'Hồ sơ chờ duyệt — KAS Admin' };

/**
 * The review queue.
 *
 * `GET /admin/property-submissions` returns only open submissions, oldest first,
 * already filtered to the reviewer's scope in SQL — so this page passes no
 * filter, sorts nothing, and cannot show a submission the session may not act on.
 */
export default async function AdminReviewQueuePage() {
  // Server-supplied, so a wrong client clock cannot age a submission.
  const [result, now] = await Promise.all([reviewQueue(), serverNow()]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Duyệt hồ sơ"
        title="Hồ sơ chờ duyệt"
        description="Khách sạn được gửi duyệt trước khi hiển thị trên website, cũ nhất trước. Duyệt sẽ công bố khách sạn ra danh sách công khai."
      />

      {result.status === 'error' ? (
        <ErrorState error={result.error} />
      ) : result.submissions.length === 0 ? (
        // Not a failure: the queue is genuinely clear. Today that is also the
        // real state — no property has been submitted yet.
        <EmptyState title="Không có hồ sơ nào đang chờ">
          Khi một khách sạn được gửi lên để duyệt, hồ sơ sẽ xuất hiện tại đây.
        </EmptyState>
      ) : (
        <ReviewQueue submissions={result.submissions} now={now} />
      )}
    </div>
  );
}
