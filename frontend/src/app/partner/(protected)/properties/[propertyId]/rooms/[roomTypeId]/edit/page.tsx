import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { messageFor } from '@/features/auth/messages';
import { propertyDetail } from '@/features/property/server';
import { RoomTypeForm } from '@/features/roomType/RoomTypeForm';
import { amenityCatalog, roomTypeDetail } from '@/features/roomType/server';
import { roomTypeName } from '@/lib/domain/roomType';
import { Breadcrumb, ErrorState } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Sửa loại phòng — KAS Admin',
};

/**
 * Editing a room type.
 *
 * Loaded server-side, where the `HttpOnly` session cookies can be read, so the
 * form is populated from the real DTO — including the `version` it must send
 * back. The save goes from the browser, where the CSRF cookie lives.
 *
 * Both ids are collapsed to one not-found before this component sees them, so a
 * foreign property or a foreign room reaches the same page as an absent one.
 */
export default async function EditRoomTypePage({
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
        <h1 className={styles.pageTitle}>Sửa loại phòng</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Sửa loại phòng</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  const catalog = await amenityCatalog();
  const name = roomTypeName(result.roomType.translations);

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: 'Khách sạn', href: '/partner/properties' },
          { label: property.property.slug, href: `/partner/properties/${propertyId}` },
          { label: 'Loại phòng', href: `/partner/properties/${propertyId}/rooms` },
          {
            label: result.roomType.slug,
            href: `/partner/properties/${propertyId}/rooms/${roomTypeId}`,
          },
          { label: 'Sửa' },
        ]}
      />

      <h1 className={styles.pageTitle}>{name ?? result.roomType.slug}</h1>

      <RoomTypeForm
        propertyId={propertyId}
        roomType={result.roomType}
        amenities={catalog.status === 'ok' ? catalog.amenities : []}
        amenityError={catalog.status === 'error' ? messageFor(catalog.error) : undefined}
      />
    </div>
  );
}
