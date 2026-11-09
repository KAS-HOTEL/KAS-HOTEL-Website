import { Fragment, type ReactNode } from 'react';
import { EmptyState, Skeleton } from './States';
import styles from './Table.module.css';

/**
 * The operational table.
 *
 * Used by properties, rooms, inventory, rate rules, users and audit. Generic
 * over the row type so a caller keeps its own domain types end to end and never
 * casts.
 *
 * <h2>Semantics first</h2>
 *
 * A real `table` with `th scope="col"`, a `caption`, and `aria-busy` while
 * loading. A grid of divs looks identical and is unusable with a screen reader,
 * which announces neither the column a cell belongs to nor how many rows there
 * are.
 *
 * <h2>No pagination inside the table</h2>
 *
 * Almost every list this renders is bounded by something real — a partner's
 * eight properties, one property's room types, one request's notes — so a full
 * list is the correct one and a page envelope here would be furniture.
 *
 * <p>One endpoint now pages: `GET /admin/ops/reservations`, whose list grows
 * with every booking and never shrinks. Its pager is a sibling component
 * (`ReservationPager`) rendering the server's own `page`/`size`/`total` as
 * links, rather than state inside this primitive — so a table still receives
 * exactly the rows it should display, and only the screens that genuinely page
 * carry the concept.
 */

export interface Column<Row> {
  /** Stable key, also used for the React key of each cell. */
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  /** Right-align numerics so figures line up — doc 80's operational density. */
  readonly align?: 'start' | 'end';
  /** Marks the trailing actions column so it can be styled and pinned. */
  readonly isActions?: boolean;
}

interface TableProps<Row> {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly loading?: boolean;
  readonly emptyTitle?: string;
  readonly emptyBody?: ReactNode;
  readonly selectedKey?: string | undefined;
  readonly onRowSelect?: (row: Row) => void;
  /**
   * Optional section label per row. A heading row is drawn wherever the label
   * changes, so the rows keep the caller's order (a newest-first inbox reads
   * "Hôm nay", "Hôm qua"… without being re-sorted here).
   */
  readonly groupOf?: (row: Row) => string;
  /** Optional extra class per row, e.g. to emphasise an unhandled item. */
  readonly rowClassName?: (row: Row) => string | undefined;
}

export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'Chưa có dữ liệu',
  emptyBody,
  selectedKey,
  onRowSelect,
  groupOf,
  rowClassName,
}: TableProps<Row>) {
  if (loading) {
    return (
      <div className={styles.wrap} aria-busy="true" aria-live="polite">
        <div className={styles.loading}>
          <Skeleton height={20} width="30%" />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} width="70%" />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  }

  return (
    // Doc 82: the scroll container is the table, never the page. A dense
    // operational table on a phone must scroll inside its own box, so the
    // surrounding navigation stays put.
    <div className={styles.wrap} tabIndex={0} role="region" aria-label={caption}>
      <table className={styles.table}>
        <caption className="srOnly">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === 'end' ? styles.end : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            const group = groupOf?.(row);
            const previous = index === 0 ? undefined : rows[index - 1];
            const startsGroup =
              group !== undefined && (previous === undefined || groupOf?.(previous) !== group);
            const className = [selected ? styles.selected : undefined, rowClassName?.(row)]
              .filter(Boolean)
              .join(' ');
            return (
              <Fragment key={key}>
              {startsGroup ? (
                <tr className={styles.group}>
                  <th scope="colgroup" colSpan={columns.length}>
                    {group}
                  </th>
                </tr>
              ) : null}
              <tr
                className={className === '' ? undefined : className}
                aria-selected={onRowSelect ? selected : undefined}
                onClick={onRowSelect ? () => onRowSelect(row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      column.align === 'end' ? styles.end : undefined,
                      column.isActions ? styles.actions : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
