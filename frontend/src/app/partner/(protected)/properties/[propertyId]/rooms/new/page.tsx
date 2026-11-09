import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { propertyDetail } from '@/features/property/server';
import { RoomTypeForm } from '@/features/roomType/RoomTypeForm';
import { amenityCatalog } from '@/features/roomType/server';
import { messageFor } from '@/features/auth/messages';
import { Breadcrumb, ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Loại phòng mới — KAS Partner',
};

/**
 * Creating a room type.
 *
 * The property is resolved first, so a foreign or absent property id produces
 * the same not-found page as everywhere else — a create form is not the place to
 * start disclosing which properties exist.
 *
 * The amenity catalogue is loaded here rather than in the client: it is the
 * backend's list, and fetching it on the server keeps the form's only network
 * call the one that saves.
 */
export default async function NewRoomTypePage({
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
        <h1 className={styles.pageTitle}>Loại phòng mới</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const catalog = await amenityCatalog();

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: 'Khách sạn', href: '/partner/properties' },
          { label: property.property.slug, href: `/partner/properties/${propertyId}` },
          { label: 'Loại phòng', href: `/partner/properties/${propertyId}/rooms` },
          { label: 'Tạo mới' },
        ]}
      />

      <h1 className={styles.pageTitle}>Loại phòng mới</h1>

      <RoomTypeForm
        propertyId={propertyId}
        amenities={catalog.status === 'ok' ? catalog.amenities : []}
        amenityError={catalog.status === 'error' ? messageFor(catalog.error) : undefined}
      />
    </div>
  );
}
