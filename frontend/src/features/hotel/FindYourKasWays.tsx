import Link from 'next/link';
import type { PublicTripIntent } from '@/lib/domain/availability';
import {
  FIND_YOUR_KAS_COPY,
} from './findYourKas';
import styles from './FindYourKasWays.module.css';

export function FindYourKasWays({
  locale,
  basePath,
  selectedIntent,
  intents,
}: {
  readonly locale: string;
  readonly basePath: string;
  readonly selectedIntent?: string | undefined;
  readonly intents: readonly PublicTripIntent[];
}) {
  const copy = locale === 'vi' ? FIND_YOUR_KAS_COPY.vi : FIND_YOUR_KAS_COPY.en;

  return (
    <section className={styles.section} aria-labelledby="find-your-kas-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2 id="find-your-kas-title">{copy.heading}</h2>
        </div>
        <p className={styles.intro}>{copy.intro}</p>
      </div>

      <nav className={styles.ways} aria-label={copy.heading}>
        {intents.map((intent, index) => {
          const active = intent.code === selectedIntent;
          return (
            <Link
              className={styles.way}
              data-active={active || undefined}
              href={`${basePath}?intent=${intent.code}`}
              key={intent.code}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.label}>{intent.label}</span>
              <span className={styles.description}>{intent.description}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <p>{copy.footer}</p>
        <Link className={styles.explore} href={basePath}>{copy.explore} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
