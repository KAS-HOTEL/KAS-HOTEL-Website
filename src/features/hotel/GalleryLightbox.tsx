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

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PublicMediaView } from '@/lib/domain/media';
import styles from './Hotel.module.css';

/**
 * A full-screen viewer for a set of photographs.
 *
 * <h2>A dialog, not a div with a high z-index</h2>
 *
 * `<dialog>` opened with `showModal()` gives the behaviour for free and gives it
 * correctly: the rest of the page becomes inert, focus is trapped, Escape
 * closes, and the backdrop is a real pseudo-element rather than a click-catcher
 * that a keyboard user can never reach. Reimplementing any of that by hand is
 * how galleries end up unusable with a screen reader.
 *
 * <h2>Arrow keys, because it is a gallery</h2>
 *
 * Left and right move; Escape closes (the platform's own behaviour, kept). The
 * counter is announced, so a screen-reader user knows how far through a set of
 * twelve photographs they are rather than hearing "image" twelve times.
 *
 * <h2>It shows what it was given</h2>
 *
 * Every photograph comes from the caller's `images`, which come from a public
 * gallery endpoint. Nothing here constructs a URL, and a set with no images
 * never opens.
 */
export function GalleryLightbox({
  images,
  startAt,
  label,
  onClose,
}: {
  readonly images: readonly PublicMediaView[];
  /** Which photograph the reader clicked. */
  readonly startAt: number;
  /** Names the set — the hotel or the room the photographs belong to. */
  readonly label: string;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [index, setIndex] = useState(startAt);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
    }
    // Closing is the caller's decision; this only opens.
    return () => {
      if (element?.open) {
        element.close();
      }
    };
  }, []);

  const move = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = current + delta;
        // Wraps, because a gallery that stops at the last photograph makes the
        // reader travel back through all of them.
        if (next < 0) return images.length - 1;
        if (next >= images.length) return 0;
        return next;
      });
    },
    [images.length],
  );

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    }
  }

  const current = images[index];
  if (!current) {
    return null;
  }

  return (
    <dialog
      ref={dialog}
      className={styles.lightbox}
      aria-label={label}
      onClose={onClose}
      onKeyDown={onKeyDown}
      // The backdrop is part of the dialog's own box, so a click that lands on
      // it — and not on the figure — is a click outside the content.
      onClick={(event) => {
        if (event.target === dialog.current) {
          dialog.current?.close();
        }
      }}
    >
      <div className={styles.lightboxInner}>
        <div className={styles.lightboxBar}>
          <p className={styles.lightboxCounter}>
            {/* Announced: "3 / 12" tells a screen-reader user where they are. */}
            <span aria-live="polite">
              {index + 1} / {images.length}
            </span>
          </p>
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => dialog.current?.close()}
          >
            Đóng
          </button>
        </div>

        <figure className={styles.lightboxFigure}>
          <img
            className={styles.lightboxImage}
            src={current.url}
            alt={current.alt ?? `${label} — ảnh ${index + 1}`}
            {...(current.width ? { width: current.width } : {})}
            {...(current.height ? { height: current.height } : {})}
          />
          {current.caption ? (
            <figcaption className={styles.lightboxCaption}>{current.caption}</figcaption>
          ) : null}
        </figure>

        {images.length > 1 ? (
          <div className={styles.lightboxNav}>
            <button type="button" className={styles.lightboxArrow} onClick={() => move(-1)}>
              <span aria-hidden="true">←</span>
              <span className={styles.srOnly}>Ảnh trước</span>
            </button>
            <button type="button" className={styles.lightboxArrow} onClick={() => move(1)}>
              <span aria-hidden="true">→</span>
              <span className={styles.srOnly}>Ảnh tiếp theo</span>
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
