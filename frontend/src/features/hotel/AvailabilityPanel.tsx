import type { PublishedRoomType } from '@/lib/domain/availability';
import { nights } from '@/lib/domain/availability';
import type { PublicMediaView } from '@/lib/domain/media';
import type { RoomSelection } from '@/lib/domain/stay';
import { BookingSection } from './BookingSection';
import { roomSelectionCopy } from './bookingMessages';
import type { AvailabilityResult } from './load';
import { guestMessageFor } from './load';
import { EmptyState, Skeleton } from '@/ui/primitives';
import styles from './StaySearch.module.css';

/**
 * Availability for the chosen dates, rendered from the server's answer.
 *
 * <h2>Why it takes a result rather than fetching one</h2>
 *
 * The page issues every public read it needs in one `Promise.all`, so the
 * property, the room descriptions, the galleries, the policies, the facilities
 * and the availability are in flight together rather than one after another.
 * A component that fetched for itself would have to be awaited separately and
 * would put its request back at the end of that queue.
 *
 * <h2>Three outcomes, three treatments</h2>
 *
 * <ul>
 *   <li><strong>Rooms</strong> — the selection surface.</li>
 *   <li><strong>Nothing free</strong> — `200 []`, which is a successful answer
 *       and not an error. It is also what a property that is not `OPEN`
 *       returns, so the response discloses nothing either way.</li>
 *   <li><strong>Refused</strong> — the backend's own words for `400` and `422`
 *       ("Check-out must be after check-in", "Those dates are not yet open for
 *       booking"), and one safe constant for anything else. A retry is offered
 *       as a **link to the same URL**, so it works without JavaScript and
 *       re-runs the server fetch rather than replaying a stale client state.</li>
 * </ul>
 */
export function AvailabilityPanel({
  slug,
  name,
  locale,
  availability,
  checkIn,
  checkOut,
  adults,
  roomsWanted,
  selection,
  roomTypes,
  galleries,
  retryHref,
}: {
  readonly slug: string;
  readonly name: string;
  readonly locale: string;
  /** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
  readonly availability: AvailabilityResult;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly roomsWanted: number;
  readonly selection: RoomSelection;
  readonly roomTypes: readonly PublishedRoomType[];
  readonly galleries: Readonly<Record<string, readonly PublicMediaView[]>>;
  /** The same search, as a link — the retry that needs no JavaScript. */
  readonly retryHref: string;
}) {
  const copy = roomSelectionCopy(locale);

  if (availability.status === 'error') {
    // Not `EmptyState`: that primitive wraps its children in a `<p>`, and this
    // treatment needs a paragraph and a link beside it.
    return (
      <div className={styles.failed} role="alert">
        <h2 className={styles.failedTitle}>{copy.errorTitle}</h2>
        <p className={styles.failedBody}>{guestMessageFor(availability.error)}</p>
        {/*
          A link rather than a button: it re-runs the server fetch, it works
          with JavaScript switched off, and it cannot replay a client state that
          is already known to have failed.
        */}
        <a className={styles.retry} href={retryHref}>
          {copy.retry}
        </a>
      </div>
    );
  }

  if (availability.rooms.length === 0) {
    // Doc 55 §9 reserves sold-out wording for real zero inventory, and this is
    // the response that means it: every room type checked, none sellable across
    // the whole stay.
    return <EmptyState title={copy.noEstimateTitle}>{copy.noEstimateBody}</EmptyState>;
  }

  return (
    <BookingSection
      propertySlug={slug}
      propertyName={name}
      locale={locale}
      rooms={availability.rooms}
      roomTypes={roomTypes}
      galleries={galleries}
      checkIn={checkIn}
      checkOut={checkOut}
      nightCount={nights(checkIn, checkOut)}
      adults={adults}
      roomsWanted={roomsWanted}
      initialSelection={selection}
    />
  );
}

/**
 * What the reader sees while availability is being read.
 *
 * Shaped like the room list it replaces, so the page does not jump when the real
 * rooms arrive. `role="status"` with the loading sentence means a screen-reader
 * user is told what is happening rather than left with three silent grey boxes.
 */
export function AvailabilitySkeleton({ label }: { readonly label: string }) {
  return (
    <div className={styles.loading} role="status" aria-label={label}>
      <p className={styles.loadingText}>{label}</p>
      <Skeleton height={144} />
      <Skeleton height={144} />
      <Skeleton height={144} />
    </div>
  );
}
