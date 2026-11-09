'use client';

/* eslint-disable @next/next/no-img-element -- see the note below. */

/*
 * A plain img, deliberately.
 *
 * next/image needs every image host listed in images.remotePatterns at build
 * time. The media delivery host is deployment configuration
 * (kas.media.delivery-base-url) and is not known when the bundle is built, so
 * this is the correct element here. The intrinsic width and height the API
 * returns are still applied, which is what reserves the space.
 */

import { useState } from 'react';
import type { PublicMediaView } from '@/lib/domain/media';
import { GalleryLightbox } from './GalleryLightbox';
import styles from './Hotel.module.css';

/** The mosaic shows one large image and three supporting ones. */
const MOSAIC_SIZE = 4;

/**
 * The hotel's own photographs, at the top of its page.
 *
 * <h2>A mosaic, then everything</h2>
 *
 * One large image with up to three beside it, and the last tile carries the
 * remainder as "+N" — the arrangement every hotel booking site converged on,
 * because it shows the hotel at a glance and admits how much more there is.
 * Clicking any tile opens the full set at that photograph.
 *
 * <h2>These are the hotel's photographs, not a room's</h2>
 *
 * The source is `GET /public/properties/{slug}/gallery`, which reads
 * `media_link` rows whose `owner_type` is `PROPERTY`. A room's photographs live
 * on `ROOM_TYPE` links and are rendered by `RoomGallery` inside the room card.
 * The two never mix, because the link says which owner a photograph belongs to.
 *
 * <h2>No photographs means no gallery</h2>
 *
 * Not a grey placeholder: a booking page with a slot where a picture should be
 * reads as broken, and a stock hotel would be somebody else's. A property with
 * no published media simply renders nothing here, and the page continues with
 * its name and description.
 */
export function PropertyGallery({
  images,
  hotelName,
  viewAllLabel,
}: {
  readonly images: readonly PublicMediaView[];
  readonly hotelName: string;
  /** "Xem tất cả ảnh" — passed in so the locale copy stays in one place. */
  readonly viewAllLabel: string;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (images.length === 0) {
    return null;
  }

  const mosaic = images.slice(0, MOSAIC_SIZE);
  const remainder = images.length - mosaic.length;

  return (
    <section className={styles.gallery} aria-label={`Ảnh ${hotelName}`}>
      <div className={styles.galleryMosaic} data-count={mosaic.length}>
        {mosaic.map((image, index) => {
          // The last visible tile carries the count of everything not shown.
          const isLastTile = index === mosaic.length - 1;
          const hidden = isLastTile && remainder > 0 ? remainder : 0;

          return (
            <button
              key={image.url}
              type="button"
              className={styles.galleryTile}
              data-lead={index === 0 || undefined}
              onClick={() => setOpenAt(index)}
              aria-label={
                hidden > 0
                  ? `Xem tất cả ${images.length} ảnh`
                  : `${hotelName} — ảnh ${index + 1} trong ${images.length}`
              }
            >
              <img
                className={styles.galleryImage}
                src={image.url}
                // The Partner's own alt text when they wrote one. The fallback
                // names the hotel, which is more use than "image".
                alt={image.alt ?? hotelName}
                {...(image.width ? { width: image.width } : {})}
                {...(image.height ? { height: image.height } : {})}
              />
              {hidden > 0 ? (
                <span className={styles.galleryMore} aria-hidden="true">
                  +{hidden}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <button type="button" className={styles.galleryViewAll} onClick={() => setOpenAt(0)}>
        {viewAllLabel} ({images.length})
      </button>

      {openAt === null ? null : (
        <GalleryLightbox
          images={images}
          startAt={openAt}
          label={`Ảnh ${hotelName}`}
          onClose={() => setOpenAt(null)}
        />
      )}
    </section>
  );
}
