import {
  submissionStatusLabel,
  submissionStatusTone,
  type SubmissionView,
} from '@/lib/domain/submission';
import { Badge, EmptyState } from '@/ui/primitives';
import styles from './Review.module.css';

/**
 * Every decision taken on this property.
 *
 * <h2>Retained, never overwritten</h2>
 *
 * `property_submission` keeps one row per submission, so a property that was
 * sent back and resubmitted has both rows here. That is the point of the panel:
 * a reviewer seeing a second submission should be able to read what was asked
 * for the first time.
 *
 * <h2>The reviewer is an id, because that is what the API returns</h2>
 *
 * `SubmissionView.reviewedBy` is a `UUID` and no endpoint resolves it to a name
 * — there is no user-lookup route in the API. The id is shown as an id rather
 * than dressed up as a person, and the row says nothing it cannot support.
 */
export function ReviewHistory({ history }: { readonly history: readonly SubmissionView[] }) {
  if (history.length === 0) {
    return (
      <EmptyState title="Chưa có lịch sử">
        Khách sạn này chưa có hồ sơ nào được gửi duyệt trước đây.
      </EmptyState>
    );
  }

  return (
    <ol className={styles.history}>
      {history.map((entry) => (
        <li key={entry.id} className={styles.historyItem}>
          <div className={styles.historyHead}>
            <Badge tone={submissionStatusTone(entry.status)}>
              {submissionStatusLabel(entry.status)}
            </Badge>
            <span className={styles.historyWhen}>{formatInstant(entry.submittedAt)}</span>
          </div>

          <dl className={styles.historyFacts}>
            <div className={styles.historyFact}>
              <dt>Gửi lúc</dt>
              <dd>{formatInstant(entry.submittedAt)}</dd>
            </div>
            {entry.reviewedAt === undefined ? null : (
              <div className={styles.historyFact}>
                <dt>Duyệt lúc</dt>
                <dd>{formatInstant(entry.reviewedAt)}</dd>
              </div>
            )}
            {entry.reviewedBy === undefined ? null : (
              <div className={styles.historyFact}>
                <dt>Người duyệt</dt>
                <dd className={styles.mono}>{entry.reviewedBy}</dd>
              </div>
            )}
          </dl>

          {entry.decisionReason === undefined ? null : (
            <p className={styles.historyReason}>{entry.decisionReason}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * An ISO instant as a readable local time.
 *
 * Formatted with an explicit locale and time zone rather than the runtime's, so
 * the server-rendered string and the client's match and hydration does not warn.
 */
export function formatInstant(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed);
}
