'use client';

import { BuildingIcon } from '@/ui/icons';
import { Select, Skeleton } from '@/ui/primitives';
import styles from './PropertySwitcher.module.css';

/**
 * Switches the active property for the Partner console.
 *
 * <h2>N properties, never eight</h2>
 *
 * A partner owns one property or many. The count is whatever the backend returns
 * from the caller's scope, and nothing here assumes, defaults to, or special-cases
 * the eight current seed records. Doc 85 §5.2 makes the scope the authority:
 * `GET /api/v1/admin/properties` already returns exactly the properties this
 * session may reach, so the switcher is a view of that answer rather than a
 * filter over a wider list.
 *
 * <h2>Presentational on purpose</h2>
 *
 * It takes a list and reports a choice. Fetching stays outside: the protected
 * layout loads the scoped list on the server and {@code PropertySwitcherControl}
 * turns a choice into a route change. Doc 100 §9 keeps API access in `lib/api`,
 * and a component that both fetched and rendered would be untestable without a
 * network.
 *
 * <h2>The single-property case</h2>
 *
 * With one property there is nothing to switch, so it renders as a label rather
 * than a select. A one-option dropdown invites a click that does nothing.
 */

export interface SwitchableProperty {
  readonly id: string;
  /**
   * What to show for this property.
   *
   * Deliberately not called `name`. `GET /api/v1/admin/properties` returns no
   * display name (OQ-132), so callers feed it the slug — and a field named
   * `name` holding a slug is how a screen starts claiming to show something it
   * never received.
   */
  readonly label: string;
}

interface PropertySwitcherProps {
  readonly properties: readonly SwitchableProperty[];
  readonly activeId: string | null;
  readonly onChange: (propertyId: string) => void;
  readonly loading?: boolean;
  /** Set when the list could not be loaded; the switcher then says so. */
  readonly error?: string | undefined;
}

export function PropertySwitcher({
  properties,
  activeId,
  onChange,
  loading = false,
  error,
}: PropertySwitcherProps) {
  if (loading) {
    return (
      <div className={styles.switcher} aria-busy="true">
        <BuildingIcon size={16} className={styles.icon} />
        <Skeleton height={20} width="180px" />
      </div>
    );
  }

  if (error !== undefined) {
    return (
      <div className={styles.switcher} role="alert">
        <BuildingIcon size={16} className={styles.icon} />
        <span className={styles.message}>{error}</span>
      </div>
    );
  }

  if (properties.length === 0) {
    // Not an error: a partner with no property yet is a real state, and the
    // eight seed properties are DRAFT until onboarding publishes them.
    return (
      <div className={styles.switcher}>
        <BuildingIcon size={16} className={styles.icon} />
        <span className={styles.message}>Chưa có khách sạn nào</span>
      </div>
    );
  }

  if (properties.length === 1) {
    const only = properties[0];
    return (
      <div className={styles.switcher}>
        <BuildingIcon size={16} className={styles.icon} />
        <span className={styles.single}>{only?.label}</span>
      </div>
    );
  }

  return (
    <div className={styles.switcher}>
      <BuildingIcon size={16} className={styles.icon} />
      <div className={styles.selectSlot}>
        <Select
          id="property-switcher"
          label="Khách sạn đang chọn"
          value={activeId ?? ''}
          placeholder="Chọn khách sạn"
          options={properties.map((property) => ({
            value: property.id,
            label: property.label,
          }))}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
