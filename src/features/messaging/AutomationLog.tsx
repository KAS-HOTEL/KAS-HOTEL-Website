import Link from 'next/link';
import {
  automationStatusLabel,
  triggerLabel,
  type AutomationLogEntry,
} from '@/lib/domain/conversation';
import { Badge, EmptyState } from '@/ui/primitives';
import styles from './Messaging.module.css';

/**
 * What the automated-message sweep has actually produced.
 *
 * <h2>Every row is a message that exists</h2>
 *
 * There is no execution table behind this and none was created. A sweep that
 * wrote nothing left nothing to show, and a `SKIPPED` row for every reservation
 * it considered and passed over would bury the real entries under non-events.
 *
 * <p>So there are two states, both derivable from the record: **Đã ghi nhận**
 * (written) and **Đã gửi** (a transport wrote `sent_at`). There is no `FAILED`,
 * because a failed write leaves no row to fail — a failure appears as the
 * absence of an entry, and the next hourly tick retries it.
 */
export function AutomationLog({
  entries,
  copy,
}: {
  readonly entries: readonly AutomationLogEntry[];
  readonly copy: AutomationLogCopy;
}) {
  if (entries.length === 0) {
    return <EmptyState title={copy.emptyTitle}>{copy.emptyBody}</EmptyState>;
  }

  return (
    <ul className={styles.automationLog} aria-label={copy.label}>
      {entries.map((entry) => (
        <li
          key={`${entry.reference}-${entry.templateName}-${entry.recordedAt}`}
          className={styles.automationEntry}
        >
          <div className={styles.automationEntryTop}>
            <Link
              href={`/partner/messages/${entry.reference}`}
              className={styles.automationReference}
            >
              {entry.reference}
            </Link>
            <Badge tone={entry.status === 'SENT' ? 'success' : 'info'}>
              {automationStatusLabel(entry.status)}
            </Badge>
          </div>
          <p className={styles.automationTemplate}>{entry.templateName}</p>
          <p className={styles.automationMeta}>
            {triggerLabel(entry.trigger)} · {entry.propertySlug}
          </p>
          <time dateTime={entry.recordedAt} className={styles.automationTime}>
            {entry.recordedAt}
          </time>
        </li>
      ))}
    </ul>
  );
}

export interface AutomationLogCopy {
  readonly label: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const AUTOMATION_LOG_COPY: AutomationLogCopy = {
  label: 'Nhật ký tin nhắn tự động',
  emptyTitle: 'Chưa có tin nhắn tự động nào',
  emptyBody:
    'Khi bạn bật một tin nhắn mẫu tự động, các tin nhắn hệ thống ghi nhận sẽ xuất hiện ở đây.',
};
