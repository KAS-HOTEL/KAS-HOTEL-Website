import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { propertyGallery, roomGallery } from '@/features/media/server';
import { PropertyOverview } from '@/features/property/PropertyOverview';
import { TripIntentEditor } from '@/features/property/TripIntentEditor';
import { publicTripIntents } from '@/features/hotel/server';
import { propertyDetail } from '@/features/property/server';
import { roomTypeList } from '@/features/roomType/server';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Deliberately constant. A title built from the property would differ between
  // "absent" and "someone else's hotel" the moment either one resolved, and the
  // browser tab is as good a side channel as the page body.
  title: 'Khách sạn — KAS Admin',
};

/**
 * One hotel — its state, its numbers, and what is left to do.
 *
 * <h2>The security-relevant line is `notFound()`</h2>
 *
 * A malformed id, an id that names nothing, and an id that names another
 * partner's hotel all reach the same `notFound()` and render the same page.
 * `loadPropertyDetail` collapses the three cases before this component sees
 * them, so there is no branch here that could accidentally grow a distinguishing
 * message later.
 *
 * That mirrors doc 85 §6.3: the backend answers 404 rather than 403 for a
 * cross-partner read so the existence of another partner's records is never
 * disclosed. A frontend that said "you do not have permission" would undo it in
 * one line.
 *
 * <h2>Three reads, in parallel</h2>
 *
 * The property, its room types and its gallery. The last two are what turned
 * this page from a description of a database row into a description of a hotel:
 * a cover photograph, a room-type count and a photograph count are the figures
 * an operator opens the console for. A failure in either degrades to a zero
 * count — never to a failed page, because the lifecycle actions below still work
 * and are the reason a Partner is here.
 */
export default async function PartnerPropertyDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  const result = await propertyDetail(propertyId);

  if (result.status === 'notFound') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        {/* The slug is unknown when the call failed, so the heading is generic —
            but there is still a heading, because a page of pure error text with
            no h1 is unnavigable with a screen reader. */}
        <h1 className={styles.pageTitle}>Khách sạn</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  const [rooms, gallery, tripIntents] = await Promise.all([
    roomTypeList(propertyId),
    propertyGallery(propertyId),
    publicTripIntents('vi'),
  ]);

  // A draft's setup steps say which room types still have no photograph. Only read
  // while the hotel is a draft, one request per room type (a hotel has a handful).
  let roomsWithoutPhotos: number | null = null;
  if (result.property.lifecycleState === 'DRAFT' && rooms.status === 'ok') {
    const galleries = await Promise.all(rooms.roomTypes.map((room) => roomGallery(room.id)));
    roomsWithoutPhotos = galleries.some((g) => g.status !== 'ok')
      ? null
      : galleries.filter((g) => g.status === 'ok' && g.items.length === 0).length;
  }

  return (
    <div className={styles.page}>
      <PropertyOverview
        property={result.property}
        completeness={result.completeness}
        roomTypes={rooms.status === 'ok' ? rooms.roomTypes : []}
        gallery={gallery.status === 'ok' ? gallery.items : []}
        roomsWithoutPhotos={roomsWithoutPhotos}
      />
      {tripIntents.status === 'ok' ? (
        <TripIntentEditor
          propertyId={propertyId}
          initialCodes={result.property.tripIntentCodes}
          intents={tripIntents.intents}
        />
      ) : <ErrorState error={tripIntents.error} />}
    </div>
  );
}
