import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { propertyDetail } from '@/features/property/server';
import { RoomTypeCards } from '@/features/roomType/RoomTypeCards';
import { RoomTypeTable } from '@/features/roomType/RoomTypeTable';
import { roomTypeList } from '@/features/roomType/server';
import { displayName } from '@/lib/domain/property';
import Link from 'next/link';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant, like every other property screen: a title built from the record
  // would differ between "absent" and "someone else's hotel" the moment either
  // resolved, and the browser tab is as good a side channel as the page body.
  title: 'Loại phòng — KAS Admin',
};

/**
 * The room types of one property, read-only.
 *
 * <h2>The property is resolved first, and that is the isolation boundary</h2>
 *
 * `GET /room-types` answers `[]` for a property outside the caller's scope
 * rather than 404 — the scope predicate simply matches no rows. That is safe on
 * its own, but it would make a foreign property look like an empty hotel. So the
 * property is loaded first and a foreign id produces the same `notFound()` as an
 * absent one, exactly as the overview and information screens do.
 */
export default async function PropertyRoomsPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  const property = await propertyDetail(propertyId);

  if (property.status === 'notFound') {
    notFound();
  }

  if (property.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Loại phòng</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const rooms = await roomTypeList(propertyId);
  const name = displayName(property.property.names);

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.property.slug}
        name={name}
        section="Loại phòng"
        lifecycleState={property.property.lifecycleState}
      />

      <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(propertyId)} activeId="rooms" />

      {/*
        A section header rather than a lone right-aligned button. The action had
        no context above a bare table: nothing named what was being added to, and
        nothing said how many there already were. The count comes from the list
        that was already fetched.
      */}
      <div className={styles.pageSectionHead}>
        <h2 className={styles.pageSectionTitle}>
          Loại phòng
          {rooms.status === 'ok' ? (
            <span className={styles.pageSectionCount}>{rooms.roomTypes.length}</span>
          ) : null}
        </h2>
        {/* A real link, not a button: creating opens a page, and a page should be
            openable in a new tab and reachable with Tab. */}
        <Link href={`/partner/properties/${propertyId}/rooms/new`} className={styles.primaryLink}>
          Thêm loại phòng
        </Link>
      </div>

      {rooms.status === 'error' ? (
        <ErrorState error={rooms.error} />
      ) : (
        <>
          {/*
            One list, two shapes. The table is the desktop instrument and the
            cards are the phone one; CSS shows exactly one of them, so the six
            columns never have to be dragged sideways to read a single room.

            The cards render only when there are rows: the table already owns the
            empty state, and two empty states would be one too many.
          */}
          <RoomTypeTable propertyId={propertyId} roomTypes={rooms.roomTypes} />
          {rooms.roomTypes.length === 0 ? null : (
            <RoomTypeCards propertyId={propertyId} roomTypes={rooms.roomTypes} />
          )}
        </>
      )}
    </div>
  );
}
