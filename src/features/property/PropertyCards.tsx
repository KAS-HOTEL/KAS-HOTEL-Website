import Link from 'next/link';
import type { MediaCoverView } from '@/lib/domain/media';
import { displayName, missingInformation, type PropertyAdminView } from '@/lib/domain/property';
import { Badge } from '@/ui/primitives';
import { PropertyCover } from './PropertyCover';
import { PropertyStatus } from './PropertyStatus';
import { formatAddress } from './address';
import styles from './PropertyCards.module.css';

/**
 * The portfolio at narrow widths.
 *
 * <h2>Why this exists alongside the table</h2>
 *
 * {@link PropertyTable} argues — correctly — that six scalars are a table and
 * not a card, and on a desktop that holds: the columns line up and eight hotels
 * are scannable in one glance. At 375px the same table stops being a table. Its
 * `overflow-x` region is accessible but three of the six columns sit off-screen,
 * and "Kas Passion Boutique Hotel" wraps to four lines inside a column narrower
 * than the word "Boutique".
 *
 * <p>So the answer is not "cards are nicer" — it is that a table whose columns
 * cannot be seen together has stopped doing the one thing a table is for.
 *
 * <h2>Exactly the table's fields, and no others</h2>
 *
 * Name, slug, status, address, phone, flagship. Every one comes from
 * {@code PropertyAdminView}; nothing is derived, counted or invented, and a
 * field the backend omitted is shown as absent rather than as a dash pretending
 * to be data. There is deliberately no room count, no occupancy and no rating —
 * the endpoint returns none of them.
 *
 * <h2>One of the two is in the accessibility tree at a time</h2>
 *
 * The page renders both and CSS hides one at 768px. `display: none` removes a
 * subtree from the accessibility tree as well as the layout, so a screen reader
 * meets one list, not two — which is why this is a media query rather than
 * `aria-hidden` bookkeeping that could drift.
 */
export function PropertyCards({
  properties,
  covers,
  coversUnavailable = false,
}: {
  readonly properties: readonly PropertyAdminView[];
  /** Cover per property id. A property with none is simply absent. */
  readonly covers?: ReadonlyMap<string, MediaCoverView> | undefined;
  readonly coversUnavailable?: boolean | undefined;
}) {
  return (
    <ul className={styles.list}>
      {properties.map((property) => {
        const name = displayName(property.names);
        const address = formatAddress(property);
        const missing = missingInformation(property);

        return (
          <li key={property.id}>
            {/*
              The whole card is the link, so the touch target is the card rather
              than a line of text inside it — and it is still one tab stop, not
              a card wrapping several competing ones.
            */}
            <Link href={`/partner/properties/${property.id}`} className={styles.card}>
              <span className={styles.head}>
                <PropertyCover
                  cover={covers?.get(property.id) ?? null}
                  unavailable={coversUnavailable}
                />
                <span className={styles.name}>
                  {name ?? <span className={styles.unnamed}>Chưa đặt tên</span>}
                </span>
                <PropertyStatus state={property.lifecycleState} />
              </span>

              {/* The slug line is gone — see PropertyTable for the reasoning.
                  On a phone it was also the widest thing on the card. */}
              <span className={styles.meta}>
                {address === '' ? null : <span className={styles.metaLine}>{address}</span>}
                {property.phone === undefined ? null : (
                  <span className={styles.metaLine}>{property.phone}</span>
                )}
                {/*
                  The same triage signal the table carries, because a phone is
                  where this list is most likely to be read between hotels. Not
                  the publish gate — see missingInformation().
                */}
                <span className={styles.metaLine}>
                  {missing.length === 0 ? 'Thông tin đã đủ' : `Thiếu ${missing.length} mục thông tin`}
                </span>
              </span>

              {property.isFlagship ? (
                <span className={styles.flags}>
                  <Badge tone="accent">Nổi bật</Badge>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
