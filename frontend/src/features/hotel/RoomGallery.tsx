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

/**
 * One room type's photographs, on the guest-facing hotel page.
 *
 * <h2>Real photographs or nothing</h2>
 *
 * Every image comes from
 * `GET /public/properties/{slug}/room-types/{slug}/gallery`, which returns only
 * published assets on a published property. A room with no photographs renders
 * no gallery at all — a stock bedroom would be somebody else's hospitality, and
 * a grey placeholder on a booking page reads as a fault rather than an absence.
 *
 * <h2>These are the room's photographs, not the hotel's</h2>
 *
 * The endpoint reads `media_link` rows whose `owner_type` is `ROOM_TYPE`. The
 * lobby and the exterior are `PROPERTY` links and are rendered by
 * `PropertyGallery` at the top of the page. The two sets never mix.
 *
 * <h2>The order is the Partner's</h2>
 *
 * Cover first, then `display_order` — the sequence arranged in the extranet, not
 * the order the rows happened to be inserted in.
 *
 * <h2>Clicking opens the full set</h2>
 *
 * The main image and every thumbnail open `GalleryLightbox` at that photograph,
 * so a guest can look at a bathroom properly rather than at a 200px tile.
 */
export function RoomGallery({
  images,
  roomName,
}: {
  readonly images: readonly PublicMediaView[];
  readonly roomName: string;
}) {
  const [active, setActive] = useState(0);
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (images.length === 0) {
    return null;
  }

  const main = images[active] ?? images[0];
  if (!main) {
    return null;
  }

  return (
    <div className={styles.roomGallery}>
      <button
        type="button"
        className={styles.roomGalleryMain}
        onClick={() => setOpenAt(active)}
        aria-label={`${roomName} — xem ${images.length} ảnh`}
      >
        <img
          className={styles.roomGalleryImage}
          src={main.url}
          // The Partner's own alt text when they wrote one. The fallback names
          // the room rather than saying "image", which tells a screen-reader
          // user nothing they did not already know.
          alt={main.alt ?? roomName}
          {...(main.width ? { width: main.width } : {})}
          {...(main.height ? { height: main.height } : {})}
        />
        {images.length > 1 ? (
          <span className={styles.roomGalleryCount} aria-hidden="true">
            {images.length} ảnh
          </span>
        ) : null}
      </button>

      {images.length > 1 ? (
        <ul className={styles.roomGalleryThumbs}>
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                className={styles.roomGalleryThumb}
                data-active={index === active || undefined}
                aria-current={index === active ? 'true' : undefined}
                aria-label={`${roomName} — ảnh ${index + 1} trong ${images.length}`}
                onClick={() => setActive(index)}
              >
                <img src={image.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {openAt === null ? null : (
        <GalleryLightbox
          images={images}
          startAt={openAt}
          label={`Ảnh ${roomName}`}
          onClose={() => setOpenAt(null)}
        />
      )}
    </div>
  );
}
