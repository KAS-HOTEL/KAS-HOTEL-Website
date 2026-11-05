import type { ReactNode } from 'react';
import styles from './Dashboard.module.css';

/**
 * One figure on the overview.
 *
 * <h2>`null` is a value, and it is shown as one</h2>
 *
 * A metric with no endpoint behind it renders an em dash and its note says why,
 * rather than a zero. Zero is a measurement — "no bookings this week" — and this
 * application has not measured anything: saying zero where nothing was counted
 * is the same fabrication as saying 124.
 */
export function StatCard({
  label,
  value,
  note,
  icon,
}: {
  readonly label: string;
  /** `null` when no endpoint reports this figure. */
  readonly value: string | null;
  readonly note: string;
  /** Decoration beside the label, which already names the figure. */
  readonly icon: ReactNode;
}) {
  const unavailable = value === null;

  return (
    <article className={styles.stat} data-unavailable={unavailable || undefined}>
      <div className={styles.statHead}>
        <p className={styles.statLabel}>{label}</p>
        <span className={styles.statIcon} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className={styles.statValue}>
        {unavailable ? (
          <>
            <span aria-hidden="true">—</span>
            <span className={styles.srOnly}>Không có dữ liệu</span>
          </>
        ) : (
          value
        )}
      </p>
      <p className={styles.statNote}>{note}</p>
    </article>
  );
}
