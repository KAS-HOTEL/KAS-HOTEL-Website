import type { Metadata } from 'next';
import { PublishingBoard } from '@/features/property/PublishingBoard';
import { publishingBoard } from '@/features/property/server';
import { EmptyState, ErrorState, PageHeader } from '@/ui/primitives';
import styles from '@/features/review/Review.module.css';

export const metadata: Metadata = { title: 'Khách sạn — KAS Admin' };

/**
 * The Admin hotel list, and the place a hotel is put on the website.
 *
 * <h2>What this screen is for</h2>
 *
 * Every hotel in the reviewer's scope, with its current state and the one
 * action that state permits — approve a submitted draft, or open an approved
 * hotel for booking. Both are existing endpoints and existing transitions; this
 * page is where they became reachable, because the publish control had been
 * taken off the Partner overview and had no home afterwards.
 *
 * <h2>Deliberately not a dashboard</h2>
 *
 * No filters, no search, no pagination. `GET /admin/properties` is unpaginated
 * and returns a single partner's estate — eight hotels — so a filter row would
 * be chrome above a list short enough to read at a glance. The review queue
 * remains its own screen: this one is about hotels, that one is about pending
 * decisions, and they link to each other rather than merging.
 */
export default async function AdminProperties() {
  const board = await publishingBoard();

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quản trị"
        title="Khách sạn"
        description="Duyệt hồ sơ để khách sạn hiển thị trên website, rồi mở bán để khách có thể đặt phòng."
      />

      {board.status === 'error' ? (
        <ErrorState error={board.error} />
      ) : board.rows.length === 0 ? (
        <EmptyState title="Chưa có khách sạn nào">
          Khi đối tác tạo khách sạn đầu tiên, khách sạn sẽ xuất hiện tại đây.
        </EmptyState>
      ) : (
        <PublishingBoard
          rows={board.rows}
          coversUnavailable={board.coversUnavailable}
          queueUnavailable={board.queueUnavailable}
        />
      )}
    </div>
  );
}
