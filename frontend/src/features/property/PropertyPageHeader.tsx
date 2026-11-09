import type { ReactNode } from 'react';
import { Breadcrumb } from '@/ui/primitives';
import { PropertyStatus } from './PropertyStatus';
import styles from './Property.module.css';

/**
 * The header every property-management screen shares.
 *
 * <h2>Why one component, and what it fixed</h2>
 *
 * The seven screens had drifted into two schemes. Information and Rooms made the
 * hotel name the {@code h1} with the slug beneath; Media, Policies, Inventory and
 * Rates made the *section* the {@code h1} with the hotel name beneath. So the
 * largest text on the page changed meaning as you moved between tabs, and on four
 * of them the hotel — the thing every edit is about — was the smaller line.
 *
 * <h2>The hierarchy</h2>
 *
 * <p>Section above, hotel as the heading, its location below. The hotel is the subject of
 * every screen in this area, so it is the {@code h1} throughout; the section is an
 * eyebrow because the breadcrumb and the active tab already carry it, and a second
 * heading competing with the hotel name is what caused the drift.
 *
 * <p>The lifecycle badge rides along on every screen rather than only on the
 * overview. Whether a hotel is a draft changes what an edit means, and that was
 * previously invisible from Rates or Inventory.
 */
export function PropertyPageHeader({
  propertyId,
  slug,
  name,
  place,
  section,
  lifecycleState,
  badges,
  actions,
}: {
  readonly propertyId: string;
  readonly slug: string;
  /** Resolved display name; `null` when no translation exists yet. */
  readonly name: string | null;
  /** "Quận 1, Hồ Chí Minh" — what an operator recognises the hotel by. */
  readonly place?: string | undefined;
  /** The management area — omitted on the overview, which is the property itself. */
  readonly section?: string;
  readonly lifecycleState: string;
  /** Extra badges beside the lifecycle one, e.g. the flagship marker. */
  readonly badges?: ReactNode;
  /** A trailing control, right-aligned on wide screens. */
  readonly actions?: ReactNode;
}) {
  return (
    <header className={styles.propertyHeader}>
      {/*
        The hotel's name in the trail, not its slug. A breadcrumb is how an
        operator retraces their steps, and they know where they are by the
        hotel's name; the slug falls back only when no translation exists yet,
        which is the one case where there is nothing else to call it.
      */}
      <Breadcrumb
        items={[
          { label: 'Khách sạn', href: '/partner/properties' },
          ...(section === undefined
            ? [{ label: name ?? slug }]
            : [
                { label: name ?? slug, href: `/partner/properties/${propertyId}` },
                { label: section },
              ]),
        ]}
      />

      <div className={styles.propertyHeaderMain}>
        <div className={styles.propertyHeaderIdentity}>
          {section === undefined ? null : <p className={styles.propertyEyebrow}>{section}</p>}
          <h1 className={styles.propertyHeaderTitle}>{name ?? slug}</h1>
          {/*
            STEP K: the slug used to sit here. It is a URL segment, not a fact
            about a hotel, and an operator has no use for it — where the hotel
            is does. The slug is still in the breadcrumb, where it identifies the
            record being navigated, and on the customer link, where it is the
            address.
          */}
          {place === undefined ? null : <p className={styles.propertyHeaderPlace}>{place}</p>}
        </div>

        <div className={styles.propertyHeaderMeta}>
          <PropertyStatus state={lifecycleState} />
          {badges}
          {actions}
        </div>
      </div>
    </header>
  );
}
