import type { ReactNode } from 'react';
import styles from './CalendarCell.module.css';

/**
 * One cell of a calendar grid — purely presentational.
 *
 * <h2>It must not know what it is showing</h2>
 *
 * The same component carries the inventory calendar (Step 13) and the rate
 * calendar (Steps 14–15). It therefore knows nothing about rooms, prices,
 * availability or oversell: it renders a primary value, an optional secondary
 * one, and a state.
 *
 * That constraint is the point. The backend is authoritative for both — doc 15
 * §2.2 puts the oversell guarantee in a database CHECK, and doc 56 §3.1 puts
 * rate precedence in `RateResolver`. A cell that computed anything would be a
 * second implementation of a rule that already exists, and the two would drift.
 *
 * <h2>`unconfigured` is not zero</h2>
 *
 * The distinction is load-bearing and comes straight from the backend work:
 * doc 15 §12 treats a missing inventory row as unavailable, never as zero
 * available, and doc 56 §9 leaves base rates OPEN so an unpriced cell is a gap
 * rather than a free room. Rendering either as "0" would state something false.
 * So `value === null` renders as a visible dash with a screen-reader label, and
 * a caller cannot accidentally show 0 by passing nothing.
 */

export type CalendarCellState = 'default' | 'unconfigured' | 'disabled' | 'warning' | 'error';

export interface CalendarCellProps {
  /** ISO date, used for the accessible label and as a stable key by callers. */
  readonly date: string;
  /** The headline figure. `null` means unconfigured — never rendered as zero. */
  readonly value: ReactNode | null;
  readonly secondary?: ReactNode;
  readonly state?: CalendarCellState;
  readonly selected?: boolean;
  /** Supplied when the cell is interactive; omitted makes it a plain grid cell. */
  readonly onSelect?: (date: string) => void;
  /** Overrides the generated accessible label where the caller has better words. */
  readonly label?: string;
}

const STATE_CLASS: Record<CalendarCellState, string | undefined> = {
  default: undefined,
  unconfigured: styles.unconfigured,
  disabled: styles.disabled,
  warning: styles.warning,
  error: styles.error,
};

export function CalendarCell({
  date,
  value,
  secondary,
  state = 'default',
  selected = false,
  onSelect,
  label,
}: CalendarCellProps) {
  const unconfigured = value === null || state === 'unconfigured';
  const interactive = onSelect !== undefined && state !== 'disabled';

  const className = [
    styles.cell,
    STATE_CLASS[unconfigured ? 'unconfigured' : state],
    selected ? styles.selected : undefined,
    interactive ? styles.interactive : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className={styles.value}>
        {unconfigured ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="srOnly">chưa cấu hình</span>
          </>
        ) : (
          value
        )}
      </span>
      {secondary === undefined ? null : <span className={styles.secondary}>{secondary}</span>}
    </>
  );

  // Doc 82: state is never carried by colour alone. `aria-current` and the
  // label announce selection and state; the tint is corroboration, not the
  // signal.
  const accessibleLabel = label ?? date;

  if (!interactive) {
    return (
      <div className={className} data-date={date} aria-label={accessibleLabel} role="gridcell">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-date={date}
      aria-label={accessibleLabel}
      aria-pressed={selected}
      onClick={() => onSelect(date)}
    >
      {content}
    </button>
  );
}
