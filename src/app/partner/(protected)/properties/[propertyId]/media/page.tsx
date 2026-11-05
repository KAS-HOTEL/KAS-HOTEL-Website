import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PropertyMediaManager } from '@/features/media/PropertyMediaManager';
import { propertyGallery } from '@/features/media/server';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { propertyDetail } from '@/features/property/server';
import { displayName } from '@/lib/domain/property';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant, like every property screen: a title built from the record would
  // differ between "absent" and "someone else's hotel" the moment either resolved.
  title: 'Hình ảnh — KAS Partner',
};

/**
 * A property's images.
 *
 * The property is resolved first, so a foreign or absent id renders the same
 * not-found page as the overview, information, rooms and policy screens. The
 * media calls are scope-filtered again by the backend regardless — the frontend
 * never treats a `propertyId` in the URL as proof of ownership.
 *
 * This screen exists because the publish checklist requires a hero image and
 * nothing served the media endpoints to a Partner, so the only way to satisfy it
 * was an `INSERT`. Registering, attaching and choosing a cover are now reachable;
 * the image file itself still is not, and the screen says so — see
 * `PropertyMediaManager` and OQ-106.
 */
export default async function PropertyMediaPage({
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
        <h1 className={styles.pageTitle}>Hình ảnh</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const gallery = await propertyGallery(propertyId);
  const name = displayName(property.property.names);

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.property.slug}
        name={name}
        section="Hình ảnh"
        lifecycleState={property.property.lifecycleState}
      />

      <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(propertyId)} activeId="media" />

      {gallery.status === 'error' ? (
        <ErrorState error={gallery.error} />
      ) : (
        <PropertyMediaManager
          propertyId={propertyId}
          items={gallery.items}
          library={gallery.library}
        />
      )}
    </div>
  );
}
