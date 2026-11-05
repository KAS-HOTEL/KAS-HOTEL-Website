import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { propertyDetail } from '@/features/property/server';
import { RoomTypeDetailView } from '@/features/roomType/RoomTypeDetailView';
import { roomTypeDetail } from '@/features/roomType/server';
import { Breadcrumb, ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Loại phòng — KAS Partner',
};

/**
 * One room type, read-only.
 *
 * <h2>Two ids, one not-found</h2>
 *
 * Either id can be malformed, absent, or belong to another partner, and all six
 * combinations render the same page. `loadRoomTypeDetail` collapses them before
 * this component sees them, and the property is resolved first so a foreign
 * property id cannot be distinguished from an absent one either.
 *
 * That matters more here than on the property screens: a room type now carries a
 * Partner-authored name (OQ-137), so a leak would disclose something a person
 * recognises rather than an opaque slug.
 */
export default async function RoomTypeDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string; readonly roomTypeId: string }>;
}) {
  const { propertyId, roomTypeId } = await params;

  const property = await propertyDetail(propertyId);
  if (property.status === 'notFound') {
    notFound();
  }

  const result = await roomTypeDetail(propertyId, roomTypeId);
  if (result.status === 'notFound') {
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

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Loại phòng</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: 'Khách sạn', href: '/partner/properties' },
          { label: property.property.slug, href: `/partner/properties/${propertyId}` },
          { label: 'Loại phòng', href: `/partner/properties/${propertyId}/rooms` },
          { label: result.roomType.slug },
        ]}
      />
      <RoomTypeDetailView propertyId={propertyId} roomType={result.roomType} />
    </div>
  );
}
