import Link from 'next/link';
import {
  submissionStatusLabel,
  submissionStatusTone,
  type SubmissionView,
} from '@/lib/domain/submission';
import { Badge } from '@/ui/primitives';
import styles from './Review.module.css';

/**
 * The submissions waiting to be reviewed.
 *
 * <h2>Rows, not cards</h2>
 *
 * This is a work queue: an Admin arrives to clear it, and the useful shape is a
 * scannable list ordered oldest-first — which is how the endpoint returns it, so
 * no sort happens here. Below 768px each row becomes a stacked block rather than
 * a table that has to be dragged sideways.
 *
 * <h2>What a row can honestly say</h2>
 *
 * `SubmissionView` has seven fields and four of them are empty while a
 * submission is open. So a row carries the property id, the status and how long
 * it has been waiting — not a partner name, a reviewer or a hotel name, none of
 * which this response contains. The property's name is on the review page, which
 * reads the property itself.
 */
export function ReviewQueue({
  submissions,
  now,
}: {
  readonly submissions: readonly SubmissionView[];
  /** Server-supplied, so a wrong client clock cannot age a submission. */
  readonly now: number;
}) {
  return (
    <ul className={styles.queue}>
      {submissions.map((submission) => (
        <li key={submission.id}>
          <Link href={`/admin/review/${submission.id}`} className={styles.queueRow}>
            <span className={styles.queueMain}>
              <span className={styles.queueId}>{submission.propertyId}</span>
              <span className={styles.queueMeta}>
                Gửi {waitedFor(submission.submittedAt, now)}
              </span>
            </span>

            <span className={styles.queueState}>
              <Badge tone={submissionStatusTone(submission.status)}>
                {submissionStatusLabel(submission.status)}
              </Badge>
              <span className={styles.queueGo} aria-hidden="true">
                →
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * How long a submission has been waiting, in whole units.
 *
 * Relative rather than absolute because the queue's question is "what is
 * oldest", not "what date was this". The instant itself is shown on the review
 * page, where the exact time is the useful form.
 */
export function waitedFor(submittedAt: string, now: number): string {
  const elapsed = now - Date.parse(submittedAt);
  if (Number.isNaN(elapsed)) {
    return submittedAt;
  }

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  return `${Math.floor(hours / 24)} ngày trước`;
}
