import { Button, Input, Select } from '@/ui/primitives';
import {
  LIFECYCLE_LABELS,
  PROPERTY_LIFECYCLE_STATES,
  type PortfolioFilter,
} from '@/lib/domain/property';
import styles from './Property.module.css';

/**
 * Narrowing the portfolio.
 *
 * <h2>A plain GET form, and no client component</h2>
 *
 * Submitting writes `?q=&state=` into the URL and the server re-renders the
 * filtered list, so the result is linkable, the back button behaves, and the
 * screen works with JavaScript disabled. It is the same shape the guest stay
 * search uses, and it matches the console's existing convention of keeping
 * range and filter state in the URL (the inventory and rate calendars both do).
 *
 * <h2>Only filters the contract can justify</h2>
 *
 * Two controls, because only two are backed by fields the list endpoint
 * actually returns: free text over the name, slug and address, and the
 * **lifecycle state**, whose five values and their labels are already frozen
 * (doc 03 §8) and already rendered in the table's status column. Nothing here
 * invents a category, and there is no filter for room count, completeness,
 * submission state or last-updated — none of which is on `PropertyAdminView`.
 *
 * There is no pagination control either: the endpoint returns the complete
 * scoped list and defines no page semantics, so inventing one would be
 * inventing a contract.
 */
export function PortfolioFilters({
  action,
  filter,
  showing,
  total,
}: {
  /** The portfolio's own path — the form posts its state back to this page. */
  readonly action: string;
  readonly filter: PortfolioFilter;
  readonly showing: number;
  readonly total: number;
}) {
  return (
    <form method="get" action={action} className={styles.portfolioFilters} aria-labelledby="portfolio-filter-title">
      <h2 className={styles.portfolioFilterTitle} id="portfolio-filter-title">
        Tìm khách sạn
      </h2>

      <div className={styles.portfolioFilterFields}>
        <Input
          id="portfolio-q"
          name="q"
          label="Tên hoặc địa chỉ"
          type="search"
          defaultValue={filter.q}
          description="Không phân biệt chữ hoa, chữ thường hay dấu."
        />

        <Select
          id="portfolio-state"
          name="state"
          label="Trạng thái"
          defaultValue={filter.state}
          options={[
            { value: 'all', label: 'Tất cả trạng thái' },
            ...PROPERTY_LIFECYCLE_STATES.map((state) => ({
              value: state,
              label: LIFECYCLE_LABELS[state],
            })),
          ]}
        />

        <div className={styles.portfolioFilterActions}>
          <Button type="submit">Lọc</Button>
        </div>
      </div>

      {/* Counts of what is on screen, from the response — never a total the
          frontend believes the portfolio ought to have. */}
      <p className={styles.portfolioCount} role="status">
        {showing === total
          ? `${total} khách sạn trong phạm vi tài khoản.`
          : `Hiển thị ${showing}/${total} khách sạn.`}
      </p>
    </form>
  );
}
