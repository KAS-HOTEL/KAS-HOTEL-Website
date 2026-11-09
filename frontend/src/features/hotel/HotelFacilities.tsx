import type { PublicFacility } from '@/lib/domain/availability';
import styles from './Hotel.module.css';

/**
 * The hotel's facilities, as a guest sees them — doc 58 §3.1, *"property detail
 * includes facilities"*, from `GET /public/properties/{slug}/facilities`.
 *
 * <h2>A block, not a checklist item</h2>
 *
 * Doc 23 §5 makes a facility a **typed content block**: a rooftop bar is a place
 * with a name and a paragraph, not a tick beside "Bar". That is why this renders
 * cards with the hotel's own words rather than joining the amenity list, and why
 * the type label sits *above* the name — the guest reads "Rooftop · The Rooftop",
 * the kind first and then what this hotel calls theirs.
 *
 * <h2>Every word is the hotel's own</h2>
 *
 * `name` and `description` are authored per locale in the Partner console and
 * returned already resolved. Nothing here writes a default, and a facility with
 * no text in the reader's locale never arrives — the backend's inner join drops
 * it rather than showing `RESTAURANT` to an English reader.
 *
 * <h2>Open to non-residents is a tri-state</h2>
 *
 * `true` earns a note, because a guest choosing a hotel for its restaurant wants
 * to know they can bring friends. `false` and `null` both say nothing: "residents
 * only" is a claim the operator has not necessarily made, and an unstated field
 * is not a denial.
 */
export function HotelFacilities({
  facilities,
  copy,
}: {
  readonly facilities: readonly PublicFacility[];
  readonly copy: FacilityCopy;
}) {
  if (facilities.length === 0) {
    // Not an error, and the common state today: no hotel has authored one yet.
    // The section disappears rather than announcing an absence — unlike policies,
    // where "none published" is itself something a guest must be told.
    return null;
  }

  return (
    <section className={styles.facilities} aria-labelledby="hotel-facilities">
      <h2 id="hotel-facilities" className={styles.sectionTitle}>{copy.heading}</h2>
      <p className={styles.facilityIntro}>{copy.intro}</p>

      <ul className={styles.facilityList}>
        {facilities.map((facility) => (
          <li key={`${facility.type}-${facility.name}`} className={styles.facility}>
            {/* The backend's own value stays visible through the fallback: a
                type added later must not vanish behind a lookup miss. */}
            <p className={styles.facilityType}>{copy.types[facility.type] ?? facility.type}</p>
            <h3 className={styles.facilityName}>{facility.name}</h3>

            {facility.description === null || facility.description.trim() === '' ? null : (
              <p className={styles.facilityDescription}>{facility.description}</p>
            )}

            {facility.openToNonResidents === true ? (
              <p className={styles.facilityNote}>{copy.openToNonResidents}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface FacilityCopy {
  readonly heading: string;
  readonly intro: string;
  readonly openToNonResidents: string;
  /** Label per `FacilityType`. A type with no entry falls back to its own value. */
  readonly types: Readonly<Record<string, string>>;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * The type labels translate the enum's own words — `ROOFTOP` is "Rooftop" — and
 * describe nothing about a particular hotel's rooftop. What it is like is the
 * hotel's to write.
 */
const FACILITY_COPY: Readonly<Record<'vi' | 'en', FacilityCopy>> = {
  vi: {
    heading: 'Tiện ích khách sạn',
    intro: 'Những không gian riêng của khách sạn này.',
    openToNonResidents: 'Đón cả khách không lưu trú',
    types: {
      RESTAURANT: 'Nhà hàng',
      BAR: 'Quầy bar',
      ROOFTOP: 'Sân thượng',
      GYM: 'Phòng tập',
      POOL: 'Hồ bơi',
      SPA: 'Spa',
      MEETING: 'Phòng họp',
      LOUNGE: 'Phòng chờ',
      TERRACE: 'Sân hiên',
    },
  },
  en: {
    heading: 'Hotel facilities',
    intro: 'The spaces that belong to this hotel.',
    openToNonResidents: 'Open to non-residents',
    types: {
      RESTAURANT: 'Restaurant',
      BAR: 'Bar',
      ROOFTOP: 'Rooftop',
      GYM: 'Gym',
      POOL: 'Pool',
      SPA: 'Spa',
      MEETING: 'Meeting space',
      LOUNGE: 'Lounge',
      TERRACE: 'Terrace',
    },
  },
};

export function facilityCopy(locale: string): FacilityCopy {
  return locale === 'vi' ? FACILITY_COPY.vi : FACILITY_COPY.en;
}
