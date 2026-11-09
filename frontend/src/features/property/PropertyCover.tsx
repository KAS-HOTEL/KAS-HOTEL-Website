/* eslint-disable @next/next/no-img-element -- see the note below. */
import type { MediaCoverView } from '@/lib/domain/media';
import styles from './PropertyCover.module.css';

/**
 * A property's cover photograph, at the size a list row can afford.
 *
 * <h2>Why the portfolio had none</h2>
 *
 * The overview showed covers and the portfolio — the screen actually called
 * "Khách sạn" — showed none at all. An operator running eight hotels recognises
 * them by their photographs long before they read eight similar names, so the
 * one screen dedicated to choosing between them was the one screen that made
 * choosing hardest.
 *
 * <h2>A plain img, deliberately</h2>
 *
 * The same reason the media managers give: the delivery URL is `m/{assetId}` on
 * a storage origin, and `next/image` would either need that origin in
 * `remotePatterns` or would proxy the bytes through the Next server — which is
 * exactly what doc 62 §4's direct-delivery contract exists to avoid.
 *
 * <h2>Two absences, not one</h2>
 *
 * "No cover has been chosen" and "the covers could not be read" are different
 * facts and a partner can act on only one of them. Collapsing them would render
 * a backend fault as "no hotel has a cover", which is the empty-versus-failure
 * confusion this console has been careful about elsewhere.
 *
 * <p>The image is decorative: every caller prints the hotel's name beside it, so
 * repeating it in `alt` would make a screen reader say it twice.
 */
export function PropertyCover({
  cover,
  unavailable = false,
  className,
}: {
  readonly cover: MediaCoverView | null;
  readonly unavailable?: boolean | undefined;
  readonly className?: string | undefined;
}) {
  const frame = className === undefined ? styles.frame : `${styles.frame} ${className}`;

  if (cover === null || cover.url === null || cover.url === undefined) {
    return (
      <span className={frame}>
        <span className={styles.placeholder}>
          {unavailable ? 'Không đọc được ảnh' : 'Chưa có ảnh'}
        </span>
      </span>
    );
  }

  return (
    <span className={frame}>
      <img
        className={styles.image}
        src={cover.url}
        alt=""
        loading="lazy"
        decoding="async"
        {...(cover.width === null ? {} : { width: cover.width })}
        {...(cover.height === null ? {} : { height: cover.height })}
      />
    </span>
  );
}
