import Link from 'next/link';
import { formatBeds, roomTypeName, viewTypeLabel, type RoomTypeView } from '@/lib/domain/roomType';
import { RoomTypeStatusBadge } from './RoomTypeStatusBadge';
import styles from './RoomType.module.css';

/**
 * The room types at narrow widths.
 *
 * <h2>Why the table alone was not enough</h2>
 *
 * `RoomTypeTable` has six columns. Its wrapper scrolls horizontally, so nothing
 * was clipped — but reading one room on a 375px screen meant dragging a
 * six-column table sideways to collect facts that belong together. Understanding
 * a single room should not require horizontal scrolling.
 *
 * <h2>The same fields, not a reduced set</h2>
 *
 * Name, code, status, occupancy, beds, view and area — every column the table
 * shows, stacked. Nothing is dropped on the assumption that a phone user needs
 * less, and nothing is added that the endpoint does not return.
 *
 * <p>CSS shows exactly one of the two: this list is hidden from 768px up and the
 * table is hidden below it, so neither the layout nor the accessibility tree ever
 * holds both.
 */
export function RoomTypeCards({
  propertyId,
  roomTypes,
}: {
  readonly propertyId: string;
  readonly roomTypes: readonly RoomTypeView[];
}) {
  return (
    <ul className={styles.cardList}>
      {roomTypes.map((roomType) => {
        const name = roomTypeName(roomType.translations);
        const beds = formatBeds(roomType.beds);
        const view = roomType.viewType;
        const area = roomType.areaSqm;

        return (
          <li key={roomType.id}>
            {/* The whole card is the target, as on the portfolio's cards: a
                title-only link is a small tap area on a phone. */}
            <Link
              href={`/partner/properties/${propertyId}/rooms/${roomType.id}`}
              className={styles.card}
            >
              <span className={styles.cardHead}>
                <span className={styles.cardName}>
                  {name ?? <span className={styles.cardUnnamed}>Chưa đặt tên</span>}
                </span>
                <RoomTypeStatusBadge status={roomType.status} />
              </span>

              <span className={styles.cardSlug}>{roomType.slug}</span>

              <dl className={styles.cardFacts}>
                <div className={styles.cardFact}>
                  <dt>Sức chứa</dt>
                  <dd>
                    {roomType.maxOccupancy} khách
                    <span className={styles.cardFactNote}>
                      {roomType.maxAdults} người lớn · {roomType.maxChildren} trẻ em
                    </span>
                  </dd>
                </div>

                <div className={styles.cardFact}>
                  <dt>Giường</dt>
                  <dd>{beds === '' ? <span className={styles.cardUnset}>Chưa cấu hình</span> : beds}</dd>
                </div>

                <div className={styles.cardFact}>
                  <dt>Hướng nhìn</dt>
                  <dd>
                    {view === undefined ? (
                      <span className={styles.cardUnset}>Chưa đặt</span>
                    ) : (
                      viewTypeLabel(view)
                    )}
                  </dd>
                </div>

                <div className={styles.cardFact}>
                  <dt>Diện tích</dt>
                  <dd>
                    {area === undefined ? (
                      <span className={styles.cardUnset}>Chưa đặt</span>
                    ) : (
                      `${area} m²`
                    )}
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
