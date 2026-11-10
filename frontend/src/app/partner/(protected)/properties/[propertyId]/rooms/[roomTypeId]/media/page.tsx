import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoomMediaManager } from '@/features/media/RoomMediaManager';
import { roomGallery } from '@/features/media/server';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyDetail } from '@/features/property/server';
import { roomTypeDetail } from '@/features/roomType/server';
import { roomTypeName } from '@/lib/domain/roomType';
import { displayName } from '@/lib/domain/property';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant, like every other property-scoped page: a title built from the room
  // would differ between "absent" and "someone else's", and the browser tab is
  // as good a side channel as the page body.
  title: 'Ảnh phòng — KAS Admin',
};

/**
 * One room type's photo gallery.
 *
 * <h2>Why this page exists</h2>
 *
 * The room's "Hình ảnh" tab was rendered disabled: `media_link` has always had a
 * `ROOM_TYPE` owner with its own `display_order` and one-cover index, and the
 * whole R2 upload chain already existed, but nothing in the console reached it.
 * A Partner could photograph a room and had nowhere to put the picture.
 *
 * <h2>Room photos are not hotel photos</h2>
 *
 * This gallery writes links with `ownerType: 'ROOM_TYPE'` and the `ROOM`
 * category; the property gallery writes `PROPERTY`. They draw on the same asset
 * library and never show each other's placements, so a lobby cannot end up
 * illustrating a bedroom.
 */
export default async function RoomMediaPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string; readonly roomTypeId: string }>;
}) {
  const { propertyId, roomTypeId } = await params;

  const [property, room] = await Promise.all([
    propertyDetail(propertyId),
    roomTypeDetail(propertyId, roomTypeId),
  ]);

  // A malformed id, an id that names nothing, and another partner's room all
  // reach the same notFound() — doc 85 §6.3.
  if (property.status === 'notFound' || room.status === 'notFound') {
    notFound();
  }

  if (property.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Ảnh phòng</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  if (room.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Ảnh phòng</h1>
        <ErrorState error={room.error} />
      </div>
    );
  }

  const gallery = await roomGallery(roomTypeId);
  const name = roomTypeName(room.roomType.translations) ?? room.roomType.slug;

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.property.slug}
        name={displayName(property.property.names) ?? property.property.slug}
        section={`${name} — Ảnh phòng`}
        lifecycleState={property.property.lifecycleState}
      />

      {gallery.status === 'error' ? (
        <ErrorState error={gallery.error} />
      ) : (
        <RoomMediaManager
          propertyId={propertyId}
          roomTypeId={roomTypeId}
          roomTypeName={name}
          items={gallery.items}
        />
      )}
    </div>
  );
}
