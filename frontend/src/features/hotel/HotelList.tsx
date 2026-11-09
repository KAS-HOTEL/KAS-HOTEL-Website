/* eslint-disable @next/next/no-img-element -- the media delivery host is deployment configuration, not known at build time; see PropertyGallery. */
import Link from 'next/link';
import type { PublicMediaView } from '@/lib/domain/media';
import {
  isBookable,
  locationLabel,
  notBookableReason,
  type PublishedProperty,
} from '@/lib/domain/availability';
import { Badge } from '@/ui/primitives';
import { searchCopy } from './requestMessages';
import styles from './Hotel.module.css';

/**
 * The published portfolio.
 *
 * <h2>A list, not a search</h2>
 *
 * `GET /public/properties` takes **`locale` and nothing else** — no page, no
 * sort, no filter, no facet. Doc 58 §3.1's row mentions `district`, `character`,
 * `amenity` and `collection` as filters, but the implemented controller accepts
 * none of them, so none is offered. The order is the repository's
 * (`sort_order, slug`) and nothing here re-sorts it.
 *
 * This is emphatically **not** `GET /public/availability/search` — **OQ-122**,
 * whose facets and response envelope are still undefined. Nothing here filters
 * or sorts the portfolio by availability or by price, and no card shows either:
 * there is no endpoint that could answer that question for eight hotels at once,
 * and answering it eight times over would be inventing a contract.
 *
 * <h2>The search bar above it carries a stay, it does not narrow this list</h2>
 *
 * STEP J's search bar collects dates and a party and appends them to each card's
 * link, so a guest arrives on a hotel page with their search already made and
 * the real per-property availability endpoint answers it there. That is a
 * **hand-off**, not a filter — this list is exactly as long with dates as
 * without them, and a card never implies that this hotel is free on those
 * nights. When OQ-122 lands, the narrowing belongs to that endpoint.
 *
 * <h2>No imagery, and not for want of a design</h2>
 *
 * `PublishedProperty` carries no media field, and the list contract offers no
 * bulk gallery — `GET /public/properties/{slug}/gallery` is per property, which
 * on a list would be an N+1 against a contract that does not offer it. It would
 * also return nothing: media storage is unresolved (**OQ-106**) and the database
 * holds **zero** assets. So the cards are typographic rather than illustrated. No
 * placeholder image, no stock photograph, no storage key.
 *
 * <h2>Nothing commercial is shown</h2>
 *
 * No price, no rating, no review count, no availability, no discount, no
 * amenity. None of it is on the response, and a list that invented any of it
 * would be lying about eight real hotels.
 */
export function HotelList({
  properties,
  locale,
  covers = {},
  stayQuery,
}: {
  readonly properties: readonly PublishedProperty[];
  readonly locale: string;
  /**
   * Each hotel's cover photograph by slug, from the public gallery endpoint.
   * Defaulted so every existing caller keeps working: a hotel with no entry
   * renders without an image rather than with a placeholder.
   */
  readonly covers?: Readonly<Record<string, PublicMediaView>>;
  /**
   * The guest's search, as a query string, appended to every card's link — so a
   * guest who chose dates on the portfolio does not have to choose them again on
   * the hotel page. Absent when they have not searched, and the links are then
   * exactly what they were before.
   */
  readonly stayQuery?: string | undefined;
}) {
  const copy = searchCopy(locale);
  const suffix = stayQuery === undefined || stayQuery === '' ? '' : `?${stayQuery}`;

  return (
    <ul className={styles.hotelList}>
      {properties.map((property) => {
        // The list query inner-joins the translation, so a name is always
        // present; the slug remains the honest fallback if that ever changes.
        const name = property.name ?? property.slug;
        const where = locationLabel(property);
        const closed = notBookableReason(property.lifecycleState, copy);
        const cover = covers[property.slug];

        return (
          <li key={property.slug} className={styles.hotelCard}>
            {/*
              The hotel's cover photograph — the first image of its PROPERTY
              gallery. Absent when the hotel has published none: a guest is
              better served by a card that is plainly text than by a grey
              rectangle pretending to be a photograph.
            */}
            {cover === undefined ? null : (
              <span className={styles.hotelMedia}>
                <img
                  className={styles.hotelImage}
                  src={cover.url}
                  alt={cover.alt ?? name}
                  {...(cover.width ? { width: cover.width } : {})}
                  {...(cover.height ? { height: cover.height } : {})}
                />
              </span>
            )}

            <div className={styles.hotelBody}>
            <h2 className={styles.hotelName}>
              {/* The whole action of a card is "open this hotel", so the link is
                  the name — a link, because it navigates. Its accessible name is
                  the hotel, which is what a screen-reader user is choosing
                  between. */}
              <Link
                href={`/${locale}/hotels/${property.slug}${suffix}`}
                className={styles.hotelLink}
              >
                {name}
              </Link>
            </h2>

            {where === null ? null : <p className={styles.hotelLocation}>{where}</p>}

            {/* Doc 03 §8 — COMING_SOON is listed with a teaser and
                TEMPORARILY_CLOSED is listed but unavailable. Saying which is the
                reason lifecycleState is public at all. Words, not a tint.

                A sentence, not a Badge: `notBookableReason` returns prose, and
                Badge is `white-space: nowrap`. Measured at 375px, the
                COMING_SOON sentence in a pill had a min-content width of
                338.8px, which pushed the grid track to 388.8px and scrolled the
                whole document sideways by 31px. The detail page already renders
                this same string as a paragraph. */}
            {isBookable(property.lifecycleState) ? null : (
              <p className={styles.hotelNotice}>{closed ?? property.lifecycleState}</p>
            )}

            {property.isFlagship ? (
              <div className={styles.hotelBadges}>
                <Badge tone="accent">{copy.flagship}</Badge>
              </div>
            ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
