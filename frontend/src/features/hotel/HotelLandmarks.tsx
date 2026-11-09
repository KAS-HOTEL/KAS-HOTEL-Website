import type { PublicLandmark } from '@/lib/domain/availability';
import styles from './Hotel.module.css';

/**
 * What is around the hotel — doc 58 §3.1, *"property detail includes …
 * landmarks"*, carried on `GET /public/properties/{slug}`.
 *
 * <h2>Distance is the point</h2>
 *
 * Doc 03 §5.2 asks for **verified** walking distances — "Ben Thanh Market — 6 min
 * walk" — so the measure sits beside the name rather than in a paragraph. A
 * landmark with neither measure still renders: it is a named place the hotel
 * chose to mention, and saying only its name is honest where inventing "5 min"
 * would not be.
 *
 * <h2>Nothing is derived</h2>
 *
 * A distance is never turned into a walking time or the reverse. The two are
 * independent fields on the record because the hotel measures them separately,
 * and a computed "≈7 min" would be the platform making a claim the hotel did not.
 *
 * <h2>Order is the operator's</h2>
 *
 * Never re-sorted by distance. Which landmark matters most is an editorial
 * judgement doc 03 §5.2 leaves to the hotel — the nearest place is not always the
 * reason someone books.
 */
export function HotelLandmarks({
  landmarks,
  copy,
}: {
  readonly landmarks: readonly PublicLandmark[];
  readonly copy: LandmarkCopy;
}) {
  if (landmarks.length === 0) {
    // The section disappears rather than announcing an absence — like the
    // facilities, and unlike the policies, where "none published" is itself
    // something a guest must be told before agreeing to terms.
    return null;
  }

  return (
    <section className={styles.landmarks} aria-labelledby="hotel-landmarks">
      <h2 id="hotel-landmarks" className={styles.sectionTitle}>{copy.heading}</h2>
      <p className={styles.landmarkIntro}>{copy.intro}</p>

      <ul className={styles.landmarkList}>
        {landmarks.map((landmark) => (
          <li key={landmark.name} className={styles.landmark}>
            <div className={styles.landmarkHead}>
              <h3 className={styles.landmarkName}>{landmark.name}</h3>
              {distanceLabel(landmark, copy) === null ? null : (
                <p className={styles.landmarkDistance}>{distanceLabel(landmark, copy)}</p>
              )}
            </div>

            {landmark.description === null || landmark.description.trim() === '' ? null : (
              <p className={styles.landmarkDescription}>{landmark.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The measure line, or `null` when the hotel has measured neither.
 *
 * Both are shown when both exist, because they answer different questions — how
 * far it is and how long it takes — and the hotel supplied each separately.
 */
function distanceLabel(landmark: PublicLandmark, copy: LandmarkCopy): string | null {
  const parts: string[] = [];

  if (landmark.walkingMinutes !== null) {
    parts.push(copy.walkingMinutes(landmark.walkingMinutes));
  }
  if (landmark.distanceMetres !== null) {
    parts.push(copy.distance(landmark.distanceMetres));
  }

  return parts.length === 0 ? null : parts.join(' · ');
}

export interface LandmarkCopy {
  readonly heading: string;
  readonly intro: string;
  readonly walkingMinutes: (minutes: number) => string;
  readonly distance: (metres: number) => string;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * A distance under a kilometre stays in metres; at or above one it is written in
 * kilometres to one decimal, because "1.2 km" is what a person reads and
 * "1200 m" is what a database stores. The rounding is presentation only — the
 * stored value is untouched.
 */
const LANDMARK_COPY: Readonly<Record<'vi' | 'en', LandmarkCopy>> = {
  vi: {
    heading: 'Xung quanh khách sạn',
    intro: 'Những địa điểm gần đây, theo khoảng cách khách sạn đã xác minh.',
    walkingMinutes: (minutes) => `${minutes} phút đi bộ`,
    distance: (metres) =>
      metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`,
  },
  en: {
    heading: 'Around the hotel',
    intro: 'Nearby places, at distances this hotel has verified.',
    walkingMinutes: (minutes) => `${minutes} min walk`,
    distance: (metres) =>
      metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`,
  },
};

export function landmarkCopy(locale: string): LandmarkCopy {
  return locale === 'vi' ? LANDMARK_COPY.vi : LANDMARK_COPY.en;
}
