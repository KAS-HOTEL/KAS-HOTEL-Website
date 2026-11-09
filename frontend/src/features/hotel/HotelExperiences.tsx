import type { PublicExperience } from '@/lib/domain/availability';
import styles from './Hotel.module.css';

/**
 * What this hotel does that no other does — doc 67 §1's section 5, carried on
 * `GET /public/properties/{slug}` by Step 16A.47's owner ruling.
 *
 * <h2>Why this section is weighted the way it is</h2>
 *
 * Doc 66 §7: this is *"where Milestone's restaurant and rooftop live as
 * experiences rather than amenity checkboxes"*. Doc 67 §1 places it above the
 * rooms, and doc 67 §2 makes at least one of these a condition of publishing at
 * all — so it is a named editorial block with room to breathe, not a strip of
 * chips. It carries more weight than the landmarks below it and less than the
 * rooms, which is the order doc 67 §1 sets out.
 *
 * <h2>Words only, and that is the whole V1</h2>
 *
 * No image, no time-of-day badge. Step 16A.47 omitted both — `media_owner_type`
 * has no `EXPERIENCE` member and `timeOfDay` has no vocabulary in any document —
 * so the layout is built for text rather than leaving a hole where a photograph
 * is supposed to arrive. A card with a grey placeholder box would look broken;
 * a card that was always meant to be typography does not.
 *
 * <h2>A title alone is enough</h2>
 *
 * The description is optional in the schema and optional here. "Rooftop at dusk"
 * with nothing after it is a real thing a hotel may publish, and rendering just
 * the line is honest where padding it out would not be.
 */
export function HotelExperiences({
  experiences,
  copy,
}: {
  readonly experiences: readonly PublicExperience[];
  readonly copy: ExperienceCopy;
}) {
  if (experiences.length === 0) {
    // The section disappears rather than announcing an absence — like the
    // facilities and landmarks, and unlike the policies, where "none published"
    // is itself something a guest must be told before agreeing to terms.
    return null;
  }

  return (
    <section className={styles.experiences} aria-labelledby="hotel-experiences">
      <h2 id="hotel-experiences" className={styles.sectionTitle}>{copy.heading}</h2>
      <p className={styles.experienceIntro}>{copy.intro}</p>

      <ul className={styles.experienceList}>
        {experiences.map((experience) => (
          <li key={experience.title} className={styles.experience}>
            <h3 className={styles.experienceName}>{experience.title}</h3>

            {experience.description === null || experience.description.trim() === '' ? null : (
              <p className={styles.experienceDescription}>{experience.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ExperienceCopy {
  readonly heading: string;
  readonly intro: string;
}

/**
 * Guest copy in both frozen locales, following `requestMessages.ts`.
 *
 * The intro says "this hotel" rather than naming a count: doc 67 §2 sets a floor
 * of one and no ceiling, so a sentence built around a number would read wrong at
 * either end of the range.
 */
const EXPERIENCE_COPY: Readonly<Record<'vi' | 'en', ExperienceCopy>> = {
  vi: {
    heading: 'Trải nghiệm đặc trưng',
    intro: 'Những điều chỉ có ở khách sạn này.',
  },
  en: {
    heading: 'Signature experiences',
    intro: 'The things this hotel does that no other one does.',
  },
};

export function experienceCopy(locale: string): ExperienceCopy {
  return locale === 'vi' ? EXPERIENCE_COPY.vi : EXPERIENCE_COPY.en;
}
