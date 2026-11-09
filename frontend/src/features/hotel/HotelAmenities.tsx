import type { PublicAmenity } from '@/lib/domain/availability';
import styles from './Hotel.module.css';

/**
 * What this hotel offers — doc 58 §3.1, *"property detail … includes …
 * amenities"*, from `GET /public/properties/{slug}`.
 *
 * <h2>This hotel's, never the catalogue's</h2>
 *
 * The backend returns only what an operator assigned to this property. Doc 03 §6
 * makes the 56-row taxonomy a shared **vocabulary**, not a feature list, and doc
 * 03 §9's P1 risk is eight hotels reading identically — which is exactly what
 * showing the whole catalogue under each would produce.
 *
 * <h2>Grouped by the backend's own categories</h2>
 *
 * Doc 03 §6 gives the structure as `AmenityCategory → Amenity`, so the grouping
 * is the taxonomy's, not one invented here. Categories appear in the order their
 * first amenity arrives, which is the operator's own `sort_order` — nothing is
 * re-sorted, and no category is ranked above another. A category with no label
 * renders its own value rather than disappearing.
 *
 * <h2>What is deliberately not here</h2>
 *
 * No icons: the column is nullable, the contract defines no icon set, and
 * inventing artwork per code is exactly the kind of guess doc 03 §6 rules out by
 * making the vocabulary controlled. No count, no "N more", no comparison against
 * another hotel.
 */
export function HotelAmenities({
  amenities,
  copy,
}: {
  readonly amenities: readonly PublicAmenity[];
  readonly copy: AmenityCopy;
}) {
  if (amenities.length === 0) {
    // Common and legitimate: doc 51 A9 has not supplied the catalogue's names,
    // and a hotel may simply not have been given any yet. Saying so beats an
    // empty heading, and beats inventing a feature list.
    return (
      <section className={styles.amenities} aria-labelledby="hotel-amenities">
        <h2 id="hotel-amenities" className={styles.sectionTitle}>{copy.heading}</h2>
        <p className={styles.amenityEmpty}>{copy.none}</p>
      </section>
    );
  }

  const groups = groupByCategory(amenities);

  return (
    <section className={styles.amenities} aria-labelledby="hotel-amenities">
      <h2 id="hotel-amenities" className={styles.sectionTitle}>{copy.heading}</h2>

      <div className={styles.amenityGroups}>
        {groups.map(([category, items]) => (
          <div key={category} className={styles.amenityGroup}>
            <h3 className={styles.amenityCategory}>
              {copy.categories[category] ?? category}
            </h3>
            <ul className={styles.amenityList}>
              {items.map((amenity) => (
                <li
                  key={amenity.code}
                  className={amenity.isHighlight ? styles.amenityHighlight : undefined}
                >
                  {amenity.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Groups without reordering.
 *
 * A `Map` keeps insertion order, so categories appear in the order the server
 * sent their first amenity and the amenities within each keep the server's
 * order too. Sorting here would override the operator's own `sort_order`.
 */
function groupByCategory(
  amenities: readonly PublicAmenity[],
): readonly (readonly [string, readonly PublicAmenity[]])[] {
  const groups = new Map<string, PublicAmenity[]>();
  for (const amenity of amenities) {
    const existing = groups.get(amenity.category);
    if (existing === undefined) {
      groups.set(amenity.category, [amenity]);
    } else {
      existing.push(amenity);
    }
  }
  return [...groups.entries()];
}

export interface AmenityCopy {
  readonly heading: string;
  readonly none: string;
  /** Label per doc 03 §6 category. An unlabelled one falls back to its value. */
  readonly categories: Readonly<Record<string, string>>;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * The Vietnamese category labels are the console's own
 * (`AMENITY_CATEGORY_LABELS`), reused rather than re-translated so the two
 * surfaces cannot drift; the English ones are those same nine frozen doc 03 §6
 * categories, one for one. Amenity **names** are not translated here — they
 * arrive already resolved for the locale, because they are the catalogue's
 * content, not this component's.
 */
const AMENITY_COPY: Readonly<Record<'vi' | 'en', AmenityCopy>> = {
  vi: {
    heading: 'Tiện nghi',
    none: 'Khách sạn chưa công bố danh sách tiện nghi.',
    categories: {
      CONNECTIVITY: 'Kết nối',
      COMFORT: 'Tiện nghi phòng',
      BATHROOM: 'Phòng tắm',
      MEDIA: 'Giải trí',
      FOOD_DRINK: 'Ăn uống',
      SERVICES: 'Dịch vụ',
      ACCESSIBILITY: 'Tiếp cận',
      FAMILY: 'Gia đình',
      PROPERTY_FACILITY: 'Tiện ích khách sạn',
    },
  },
  en: {
    heading: 'Amenities',
    none: 'This hotel has not published its amenities yet.',
    categories: {
      CONNECTIVITY: 'Connectivity',
      COMFORT: 'Room comfort',
      BATHROOM: 'Bathroom',
      MEDIA: 'Media',
      FOOD_DRINK: 'Food and drink',
      SERVICES: 'Services',
      ACCESSIBILITY: 'Accessibility',
      FAMILY: 'Family',
      PROPERTY_FACILITY: 'Hotel facilities',
    },
  },
};

export function amenityCopy(locale: string): AmenityCopy {
  return locale === 'vi' ? AMENITY_COPY.vi : AMENITY_COPY.en;
}
