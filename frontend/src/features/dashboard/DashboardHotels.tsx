/* eslint-disable @next/next/no-img-element -- see the note below. */

/*
 * A plain img, deliberately — the same reason the media managers give.
 *
 * next/image needs every image host listed in images.remotePatterns at build
 * time. The media delivery host is deployment configuration
 * (kas.media.delivery-base-url) and is not known when the bundle is built, so
 * this is the correct element rather than a lint exception taken for
 * convenience. The intrinsic width and height the API returns are still applied,
 * which is what reserves the space and avoids a layout shift.
 */

import Link from 'next/link';
import type { MediaCoverView } from '@/lib/domain/media';
import { displayName, missingInformation, type PropertyAdminView } from '@/lib/domain/property';
import { formatAddress } from '@/features/property/address';
import { PropertyStatus } from '@/features/property/PropertyStatus';
import styles from './Dashboard.module.css';

/**
 * The portfolio, as cards on the overview.
 *
 * <h2>What each card can honestly carry</h2>
 *
 * The design's cards show a photograph, a room count and a star rating. This one
 * shows the name, the address, the lifecycle state and how much of the
 * Information screen is still blank — because those are the fields
 * `GET /admin/properties` actually returns.
 *
 * <p>The image is the property's own cover, from `GET /admin/media/covers` —
 * `media_link.is_cover` resolved to the same delivery URL every other surface
 * serves. It used to be a placeholder on every card, because nothing had ever
 * been uploaded and the list response carries no media; both halves of that are
 * now false. No room count: the list response has no room-type data, and a
 * per-property read would be eight extra requests for a figure the design uses
 * decoratively. No rating: `review` is empty and no endpoint aggregates it.
 *
 * <h2>Why the cover arrives beside the properties rather than inside them</h2>
 *
 * `PropertyAdminView` carries no media field and must not grow one: `onboarding`
 * does not depend on `media`, and a portfolio row carrying a cover would drag the
 * module graph across a boundary doc 12 §3 draws, to save one request. So the
 * page fetches both and this component joins them by id.
 *
 * <h2>A missing cover and an unreachable one are different</h2>
 *
 * `coversUnavailable` says the cover request itself failed. Without it a backend
 * fault would render as "no hotel has a cover" — indistinguishable from an
 * operator who has not chosen one, and the wrong thing to tell them.
 *
 * <h2>The whole card is the link</h2>
 *
 * As on the portfolio's own cards — a title-only target is a small tap area on a
 * phone, and the rest of the card is not doing anything else.
 */
export function DashboardHotels({
  properties,
  covers,
  coversUnavailable = false,
}: {
  readonly properties: readonly PropertyAdminView[];
  /** Cover per property id. A property with none is simply absent. */
  readonly covers?: ReadonlyMap<string, MediaCoverView> | undefined;
  readonly coversUnavailable?: boolean | undefined;
}) {
  return (
    <ul className={styles.hotelGrid}>
      {properties.map((property, index) => {
        const name = displayName(property.names);
        const address = formatAddress(property);
        const missing = missingInformation(property);
        const cover = covers?.get(property.id) ?? null;

        return (
          <li key={property.id}>
            <Link href={`/partner/properties/${property.id}`} className={styles.hotelCard}>
              <span className={styles.hotelMedia}>
                {cover === null || cover.url === null ? (
                  /*
                    No photograph to show. Rather than a broken frame or a stock
                    hotel that is somebody else's hospitality, this is a composed
                    band in the brand's own colour, with the same gold corner
                    bracket the sign-in panel uses.

                    It says so in words. A placeholder that does not admit to
                    being one is the thing that reads as a bug; one that names
                    itself reads as a state — and the two states are different:
                    nobody has chosen a cover, or the covers could not be read.
                  */
                  <span className={styles.hotelMediaLabel}>
                    {coversUnavailable ? 'Không đọc được ảnh bìa' : 'Chưa có ảnh bìa'}
                  </span>
                ) : (
                  /*
                    The operator's own photograph. The card already names the
                    hotel, so the image is decorative here and takes an empty
                    alt rather than repeating it to a screen reader.

                    The space is reserved by `.hotelMedia { aspect-ratio: 3/2 }`
                    rather than by the attributes below — the image is
                    absolutely positioned and stretched, so its intrinsic size
                    contributes nothing to layout. They are kept because they
                    are true and cost nothing.

                    Lazy and asynchronously decoded, which it was not: this
                    grid is two columns of full-resolution originals, so an
                    eight-hotel portfolio opened the console with eight
                    concurrent image fetches racing the page's own data. Only
                    the first card is above the fold on any screen; the rest
                    can wait until they are scrolled to.
                  */
                  <img
                    className={styles.hotelMediaImage}
                    src={cover.url}
                    alt=""
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    {...(index === 0 ? { fetchPriority: 'high' as const } : {})}
                    {...(cover.width === null ? {} : { width: cover.width })}
                    {...(cover.height === null ? {} : { height: cover.height })}
                  />
                )}
                {/* Over the band, as the reference puts its rating: the state is
                    the first thing an operator scans a portfolio for, and on the
                    band it is not competing with the name for the same line. */}
                <span className={styles.hotelBadge}>
                  <PropertyStatus state={property.lifecycleState} />
                </span>
              </span>

              <span className={styles.hotelName}>
                {name ?? <span className={styles.unnamed}>Chưa đặt tên</span>}
              </span>

              {address === '' ? (
                <span className={styles.hotelMeta}>Chưa có địa chỉ</span>
              ) : (
                <span className={styles.hotelMeta}>{address}</span>
              )}

              {/* The completeness figure is the one number this card can state
                  honestly — it comes from fields the list response carries. */}
              <span className={styles.hotelProgress} data-complete={missing.length === 0 || undefined}>
                {missing.length === 0 ? 'Thông tin đã đủ' : `Thiếu ${missing.length} mục thông tin`}
              </span>

              {/* The card closes on a verb rather than trailing off after its
                  metadata. Not a button — the whole card is already the link. */}
              <span className={styles.hotelCta}>Quản lý khách sạn →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
